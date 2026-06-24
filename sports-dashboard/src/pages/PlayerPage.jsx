import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getPlayerBio, getPlayerSeasonStats } from '../api/espn';

const STAT_COLS = [
  { key: 'GP',  label: 'GP',  title: 'Games Played' },
  { key: 'AB',  label: 'AB',  title: 'At Bats' },
  { key: 'AVG', label: 'AVG', title: 'Batting Average', hl: true },
  { key: 'OBP', label: 'OBP', title: 'On Base Pct', hl: true },
  { key: 'SLG', label: 'SLG', title: 'Slugging', hl: true },
  { key: 'OPS', label: 'OPS', title: 'OPS', hl: true },
  { key: 'R',   label: 'R',   title: 'Runs' },
  { key: 'H',   label: 'H',   title: 'Hits' },
  { key: '2B',  label: '2B',  title: 'Doubles' },
  { key: '3B',  label: '3B',  title: 'Triples' },
  { key: 'HR',  label: 'HR',  title: 'Home Runs', hl: true },
  { key: 'RBI', label: 'RBI', title: 'RBI', hl: true },
  { key: 'BB',  label: 'BB',  title: 'Walks' },
  { key: 'HBP', label: 'HBP', title: 'Hit by Pitch' },
  { key: 'SO',  label: 'SO',  title: 'Strikeouts' },
  { key: 'SB',  label: 'SB',  title: 'Stolen Bases' },
  { key: 'CS',  label: 'CS',  title: 'Caught Stealing' },
  { key: 'WAR', label: 'WAR', title: 'WAR' },
];

function getStats(data) {
  if (!data) return {};
  const cats = data.splits?.categories || [];
  const batting = cats.find((c) => c.name === 'batting') || cats[0];
  const result = {};
  (batting?.stats || []).forEach((s) => { result[s.abbreviation] = s.displayValue; });
  return result;
}

export default function PlayerPage() {
  const { sport, playerId } = useParams();
  const navigate = useNavigate();
  const [bio, setBio] = useState(null);
  const [seasons, setSeasons] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const currentYear = new Date().getFullYear();

    getPlayerBio(sport, playerId).then(setBio).catch(() => {});

    // Fetch up to 5 most recent seasons
    const years = Array.from({ length: 5 }, (_, i) => currentYear - i).reverse();
    Promise.allSettled(years.map((y) => getPlayerSeasonStats(sport, playerId, y)))
      .then((results) => {
        const valid = results
          .filter((r) => r.status === 'fulfilled')
          .map((r) => r.value)
          .filter((r) => {
            const stats = getStats(r.data);
            return stats['GP'] && stats['GP'] !== '0';
          });
        setSeasons(valid);
      })
      .finally(() => setLoading(false));
  }, [sport, playerId]);

  const athlete = bio?.athlete || {};
  const summary = athlete.statsSummary?.statistics || [];
  const teamLogo = athlete.team?.logos?.[0]?.href || athlete.team?.logo;

  // Career totals (numeric sum of seasons)
  const careerTotals = (() => {
    const numericKeys = ['GP','AB','R','H','2B','3B','HR','RBI','BB','HBP','SO','SB','CS'];
    const totals = {};
    seasons.forEach(({ data }) => {
      const s = getStats(data);
      numericKeys.forEach((k) => {
        const v = parseFloat(s[k]);
        if (!isNaN(v)) totals[k] = (totals[k] || 0) + v;
      });
    });
    // Calculate AVG, OBP, OPS from last season (career averages would need AB weighting)
    const lastStats = seasons.length ? getStats(seasons[seasons.length - 1].data) : {};
    return { ...totals, AVG: lastStats.AVG, OBP: lastStats.OBP, SLG: lastStats.SLG, OPS: lastStats.OPS, WAR: '—' };
  })();

  return (
    <div className="pp-page">
      <button className="tp-back" onClick={() => navigate(-1)}>← Back</button>

      {loading && <div className="tp-loading">Loading…</div>}

      {!loading && athlete.displayName && (
        <>
          {/* Bio Header */}
          <div className="pp-header">
            <div className="pp-hero">
              {athlete.headshot?.href && (
                <img src={athlete.headshot.href} alt={athlete.displayName} className="pp-headshot" />
              )}
              <div className="pp-bio">
                <div className="pp-name">
                  <span className="pp-firstname">{athlete.firstName}</span>
                  <span className="pp-lastname"> {athlete.lastName}</span>
                </div>
                <div className="pp-team-row">
                  {teamLogo && <img src={teamLogo} alt="" className="pp-team-logo" />}
                  <span className="pp-team-name">{athlete.team?.displayName}</span>
                  {athlete.displayJersey && <span className="pp-meta"> · #{athlete.displayJersey}</span>}
                  {athlete.position?.abbreviation && <span className="pp-meta"> · {athlete.position.abbreviation}</span>}
                </div>
                <div className="pp-details">
                  {athlete.displayHeight && athlete.displayWeight && (
                    <div className="pp-detail-row"><span className="pp-detail-label">HT/WT</span><span>{athlete.displayHeight}, {athlete.displayWeight}</span></div>
                  )}
                  {athlete.displayDOB && (
                    <div className="pp-detail-row"><span className="pp-detail-label">BORN</span><span>{athlete.displayDOB}{athlete.age ? ` (${athlete.age})` : ''}</span></div>
                  )}
                  {athlete.displayBatsThrows && (
                    <div className="pp-detail-row"><span className="pp-detail-label">BAT/THR</span><span>{athlete.displayBatsThrows}</span></div>
                  )}
                  {athlete.displayDraft && (
                    <div className="pp-detail-row"><span className="pp-detail-label">DRAFT</span><span>{athlete.displayDraft}</span></div>
                  )}
                </div>
              </div>
            </div>

            {/* Season stat highlights */}
            {summary.length > 0 && (
              <div className="pp-stat-highlights">
                <div className="pp-highlights-label">{athlete.statsSummary?.displayName || '2026 Season Stats'}</div>
                <div className="pp-highlights-grid">
                  {summary.map((s) => (
                    <div key={s.abbreviation} className="pp-highlight-pill">
                      <div className="pp-hl-value">{s.displayValue}</div>
                      <div className="pp-hl-label">{s.abbreviation}</div>
                      {s.rankDisplayValue && <div className="pp-hl-rank">{s.rankDisplayValue}</div>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Career stats table */}
          <div className="pp-stats-section">
            <div className="pp-stats-title">Career Batting</div>
            <div className="pp-table-wrap">
              <table className="pp-table">
                <thead>
                  <tr>
                    <th className="pp-th pp-th-season">SEASON</th>
                    {STAT_COLS.map((c) => (
                      <th key={c.key} className="pp-th" title={c.title}>{c.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {seasons.map(({ year, data }) => {
                    const s = getStats(data);
                    const isCurrent = year === new Date().getFullYear();
                    return (
                      <tr key={year} className={`pp-tr ${isCurrent ? 'pp-tr-current' : ''}`}>
                        <td className="pp-td pp-td-season">{year}</td>
                        {STAT_COLS.map((c) => (
                          <td key={c.key} className={`pp-td ${c.hl ? 'pp-td-hl' : ''}`}>
                            {s[c.key] ?? '—'}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                  {seasons.length > 1 && (
                    <tr className="pp-tr-career">
                      <td className="pp-td pp-td-season pp-career-label">Career</td>
                      {STAT_COLS.map((c) => (
                        <td key={c.key} className={`pp-td ${c.hl ? 'pp-td-hl' : ''}`}>
                          {careerTotals[c.key] !== undefined
                            ? (typeof careerTotals[c.key] === 'number'
                              ? careerTotals[c.key]
                              : careerTotals[c.key])
                            : '—'}
                        </td>
                      ))}
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {!loading && !athlete.displayName && (
        <div className="error-banner">Could not load player information.</div>
      )}
    </div>
  );
}
