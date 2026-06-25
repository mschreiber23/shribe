import { useState, useEffect } from 'react';
import { getStandings, SPORTS } from '../api/espn';

/* ── Column configs matching ESPN ─────────────────────── */
const COLS = {
  mlb: [
    { k:'W', label:'W', hl:true }, { k:'L', label:'L' },
    { k:'PCT', label:'PCT', hl:true }, { k:'GB', label:'GB' },
    { k:'Home', label:'HOME' }, { k:'AWAY', label:'AWAY' },
    { k:'RS', label:'RS' }, { k:'RA', label:'RA' },
    { k:'DIFF', label:'DIFF' }, { k:'STRK', label:'STRK' },
    { k:'Last Ten', label:'L10' },
  ],
  nba: [
    { k:'W', label:'W', hl:true }, { k:'L', label:'L' },
    { k:'PCT', label:'PCT', hl:true }, { k:'GB', label:'GB' },
    { k:'Home', label:'HOME' }, { k:'Road', label:'AWAY' },
    { k:'vs. Div.', label:'DIV' }, { k:'vs. Conf.', label:'CONF' },
    { k:'PPG', label:'PPG' }, { k:'OPP PPG', label:'OPP' },
    { k:'DIFF', label:'DIFF' }, { k:'L10', label:'L10' },
    { k:'STRK', label:'STRK' },
  ],
  nfl: [
    { k:'W', label:'W', hl:true }, { k:'L', label:'L' },
    { k:'T', label:'T' }, { k:'PCT', label:'PCT', hl:true },
    { k:'Home', label:'HOME' }, { k:'Road', label:'AWAY' },
    { k:'vs. Div.', label:'DIV' }, { k:'vs. Conf.', label:'CONF' },
    { k:'PF', label:'PF' }, { k:'PA', label:'PA' },
    { k:'DIFF', label:'DIFF' }, { k:'STRK', label:'STRK' },
  ],
  nhl: [
    { k:'GP', label:'GP' }, { k:'W', label:'W', hl:true },
    { k:'L', label:'L' }, { k:'OTL', label:'OTL' },
    { k:'PTS', label:'PTS', hl:true }, { k:'ROW', label:'ROW' },
    { k:'HOME', label:'HOME' }, { k:'AWAY', label:'AWAY' },
    { k:'GF', label:'GF' }, { k:'GA', label:'GA' },
    { k:'DIFF', label:'DIFF' }, { k:'L10', label:'L10' },
    { k:'STRK', label:'STRK' },
  ],
};

function getStatMap(entry) {
  const r = {};
  (entry.stats || []).forEach((s) => {
    const key = s.abbreviation || s.name;
    if (key) { r[key] = s.displayValue; }
    if (s.name) { r[s.name] = s.displayValue; }
  });
  return r;
}

function StandingsGroup({ group, cols }) {
  return (
    <div className="standings-group">
      <div className="standings-group-header">{group.name}</div>
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
            {group.entries.map((entry, i) => {
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
                      <td
                        key={c.k}
                        className={`standings-td ${c.hl ? 'standings-td-hl' : ''} ${isStrk && isWStrk ? 'standings-strk-w' : isStrk ? 'standings-strk-l' : ''}`}
                      >
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
    </div>
  );
}

function SportStandings({ sport }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const cols = COLS[sport] || COLS.mlb;

  useEffect(() => {
    setLoading(true);
    setData(null);
    getStandings(sport).then(setData).catch(() => setData(null)).finally(() => setLoading(false));
  }, [sport]);

  if (loading) return (
    <div className="standings-skeleton">
      {[1,2,3].map((i) => <div key={i} className="skeleton-card" style={{height:200}} />)}
    </div>
  );
  if (!data) return <div className="tp-loading">Standings unavailable.</div>;

  const groups = [];
  const walk = (node) => {
    const entries = node.standings?.entries || [];
    if (entries.length > 0) groups.push({ name: node.name, entries });
    (node.children || []).forEach(walk);
  };
  walk(data);

  return (
    <div className="standings-groups">
      {groups.map((g, i) => <StandingsGroup key={i} group={g} cols={cols} />)}
    </div>
  );
}

export default function StandingsPage() {
  const [activeSport, setActiveSport] = useState('mlb');
  return (
    <div className="page-content">
      <h1 className="page-title">Standings</h1>
      <div className="scores-sport-tabs">
        {Object.entries(SPORTS).map(([key, { label }]) => (
          <button
            key={key}
            className={`ts-tab ${activeSport === key ? 'ts-tab-active' : ''}`}
            onClick={() => setActiveSport(key)}
          >
            {label}
          </button>
        ))}
      </div>
      <SportStandings sport={activeSport} />
    </div>
  );
}
