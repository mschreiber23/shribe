import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getPlayerBio } from '../api/espn';

/* ── CORS proxy + fetch helper ───────────────────────────────────────── */
const PROXY = 'https://corsproxy.io/?url=';

async function proxyFetch(url) {
  const res = await fetch(PROXY + encodeURIComponent(url));
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  try { return JSON.parse(text); } catch { return text; }
}

/* ── Resolve ESPN athlete → MLB person ID via MLB Stats API ──────────── */
async function resolveMlbId(firstName, lastName) {
  const name = `${firstName} ${lastName}`;
  const res = await fetch(
    `https://statsapi.mlb.com/api/v1/people/search?names=${encodeURIComponent(name)}&sportIds=1`
  );
  const data = await res.json();
  const people = data.people || [];
  // Prefer exact full-name match, then fallback to first result
  const exact = people.find(
    (p) => p.fullName?.toLowerCase() === name.toLowerCase()
  );
  return (exact || people[0])?.id ? String((exact || people[0]).id) : null;
}

/* ── Baseball Savant data fetchers ───────────────────────────────────── */
async function fetchPercentiles(mlbId, year) {
  // Returns array; pick the first element (the player's row)
  const data = await proxyFetch(
    `https://baseballsavant.mlb.com/percentile-rankings?type=batter&year=${year}&pid=${mlbId}`
  );
  return Array.isArray(data) ? data[0] : data;
}

async function fetchStatcastStats(mlbId) {
  // Returns CSV; we parse it into objects
  const csv = await proxyFetch(
    `https://baseballsavant.mlb.com/statcast_search/csv?player_type=batter&batterID=${mlbId}&hfGT=R%7C&min_pitches=0&min_results=0&group_by=name-year&sort_col=pitches&sort_order=desc&min_pas=0`
  );
  if (typeof csv !== 'string') return [];
  return parseCSV(csv);
}

function parseCSV(csv) {
  const lines = csv.trim().split('\n').filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map((h) => h.replace(/"/g, '').trim());
  return lines.slice(1).map((line) => {
    const vals = splitCSVLine(line);
    return Object.fromEntries(headers.map((h, i) => [h, vals[i] ?? '']));
  });
}

function splitCSVLine(line) {
  const result = [];
  let cur = '';
  let inQuotes = false;
  for (const ch of line) {
    if (ch === '"') { inQuotes = !inQuotes; continue; }
    if (ch === ',' && !inQuotes) { result.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  result.push(cur.trim());
  return result;
}

/* ── Percentile circle config ────────────────────────────────────────── */
// invert: for stats where LOWER is better (K%), display 100 - raw_pct
const PERCENTILE_STATS = [
  { key: 'exit_velocity_avg',  pctKey: 'percent_rank_exit_velocity', label: 'Exit Velocity', unit: ' mph', fmt: 'num1' },
  { key: 'avg_best_speed',     pctKey: 'percent_rank_max_ev',         label: 'Max EV',        unit: ' mph', fmt: 'num1' },
  { key: 'sweet_spot_percent', pctKey: 'percent_rank_sweet_spot',     label: 'Sweet Spot%',   unit: '%',   fmt: 'num1' },
  { key: 'barrel_batted_rate', pctKey: 'percent_rank_barrel',         label: 'Barrel%',       unit: '%',   fmt: 'num1' },
  { key: 'hard_hit_percent',   pctKey: 'percent_rank_hard_hit',       label: 'Hard Hit%',     unit: '%',   fmt: 'num1' },
  { key: 'xba',                pctKey: 'percent_rank_xba',            label: 'xBA',           unit: '',    fmt: 'avg' },
  { key: 'xslg',               pctKey: 'percent_rank_xslg',           label: 'xSLG',          unit: '',    fmt: 'avg' },
  { key: 'woba',               pctKey: 'percent_rank_woba',           label: 'wOBA',          unit: '',    fmt: 'avg' },
  { key: 'xwoba',              pctKey: 'percent_rank_xwoba',          label: 'xwOBA',         unit: '',    fmt: 'avg' },
  { key: 'k_percent',          pctKey: 'percent_rank_k',              label: 'K%',            unit: '%',   fmt: 'num1', invert: true },
  { key: 'bb_percent',         pctKey: 'percent_rank_bb',             label: 'BB%',           unit: '%',   fmt: 'num1' },
];

// Baseball Savant color scale
function pctColor(pct) {
  if (pct >= 90) return '#e05c1a'; // orange-red (elite)
  if (pct >= 60) return '#5299d3'; // blue (above avg)
  if (pct >= 40) return '#888';    // gray (average)
  if (pct >= 20) return '#3a6fa8'; // dark blue (below avg)
  return '#1c3f6e';                // navy (poor)
}

function fmtVal(val, fmt) {
  const n = parseFloat(val);
  if (isNaN(n) || val === '' || val == null) return '—';
  if (fmt === 'avg') return n < 1 ? n.toFixed(3).replace(/^0\./, '.') : n.toFixed(3);
  if (fmt === 'pct') return n.toFixed(1) + '%';
  if (fmt === 'num1') return Number.isInteger(n) ? String(n) : n.toFixed(1);
  if (fmt === 'int') return String(Math.round(n));
  return String(n);
}

/* ── Percentile Circle SVG component ────────────────────────────────── */
function PctCircle({ label, rawVal, pct, fmt, unit, invert }) {
  const display = typeof pct === 'number' ? (invert ? 100 - pct : pct) : null;
  const color = display != null ? pctColor(display) : '#555';
  const r = 30;
  const circ = 2 * Math.PI * r;
  const fill = display != null ? circ * (1 - display / 100) : circ;

  const valStr = rawVal != null && rawVal !== '' && !isNaN(parseFloat(rawVal))
    ? fmtVal(rawVal, fmt) + unit
    : '—';

  return (
    <div className="sc-pct-cell">
      <svg width="76" height="76" viewBox="0 0 76 76" className="sc-pct-svg">
        {/* track */}
        <circle cx="38" cy="38" r={r} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="7" />
        {/* fill */}
        {display != null && (
          <circle cx="38" cy="38" r={r} fill="none" stroke={color} strokeWidth="7"
            strokeDasharray={circ} strokeDashoffset={fill}
            strokeLinecap="round" transform="rotate(-90 38 38)" />
        )}
        {/* percentile number */}
        <text x="38" y="38" textAnchor="middle" dominantBaseline="central"
          fill="#fff" fontSize="13" fontWeight="800">
          {display != null ? display : '—'}
        </text>
      </svg>
      <div className="sc-pct-val">{valStr}</div>
      <div className="sc-pct-label">{label}</div>
    </div>
  );
}

/* ── Stat table helper ───────────────────────────────────────────────── */
function StatTable({ title, cols, rows }) {
  if (!rows || rows.length === 0) return null;
  return (
    <div className="sc-section">
      <div className="sc-section-title">{title}</div>
      <div className="sc-table-wrap">
        <table className="sc-table">
          <thead>
            <tr>
              {cols.map((c) => (
                <th key={c.key} className={`sc-th ${c.hl ? 'sc-th-hl' : ''}`}>{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className={row._isTotal ? 'sc-tr-total' : 'sc-tr'}>
                {cols.map((c) => (
                  <td key={c.key} className={`sc-td ${c.hl ? 'sc-td-hl' : ''} ${c.left ? 'sc-td-left' : ''}`}>
                    {row[c.key] != null ? fmtVal(row[c.key], c.fmt) : '—'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────
   Main page
   ───────────────────────────────────────────────────────────────────── */
export default function StatcastPage() {
  const { playerId } = useParams(); // ESPN player ID
  const navigate = useNavigate();
  const [bio, setBio]             = useState(null);
  const [mlbId, setMlbId]         = useState(null);
  const [percs, setPercs]         = useState(null); // current-year percentile row
  const [statRows, setStatRows]   = useState([]);   // CSV rows by year
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);

  const year = new Date().getFullYear();

  useEffect(() => {
    setLoading(true);
    setError(null);

    getPlayerBio('mlb', playerId).then(async (bioData) => {
      setBio(bioData);
      const athlete = bioData?.athlete || {};
      const firstName = athlete.firstName || '';
      const lastName  = athlete.lastName  || '';

      if (!firstName && !lastName) {
        setError('Could not load player info.');
        setLoading(false);
        return;
      }

      // 1. Resolve MLB ID
      let id = null;
      // Sometimes ESPN bio includes an alternateId or link to mlb.com
      const links = athlete.links || [];
      for (const l of links) {
        const href = l.href || l.url || '';
        const m = href.match(/mlb\.com\/player\/[^/]+-(\d+)/) ||
                  href.match(/baseballsavant\.mlb\.com\/savant-player\/[^/]+-(\d+)/);
        if (m) { id = m[1]; break; }
      }
      if (!id) {
        try { id = await resolveMlbId(firstName, lastName); } catch {}
      }

      if (!id) {
        setError('Could not resolve MLB player ID. Statcast data unavailable.');
        setLoading(false);
        return;
      }
      setMlbId(id);

      // 2. Fetch in parallel
      const [percResult, statResult] = await Promise.allSettled([
        fetchPercentiles(id, year),
        fetchStatcastStats(id),
      ]);

      if (percResult.status === 'fulfilled' && percResult.value) {
        setPercs(percResult.value);
      }
      if (statResult.status === 'fulfilled') {
        setStatRows(statResult.value || []);
      }

      if (percResult.status === 'rejected' && statResult.status === 'rejected') {
        setError('Could not load Statcast data. Baseball Savant may be temporarily unavailable.');
      }

      setLoading(false);
    }).catch(() => {
      setError('Failed to load player bio.');
      setLoading(false);
    });
  }, [playerId]);

  const athlete    = bio?.athlete || {};
  const teamColor  = athlete.team?.color ? `#${athlete.team.color}` : '#7c3aed';
  const teamLogo   = athlete.team?.logos?.find((l) => l.rel?.includes('dark'))?.href
                   || athlete.team?.logos?.[0]?.href
                   || athlete.team?.logo;
  const savantUrl  = mlbId
    ? `https://baseballsavant.mlb.com/savant-player/${athlete.displayName?.toLowerCase().replace(/\s+/g, '-') || 'player'}-${mlbId}?stats=statcast-r-hitting-mlb`
    : 'https://baseballsavant.mlb.com';

  // ── Build year-by-year Statcast table rows from CSV ─────────────────
  const statcastCols = [
    { key: 'year',               label: 'Season', left: true, fmt: 'int' },
    { key: 'n_pitches_seen',     label: 'Pitches', fmt: 'int' },
    { key: 'n_batted_ball',      label: 'BIP',    fmt: 'int' },
    { key: 'n_barrels',          label: 'Barrels', fmt: 'int' },
    { key: 'barrel_rate',        label: 'Barrel%', hl: true, fmt: 'pct' },
    { key: 'launch_speed',       label: 'EV',      hl: true, fmt: 'num1' },
    { key: 'max_launch_speed',   label: 'Max EV',  fmt: 'num1' },
    { key: 'sweet_spot_percent', label: 'SweetSp%', fmt: 'pct' },
    { key: 'xba',                label: 'xBA',     hl: true, fmt: 'avg' },
    { key: 'xslg',               label: 'xSLG',    hl: true, fmt: 'avg' },
    { key: 'woba',               label: 'wOBA',    fmt: 'avg' },
    { key: 'xwoba',              label: 'xwOBA',   hl: true, fmt: 'avg' },
    { key: 'hard_hit_percent',   label: 'HardHit%', hl: true, fmt: 'pct' },
    { key: 'k_percent',          label: 'K%',      fmt: 'pct' },
    { key: 'bb_percent',         label: 'BB%',     fmt: 'pct' },
  ];

  const bbbCols = [
    { key: 'year',             label: 'Season',    left: true, fmt: 'int' },
    { key: 'gb_percent',       label: 'GB%',       fmt: 'pct' },
    { key: 'fb_percent',       label: 'FB%',       fmt: 'pct' },
    { key: 'ld_percent',       label: 'LD%',       hl: true, fmt: 'pct' },
    { key: 'iffb_percent',     label: 'PU%',       fmt: 'pct' },
    { key: 'pull_percent',     label: 'Pull%',     fmt: 'pct' },
    { key: 'straightaway_percent', label: 'Straight%', fmt: 'pct' },
    { key: 'opposite_percent', label: 'Oppo%',     fmt: 'pct' },
  ];

  const qocCols = [
    { key: 'year',           label: 'Season',      left: true, fmt: 'int' },
    { key: 'weak_percent',   label: 'Weak%',       fmt: 'pct' },
    { key: 'topped_percent', label: 'Topped%',     fmt: 'pct' },
    { key: 'under_percent',  label: 'Under%',      fmt: 'pct' },
    { key: 'flare_percent',  label: 'Flare/Burn%', fmt: 'pct' },
    { key: 'solid_percent',  label: 'Solid%',      fmt: 'pct' },
    { key: 'barrel_rate',    label: 'Barrel%',     hl: true, fmt: 'pct' },
  ];

  // Map CSV rows to table rows — CSV column names vary by endpoint
  // We normalize common aliases
  const normalizeRow = (row) => ({
    year:                row.game_year  || row.year || '',
    n_pitches_seen:      row.p          || row.pitches || row.n_pitches_seen || '',
    n_batted_ball:       row.bip        || row.batted_balls || row.n_batted_ball || '',
    n_barrels:           row.barrels    || row.n_barrels || '',
    barrel_rate:         row.brl_pa     || row.barrel_batted_rate || row.barrel_rate || '',
    launch_speed:        row.ev         || row.launch_speed || row.exit_velocity_avg || '',
    max_launch_speed:    row.max_ev     || row.max_launch_speed || row.avg_best_speed || '',
    sweet_spot_percent:  row.ss         || row.sweet_spot_percent || '',
    xba:                 row.est_ba     || row.xba || '',
    xslg:                row.est_slg    || row.xslg || '',
    woba:                row.woba       || '',
    xwoba:               row.est_woba   || row.xwoba || '',
    hard_hit_percent:    row.hard_hit   || row.hard_hit_percent || '',
    k_percent:           row.k_percent  || '',
    bb_percent:          row.bb_percent || '',
    gb_percent:          row.gb_percent || '',
    fb_percent:          row.fb_percent || '',
    ld_percent:          row.ld_percent || '',
    iffb_percent:        row.iffb_percent || '',
    pull_percent:        row.pull_percent || '',
    straightaway_percent:row.straightaway_percent || '',
    opposite_percent:    row.opposite_percent || '',
    weak_percent:        row.weak_percent || '',
    topped_percent:      row.topped_percent || '',
    under_percent:       row.under_percent || '',
    flare_percent:       row.flare_percent || '',
    solid_percent:       row.solid_percent || '',
  });

  const tableRows = statRows.map(normalizeRow);

  // If CSV didn't load but percRow exists, synthesize a single row from it
  const percRow = percs || {};
  const syntheticRows = tableRows.length === 0 && Object.keys(percRow).length > 0
    ? [{
        year:               year,
        n_pitches_seen:     percRow.n_pitches  || percRow.pa || '',
        n_batted_ball:      percRow.n_batted_ball || '',
        n_barrels:          percRow.n_barrels   || '',
        barrel_rate:        percRow.barrel_batted_rate || '',
        launch_speed:       percRow.exit_velocity_avg || '',
        max_launch_speed:   percRow.avg_best_speed  || '',
        sweet_spot_percent: percRow.sweet_spot_percent || '',
        xba:                percRow.xba || '',
        xslg:               percRow.xslg || '',
        woba:               percRow.woba || '',
        xwoba:              percRow.xwoba || '',
        hard_hit_percent:   percRow.hard_hit_percent || '',
        k_percent:          percRow.k_percent || '',
        bb_percent:         percRow.bb_percent || '',
        gb_percent:         percRow.gb_percent || '',
        fb_percent:         percRow.fb_percent || '',
        ld_percent:         percRow.ld_percent || '',
        pull_percent:       percRow.pull_percent || '',
        straightaway_percent: percRow.straightaway_percent || '',
        opposite_percent:   percRow.opposite_percent || '',
      }]
    : tableRows;

  return (
    <div className="sc-page" style={{ '--team-color': teamColor }}>
      <button className="tp-back" onClick={() => navigate(-1)}>← Back</button>

      {/* ── Header ─────────────────────────────────────────────────── */}
      {athlete.displayName && (
        <div className="sc-header" style={{ borderTop: `4px solid ${teamColor}` }}>
          <div className="sc-header-top">
            <div className="sc-header-identity">
              {athlete.headshot?.href && (
                <img src={athlete.headshot.href} alt="" className="sc-headshot" />
              )}
              <div>
                <div className="sc-player-name">
                  <span className="sc-firstname">{athlete.firstName} </span>
                  <span className="sc-lastname">{athlete.lastName}</span>
                </div>
                <div className="sc-meta-row">
                  {teamLogo && <img src={teamLogo} alt="" className="sc-team-logo" />}
                  <span className="sc-team-name" style={{ color: teamColor }}>
                    {athlete.team?.displayName}
                  </span>
                  {athlete.position?.abbreviation && (
                    <span className="sc-pos"> · {athlete.position.abbreviation}</span>
                  )}
                  {athlete.displayBatsThrows && (
                    <span className="sc-pos"> · Bats/Throws: {athlete.displayBatsThrows}</span>
                  )}
                </div>
              </div>
            </div>
            <a href={savantUrl} target="_blank" rel="noopener noreferrer" className="sc-savant-link">
              View on Baseball Savant ↗
            </a>
          </div>

          {/* Powered by badge */}
          <div className="sc-powered-row">
            <span className="sc-powered-label">
              Statcast data powered by{' '}
              <a href="https://baseballsavant.mlb.com" target="_blank" rel="noopener noreferrer">
                Baseball Savant
              </a>
            </span>
          </div>
        </div>
      )}

      {loading && (
        <div className="sc-loading">
          <div className="auth-spinner" />
          <span>Loading Statcast data…</span>
        </div>
      )}

      {!loading && error && (
        <div className="sc-error-card">
          <div className="sc-error-msg">{error}</div>
          <a href={savantUrl} target="_blank" rel="noopener noreferrer" className="sc-savant-btn">
            View Full Page on Baseball Savant ↗
          </a>
        </div>
      )}

      {!loading && !error && (
        <>
          {/* ── MLB Percentile Rankings ─────────────────────────────── */}
          {Object.keys(percRow).length > 0 && (
            <div className="sc-section">
              <div className="sc-section-title">
                MLB Percentile Rankings
                <span className="sc-section-sub"> — {year} Regular Season</span>
              </div>
              <div className="sc-pct-grid">
                {PERCENTILE_STATS.map((stat) => {
                  const rawVal = percRow[stat.key];
                  const pct    = typeof percRow[stat.pctKey] === 'number'
                    ? percRow[stat.pctKey]
                    : parseFloat(percRow[stat.pctKey]);
                  return (
                    <PctCircle
                      key={stat.key}
                      label={stat.label}
                      rawVal={rawVal}
                      pct={isNaN(pct) ? null : pct}
                      fmt={stat.fmt}
                      unit={stat.unit}
                      invert={!!stat.invert}
                    />
                  );
                })}
              </div>
              {/* Percentile legend */}
              <div className="sc-pct-legend">
                {[
                  { color: '#e05c1a', label: '≥ 90 (Elite)' },
                  { color: '#5299d3', label: '60–89 (Above Avg)' },
                  { color: '#888',    label: '40–59 (Average)' },
                  { color: '#3a6fa8', label: '20–39 (Below Avg)' },
                  { color: '#1c3f6e', label: '< 20 (Poor)' },
                ].map(({ color, label }) => (
                  <div key={label} className="sc-legend-item">
                    <span className="sc-legend-dot" style={{ background: color }} />
                    <span>{label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Statcast Batting Stats ──────────────────────────────── */}
          <StatTable
            title="Statcast Batting Statistics"
            cols={statcastCols}
            rows={syntheticRows}
          />

          {/* ── Batted Ball Profile ──────────────────────────────────── */}
          <StatTable
            title="Batted Ball Profile"
            cols={bbbCols}
            rows={syntheticRows}
          />

          {/* ── Quality of Contact ──────────────────────────────────── */}
          <StatTable
            title="Quality of Contact"
            cols={qocCols}
            rows={syntheticRows}
          />

          {/* ── Fallback if no data at all ──────────────────────────── */}
          {Object.keys(percRow).length === 0 && syntheticRows.length === 0 && (
            <div className="sc-error-card">
              <div className="sc-error-msg">
                No Statcast data found for {year}. The CORS proxy may be temporarily unavailable,
                or this player may not have enough plate appearances for Statcast qualification.
              </div>
              <a href={savantUrl} target="_blank" rel="noopener noreferrer" className="sc-savant-btn">
                View on Baseball Savant ↗
              </a>
            </div>
          )}

          {/* ── Always-visible Savant link ────────────────────────────── */}
          {(Object.keys(percRow).length > 0 || syntheticRows.length > 0) && (
            <a href={savantUrl} target="_blank" rel="noopener noreferrer" className="sc-savant-btn sc-savant-btn-full">
              View Full Interactive Page on Baseball Savant ↗
            </a>
          )}
        </>
      )}
    </div>
  );
}
