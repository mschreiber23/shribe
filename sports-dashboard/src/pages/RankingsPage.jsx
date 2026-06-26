import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

const STATSAPI = 'https://statsapi.mlb.com/api/v1';
const BS = 'https://baseballsavant.mlb.com';

const MLB_ABBR = {
  108:'LAA',109:'ARI',110:'BAL',111:'BOS',112:'CHC',113:'CIN',114:'CLE',
  115:'COL',116:'DET',117:'HOU',118:'KC', 119:'LAD',120:'WSH',121:'NYM',
  133:'ATH',134:'PIT',135:'SD', 136:'SEA',137:'SF', 138:'STL',139:'TB',
  140:'TEX',141:'TOR',142:'MIN',143:'PHI',144:'ATL',145:'CWS',146:'MIA',
  147:'NYY',158:'MIL',
};

/* ── Shared helpers ──────────────────────────────────────────────────── */
function parseCSV(text) {
  const raw = text.replace(/^\uFEFF/, '');
  const lines = raw.split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];
  const headers = splitLine(lines[0]);
  return lines.slice(1).map(l => {
    const vals = splitLine(l);
    return Object.fromEntries(headers.map((h, i) => [h, vals[i] ?? '']));
  });
}
function splitLine(line) {
  const r = []; let cur = ''; let q = false;
  for (const ch of line) {
    if (ch === '"') { q = !q; continue; }
    if (ch === ',' && !q) { r.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  r.push(cur.trim());
  return r;
}
async function apiFetch(url, signal) {
  const res = await fetch(url, signal ? { signal } : {});
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

/* ── Data fetchers ───────────────────────────────────────────────────── */
async function getMlbSchedule() {
  const today = new Date().toISOString().slice(0, 10);
  const res = await fetch(
    `${STATSAPI}/schedule?sportId=1&date=${today}&hydrate=probablePitcher,lineups,teams,game(content(summary))`
  );
  const data = await res.json();
  return data.dates?.[0]?.games || [];
}

// Fetch ALL pitcher stats for the season in one call — filter client-side
async function fetchAllPitcherStats() {
  const year = new Date().getFullYear();
  const text = await apiFetch(
    `${BS}/statcast_search/csv?player_type=pitcher&hfGT=R%7C&hfSea=${year}%7C&min_pitches=0&min_results=0&group_by=name&sort_col=pitches&sort_order=desc&min_pas=0`
  );
  const rows = parseCSV(text);
  const map = {};
  rows.forEach(r => { if (r.player_id) map[String(r.player_id).trim()] = r; });
  return map;
}

// Get pitcher splits vs L and R from statcast_search leaderboard
async function fetchPitcherSplitsById(mlbId) {
  const year = new Date().getFullYear();
  const base = `${BS}/statcast_search/csv?player_type=pitcher&hfGT=R%7C&hfSea=${year}%7C&min_pitches=0&min_results=0&group_by=name&sort_col=pitches&sort_order=desc&min_pas=0`;
  const [allText, vsLText, vsRText] = await Promise.all([
    apiFetch(base),
    apiFetch(base + '&batter_stands=L'),
    apiFetch(base + '&batter_stands=R'),
  ]);
  const pick = (text) => parseCSV(text).find(r => String(r.player_id).trim() === String(mlbId).trim()) || null;
  return { all: pick(allText), vsL: pick(vsLText), vsR: pick(vsRText) };
}

// Season stats for team batters (vs specific pitcher handedness)
async function fetchTeamBattersForRankings(abbr, pitcherThrows) {
  const year = new Date().getFullYear();
  const throwsParam = pitcherThrows ? `&pitcher_throws=${pitcherThrows}` : '';
  const url = `${BS}/statcast_search/csv?player_type=batter&hfGT=R%7C&hfTeam=${encodeURIComponent(abbr + '|')}&hfSea=${year}%7C&min_pitches=0&min_results=0&group_by=name&sort_col=pitches&sort_order=desc&min_pas=0${throwsParam}`;
  const text = await apiFetch(url);
  const rows = parseCSV(text);
  const map = {};
  rows.forEach(r => { if (r.player_id) map[String(r.player_id).trim()] = r; });
  return map;
}

// Recent form: last 14 days (all pitchers — no hand filter, small sample)
async function fetchTeamRecentForm(abbr) {
  const d = new Date(); d.setDate(d.getDate() - 14);
  const since = d.toISOString().slice(0, 10);
  const url = `${BS}/statcast_search/csv?player_type=batter&hfGT=R%7C&hfTeam=${encodeURIComponent(abbr + '|')}&game_date_gt=${since}&min_pitches=0&min_results=0&group_by=name&sort_col=pitches&sort_order=desc&min_pas=0`;
  const text = await apiFetch(url).catch(() => '');
  if (!text) return {};
  const rows = parseCSV(text);
  const map = {};
  rows.forEach(r => { if (r.player_id) map[String(r.player_id).trim()] = r; });
  return map;
}

// Blend season stats with recent form (weighted by recent PA to avoid tiny-sample noise)
function blendStats(season, recent) {
  if (!recent) return { ...season, _recentXwoba: null, _recentPA: 0 };
  const recentPA = parseInt(recent.pa) || 0;
  // Scale weight linearly: 0 PA → 0%, 30+ PA → 40% recent
  const w = Math.min(0.40, (recentPA / 30) * 0.40);
  const mix = (key, fallback) => {
    const sv = parseFloat(season[key]);
    const rv = parseFloat(recent[key]);
    const s = isNaN(sv) ? fallback : sv;
    const r2 = isNaN(rv) ? s : rv;
    return ((s * (1 - w)) + (r2 * w)).toFixed(4);
  };
  return {
    ...season,
    xwoba:                   mix('xwoba',                   0.320),
    woba:                    mix('woba',                    0.320),
    hardhit_percent:         mix('hardhit_percent',         38),
    barrels_per_bbe_percent: mix('barrels_per_bbe_percent', 8),
    bb_percent:              mix('bb_percent',              8.5),
    k_percent:               mix('k_percent',               22),
    iso:                     mix('iso',                     0.165),
    _recentXwoba: parseFloat(recent.xwoba) || null,
    _recentPA:    recentPA,
  };
}

// Hot/cold indicator based on recent vs season xwOBA gap
function formTag(seasonXwoba, recentXwoba, recentPA) {
  if (recentPA < 15 || !recentXwoba) return { icon: '', cls: '' };
  const diff = recentXwoba - seasonXwoba;
  if (diff >= 0.060) return { icon: '🔥🔥', cls: 'form-hot2' };
  if (diff >= 0.030) return { icon: '🔥',   cls: 'form-hot' };
  if (diff <= -0.060) return { icon: '❄️❄️', cls: 'form-cold2' };
  if (diff <= -0.030) return { icon: '❄️',  cls: 'form-cold' };
  return { icon: '', cls: '' };
}

/* ── ESPN ID resolution ──────────────────────────────────────────────── */
// Fetch all ESPN MLB team abbreviation → ESPN team ID mapping
async function fetchEspnTeamIds() {
  const res = await fetch('https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/teams?limit=50');
  const data = await res.json();
  const map = {};
  for (const t of (data.sports?.[0]?.leagues?.[0]?.teams || [])) {
    const team = t.team;
    if (team?.abbreviation && team?.id) map[team.abbreviation.toUpperCase()] = team.id;
  }
  return map;
}

// Fetch ESPN roster for a team and return normName → espnAthleteId map
async function fetchEspnRoster(espnTeamId) {
  const res = await fetch(
    `https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/teams/${espnTeamId}/roster`
  );
  const data = await res.json();
  const map = {};
  for (const group of (data.athletes || [])) {
    const items = Array.isArray(group) ? group : (group.items || group.athletes || []);
    for (const a of items) {
      const name = a.fullName || a.displayName || '';
      if (name && a.id) map[normName(name)] = String(a.id);
    }
  }
  return map;
}

/* ── DraftKings salary CSV parser ───────────────────────────────────── */
// Normalize names for fuzzy matching (removes accents, suffixes, punctuation)
function normName(name) {
  return (name || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')  // strip diacritics
    .replace(/\s+(jr\.?|sr\.?|ii|iii|iv)[\s.]*$/i, '') // strip suffixes
    .toLowerCase().replace(/[^a-z]/g, '');               // letters only
}

function parseDkCsv(text) {
  // DraftKings format:
  // Position,Name + ID,Name,ID,Roster Position,Salary,Game Info,TeamAbbrev,AvgPointsPerGame
  const lines = text.split('\n').filter(l => l.trim());
  // Find header line
  const headerIdx = lines.findIndex(l => l.includes('Salary') && l.includes('Name'));
  if (headerIdx === -1) return {};
  const headers = lines[headerIdx].split(',').map(h => h.trim().replace(/"/g, '').toLowerCase());
  const nameIdx   = headers.findIndex(h => h === 'name');
  const salaryIdx = headers.findIndex(h => h === 'salary');
  const teamIdx   = headers.findIndex(h => h.includes('team'));

  const salaryMap = {}; // normName → { name, salary, team }
  for (const line of lines.slice(headerIdx + 1)) {
    if (!line.trim()) continue;
    // Handle quoted fields
    const cols = line.split(',').map(c => c.trim().replace(/^"|"$/g, ''));
    const name   = cols[nameIdx]   || '';
    const salary = parseInt((cols[salaryIdx] || '').replace(/[^0-9]/g, '')) || 0;
    const team   = cols[teamIdx]   || '';
    if (name && salary > 0) {
      salaryMap[normName(name)] = { name, salary, team };
    }
  }
  return salaryMap;
}

/* ── DK Fantasy Points Projection ───────────────────────────────────── */
// DraftKings MLB batter scoring:
//   1B=3, 2B=5, 3B=8, HR=10, BB/HBP=2, RBI=2, R=2, SB=5
// We estimate expected DK pts from Statcast metrics.
function projDkPts(batter, pitcherRow) {
  const s = (v, d = 0) => { const n = parseFloat(v); return isNaN(n) ? d : n; };

  const xwoba = s(batter.xwoba,   0.320);
  const brl   = s(batter.barrels_per_bbe_percent, 8) / 100;
  const bb    = s(batter.bb_percent,   8.5) / 100;
  const k     = s(batter.k_percent,    22)  / 100;
  const iso   = s(batter.iso,          0.165);
  const pXwoba = s(pitcherRow?.xwoba,  0.320);
  const pK     = s(pitcherRow?.k_percent, 22) / 100;

  // Base projection: calibrated so .320 xwOBA → ~7.4 pts, .400 → ~11 pts
  const base = xwoba * 45 - 7.0;

  // Power bonus: barrel% above avg drives HR/XBH (worth 5-10 DK pts each)
  const brlBonus  = (brl - 0.08) * 15;

  // BB bonus: each walk is guaranteed 2 DK pts
  const bbBonus   = (bb - 0.085) * 10;

  // ISO bonus: extra base hit ability
  const isoBonus  = (iso - 0.165) * 5;

  // K penalty: strikeouts waste plate appearances
  const kPenalty  = (k - 0.22) * 8;

  // Pitcher quality multiplier: tougher pitchers suppress all stats
  // Easy pitcher (.400 xwOBA) → 1.25×, Average (.320) → 1.0×, Ace (.240) → 0.75×
  const pitcherMult = 0.70 + (pXwoba / 0.400) * 0.60;

  // Pitcher strikeout rate penalty: high-K pitcher → fewer balls in play → lower pts
  const pitcherKPenalty = (pK - 0.22) * 3;

  const raw = (base + brlBonus + bbBonus + isoBonus - kPenalty - pitcherKPenalty) * pitcherMult;
  return Math.max(0.5, Math.round(raw * 10) / 10);
}

/* ── Scoring formula ─────────────────────────────────────────────────── */
// Score each batter-pitcher matchup on a ~0-100 scale.
// Higher = better offensive matchup for this batter today.
function calcScore(batter, pitcherRow) {
  const safe = (v, fallback = 0) => { const n = parseFloat(v); return isNaN(n) ? fallback : n; };

  const bXwoba = safe(batter.xwoba,   0.320);
  const bHH    = safe(batter.hardhit_percent, 38) / 100;
  const bBrl   = safe(batter.barrels_per_bbe_percent, 8) / 100;
  const bBB    = safe(batter.bb_percent, 8.5) / 100;
  const bK     = safe(batter.k_percent, 22) / 100;

  // Pitcher: how hittable are they? Higher xwOBA allowed = easier matchup
  const pXwoba = safe(pitcherRow?.xwoba, 0.320);
  const pHH    = safe(pitcherRow?.hardhit_percent, 38) / 100;
  const pBrl   = safe(pitcherRow?.barrels_per_bbe_percent, 8) / 100;
  const pK     = safe(pitcherRow?.k_percent, 22) / 100; // lower pitcher K = easier

  // Composite: batter ability (60%) + pitcher vulnerability (40%)
  const batterScore =
    (bXwoba / 0.400) * 35 +      // xwOBA: 35 pts max (.400 = perfect)
    bHH * 15 +                    // Hard Hit: 15 pts max (100% = perfect)
    bBrl * 10 +                   // Barrel: 10 pts max (100% = perfect)
    bBB * 8 +                     // BB: 8 pts max (100% = perfect)
    (1 - bK) * 7;                 // Low K: 7 pts max (0% K = perfect)

  const pitcherScore =
    (pXwoba / 0.400) * 20 +      // pitcher xwOBA allowed: 20 pts max
    pHH * 10 +                    // pitcher hard hit allowed: 10 pts max
    pBrl * 5 +                    // pitcher barrel allowed: 5 pts max
    (1 - pK) * 5;                 // pitcher low K rate (easier to hit): 5 pts max

  return Math.min(100, batterScore + pitcherScore);
}

/* ── Score badge color ───────────────────────────────────────────────── */
function scoreBadgeClass(score) {
  if (score >= 75) return 'rank-badge-elite';
  if (score >= 65) return 'rank-badge-good';
  if (score >= 55) return 'rank-badge-avg';
  return 'rank-badge-poor';
}

function fmt(val, type) {
  const n = parseFloat(val);
  if (isNaN(n) || val == null || val === '') return '—';
  if (type === 'avg') return n < 1 ? n.toFixed(3).replace(/^0\./, '.') : n.toFixed(3);
  if (type === 'pct') return n.toFixed(1) + '%';
  return String(n);
}

/* ─────────────────────────────────────────────────────────────────────
   Main Rankings Page
   ───────────────────────────────────────────────────────────────────── */
export default function RankingsPage() {
  const [rankings, setRankings]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [progress, setProgress]   = useState('');
  const [filterTeam, setFilterTeam] = useState('');
  const [filterHand, setFilterHand] = useState('');
  const [sortCol, setSortCol]     = useState('score');
  const [sortDir, setSortDir]     = useState('desc');
  const [salaryMap, setSalaryMap]   = useState({});
  const [espnIdMap, setEspnIdMap]   = useState({});  // normName → espnAthleteId
  const fileInputRef = useRef(null);
  const navigate = useNavigate();

  const handleDkUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const parsed = parseDkCsv(ev.target.result || '');
      setSalaryMap(parsed);
      setSortCol('value'); // auto-sort by value once salaries loaded
      setSortDir('desc');
    };
    reader.readAsText(file);
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setRankings([]);

    (async () => {
      try {
        // Step 1: today's schedule
        setProgress('Loading today\'s schedule…');
        const games = await getMlbSchedule();
        if (cancelled) return;

        // Step 2: all pitcher stats (one big call)
        setProgress('Fetching pitcher stats…');
        const allPitcherStats = await fetchAllPitcherStats().catch(() => ({}));
        if (cancelled) return;

        // Step 3: pitcher handedness for each probable pitcher
        setProgress('Resolving pitcher handedness…');
        const pitcherMatchups = games.flatMap(g => [
          { game: g, pitcher: g.teams?.home?.probablePitcher, batterTeamId: g.teams?.away?.team?.id, batterSide: 'away' },
          { game: g, pitcher: g.teams?.away?.probablePitcher, batterTeamId: g.teams?.home?.team?.id, batterSide: 'home' },
        ]).filter(m => m.pitcher?.id && m.batterTeamId);

        // Fetch pitcher hands in parallel
        const handResults = await Promise.allSettled(
          pitcherMatchups.map(async (m) => {
            const res = await fetch(`${STATSAPI}/people/${m.pitcher.id}`);
            const data = await res.json();
            return data.people?.[0]?.pitchHand?.code || null;
          })
        );

        const matchupsWithHands = pitcherMatchups.map((m, i) => ({
          ...m,
          pitcherHand: handResults[i].status === 'fulfilled' ? handResults[i].value : null,
        }));

        if (cancelled) return;

        // Step 4: fetch season stats + recent form in parallel for each team
        setProgress('Fetching batter stats + recent form…');
        const batterResults = await Promise.allSettled(
          matchupsWithHands.map(async (m) => {
            const abbr = MLB_ABBR[m.batterTeamId];
            if (!abbr) return null;
            const [seasonById, recentById] = await Promise.allSettled([
              fetchTeamBattersForRankings(abbr, m.pitcherHand),
              fetchTeamRecentForm(abbr),
            ]);
            return {
              ...m, abbr,
              byId:     seasonById.status  === 'fulfilled' ? seasonById.value  : {},
              recentById: recentById.status === 'fulfilled' ? recentById.value : {},
            };
          })
        );

        if (cancelled) return;

        // Step 5: compute scores for every batter
        setProgress('Computing ShribeIQ scores…');
        const allRows = [];
        batterResults.forEach(res => {
          if (res.status !== 'fulfilled' || !res.value) return;
          const { game, pitcher, pitcherHand, abbr, byId, recentById } = res.value;
          const pitcherId = String(pitcher.id);
          const pitcherRow = allPitcherStats[pitcherId] || null;

          Object.entries(byId).forEach(([batterId, seasonBatter]) => {
            if ((parseInt(seasonBatter.abs) || 0) < 100) return;

            // Blend season + recent form
            const recentBatter = recentById[batterId] || null;
            const batter = blendStats(seasonBatter, recentBatter);

            const score   = calcScore(batter, pitcherRow);
            const projPts = projDkPts(batter, pitcherRow);
            const playerName = (batter.player_name || '').split(',').map(s => s.trim()).reverse().join(' ');
            const form = formTag(
              parseFloat(seasonBatter.xwoba) || 0.320,
              batter._recentXwoba,
              batter._recentPA
            );
            allRows.push({
              batterId,
              playerName,
              playerNameNorm: normName(playerName),
              teamAbbr: abbr,
              pitcherName: pitcher.fullName || '',
              pitcherId,
              pitcherHand: pitcherHand || '?',
              score:   Math.round(score * 10) / 10,
              projPts,
              pa:      batter.pa,
              xwoba:   batter.xwoba,    // blended
              woba:    batter.woba,     // blended
              hh:      batter.hardhit_percent,
              brl:     batter.barrels_per_bbe_percent,
              kpct:    batter.k_percent,
              bbpct:   batter.bb_percent,
              iso:     batter.iso,
              pXwoba:  pitcherRow?.xwoba,
              pKpct:   pitcherRow?.k_percent,
              formIcon: form.icon,
              formCls:  form.cls,
              recentXwoba: batter._recentXwoba,
              recentPA:    batter._recentPA,
            });
          });
        });

        if (!cancelled) {
          allRows.sort((a, b) => b.score - a.score);
          setRankings(allRows);
          setLoading(false);
          setProgress('');
        }

        // Background: resolve ESPN athlete IDs for clickable player links
        if (!cancelled) {
          const teamAbbrs = [...new Set(allRows.map(r => r.teamAbbr))];
          fetchEspnTeamIds().then(async (espnTeamIdMap) => {
            const combined = {};
            await Promise.allSettled(
              teamAbbrs.map(async (abbr) => {
                const espnTeamId = espnTeamIdMap[abbr];
                if (!espnTeamId) return;
                const rosterMap = await fetchEspnRoster(espnTeamId).catch(() => ({}));
                Object.assign(combined, rosterMap);
              })
            );
            if (!cancelled) setEspnIdMap(combined);
          }).catch(() => {});
        }
      } catch (e) {
        if (!cancelled) { setLoading(false); setProgress(''); }
      }
    })();

    return () => { cancelled = true; };
  }, []);

  /* ── Merge salary data into rows ── */
  const enriched = rankings.map(r => {
    const dk = salaryMap[r.playerNameNorm] || null;
    const salary = dk?.salary || 0;
    const value  = salary > 0 ? Math.round((r.projPts / (salary / 1000)) * 100) / 100 : null;
    return { ...r, salary, value };
  });
  const hasSalaries = enriched.some(r => r.salary > 0);

  const handleSort = (col) => {
    if (sortCol === col) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSortCol(col); setSortDir('desc'); }
  };

  const teams = [...new Set(enriched.map(r => r.teamAbbr))].sort();

  const filtered = enriched.filter(r => {
    if (filterTeam && r.teamAbbr !== filterTeam) return false;
    if (filterHand && r.pitcherHand !== filterHand) return false;
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    const va = parseFloat(a[sortCol]) || 0;
    const vb = parseFloat(b[sortCol]) || 0;
    return sortDir === 'desc' ? vb - va : va - vb;
  });

  const ColHeader = ({ col, label }) => (
    <th className={`rank-th ${sortCol === col ? 'rank-th-active' : ''}`}
      onClick={() => handleSort(col)} style={{ cursor: 'pointer', userSelect: 'none' }}>
      {label}{sortCol === col ? (sortDir === 'desc' ? ' ▼' : ' ▲') : ''}
    </th>
  );

  return (
    <div className="rank-page">
      {/* Header */}
      <div className="rank-header">
        <div>
          <div className="rank-title">⚡ ShribeIQ Batter Rankings</div>
          <div className="rank-subtitle">
            All today's batters ranked by matchup favorability — Statcast metrics vs opposing pitcher
          </div>
        </div>
        {!loading && (
          <div className="rank-meta">
            {sorted.length} batters · {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </div>
        )}
      </div>

      {/* Filters + DK Upload */}
      {!loading && (
        <div className="rank-controls">
          <div className="rank-filters">
            <select className="dfs-arsenal-select" value={filterTeam} onChange={e => setFilterTeam(e.target.value)}>
              <option value="">All Teams</option>
              {teams.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <select className="dfs-arsenal-select" value={filterHand} onChange={e => setFilterHand(e.target.value)}>
              <option value="">All Pitchers</option>
              <option value="L">vs LHP</option>
              <option value="R">vs RHP</option>
            </select>
          </div>
          <div className="rank-dk-upload">
            <input ref={fileInputRef} type="file" accept=".csv" style={{ display: 'none' }}
              onChange={handleDkUpload} />
            <button className={`rank-upload-btn ${hasSalaries ? 'rank-upload-btn-active' : ''}`}
              onClick={() => fileInputRef.current?.click()}>
              {hasSalaries ? `✓ DK Salaries Loaded` : '📥 Import DraftKings Salaries (.csv)'}
            </button>
            {!hasSalaries && (
              <div className="rank-upload-hint">
                Download from DK contest lobby → Export Salaries → Upload here
              </div>
            )}
          </div>
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="rank-loading">
          <div className="auth-spinner" />
          <div>
            <div className="rank-loading-title">Building ShribeIQ Rankings…</div>
            <div className="rank-loading-sub">{progress}</div>
          </div>
        </div>
      )}

      {/* Rankings table */}
      {!loading && (
        <div className="rank-table-wrap">
          <table className="rank-table">
            <thead>
              <tr>
                <th className="rank-th rank-th-num">#</th>
                <th className="rank-th rank-th-player">Batter</th>
                <th className="rank-th">Team</th>
                <th className="rank-th rank-th-pitcher">Opposing Pitcher</th>
                {hasSalaries && <ColHeader col="salary"  label="Salary" />}
                {hasSalaries && <ColHeader col="projPts" label="Proj Pts" />}
                {hasSalaries && <ColHeader col="value"   label="Pts/$K" />}
                <ColHeader col="score"  label="Score" />
                <ColHeader col="xwoba"  label="xwOBA" />
                <ColHeader col="woba"   label="wOBA" />
                <ColHeader col="hh"     label="HH%" />
                <ColHeader col="brl"    label="Brl%" />
                <ColHeader col="kpct"   label="K%" />
                <ColHeader col="bbpct"  label="BB%" />
                <ColHeader col="pXwoba" label="P.xwOBA" />
                <ColHeader col="pKpct"  label="P.K%" />
              </tr>
            </thead>
            <tbody>
              {sorted.map((r, i) => (
                <tr key={`${r.batterId}-${r.pitcherId}`} className="rank-tr">
                  <td className="rank-td rank-td-num">{i + 1}</td>
                  <td className="rank-td rank-td-player">
                    {espnIdMap[r.playerNameNorm] ? (
                      <span
                        className="rank-player-name rank-player-link"
                        onClick={() => navigate(`/player/mlb/${espnIdMap[r.playerNameNorm]}`)}
                        title="View player profile"
                      >
                        {r.playerName}
                      </span>
                    ) : (
                      <span className="rank-player-name">{r.playerName}</span>
                    )}
                    {r.formIcon && (
                      <span className="rank-form-icon" title={`Recent xwOBA: ${r.recentXwoba?.toFixed(3)} (${r.recentPA} PA last 14d)`}>
                        {r.formIcon}
                      </span>
                    )}
                  </td>
                  <td className="rank-td rank-td-team">{r.teamAbbr}</td>
                  <td className="rank-td rank-td-pitcher">
                    <span>{r.pitcherName.split(' ').map((w,i)=>i===0?w[0]+'.':w).join(' ')}</span>
                    <span className={`rank-hand rank-hand-${r.pitcherHand?.toLowerCase()}`}>{r.pitcherHand}</span>
                  </td>
                  {hasSalaries && (
                    <td className="rank-td rank-salary">
                      {r.salary > 0 ? `$${r.salary.toLocaleString()}` : '—'}
                    </td>
                  )}
                  {hasSalaries && (
                    <td className="rank-td rank-proj">
                      {r.projPts > 0 ? r.projPts : '—'}
                    </td>
                  )}
                  {hasSalaries && (
                    <td className="rank-td">
                      {r.value != null ? (
                        <span className={`rank-value-badge ${r.value >= 3.5 ? 'rank-badge-elite' : r.value >= 2.5 ? 'rank-badge-good' : r.value >= 2.0 ? 'rank-badge-avg' : 'rank-badge-poor'}`}>
                          {r.value}x
                        </span>
                      ) : '—'}
                    </td>
                  )}
                  <td className="rank-td">
                    <span className={`rank-score-badge ${scoreBadgeClass(r.score)}`}>{r.score}</span>
                  </td>
                  <td className="rank-td">{fmt(r.xwoba, 'avg')}</td>
                  <td className="rank-td">{fmt(r.woba, 'avg')}</td>
                  <td className="rank-td">{fmt(r.hh, 'pct')}</td>
                  <td className="rank-td">{fmt(r.brl, 'pct')}</td>
                  <td className="rank-td">{fmt(r.kpct, 'pct')}</td>
                  <td className="rank-td">{fmt(r.bbpct, 'pct')}</td>
                  <td className="rank-td rank-td-dim">{fmt(r.pXwoba, 'avg')}</td>
                  <td className="rank-td rank-td-dim">{fmt(r.pKpct, 'pct')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
