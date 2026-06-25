import { useState, useEffect } from 'react';
import { getStandings, SPORTS } from '../api/espn';

/* ── View configs per sport ────────────────────────────
   Each view has a label and a level parameter (1=overall, 2=league/conf, 3=division)
   MLB also has WC and expanded handled client-side
─────────────────────────────────────────────────────── */
const VIEWS = {
  mlb: [
    { label: 'Division',   level: 3 },
    { label: 'League',     level: 2 },
    { label: 'Overall',    level: 1 },
    { label: 'Wild Card',  level: 1, wc: true },
  ],
  nba: [
    { label: 'Division',   level: 3 },
    { label: 'Conference', level: 2 },
    { label: 'League',     level: 1 },
  ],
  nfl: [
    { label: 'Division',   level: 3 },
    { label: 'Conference', level: 2 },
    { label: 'Overall',    level: 1 },
  ],
  nhl: [
    { label: 'Division',   level: 3 },
    { label: 'Conference', level: 2 },
    { label: 'Overall',    level: 1 },
    { label: 'Wild Card',  level: 1, wc: true },
  ],
};

/* ── Column configs ─────────────────────────────────── */
const COLS = {
  mlb: [
    { k:'W', label:'W', hl:true }, { k:'L', label:'L' }, { k:'PCT', label:'PCT', hl:true },
    { k:'GB', label:'GB' }, { k:'Home', label:'HOME' }, { k:'AWAY', label:'AWAY' },
    { k:'RS', label:'RS' }, { k:'RA', label:'RA' }, { k:'DIFF', label:'DIFF' },
    { k:'STRK', label:'STRK' }, { k:'Last Ten', label:'L10' },
  ],
  mlb_wc: [
    { k:'W', label:'W', hl:true }, { k:'L', label:'L' }, { k:'PCT', label:'PCT', hl:true },
    { k:'GBP', label:'WC GB' }, { k:'Home', label:'HOME' }, { k:'AWAY', label:'AWAY' },
    { k:'RS', label:'RS' }, { k:'RA', label:'RA' }, { k:'DIFF', label:'DIFF' },
    { k:'STRK', label:'STRK' }, { k:'Last Ten', label:'L10' },
  ],
  nba: [
    { k:'W', label:'W', hl:true }, { k:'L', label:'L' }, { k:'PCT', label:'PCT', hl:true },
    { k:'GB', label:'GB' }, { k:'Home', label:'HOME' }, { k:'Road', label:'AWAY' },
    { k:'vs. Div.', label:'DIV' }, { k:'vs. Conf.', label:'CONF' },
    { k:'PPG', label:'PPG' }, { k:'OPP PPG', label:'OPP' },
    { k:'DIFF', label:'DIFF' }, { k:'L10', label:'L10' }, { k:'STRK', label:'STRK' },
  ],
  nfl: [
    { k:'W', label:'W', hl:true }, { k:'L', label:'L' }, { k:'T', label:'T' },
    { k:'PCT', label:'PCT', hl:true }, { k:'Home', label:'HOME' }, { k:'Road', label:'AWAY' },
    { k:'vs. Div.', label:'DIV' }, { k:'vs. Conf.', label:'CONF' },
    { k:'PF', label:'PF' }, { k:'PA', label:'PA' }, { k:'DIFF', label:'DIFF' }, { k:'STRK', label:'STRK' },
  ],
  nhl: [
    { k:'GP', label:'GP' }, { k:'W', label:'W', hl:true }, { k:'L', label:'L' }, { k:'OTL', label:'OTL' },
    { k:'PTS', label:'PTS', hl:true }, { k:'ROW', label:'ROW' },
    { k:'HOME', label:'HOME' }, { k:'AWAY', label:'AWAY' },
    { k:'GF', label:'GF' }, { k:'GA', label:'GA' }, { k:'DIFF', label:'DIFF' },
    { k:'L10', label:'L10' }, { k:'STRK', label:'STRK' },
  ],
};

function getStatMap(entry) {
  const r = {};
  (entry.stats || []).forEach((s) => {
    const key = s.abbreviation || s.name;
    if (key) r[key] = s.displayValue;
    if (s.name) r[s.name] = s.displayValue;
  });
  return r;
}

function StandingsTable({ entries, cols, sport }) {
  return (
    <div className="standings-table-wrap">
      <table className="standings-table">
        <thead>
          <tr>
            <th className="standings-th standings-th-team">TEAM</th>
            {cols.map((c) => (
              <th key={c.k} className={`standings-th ${c.hl ? 'standings-th-hl' : ''}`}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {entries.map((entry, i) => {
            const team = entry.team || {};
            const stats = getStatMap(entry);
            const logo = team.logos?.[0]?.href;
            const strk = stats['STRK'] || stats['streak'] || '';
            const isWStrk = strk.startsWith('W');
            const clinch = stats['CLINCH'];
            return (
              <tr key={team.id || i} className="standings-tr">
                <td className="standings-td standings-td-team">
                  {logo && <img src={logo} alt="" className="standings-logo" />}
                  <div className="standings-team-info">
                    <span className="standings-abbr">{team.abbreviation}</span>
                    {clinch && clinch !== '-' && <span className="standings-clinch">{clinch}</span>}
                  </div>
                </td>
                {cols.map((c) => {
                  const val = stats[c.k] ?? '—';
                  const isStrk = c.k === 'STRK';
                  return (
                    <td key={c.k} className={`standings-td ${c.hl ? 'standings-td-hl' : ''} ${isStrk && isWStrk ? 'standings-strk-w' : isStrk ? 'standings-strk-l' : ''}`}>
                      {val}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SportStandings({ sport, view }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const cols = view.wc
    ? (COLS[`${sport}_wc`] || COLS[sport])
    : (COLS[sport] || COLS.mlb);

  useEffect(() => {
    setLoading(true);
    setData(null);
    getStandings(sport, view.level)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [sport, view.level]);

  if (loading) return (
    <div className="standings-skeleton">
      {[1,2,3].map((i) => <div key={i} className="skeleton-card" style={{ height: 180 }} />)}
    </div>
  );
  if (!data) return <div className="tp-loading">Standings unavailable.</div>;

  // Collect groups
  const groups = [];
  const walk = (node) => {
    const entries = node.standings?.entries || [];
    if (entries.length > 0) groups.push({ name: node.name, entries });
    (node.children || []).forEach(walk);
  };
  walk(data);

  if (!groups.length) return <div className="tp-loading">No data available.</div>;

  // Wild card view: show all teams sorted by W%, add separator after top 3 per league
  if (view.wc) {
    // Sort each league by PCT descending
    return (
      <div className="standings-groups">
        {groups.map((g, i) => (
          <div key={i} className="standings-group">
            <div className="standings-group-header">{g.name}</div>
            <StandingsTable
              entries={[...g.entries].sort((a, b) => {
                const sa = getStatMap(a); const sb = getStatMap(b);
                return parseFloat(sb['PCT']||0) - parseFloat(sa['PCT']||0);
              })}
              cols={cols}
              sport={sport}
            />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="standings-groups">
      {groups.map((g, i) => (
        <div key={i} className="standings-group">
          {groups.length > 1 && <div className="standings-group-header">{g.name}</div>}
          {groups.length === 1 && <div className="standings-group-header">{g.name}</div>}
          <StandingsTable entries={g.entries} cols={cols} sport={sport} />
        </div>
      ))}
    </div>
  );
}

export default function StandingsPage() {
  const [activeSport, setActiveSport] = useState('mlb');
  const [activeViewIdx, setActiveViewIdx] = useState(0);

  const views = VIEWS[activeSport] || VIEWS.mlb;
  const activeView = views[activeViewIdx] || views[0];

  const handleSportChange = (sport) => {
    setActiveSport(sport);
    setActiveViewIdx(0);
  };

  return (
    <div className="page-content">
      <h1 className="page-title">Standings</h1>

      {/* Sport tabs */}
      <div className="scores-sport-tabs">
        {Object.entries(SPORTS).map(([key, { label }]) => (
          <button
            key={key}
            className={`ts-tab ${activeSport === key ? 'ts-tab-active' : ''}`}
            onClick={() => handleSportChange(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {/* View tabs */}
      <div className="standings-view-tabs">
        {views.map((v, i) => (
          <button
            key={v.label}
            className={`standings-view-tab ${activeViewIdx === i ? 'standings-view-tab-active' : ''}`}
            onClick={() => setActiveViewIdx(i)}
          >
            {v.label}
          </button>
        ))}
      </div>

      <SportStandings sport={activeSport} view={activeView} />
    </div>
  );
}
