import { useEffect } from 'react';
import useBoxScore from '../hooks/useBoxScore';

function TeamBoxScore({ group, sport }) {
  const team = group.team || {};
  const statistics = group.statistics || [];

  return (
    <div className="bsm-team-section">
      <div className="bsm-team-header">
        {team.logo && <img src={team.logo} alt={team.abbreviation} className="bsm-team-logo" />}
        <span className="bsm-team-name">{team.displayName}</span>
      </div>

      {statistics.map((statGroup, i) => {
        const labels = statGroup.labels || [];
        const athletes = statGroup.athletes || [];
        const totals = statGroup.totals || [];
        const groupName = statGroup.name || statGroup.type || '';

        if (athletes.length === 0) return null;

        // Choose which columns to display based on sport to keep it readable
        const displayCols = getDisplayCols(sport, groupName, labels);

        return (
          <div key={i} className="bsm-stat-group">
            {groupName && <div className="bsm-group-label">{groupName}</div>}
            <div className="bsm-table-wrap">
              <table className="bsm-table">
                <thead>
                  <tr>
                    <th className="bsm-th bsm-th-player">Player</th>
                    {displayCols.map((col) => (
                      <th key={col.label} className="bsm-th">{col.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {athletes.map((a, j) => {
                    const player = a.athlete || {};
                    const stats = a.stats || [];
                    const didNotPlay = a.didNotPlay || stats.length === 0;
                    return (
                      <tr key={j} className={`bsm-tr ${didNotPlay ? 'bsm-dnp' : ''}`}>
                        <td className="bsm-td bsm-td-player">
                          <div className="bsm-player-row">
                            {player.headshot?.href && (
                              <img src={player.headshot.href} alt="" className="bsm-player-avatar" />
                            )}
                            <div>
                              <div className="bsm-player-name">{player.shortName || player.displayName}</div>
                              <div className="bsm-player-pos">{a.position?.abbreviation || ''}</div>
                            </div>
                          </div>
                        </td>
                        {didNotPlay ? (
                          <td className="bsm-td bsm-dnp-cell" colSpan={displayCols.length}>DNP</td>
                        ) : (
                          displayCols.map((col) => (
                            <td key={col.label} className={`bsm-td ${isHighlightStat(sport, col.label) ? 'bsm-stat-highlight' : ''}`}>
                              {stats[col.index] ?? '—'}
                            </td>
                          ))
                        )}
                      </tr>
                    );
                  })}
                  {totals.length > 0 && (
                    <tr className="bsm-totals-row">
                      <td className="bsm-td bsm-td-player bsm-totals-label">TOTALS</td>
                      {displayCols.map((col) => (
                        <td key={col.label} className="bsm-td">{totals[col.index] ?? ''}</td>
                      ))}
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function getDisplayCols(sport, groupName, labels) {
  const name = (groupName || '').toLowerCase();
  const allCols = labels.map((label, index) => ({ label, index }));

  if (sport === 'nba') {
    const want = ['MIN', 'PTS', 'REB', 'AST', 'STL', 'BLK', 'FG', '3PT', 'FT', '+/-', 'TO'];
    return filterCols(allCols, want);
  }
  if (sport === 'mlb') {
    if (name.includes('pitch')) {
      const want = ['IP', 'H', 'R', 'ER', 'BB', 'K', 'HR', 'ERA', 'PC-ST'];
      return filterCols(allCols, want);
    }
    const want = ['AB', 'R', 'H', 'RBI', 'HR', 'BB', 'K', 'AVG', 'OBP', 'SLG'];
    return filterCols(allCols, want);
  }
  if (sport === 'nfl') {
    if (name.includes('pass')) {
      const want = ['C/ATT', 'YDS', 'AVG', 'TD', 'INT', 'SACKS', 'QBR', 'RTG'];
      return filterCols(allCols, want);
    }
    if (name.includes('rush')) {
      const want = ['CAR', 'YDS', 'AVG', 'TD', 'LONG'];
      return filterCols(allCols, want);
    }
    if (name.includes('receiv')) {
      const want = ['REC', 'YDS', 'AVG', 'TD', 'LONG', 'TGTS'];
      return filterCols(allCols, want);
    }
    return allCols.slice(0, 8);
  }
  if (sport === 'nhl') {
    const want = ['G', 'A', 'PTS', '+/-', 'SOG', 'PIM', 'TOI'];
    return filterCols(allCols, want);
  }
  return allCols.slice(0, 10);
}

function filterCols(allCols, want) {
  const result = [];
  for (const w of want) {
    const found = allCols.find((c) => c.label === w);
    if (found) result.push(found);
  }
  if (result.length === 0) return allCols.slice(0, 10);
  return result;
}

function isHighlightStat(sport, label) {
  const highlights = {
    nba: ['PTS', 'REB', 'AST'],
    mlb: ['H', 'HR', 'RBI', 'K', 'ERA'],
    nfl: ['YDS', 'TD'],
    nhl: ['G', 'A', 'PTS'],
  };
  return (highlights[sport] || []).includes(label);
}

function GameHeader({ data, sport }) {
  const header = data?.header || {};
  const competitions = header.competitions || [];
  const comp = competitions[0] || {};
  const competitors = comp.competitors || [];
  const status = comp.status || {};
  const state = status.type?.state;
  const isLive = state === 'in';
  const isFinal = state === 'post';

  return (
    <div className="bsm-game-header">
      <div className="bsm-competitors">
        {competitors.map((c, i) => (
          <div key={i} className={`bsm-competitor ${c.winner ? 'bsm-winner' : ''}`}>
            {c.team?.logo && (
              <img src={c.team.logo} alt={c.team.abbreviation} className="bsm-comp-logo" />
            )}
            <div>
              <div className="bsm-comp-name">{c.team?.shortDisplayName || c.team?.displayName}</div>
              <div className="bsm-comp-record">{c.record?.[0]?.displayValue}</div>
            </div>
            <div className="bsm-comp-score">{c.score ?? '—'}</div>
          </div>
        ))}
      </div>
      <div className="bsm-status">
        {isLive && (
          <span className="badge badge-live">
            <span className="live-dot" /> {status.displayClock} · {status.period && `Q${status.period}`}
          </span>
        )}
        {isFinal && <span className="badge badge-final">Final</span>}
        {!isLive && !isFinal && (
          <span className="badge badge-pre">{status.type?.shortDetail}</span>
        )}
      </div>
    </div>
  );
}

export default function BoxScoreModal({ sport, game, onClose }) {
  const gameId = game?.id;
  const { data, loading, error } = useBoxScore(sport, gameId);

  useEffect(() => {
    const handler = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const players = data?.boxscore?.players || [];

  return (
    <div className="bsm-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bsm-panel">
        <div className="bsm-top-bar">
          <span className="bsm-title">Box Score</span>
          <button className="bsm-close" onClick={onClose}>✕</button>
        </div>

        {loading && (
          <div className="bsm-loading">
            <div className="skeleton-card" style={{ height: 80, marginBottom: 16 }} />
            <div className="skeleton-card" style={{ height: 300 }} />
          </div>
        )}

        {error && <div className="error-banner" style={{ margin: 20 }}>{error}</div>}

        {!loading && !error && data && (
          <>
            <GameHeader data={data} sport={sport} />
            <div className="bsm-body">
              {players.map((group, i) => (
                <TeamBoxScore key={i} group={group} sport={sport} />
              ))}
              {players.length === 0 && (
                <div className="empty-state">
                  <div className="empty-icon">📋</div>
                  <p>Box score not available yet.</p>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
