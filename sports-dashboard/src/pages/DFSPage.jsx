import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { getScoreboard } from '../api/espn';

/* ── CSV helpers (same as StatcastPage) ─────────────────────────────── */
function parseCSV(text) {
  const raw = text.replace(/^\uFEFF/, '');
  const lines = raw.split('\n').filter((l) => l.trim());
  if (lines.length < 2) return { headers: [], rows: [] };
  const headers = splitLine(lines[0]);
  const rows = lines.slice(1).map((l) => {
    const vals = splitLine(l);
    return Object.fromEntries(headers.map((h, i) => [h, vals[i] ?? '']));
  });
  return { headers, rows };
}
function splitLine(line) {
  const result = []; let cur = ''; let q = false;
  for (const ch of line) {
    if (ch === '"') { q = !q; continue; }
    if (ch === ',' && !q) { result.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  result.push(cur.trim());
  return result;
}
async function bsFetch(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  if (text.trimStart().startsWith('<')) throw new Error('HTML response');
  return text;
}

const BS = 'https://baseballsavant.mlb.com';
const STATSAPI = 'https://statsapi.mlb.com/api/v1';

// Static MLB team ID → Baseball Savant abbreviation (API doesn't return abbr in schedule)
const MLB_ABBR = {
  108: 'LAA', 109: 'ARI', 110: 'BAL', 111: 'BOS', 112: 'CHC',
  113: 'CIN', 114: 'CLE', 115: 'COL', 116: 'DET', 117: 'HOU',
  118: 'KC',  119: 'LAD', 120: 'WSH', 121: 'NYM', 133: 'ATH',
  134: 'PIT', 135: 'SD',  136: 'SEA', 137: 'SF',  138: 'STL',
  139: 'TB',  140: 'TEX', 141: 'TOR', 142: 'MIN', 143: 'PHI',
  144: 'ATL', 145: 'CWS', 146: 'MIA', 147: 'NYY', 158: 'MIL',
};
// Short city/team label for display
const MLB_SHORT = {
  108: 'LAA', 109: 'ARI', 110: 'BAL', 111: 'BOS', 112: 'CHC',
  113: 'CIN', 114: 'CLE', 115: 'COL', 116: 'DET', 117: 'HOU',
  118: 'KC',  119: 'LAD', 120: 'WSH', 121: 'NYM', 133: 'ATH',
  134: 'PIT', 135: 'SD',  136: 'SEA', 137: 'SF',  138: 'STL',
  139: 'TB',  140: 'TEX', 141: 'TOR', 142: 'MIN', 143: 'PHI',
  144: 'ATL', 145: 'CWS', 146: 'MIA', 147: 'NYY', 158: 'MIL',
};

/* ── Name normalisation for Savant matching ──────────────────────────── */
function normKey(name) { return name.toLowerCase().replace(/[^a-z]/g, ''); }
function savantToDisplay(savantName) {
  const [last, ...rest] = savantName.split(',');
  return `${rest.join('').trim()} ${last.trim()}`;
}

/* ── MLB Stats API helpers ─────────────────────────────────────────── */
async function mlbFetch(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// Today's MLB schedule with lineups + probable pitchers
async function getMlbSchedule() {
  const today = new Date().toISOString().slice(0, 10);
  const data = await mlbFetch(
    `${STATSAPI}/schedule?sportId=1&date=${today}&hydrate=probablePitcher,lineups,teams,game(content(summary))`
  );
  return data.dates?.[0]?.games || [];
}

// Get projected lineup: use boxscore batting order from most recent completed game.
// The boxscore endpoint has explicit home/away team separation — far more reliable
// than the schedule lineups hydration which can mislabel players.
async function getProjectedLineup(teamId) {
  const end = new Date(); end.setDate(end.getDate() - 1);
  const start = new Date(); start.setDate(start.getDate() - 14);
  const fmt = (d) => d.toISOString().slice(0, 10);

  const schedule = await mlbFetch(
    `${STATSAPI}/schedule?sportId=1&teamId=${teamId}&startDate=${fmt(start)}&endDate=${fmt(end)}&gameType=R`
  );

  // Walk dates newest-first, find most recent Final game
  for (const dateObj of [...(schedule.dates || [])].reverse()) {
    for (const game of [...(dateObj.games || [])].reverse()) {
      if (game.status?.abstractGameState !== 'Final') continue;
      try {
        const bs = await mlbFetch(`${STATSAPI}/game/${game.gamePk}/boxscore`);
        const isHome = game.teams?.home?.team?.id === Number(teamId);
        const teamBs = isHome ? bs.teams?.home : bs.teams?.away;
        const battingOrder = teamBs?.battingOrder || [];
        const playerMap   = teamBs?.players || {};

        if (battingOrder.length === 0) continue;

        const players = battingOrder.map((id) => {
          const entry = playerMap[`ID${id}`];
          if (!entry) return null;
          return {
            id: entry.person?.id,
            fullName: entry.person?.fullName || '',
            useName:  entry.person?.useName  || '',
            primaryPosition: entry.position || {},
            batSide: entry.person?.batSide || {},
          };
        }).filter(Boolean);

        if (players.length > 0) {
          return { players, confirmed: false, fromDate: dateObj.date };
        }
      } catch { continue; }
    }
  }
  return { players: [], confirmed: false, fromDate: null };
}

/* ── MLB ID resolution (fallback for pitcher only) ─────────────────── */
async function resolveMlbId(fullName) {
  try {
    const res = await fetch(`${STATSAPI}/people/search?names=${encodeURIComponent(fullName)}&sportIds=1`);
    const data = await res.json();
    const people = data.people || [];
    const match = people.find((p) => p.fullName?.toLowerCase() === fullName.toLowerCase()) || people[0];
    return match?.id ? String(match.id) : null;
  } catch { return null; }
}

/* ── Baseball Savant data fetching ──────────────────────────────────── */
async function fetchBattedBallLeaderboard() {
  const year = new Date().getFullYear();
  const text = await bsFetch(
    `${BS}/leaderboard/batted-ball?type=batter&year=${year}&min=1&csv=true`
  );
  const { rows } = parseCSV(text);
  const map = {};
  rows.forEach((r) => { if (r.id) map[String(r.id).trim()] = r; });
  return map; // keyed by player_id
}

async function fetchTeamBatters(teamAbbr, pitcherThrows) {
  const year = new Date().getFullYear();
  const throwsParam = pitcherThrows ? `&pitcher_throws=${pitcherThrows}` : '';
  const statsUrl = `${BS}/statcast_search/csv?player_type=batter&hfGT=R%7C&hfTeam=${encodeURIComponent(teamAbbr + '|')}&hfSea=${year}%7C&min_pitches=0&min_results=0&group_by=name&sort_col=pitches&sort_order=desc&min_pas=0${throwsParam}`;

  // Fetch statcast stats + batted ball profile in parallel
  const [statsRes, bbRes] = await Promise.allSettled([
    bsFetch(statsUrl),
    fetchBattedBallLeaderboard(),
  ]);

  const rows = statsRes.status === 'fulfilled' ? parseCSV(statsRes.value).rows : [];
  const bbMap = bbRes.status === 'fulfilled' ? bbRes.value : {};

  // Merge batted-ball rates into each row (multiply by 100 → percentage)
  const pct = (v) => v != null && v !== '' ? (parseFloat(v) * 100).toFixed(1) : null;
  const merged = rows.map((r) => {
    const bb = bbMap[String(r.player_id).trim()] || {};
    return {
      ...r,
      gb_pct: pct(bb.gb_rate),
      fb_pct: pct(bb.fb_rate),
      ld_pct: pct(bb.ld_rate),
    };
  });

  const byId = {};
  const byName = {};
  merged.forEach((r) => {
    if (r.player_id) byId[String(r.player_id).trim()] = r;
    const display = savantToDisplay(r.player_name || '');
    byName[normKey(display)] = r;
    const last = (r.player_name || '').split(',')[0].trim().toLowerCase().replace(/[^a-z]/g, '');
    if (last && !byName[last]) byName[last] = r;
  });
  return { byId, byName };
}

async function fetchPitcherHand(mlbId) {
  const data = await mlbFetch(`${STATSAPI}/people/${mlbId}`);
  return data.people?.[0]?.pitchHand?.code || null;
}

async function fetchBvpStats(batterId, pitcherId) {
  const data = await mlbFetch(
    `${STATSAPI}/people/${batterId}/stats?stats=vsPlayer&opposingPlayerId=${pitcherId}&group=hitting&sportId=1`
  );
  const splits = data.stats?.find((s) => s.type?.displayName === 'vsPlayer')?.splits || [];
  return splits[0]?.stat || null;
}

async function fetchPitcherSeasonStats(mlbId) {
  const year = new Date().getFullYear();
  const data = await mlbFetch(
    `${STATSAPI}/people/${mlbId}/stats?stats=statsSingleSeason&group=pitching&season=${year}&sportId=1`
  );
  const splits = data.stats?.[0]?.splits || [];
  return splits[0]?.stat || null;
}

async function fetchPitcherSplits(mlbId) {
  const year = new Date().getFullYear();
  // NOTE: pitcherID param is ignored by the endpoint — must fetch full leaderboard
  // and filter by player_id client-side (same pattern as percentile rankings).
  const base = `${BS}/statcast_search/csv?player_type=pitcher&hfGT=R%7C&hfSea=${year}%7C&min_pitches=0&min_results=0&group_by=name&sort_col=pitches&sort_order=desc&min_pas=0`;
  const [allRes, vsLRes, vsRRes] = await Promise.allSettled([
    bsFetch(base),
    bsFetch(base + '&batter_stands=L'),
    bsFetch(base + '&batter_stands=R'),
  ]);
  const pick = (r) => {
    if (r.status !== 'fulfilled') return null;
    const { rows } = parseCSV(r.value);
    return rows.find((row) => String(row.player_id).trim() === String(mlbId).trim()) || null;
  };
  return { all: pick(allRes), vsL: pick(vsLRes), vsR: pick(vsRRes) };
}

/* ── League averages for heat-map (2025/26 approximations) ─────────── */
const BATTER_AVGS = {
  k_percent:             { avg: 22,    invert: true,  higherBetter: false },
  bb_percent:            { avg: 8.5,   invert: false, higherBetter: true  },
  iso:                   { avg: 0.165, invert: false, higherBetter: true  },
  woba:                  { avg: 0.320, invert: false, higherBetter: true  },
  xwoba:                 { avg: 0.320, invert: false, higherBetter: true  },
  hardhit_percent:       { avg: 38,    invert: false, higherBetter: true  },
  barrels_per_bbe_percent:{ avg: 8,   invert: false, higherBetter: true  },
  swing_miss_percent:    { avg: 25,    invert: true,  higherBetter: false },
};
// Pitcher stat: is it good (for pitcher) when high? red/green is from pitcher perspective
const PITCHER_AVGS = {
  k_percent:             { avg: 22,    higherBetter: true  },
  bb_percent:            { avg: 8.5,   higherBetter: false },
  iso:                   { avg: 0.165, higherBetter: false },
  woba:                  { avg: 0.320, higherBetter: false },
  hardhit_percent:       { avg: 38,    higherBetter: false },
  barrels_per_bbe_percent:{ avg: 8,   higherBetter: false },
  babip:                 { avg: 0.295, higherBetter: false },
  swing_miss_percent:    { avg: 25,    higherBetter: true  },
};

function heatClass(val, key, avgs) {
  const cfg = avgs[key];
  if (!cfg || val == null || val === '') return '';
  const n = parseFloat(val);
  if (isNaN(n)) return '';
  const pct = Math.abs((n - cfg.avg) / cfg.avg);
  if (pct < 0.05) return ''; // within 5% = neutral
  const above = n > cfg.avg;
  const good = cfg.higherBetter ? above : !above;
  if (pct < 0.12) return good ? 'dfs-cell-good-sm' : 'dfs-cell-bad-sm';
  if (pct < 0.25) return good ? 'dfs-cell-good' : 'dfs-cell-bad';
  return good ? 'dfs-cell-good-lg' : 'dfs-cell-bad-lg';
}

function fmt(val, key) {
  if (val == null || val === '') return '—';
  const n = parseFloat(val);
  if (isNaN(n)) return '—';
  if (['woba','xwoba','iso','babip'].includes(key)) {
    return n < 1 ? n.toFixed(3).replace(/^0\./, '.') : n.toFixed(3);
  }
  if (key.includes('percent') || key === 'k_percent' || key === 'bb_percent') {
    return n.toFixed(1) + '%';
  }
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/* ── Logo helper — constructed directly from MLB team ID ─────────────── */
// Bypasses ESPN game matching (which has ordering issues) by using the ESPN
// CDN URL pattern directly from the MLB team ID → abbreviation lookup.
function mlbTeamLogo(teamId) {
  const abbr = (MLB_ABBR[teamId] || 'mlb').toLowerCase();
  return `https://a.espncdn.com/i/teamlogos/mlb/500-dark/${abbr}.png`;
}
function mlbTeamLogoFallback(teamId) {
  const abbr = (MLB_ABBR[teamId] || 'mlb').toLowerCase();
  return `https://a.espncdn.com/i/teamlogos/mlb/500/${abbr}.png`;
}
function TeamLogo({ teamId, className }) {
  const dark = mlbTeamLogo(teamId);
  const orig = mlbTeamLogoFallback(teamId);
  if (!teamId) return null;
  return (
    <img
      src={dark}
      onError={(e) => { if (e.target.src !== orig) { e.target.onerror = null; e.target.src = orig; } }}
      alt=""
      className={className}
    />
  );
}

/* ─────────────────────────────────────────────────────────────────────
   Batter Table
   ───────────────────────────────────────────────────────────────────── */
const BATTER_AVGS_BB = {
  gb_pct: { avg: 44, higherBetter: false }, // lower GB% = more air = generally better for DFS
  fb_pct: { avg: 24, higherBetter: true  }, // higher FB% = more power chances
  ld_pct: { avg: 24, higherBetter: true  }, // higher LD% = better contact
  babip:  { avg: 0.295, higherBetter: true  },
};

const BATTER_COLS = [
  { key: 'pa',           label: 'PA',       avgs: BATTER_AVGS },
  { key: 'iso',          label: 'ISO',      avgs: BATTER_AVGS },
  { key: 'woba',         label: 'wOBA',     avgs: BATTER_AVGS },
  { key: 'xwoba',        label: 'xwOBA',    avgs: BATTER_AVGS },
  { key: 'k_percent',    label: 'K%',       avgs: BATTER_AVGS },
  { key: 'bb_percent',   label: 'BB%',      avgs: BATTER_AVGS },
  { key: 'hardhit_percent', label: 'HH%',   avgs: BATTER_AVGS },
  { key: 'barrels_per_bbe_percent', label: 'Brl%', avgs: BATTER_AVGS },
  { key: 'gb_pct',       label: 'GB%',      avgs: BATTER_AVGS_BB },
  { key: 'fb_pct',       label: 'FB%',      avgs: BATTER_AVGS_BB },
  { key: 'ld_pct',       label: 'LD%',      avgs: BATTER_AVGS_BB },
  { key: 'babip',        label: 'BABIP',    avgs: BATTER_AVGS_BB },
];

function BatterTable({ lineup, savantMap }) {
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState('desc');

  if (!lineup || lineup.length === 0) return (
    <div className="dfs-empty">No lineup data available yet.</div>
  );
  const { byId, byName } = savantMap;

  const handleSort = (key) => {
    if (sortKey === key) setSortDir((d) => d === 'desc' ? 'asc' : 'desc');
    else { setSortKey(key); setSortDir('desc'); }
  };

  // MLB Stats API lineup player: { id, fullName, primaryPosition, ... }
  const lookupStats = (player) => {
    if (!player) return null;
    // Try MLB person ID first (most reliable), then name fallback
    const byIdMatch = byId?.[String(player.id)];
    if (byIdMatch) return byIdMatch;
    const name = player.fullName || player.useName || '';
    return byName?.[normKey(name)] || byName?.[normKey(name.split(' ').slice(-1)[0])] || null;
  };

  const allRows = lineup.map(lookupStats).filter(Boolean);

  function agg(rows) {
    if (!rows.length) return {};
    const result = {};
    BATTER_COLS.slice(1).forEach(({ key }) => {
      const vals = rows.map((r) => parseFloat(r[key])).filter((n) => !isNaN(n));
      if (vals.length) result[key] = (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(3);
    });
    result.pa = rows.reduce((s, r) => s + (parseInt(r.pa) || 0), 0);
    return result;
  }

  // MLB Stats API lineup: players have { id, fullName, primaryPosition, batSide, ... }
  const lefties  = lineup.filter((p) => p.batSide?.code === 'L');
  const righties = lineup.filter((p) => p.batSide?.code === 'R' || p.batSide?.code === 'S');

  const aggAll = agg(allRows);
  const aggL   = agg(lefties.map(lookupStats).filter(Boolean));
  const aggR   = agg(righties.map(lookupStats).filter(Boolean));

  // Apply sort to lineup order
  const sortedLineup = sortKey
    ? [...lineup].sort((a, b) => {
        const sa = lookupStats(a) || {};
        const sb = lookupStats(b) || {};
        const va = parseFloat(sa[sortKey]) || 0;
        const vb = parseFloat(sb[sortKey]) || 0;
        return sortDir === 'desc' ? vb - va : va - vb;
      })
    : lineup;

  const AggRow = ({ label, row }) => (
    <tr className="dfs-agg-row">
      <td className="dfs-td dfs-td-num" />
      <td className="dfs-td dfs-td-player">{label}</td>
      {BATTER_COLS.map(({ key, avgs }) => (
        <td key={key} className={`dfs-td dfs-td-stat ${heatClass(row[key], key, avgs)}`}>
          {fmt(row[key], key)}
        </td>
      ))}
    </tr>
  );

  return (
    <div className="dfs-table-wrap">
      <table className="dfs-table">
          <thead>
            <tr>
              <th className="dfs-th dfs-th-num dfs-sticky-num">#</th>
              <th className="dfs-th dfs-th-player dfs-sticky-player">Player</th>
              {BATTER_COLS.map((c) => (
                <th key={c.key} className="dfs-th dfs-th-sortable" onClick={() => handleSort(c.key)}>
                  {c.label}{sortKey === c.key ? (sortDir === 'desc' ? ' ▼' : ' ▲') : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedLineup.map((player, i) => {
            // MLB Stats API player object from lineups
            const name = player.fullName || player.useName || '';
            const pos  = player.primaryPosition?.abbreviation || '';
            const hand = player.batSide?.code || '';
            const slot = i + 1;
            const stats = lookupStats(player) || {};
            const hasStats = Object.keys(stats).length > 0;
            return (
              <tr key={i} className="dfs-player-row">
                  <td className="dfs-td dfs-td-num dfs-sticky-num">{sortKey ? i + 1 : slot}</td>
                  <td className="dfs-td dfs-td-player dfs-sticky-player">
                  <span className="dfs-player-name">{name}</span>
                  {pos && <span className="dfs-player-meta"> {pos}</span>}
                  {hand && <span className="dfs-player-hand"> | {hand}</span>}
                </td>
                {BATTER_COLS.map(({ key, avgs }) => (
                  <td key={key} className={`dfs-td dfs-td-stat ${hasStats ? heatClass(stats[key], key, avgs) : ''}`}>
                    {hasStats ? fmt(stats[key], key) : '—'}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <AggRow label="All" row={aggAll} />
          {lefties.length > 0 && <AggRow label={`Lefties (${lefties.length})`} row={aggL} />}
          {righties.length > 0 && <AggRow label={`Righties (${righties.length})`} row={aggR} />}
        </tfoot>
      </table>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────
   Pitcher Splits Table
   ───────────────────────────────────────────────────────────────────── */
const PITCHER_STATS = [
  { key: 'pa',           label: 'PA',         avgs: {} },
  { key: 'k_percent',    label: 'K%',         avgs: PITCHER_AVGS },
  { key: 'bb_percent',   label: 'BB%',        avgs: PITCHER_AVGS },
  { key: 'iso',          label: 'ISO',        avgs: PITCHER_AVGS },
  { key: 'woba',         label: 'wOBA',       avgs: PITCHER_AVGS },
  { key: 'xwoba',        label: 'xwOBA',      avgs: PITCHER_AVGS },
  { key: 'swing_miss_percent', label: 'Whiff%', avgs: PITCHER_AVGS },
  { key: 'hardhit_percent', label: 'HardHit%', avgs: PITCHER_AVGS },
  { key: 'barrels_per_bbe_percent', label: 'Barrel%', avgs: PITCHER_AVGS },
  { key: 'babip',        label: 'BABIP',      avgs: PITCHER_AVGS },
  { key: 'launch_angle', label: 'Avg LA',     avgs: {} },
];

function PitcherSplitsTable({ splits }) {
  if (!splits) return <div className="dfs-empty">Loading pitcher stats…</div>;
  const { all, vsL, vsR } = splits;
  if (!all && !vsL && !vsR) return <div className="dfs-empty">No pitcher stats found for this season.</div>;

  return (
    <div className="dfs-table-wrap">
      <table className="dfs-table">
        <thead>
          <tr>
            <th className="dfs-th dfs-th-player">Stat</th>
            <th className="dfs-th">Vs All</th>
            <th className="dfs-th">Vs L</th>
            <th className="dfs-th">Vs R</th>
          </tr>
        </thead>
        <tbody>
          {PITCHER_STATS.map(({ key, label, avgs }) => (
            <tr key={key} className="dfs-stat-row">
              <td className="dfs-td dfs-td-player dfs-stat-label">{label}</td>
              {[all, vsL, vsR].map((split, i) => (
                <td key={i} className={`dfs-td dfs-td-stat ${split ? heatClass(split[key], key, avgs) : ''}`}>
                  {split ? fmt(split[key], key) : '—'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────
   Main DFS Page
   ───────────────────────────────────────────────────────────────────── */
/* ─────────────────────────────────────────────────────────────────────
   BvP History Tab
   ───────────────────────────────────────────────────────────────────── */
const BVP_COLS = [
  { key: 'atBats',      label: 'AB' },
  { key: 'hits',        label: 'H' },
  { key: 'doubles',     label: '2B' },
  { key: 'triples',     label: '3B' },
  { key: 'homeRuns',    label: 'HR' },
  { key: 'rbi',         label: 'RBI' },
  { key: 'strikeOuts',  label: 'K' },
  { key: 'baseOnBalls', label: 'BB' },
  { key: 'avg',         label: 'AVG', rate: true },
  { key: 'obp',         label: 'OBP', rate: true },
  { key: 'slg',         label: 'SLG', rate: true },
  { key: 'ops',         label: 'OPS', rate: true },
];

function BvPTab({ lineup, pitcherId, pitcherName }) {
  const [rows, setRows]       = useState([]);
  const [loading, setLoading] = useState(true); // start true so we never show blank
  const lastKey = useRef('');

  useEffect(() => {
    const key = `${lineup?.map(p=>p?.id).join(',')}|${pitcherId}`;
    if (!pitcherId || !lineup?.length) {
      setLoading(false);
      return;
    }
    if (key === lastKey.current) return;
    lastKey.current = key;
    setLoading(true);
    setRows([]);

    Promise.allSettled(
      lineup.map((player) =>
        fetchBvpStats(player.id, pitcherId)
          .then((stat) => ({ player, stat }))
          .catch(() => ({ player, stat: null }))
      )
    ).then((results) => {
      setRows(results.map((r) => r.value).filter(Boolean));
      setLoading(false);
    });
  }, [lineup, pitcherId]);

  if (!pitcherId && !loading) return (
    <div className="dfs-empty" style={{ padding: '20px 16px' }}>No starting pitcher announced — BvP history unavailable.</div>
  );

  if (!lineup?.length && !loading) return (
    <div className="dfs-empty" style={{ padding: '20px 16px' }}>Waiting for lineup data…</div>
  );

  if (loading) return (
    <div className="dfs-loading" style={{ padding: '24px 14px' }}>
      <div className="auth-spinner" />
      <span>Loading career BvP history…</span>
    </div>
  );

  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState('desc');
  const handleSort = (key) => {
    if (sortKey === key) setSortDir((d) => d === 'desc' ? 'asc' : 'desc');
    else { setSortKey(key); setSortDir('desc'); }
  };
  const sortedRows = sortKey
    ? [...rows].sort((a, b) => {
        const va = parseFloat(a.stat?.[sortKey]) || 0;
        const vb = parseFloat(b.stat?.[sortKey]) || 0;
        return sortDir === 'desc' ? vb - va : va - vb;
      })
    : rows;

  return (
    <div className="bvp-wrap">
      <div className="bvp-subtitle">
        Career stats vs <strong>{pitcherName || 'pitcher'}</strong>
      </div>
      <div className="dfs-table-wrap">
        <table className="dfs-table bvp-table">
          <thead>
            <tr>
              <th className="dfs-th dfs-th-num dfs-sticky-num">#</th>
              <th className="dfs-th dfs-th-player dfs-sticky-player">Player</th>
              {BVP_COLS.map((c) => (
                <th key={c.key} className={`dfs-th dfs-th-sortable ${c.rate ? 'bvp-th-rate' : ''}`}
                  onClick={() => handleSort(c.key)}>
                  {c.label}{sortKey === c.key ? (sortDir === 'desc' ? ' ▼' : ' ▲') : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedRows.map(({ player, stat }, i) => {
              const pos  = player.primaryPosition?.abbreviation || '';
              const noHistory = !stat || (parseInt(stat.atBats) === 0 && !stat.hits);
              return (
                <tr key={player.id} className="dfs-player-row">
                  <td className="dfs-td dfs-td-num dfs-sticky-num">{i + 1}</td>
                  <td className="dfs-td dfs-td-player dfs-sticky-player">
                    <span className="dfs-player-name">{player.fullName || player.useName}</span>
                    {pos && <span className="dfs-player-meta"> {pos}</span>}
                  </td>
                  {noHistory ? (
                    <td colSpan={BVP_COLS.length} className="bvp-no-history">
                      No history between batter and pitcher
                    </td>
                  ) : (
                    BVP_COLS.map((c) => {
                      const val = stat?.[c.key];
                      const display = val != null ? (c.rate ? val : String(val)) : '—';
                      return (
                        <td key={c.key} className={`dfs-td ${c.rate ? 'bvp-td-rate' : ''}`}>
                          {display}
                        </td>
                      );
                    })
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────
   Main DFS Page
   ───────────────────────────────────────────────────────────────────── */
export default function DFSPage() {
  const navigate = useNavigate();
  const [dfsTab, setDfsTab]               = useState('shriebiq'); // 'shriebiq' | 'bvp'
  const [mlbGames, setMlbGames]           = useState([]);   // from MLB Stats API
  const [selectedIdx, setSelectedIdx]     = useState(0);
  const [activeSide, setActiveSide]       = useState('away');
  const [throwsFilter, setThrowsFilter]   = useState('all');
  const [batterStats, setBatterStats]     = useState({ byId: {}, byName: {} });
  const [batterLoading, setBatterLoading] = useState(false);
  const [pitcherSplits, setPitcherSplits]     = useState(null);
  const [pitcherLoading, setPitcherLoading]   = useState(false);
  const [pitcherHand, setPitcherHand]         = useState(null);
  const [pitcherSeasonStat, setPitcherSeasonStat] = useState(null);
  const [lineup, setLineup]               = useState({ players: [], confirmed: false, fromDate: null });
  const [lineupLoading, setLineupLoading] = useState(false);
  const [espnPitcherMap, setEspnPitcherMap] = useState({}); // teamName → ESPN pitcher

  const year = new Date().getFullYear();

  // Load today's MLB games from both APIs
  useEffect(() => {
    const today = new Date();
    const dateStr = today.getFullYear().toString()
      + String(today.getMonth() + 1).padStart(2, '0')
      + String(today.getDate()).padStart(2, '0');

    // MLB Stats API for lineups + confirmed lineup data
    getMlbSchedule().then((games) => {
      setMlbGames(games);
      setSelectedIdx(0);
    }).catch(() => {});

    // ESPN scoreboard — used ONLY as fallback for probable pitchers not in MLB API
    // Matched by full team name (not index) to avoid ordering mismatch
    getScoreboard('mlb', dateStr).then((events) => {
      const map = {};
      for (const event of events) {
        const comp = event.competitions?.[0];
        for (const c of comp?.competitors || []) {
          const teamName = c.team?.displayName;
          const prob = c.probables?.[0];
          if (teamName && prob?.athlete) {
            const ath = prob.athlete;
            map[teamName] = {
              id: String(ath.id || ''),
              name: ath.displayName || ath.fullName || '',
              hand: ath.throwHand?.abbreviation || null,
              headshot: typeof ath.headshot === 'string' ? ath.headshot : ath.headshot?.href || null,
            };
          }
        }
      }
      setEspnPitcherMap(map);
    }).catch(() => {});
  }, []);

  const selectedMlb = mlbGames[selectedIdx] || null;

  // Derive teams from selected MLB game
  const mlbAway = selectedMlb?.teams?.away;
  const mlbHome = selectedMlb?.teams?.home;
  const battingMlb  = activeSide === 'away' ? mlbAway : mlbHome;
  const pitchingMlb = activeSide === 'away' ? mlbHome : mlbAway;

  // Derive probable pitcher: MLB Stats API first, ESPN fallback by team name
  const probPitcherRaw = pitchingMlb?.probablePitcher || null;
  const espnFallback   = espnPitcherMap[pitchingMlb?.team?.name] || null;
  const probPitcher = (() => {
    if (probPitcherRaw) return {
      id: String(probPitcherRaw.id),
      name: probPitcherRaw.fullName || '',
      headshot: `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/${probPitcherRaw.id}/headshot/67/current`,
      source: 'mlb',
    };
    if (espnFallback) return {
      id: espnFallback.id,
      name: espnFallback.name,
      headshot: espnFallback.headshot
        || (espnFallback.id ? `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/${espnFallback.id}/headshot/67/current` : null),
      source: 'espn',
    };
    return null;
  })();

  // Team IDs for logos (constructed directly from MLB ID, no ESPN game matching needed)
  const battingTeamId  = battingMlb?.team?.id;
  const pitchingTeamId = pitchingMlb?.team?.id;

  // Load lineup when game/side changes
  useEffect(() => {
    if (!selectedMlb) return;
    setLineup({ players: [], confirmed: false, fromDate: null });
    setLineupLoading(true);

    const isHome = activeSide === 'home';
    const teamId = isHome ? mlbHome?.team?.id : mlbAway?.team?.id;
    const confirmedPlayers = isHome
      ? selectedMlb.lineups?.homePlayers
      : selectedMlb.lineups?.awayPlayers;

    if (confirmedPlayers?.length > 0) {
      setLineup({ players: confirmedPlayers, confirmed: true, fromDate: null });
      setLineupLoading(false);
    } else if (teamId) {
      // Fall back to most recent game's boxscore batting order as projection
      getProjectedLineup(teamId).then((result) => {
        setLineup(result);
        setLineupLoading(false);
      }).catch(() => setLineupLoading(false));
    } else {
      setLineupLoading(false);
    }
  }, [selectedMlb?.gamePk, activeSide]);

  // Load pitcher splits + hand when pitcher changes
  useEffect(() => {
    if (!probPitcher?.id) return;
    setPitcherLoading(true);
    setPitcherSplits(null);
    setPitcherHand(null);
    setPitcherSeasonStat(null);

    const handPromise = probPitcher.source === 'espn' && espnFallback?.hand
      ? Promise.resolve(espnFallback.hand)
      : fetchPitcherHand(probPitcher.id);

    Promise.allSettled([
      fetchPitcherSplits(probPitcher.id),
      handPromise,
      fetchPitcherSeasonStats(probPitcher.id),
    ]).then(([splitsRes, handRes, seasonRes]) => {
      if (splitsRes.status === 'fulfilled')  setPitcherSplits(splitsRes.value);
      if (handRes.status === 'fulfilled')    setPitcherHand(handRes.value);
      if (seasonRes.status === 'fulfilled')  setPitcherSeasonStat(seasonRes.value);
      setPitcherLoading(false);
    });
  }, [probPitcher?.id, selectedIdx, activeSide]);

  // Load batter Statcast stats when batting team / throws filter changes
  const battingAbbr = battingTeamId ? MLB_ABBR[battingTeamId] : null;
  const prevBattingAbbr = useRef(null);
  useEffect(() => {
    if (!battingAbbr) return;
    setBatterLoading(true);
    // Clear stats only when team changes; keep old data visible during filter change
    if (prevBattingAbbr.current !== battingAbbr) {
      setBatterStats({ byId: {}, byName: {} });
      prevBattingAbbr.current = battingAbbr;
    }
    const throws = throwsFilter === 'all' ? null : throwsFilter;
    fetchTeamBatters(battingAbbr, throws)
      .then(setBatterStats)
      .catch(() => {})
      .finally(() => setBatterLoading(false));
  }, [battingAbbr, throwsFilter]);

  // Auto-set throws filter based on pitcher handedness (from fetched pitcherHand)
  useEffect(() => {
    if (pitcherHand === 'L' || pitcherHand === 'R') setThrowsFilter(pitcherHand);
  }, [pitcherHand]);

  return (
    <div className="dfs-page">
      {/* ── Game selector ─────────────────────────────────────────── */}
      <div className="dfs-game-selector">
        <div className="dfs-selector-label">Select Game</div>
        <div className="dfs-games-list">
          {mlbGames.length === 0 && <span className="dfs-no-games">Loading games…</span>}
          {mlbGames.map((g, i) => {
            const away = g.teams?.away?.team;
            const home = g.teams?.home?.team;
            const awayAbbr = MLB_SHORT[away?.id] || '?';
            const homeAbbr = MLB_SHORT[home?.id] || '?';
            const status = g.status?.detailedState || g.status?.abstractGameState || '';
            const isSelected = i === selectedIdx;
            return (
              <button
                key={g.gamePk}
                className={`dfs-game-pill ${isSelected ? 'dfs-game-pill-active' : ''}`}
                onClick={() => { setSelectedIdx(i); setActiveSide('away'); }}
              >
                <span className="dfs-pill-team">{awayAbbr}</span>
                <span className="dfs-pill-sep">@</span>
                <span className="dfs-pill-team">{homeAbbr}</span>
                {status && <span className="dfs-pill-status">{status}</span>}
              </button>
            );
          })}
        </div>
      </div>

      {selectedMlb && (
        <>
          {/* ── Page tab switcher: ShribeIQ | BvP History ─────────── */}
          <div className="dfs-page-tabs">
            {[
              { key: 'shriebiq', label: '⚡ ShribeIQ' },
              { key: 'bvp',      label: '🆚 BvP History' },
            ].map(({ key, label }) => (
              <button
                key={key}
                className={`dfs-page-tab ${dfsTab === key ? 'dfs-page-tab-active' : ''}`}
                onClick={() => setDfsTab(key)}
              >
                {label}
              </button>
            ))}
          </div>

          {/* ── Team tab switcher (both tabs) ─────────────────────── */}
          <div className="dfs-team-tabs">
            {[
              { side: 'away', mlbTeam: mlbAway?.team },
              { side: 'home', mlbTeam: mlbHome?.team },
            ].map(({ side, mlbTeam }) => {
              const abbr = MLB_SHORT[mlbTeam?.id] || mlbTeam?.name?.split(' ').slice(-1)[0] || '?';
              return (
                <button
                  key={side}
                  className={`dfs-team-tab ${activeSide === side ? 'dfs-team-tab-active' : ''}`}
                  onClick={() => setActiveSide(side)}
                >
                  <TeamLogo teamId={mlbTeam?.id} className="dfs-tab-logo" />
                  {abbr} Batters
                </button>
              );
            })}
          </div>

          {/* ── ShribeIQ tab: two-panel matchup layout ────────────── */}
          {dfsTab === 'shriebiq' && <div className="dfs-panels">

            {/* ── LEFT: Batter panel ─────────────────────────────── */}
            <div className="dfs-panel dfs-panel-batters">
              <div className="dfs-panel-header">
                <div className="dfs-panel-team">
                  <TeamLogo teamId={battingTeamId} className="dfs-panel-logo" />
                  <div>
                    <div className="dfs-panel-name">{battingMlb?.team?.name}</div>
                    <div className="dfs-panel-sub">
                      {lineupLoading ? 'Loading lineup…' : lineup.confirmed
                        ? <span className="dfs-confirmed-badge">✓ CONFIRMED LINEUP</span>
                        : lineup.fromDate
                          ? <span className="dfs-projected-badge">⟳ PROJECTED from {lineup.fromDate}</span>
                          : 'Batting Lineup'}
                    </div>
                  </div>
                </div>
                {/* Throws filter */}
                <div className="dfs-filter-row">
                  {[
                    { val: 'all', label: 'vs All' },
                    { val: 'L',   label: 'vs L' },
                    { val: 'R',   label: 'vs R' },
                  ].map(({ val, label }) => (
                    <button
                      key={val}
                      className={`dfs-filter-btn ${throwsFilter === val ? 'dfs-filter-active' : ''}`}
                      onClick={() => setThrowsFilter(val)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {batterLoading || lineupLoading ? (
                <div className="dfs-loading"><div className="auth-spinner" /><span>Loading…</span></div>
              ) : (
                <BatterTable lineup={lineup.players} savantMap={batterStats} />
              )}
            </div>

            {/* ── RIGHT: Pitcher panel ───────────────────────────── */}
            <div className="dfs-panel dfs-panel-pitcher">
              {/* Header — team info left, pitcher info right, both in same row */}
              <div className="dfs-panel-header dfs-pitcher-header">
                <div className="dfs-panel-team">
                  <TeamLogo teamId={pitchingTeamId} className="dfs-panel-logo" />
                  <div>
                    <div className="dfs-panel-name">{pitchingMlb?.team?.name}</div>
                    <div className="dfs-panel-sub">Starting Pitcher</div>
                  </div>
                </div>

                {probPitcher ? (
                  <div className="dfs-pitcher-inline">
                    {probPitcher.headshot && (
                      <img
                        src={probPitcher.headshot}
                        alt=""
                        className="dfs-pitcher-avatar-sm"
                        onError={(e) => {
                          // Try ESPN CDN fallback if MLB photo fails
                          const espn = `https://a.espncdn.com/i/headshots/mlb/players/full/${probPitcher.id}.png`;
                          if (e.target.src !== espn) { e.target.onerror = null; e.target.src = espn; }
                          else { e.target.style.display = 'none'; }
                        }}
                      />
                    )}
                    <div className="dfs-pitcher-inline-info">
                      <div className="dfs-pitcher-name-row">
                        <span className="dfs-pitcher-name-text">{probPitcher.name}</span>
                        {(pitcherHand || probPitcher.hand) && (
                          <span className={`dfs-pitcher-arm dfs-pitcher-arm-${(pitcherHand || probPitcher.hand)?.toLowerCase()}`}>
                            {(pitcherHand || probPitcher.hand) === 'L' ? 'LHP' : 'RHP'}
                          </span>
                        )}
                      </div>
                      {pitcherSeasonStat && (
                        <div className="dfs-pitcher-season-stats">
                          {pitcherSeasonStat.wins != null && pitcherSeasonStat.losses != null && (
                            <span>{pitcherSeasonStat.wins}-{pitcherSeasonStat.losses}</span>
                          )}
                          {pitcherSeasonStat.inningsPitched && <span>{pitcherSeasonStat.inningsPitched} IP</span>}
                          {pitcherSeasonStat.strikeOuts != null && <span>{pitcherSeasonStat.strikeOuts} K</span>}
                          {pitcherSeasonStat.era && <span>{pitcherSeasonStat.era} ERA</span>}
                          {pitcherSeasonStat.whip && <span>{pitcherSeasonStat.whip} WHIP</span>}
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="dfs-empty" style={{ padding: '4px 0' }}>No starter announced</div>
                )}
              </div>

              {probPitcher && (
                <>
                  <div className="dfs-splits-header">
                    <span className="dfs-splits-title">Stats vs Batters — {year}</span>
                  </div>
                  {pitcherLoading ? (
                    <div className="dfs-loading"><div className="auth-spinner" /><span>Loading splits…</span></div>
                  ) : (
                    <PitcherSplitsTable splits={pitcherSplits} />
                  )}
                </>
              )}
            </div>
          </div>}

          {/* ── BvP History tab ───────────────────────────────────── */}
          {dfsTab === 'bvp' && (
            <BvPTab
              lineup={lineup.players}
              pitcherId={probPitcher?.id}
              pitcherName={probPitcher?.name}
            />
          )}
        </>
      )}

      {mlbGames.length === 0 && (
        <div className="dfs-empty dfs-empty-center">No MLB games scheduled for today.</div>
      )}
    </div>
  );
}
