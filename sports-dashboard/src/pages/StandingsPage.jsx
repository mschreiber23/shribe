import { useState, useEffect } from 'react';
import { getStandings, SPORTS } from '../api/espn';

const STANDING_COLS = {
  mlb: [{ k:'W',hl:true },{ k:'L' },{ k:'PCT',hl:true },{ k:'GB' },{ k:'STRK' },{ k:'Home' },{ k:'AWAY' }],
  nba: [{ k:'W',hl:true },{ k:'L' },{ k:'PCT',hl:true },{ k:'GB' },{ k:'STRK' },{ k:'Home' },{ k:'Road' }],
  nfl: [{ k:'W',hl:true },{ k:'L' },{ k:'T' },{ k:'PCT',hl:true },{ k:'GB' },{ k:'STRK' },{ k:'Home' },{ k:'AWAY' }],
  nhl: [{ k:'W',hl:true },{ k:'L' },{ k:'OTL' },{ k:'PCT',hl:true },{ k:'GB' },{ k:'STRK' },{ k:'Home' },{ k:'AWAY' }],
};

function getStatMap(entry) {
  const r = {};
  (entry.stats || []).forEach((s) => {
    const key = s.abbreviation || s.name;
    if (key) { r[key] = s.displayValue; r[s.name] = s.displayValue; }
  });
  return r;
}

function StandingsTable({ sport }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const cols = STANDING_COLS[sport] || STANDING_COLS.mlb;

  useEffect(() => {
    getStandings(sport).then(setData).catch(() => setData(null)).finally(() => setLoading(false));
  }, [sport]);

  if (loading) return <div className="tp-loading">Loading…</div>;
  if (!data) return <div className="tp-loading">Standings unavailable.</div>;

  const groups = [];
  const walk = (node) => {
    const entries = node.standings?.entries || [];
    if (entries.length > 0) groups.push({ name: node.name, entries });
    (node.children || []).forEach(walk);
  };
  walk(data);

  return (
    <div className="tp-standings-v2">
      {groups.map((g, gi) => (
        <div key={gi} className="tp-div-block">
          <div className="tp-div-header">{g.name}</div>
          <div className="tp-table-wrap">
            <table className="tp-table">
              <thead>
                <tr>
                  <th className="tp-th tp-th-team">TEAM</th>
                  {cols.map((c) => <th key={c.k} className="tp-th">{c.k === 'Road' ? 'AWAY' : c.k}</th>)}
                </tr>
              </thead>
              <tbody>
                {g.entries.map((entry, i) => {
                  const team = entry.team || {};
                  const stats = getStatMap(entry);
                  const logo = team.logos?.[0]?.href;
                  const strk = stats['STRK'] || stats['streak'] || '';
                  return (
                    <tr key={team.id || i} className="tp-tr">
                      <td className="tp-td tp-td-team">
                        {logo && <img src={logo} alt="" className="tp-standings-logo" />}
                        <span className="tp-standings-abbr">{team.abbreviation || team.shortDisplayName}</span>
                      </td>
                      {cols.map((c) => (
                        <td key={c.k} className={`tp-td ${c.hl ? 'tp-td-hl' : ''} ${c.k === 'STRK' && strk.startsWith('W') ? 'tp-strk-win' : c.k === 'STRK' ? 'tp-strk-loss' : ''}`}>
                          {stats[c.k] ?? '—'}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
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
          <button key={key} className={`ts-tab ${activeSport === key ? 'ts-tab-active' : ''}`} onClick={() => setActiveSport(key)}>
            {label}
          </button>
        ))}
      </div>
      <StandingsTable sport={activeSport} />
    </div>
  );
}
