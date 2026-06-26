import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getScoreboard, getGameBoxscore, SPORTS } from '../api/espn';

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

/* ── Name normalisation for ESPN ↔ Savant matching ─────────────────── */
// Savant: "Wood, James"  →  ESPN: "James Wood"
function savantToDisplay(savantName) {
  const [last, ...rest] = savantName.split(',');
  return `${rest.join('').trim()} ${last.trim()}`;
}
function normKey(name) {
  return name.toLowerCase().replace(/[^a-z]/g, '');
}

/* ── MLB ID resolution ──────────────────────────────────────────────── */
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
async function fetchTeamBatters(teamAbbr, pitcherThrows) {
  const year = new Date().getFullYear();
  const throwsParam = pitcherThrows ? `&pitcher_throws=${pitcherThrows}` : '';
  const url = `${BS}/statcast_search/csv?player_type=batter&hfGT=R%7C&hfTeam=${encodeURIComponent(teamAbbr + '|')}&hfSea=${year}%7C&min_pitches=0&min_results=0&group_by=name&sort_col=pitches&sort_order=desc&min_pas=0${throwsParam}`;
  const text = await bsFetch(url);
  const { rows } = parseCSV(text);
  return rows;
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

/* ── Game + roster helpers ──────────────────────────────────────────── */
function getTeamLogo(team) {
  const logos = team?.logos || [];
  const dark = logos.find((l) => l.rel?.includes('dark'));
  return dark?.href || logos[0]?.href || team?.logo || null;
}

// Get batting lineup order from ESPN boxscore rosters
function extractLineup(rosters, teamId) {
  const teamRoster = rosters?.find((r) => String(r.team?.id) === String(teamId));
  if (!teamRoster) return [];
  const entries = teamRoster.entries || [];
  // Sort by lineup slot; slot 0 means not in lineup
  const starters = entries
    .filter((e) => e.lineup?.slot > 0)
    .sort((a, b) => (a.lineup?.slot || 99) - (b.lineup?.slot || 99));
  if (starters.length > 0) return starters;
  // Fallback: return all athletes from roster entries
  return entries.slice(0, 9);
}

/* ─────────────────────────────────────────────────────────────────────
   Batter Table
   ───────────────────────────────────────────────────────────────────── */
const BATTER_COLS = [
  { key: 'pa',           label: 'PA',    avgs: BATTER_AVGS },
  { key: 'iso',          label: 'ISO',   avgs: BATTER_AVGS },
  { key: 'woba',         label: 'wOBA',  avgs: BATTER_AVGS },
  { key: 'xwoba',        label: 'xwOBA', avgs: BATTER_AVGS },
  { key: 'k_percent',    label: 'K%',    avgs: BATTER_AVGS },
  { key: 'bb_percent',   label: 'BB%',   avgs: BATTER_AVGS },
  { key: 'hardhit_percent', label: 'HardHit%', avgs: BATTER_AVGS },
  { key: 'barrels_per_bbe_percent', label: 'Barrel%', avgs: BATTER_AVGS },
];

function BatterTable({ lineup, savantMap }) {
  if (lineup.length === 0) return (
    <div className="dfs-empty">No lineup data available yet. Check back closer to game time.</div>
  );

  // Aggregate rows
  const allRows = lineup.map((e) => {
    const name = e.athlete?.displayName || '';
    const key = normKey(name);
    return savantMap[key] || null;
  }).filter(Boolean);

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

  const lefties = lineup.filter((e) => {
    const hand = e.athlete?.batHand?.abbreviation || e.athlete?.displayBatsThrows?.charAt(0) || '';
    return hand === 'L';
  });
  const righties = lineup.filter((e) => {
    const hand = e.athlete?.batHand?.abbreviation || e.athlete?.displayBatsThrows?.charAt(0) || '';
    return hand === 'R' || hand === 'S';
  });

  const aggAll     = agg(allRows);
  const aggL       = agg(lefties.map((e) => savantMap[normKey(e.athlete?.displayName || '')]).filter(Boolean));
  const aggR       = agg(righties.map((e) => savantMap[normKey(e.athlete?.displayName || '')]).filter(Boolean));

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
            <th className="dfs-th dfs-th-num">#</th>
            <th className="dfs-th dfs-th-player">Player</th>
            {BATTER_COLS.map((c) => <th key={c.key} className="dfs-th">{c.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {lineup.map((entry, i) => {
            const athlete = entry.athlete || {};
            const name = athlete.displayName || '';
            const pos = athlete.position?.abbreviation || '';
            const hand = athlete.batHand?.abbreviation || athlete.displayBatsThrows?.charAt(0) || '';
            const slot = entry.lineup?.slot || (i + 1);
            const stats = savantMap[normKey(name)] || {};
            const hasStats = Object.keys(stats).length > 0;
            return (
              <tr key={i} className="dfs-player-row">
                <td className="dfs-td dfs-td-num">{slot}</td>
                <td className="dfs-td dfs-td-player">
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
export default function DFSPage() {
  const navigate = useNavigate();
  const [games, setGames]                 = useState([]);
  const [selectedGame, setSelectedGame]   = useState(null);
  const [gameData, setGameData]           = useState(null);
  const [activeSide, setActiveSide]       = useState('away'); // 'away' | 'home' = batting team
  const [throwsFilter, setThrowsFilter]   = useState('all'); // 'all' | 'L' | 'R'
  const [batterStats, setBatterStats]     = useState({}); // savant keyed by norm name
  const [batterLoading, setBatterLoading] = useState(false);
  const [pitcherSplits, setPitcherSplits] = useState(null);
  const [pitcherLoading, setPitcherLoading] = useState(false);
  const [pitcherInfo, setPitcherInfo]     = useState(null); // { name, hand, headshot }

  const year = new Date().getFullYear();

  // Load today's MLB games
  useEffect(() => {
    const today = new Date();
    const dateStr = today.getFullYear().toString()
      + String(today.getMonth() + 1).padStart(2, '0')
      + String(today.getDate()).padStart(2, '0');
    getScoreboard('mlb', dateStr).then((events) => {
      setGames(events);
      if (events.length > 0) setSelectedGame(events[0]);
    }).catch(() => {});
  }, []);

  // Load game detail when selection changes
  useEffect(() => {
    if (!selectedGame) return;
    setGameData(null);
    setBatterStats({});
    setPitcherSplits(null);
    setPitcherInfo(null);
    getGameBoxscore('mlb', selectedGame.id).then(setGameData).catch(() => {});
  }, [selectedGame]);

  // Derive teams from selected game
  const comp = selectedGame?.competitions?.[0];
  const competitors = comp?.competitors || [];
  const awayTeam = competitors.find((c) => c.homeAway === 'away') || competitors[0];
  const homeTeam = competitors.find((c) => c.homeAway === 'home') || competitors[1];
  const battingTeam = activeSide === 'away' ? awayTeam : homeTeam;
  const pitchingTeam = activeSide === 'away' ? homeTeam : awayTeam;

  // Derive probable pitcher
  const probPitcher = (() => {
    const pitchers = pitchingTeam?.probables || [];
    const p = pitchers[0];
    if (!p) return null;
    const ath = p.athlete || {};
    return {
      id: ath.id,
      name: ath.displayName || ath.fullName || '',
      shortName: ath.shortName || '',
      hand: ath.throwHand?.abbreviation || p.throws || '',
      headshot: typeof ath.headshot === 'string' ? ath.headshot : ath.headshot?.href,
      record: p.record || '',
      era: p.statistics?.find?.(s => s.abbreviation === 'ERA')?.displayValue || '',
    };
  })();

  // When pitching team / game changes, load pitcher splits
  useEffect(() => {
    if (!probPitcher?.name) return;
    setPitcherLoading(true);
    setPitcherSplits(null);
    setPitcherInfo(probPitcher);

    resolveMlbId(probPitcher.name).then((mlbId) => {
      if (!mlbId) { setPitcherLoading(false); return; }
      fetchPitcherSplits(mlbId).then((splits) => {
        setPitcherSplits(splits);
        setPitcherLoading(false);
      }).catch(() => setPitcherLoading(false));
    }).catch(() => setPitcherLoading(false));
  }, [probPitcher?.name, selectedGame?.id]);

  // When batting team / throws filter changes, load batter stats
  useEffect(() => {
    if (!battingTeam?.team?.abbreviation) return;
    setBatterLoading(true);
    setBatterStats({});
    const abbr = battingTeam.team.abbreviation;
    const throws = throwsFilter === 'all' ? null : throwsFilter;
    fetchTeamBatters(abbr, throws).then((rows) => {
      const map = {};
      rows.forEach((r) => {
        const key = normKey(savantToDisplay(r.player_name || ''));
        map[key] = r;
        // Also index by last name only for fuzzy match
        const lastName = (r.player_name || '').split(',')[0].trim().toLowerCase().replace(/[^a-z]/g, '');
        if (!map[lastName]) map[lastName] = r;
      });
      setBatterStats(map);
      setBatterLoading(false);
    }).catch(() => setBatterLoading(false));
  }, [battingTeam?.team?.abbreviation, throwsFilter]);

  // Auto-set throws filter based on pitcher handedness
  useEffect(() => {
    if (probPitcher?.hand) {
      setThrowsFilter(probPitcher.hand === 'L' ? 'L' : probPitcher.hand === 'R' ? 'R' : 'all');
    }
  }, [probPitcher?.hand, activeSide]);

  // Get batting lineup from game rosters
  const lineup = extractLineup(gameData?.rosters, battingTeam?.team?.id);

  const awayLogo = getTeamLogo(awayTeam?.team);
  const homeLogo = getTeamLogo(homeTeam?.team);

  return (
    <div className="dfs-page">
      {/* ── Game selector ─────────────────────────────────────────── */}
      <div className="dfs-game-selector">
        <div className="dfs-selector-label">Select Game</div>
        <div className="dfs-games-list">
          {games.length === 0 && <span className="dfs-no-games">No MLB games today</span>}
          {games.map((g) => {
            const c = g.competitions?.[0];
            const away = c?.competitors?.find((x) => x.homeAway === 'away');
            const home = c?.competitors?.find((x) => x.homeAway === 'home');
            const status = c?.status?.type?.shortDetail || '';
            const isSelected = selectedGame?.id === g.id;
            return (
              <button
                key={g.id}
                className={`dfs-game-pill ${isSelected ? 'dfs-game-pill-active' : ''}`}
                onClick={() => { setSelectedGame(g); setActiveSide('away'); }}
              >
                <span className="dfs-pill-team">{away?.team?.abbreviation}</span>
                <span className="dfs-pill-sep">@</span>
                <span className="dfs-pill-team">{home?.team?.abbreviation}</span>
                {status && <span className="dfs-pill-status">{status}</span>}
              </button>
            );
          })}
        </div>
      </div>

      {selectedGame && (
        <>
          {/* ── Team tab switcher ──────────────────────────────────── */}
          <div className="dfs-team-tabs">
            {[{ side: 'away', team: awayTeam }, { side: 'home', team: homeTeam }].map(({ side, team }) => (
              <button
                key={side}
                className={`dfs-team-tab ${activeSide === side ? 'dfs-team-tab-active' : ''}`}
                onClick={() => setActiveSide(side)}
              >
                {getTeamLogo(team?.team) && (
                  <img src={getTeamLogo(team?.team)} alt="" className="dfs-tab-logo" />
                )}
                {team?.team?.abbreviation} Batters
              </button>
            ))}
          </div>

          {/* ── Main two-panel layout ─────────────────────────────── */}
          <div className="dfs-panels">

            {/* ── LEFT: Batter panel ─────────────────────────────── */}
            <div className="dfs-panel dfs-panel-batters">
              <div className="dfs-panel-header">
                <div className="dfs-panel-team">
                  {getTeamLogo(battingTeam?.team) && (
                    <img src={getTeamLogo(battingTeam?.team)} alt="" className="dfs-panel-logo" />
                  )}
                  <div>
                    <div className="dfs-panel-name">{battingTeam?.team?.displayName}</div>
                    <div className="dfs-panel-sub">Batting Lineup</div>
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

              {batterLoading ? (
                <div className="dfs-loading"><div className="auth-spinner" /><span>Loading stats…</span></div>
              ) : (
                <BatterTable lineup={lineup} savantMap={batterStats} />
              )}
            </div>

            {/* ── RIGHT: Pitcher panel ───────────────────────────── */}
            <div className="dfs-panel dfs-panel-pitcher">
              <div className="dfs-panel-header">
                <div className="dfs-panel-team">
                  {getTeamLogo(pitchingTeam?.team) && (
                    <img src={getTeamLogo(pitchingTeam?.team)} alt="" className="dfs-panel-logo" />
                  )}
                  <div>
                    <div className="dfs-panel-name">{pitchingTeam?.team?.displayName}</div>
                    <div className="dfs-panel-sub">Starting Pitcher</div>
                  </div>
                </div>
              </div>

              {/* Pitcher identity card */}
              {probPitcher ? (
                <div className="dfs-pitcher-card">
                  {probPitcher.headshot && (
                    <img src={probPitcher.headshot} alt="" className="dfs-pitcher-avatar"
                      onError={(e) => { e.target.style.display = 'none'; }} />
                  )}
                  <div className="dfs-pitcher-info">
                    <div className="dfs-pitcher-name">
                      {probPitcher.name}
                      {probPitcher.hand && <span className="dfs-pitcher-hand"> ({probPitcher.hand})</span>}
                    </div>
                    <div className="dfs-pitcher-meta">
                      {probPitcher.record && <span>{probPitcher.record}</span>}
                      {probPitcher.era && <span> · {probPitcher.era} ERA</span>}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="dfs-empty">No probable pitcher announced yet.</div>
              )}

              {/* Splits header */}
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
          </div>
        </>
      )}

      {!selectedGame && games.length === 0 && (
        <div className="dfs-empty dfs-empty-center">No MLB games scheduled for today.</div>
      )}
    </div>
  );
}
