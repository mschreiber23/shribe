import { useState, useEffect } from 'react';

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

// Fetch all batters on a team vs a specific pitcher handedness
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

        // Step 4: fetch batter stats for each team vs pitcher handedness
        setProgress('Fetching batter matchup data…');
        const batterResults = await Promise.allSettled(
          matchupsWithHands.map(async (m) => {
            const abbr = MLB_ABBR[m.batterTeamId];
            if (!abbr) return null;
            const byId = await fetchTeamBattersForRankings(abbr, m.pitcherHand);
            return { ...m, abbr, byId };
          })
        );

        if (cancelled) return;

        // Step 5: compute scores for every batter
        setProgress('Computing ShribeIQ scores…');
        const allRows = [];
        batterResults.forEach(res => {
          if (res.status !== 'fulfilled' || !res.value) return;
          const { game, pitcher, pitcherHand, abbr, byId } = res.value;
          const pitcherId = String(pitcher.id);
          const pitcherRow = allPitcherStats[pitcherId] || null;

          // Get pitcher's split stats based on batter handedness
          // (will be refined if we want separate vs L/R — for now use overall pitcher stats)
          Object.entries(byId).forEach(([batterId, batter]) => {
            const score = calcScore(batter, pitcherRow);
            const playerName = (batter.player_name || '').split(',').map(s => s.trim()).reverse().join(' ');
            allRows.push({
              batterId,
              playerName,
              teamAbbr: abbr,
              pitcherName: pitcher.fullName || '',
              pitcherId,
              pitcherHand: pitcherHand || '?',
              score: Math.round(score * 10) / 10,
              pa:    batter.pa,
              xwoba: batter.xwoba,
              woba:  batter.woba,
              hh:    batter.hardhit_percent,
              brl:   batter.barrels_per_bbe_percent,
              kpct:  batter.k_percent,
              bbpct: batter.bb_percent,
              iso:   batter.iso,
              // Pitcher context
              pXwoba: pitcherRow?.xwoba,
              pKpct:  pitcherRow?.k_percent,
              pHH:    pitcherRow?.hardhit_percent,
            });
          });
        });

        if (!cancelled) {
          allRows.sort((a, b) => b.score - a.score);
          setRankings(allRows);
          setLoading(false);
          setProgress('');
        }
      } catch (e) {
        if (!cancelled) { setLoading(false); setProgress(''); }
      }
    })();

    return () => { cancelled = true; };
  }, []);

  const handleSort = (col) => {
    if (sortCol === col) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSortCol(col); setSortDir('desc'); }
  };

  const teams = [...new Set(rankings.map(r => r.teamAbbr))].sort();

  const filtered = rankings.filter(r => {
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

      {/* Filters */}
      {!loading && (
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
                    <span className="rank-player-name">{r.playerName}</span>
                  </td>
                  <td className="rank-td rank-td-team">{r.teamAbbr}</td>
                  <td className="rank-td rank-td-pitcher">
                    <span>{r.pitcherName.split(' ').map((w,i)=>i===0?w[0]+'.':w).join(' ')}</span>
                    <span className={`rank-hand rank-hand-${r.pitcherHand?.toLowerCase()}`}>{r.pitcherHand}</span>
                  </td>
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
