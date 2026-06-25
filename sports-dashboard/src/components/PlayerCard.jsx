import { Link } from 'react-router-dom';
import usePlayerStats from '../hooks/usePlayerStats';
import { useFavorites } from '../context/FavoritesContext';

/* ── Stat extraction (unchanged logic) ─────────────── */
function extractSeasonStats(statsData, sport) {
  if (!statsData) return [];
  const categories = statsData.splits?.categories || [];

  const getCatStats = (cat) => {
    if (!cat) return {};
    const result = {};
    (cat.stats || []).forEach((s) => { result[s.abbreviation] = s.displayValue; });
    return result;
  };

  if (sport === 'mlb') {
    const batting  = categories.find((c) => c.name === 'batting');
    const pitching = categories.find((c) => c.name === 'pitching');
    const s = getCatStats(pitching || batting || categories[0]);
    if (pitching) return [
      { label: 'ERA', value: s['ERA'] }, { label: 'W', value: s['W'] },
      { label: 'SO',  value: s['SO'] },  { label: 'IP',  value: s['IP'] },
      { label: 'L',   value: s['L'] },   { label: 'WHIP',value: s['WHIP'] },
    ];
    return [
      { label: 'AVG', value: s['AVG'] }, { label: 'OPS', value: s['OPS'] },
      { label: 'HR',  value: s['HR'] },  { label: 'RBI', value: s['RBI'] },
      { label: 'R',   value: s['R'] },   { label: 'SB',  value: s['SB'] },
    ];
  }

  if (sport === 'nba') {
    // Use pre-merged stats from bio + defensive (set by getPlayerStats)
    const merged = statsData._merged;
    if (merged) {
      return [
        { label: 'PTS', value: merged['PTS'] }, { label: 'REB', value: merged['REB'] },
        { label: 'AST', value: merged['AST'] }, { label: 'STL', value: merged['STL'] },
        { label: 'BLK', value: merged['BLK'] }, { label: 'FG%', value: merged['FG%'] },
      ];
    }
    const s = {};
    categories.forEach((cat) => Object.assign(s, getCatStats(cat)));
    const off = categories.find((c) => c.name === 'offensive');
    if (off) Object.assign(s, getCatStats(off));
    return [
      { label: 'PTS', value: s['PTS'] }, { label: 'REB', value: s['REB'] },
      { label: 'AST', value: s['AST'] }, { label: 'STL', value: s['STL'] },
      { label: 'BLK', value: s['BLK'] }, { label: 'FG%', value: s['FG%'] },
    ];
  }

  if (sport === 'nfl') {
    const position = (statsData._position || '').toUpperCase();
    const passing   = categories.find((c) => c.name?.includes('pass'));
    const rushing   = categories.find((c) => c.name?.includes('rush'));
    const receiving = categories.find((c) => c.name?.includes('receiv'));
    const general   = categories.find((c) => c.name === 'general');
    const gp = getCatStats(general)['GP'] || '';

    const QB_POS = ['QB'];
    const RB_POS = ['RB', 'HB', 'FB'];
    const REC_POS = ['WR', 'TE', 'FB'];

    if (QB_POS.includes(position) || (!position && passing)) {
      const s = getCatStats(passing);
      return [{ label: 'GP', value: gp }, { label: 'YDS', value: s['YDS'] }, { label: 'TD', value: s['TD'] }, { label: 'INT', value: s['INT'] }, { label: 'RTG', value: s['RTG'] }];
    }
    if (RB_POS.includes(position) || (!position && rushing && !passing)) {
      const s = getCatStats(rushing);
      const r = getCatStats(receiving);
      return [{ label: 'GP', value: gp }, { label: 'CAR', value: s['CAR'] }, { label: 'YDS', value: s['YDS'] }, { label: 'TD', value: s['TD'] }, { label: 'REC', value: r['REC'] }];
    }
    if (REC_POS.includes(position) || (!position && receiving)) {
      const s = getCatStats(receiving);
      return [{ label: 'GP', value: gp }, { label: 'REC', value: s['REC'] }, { label: 'YDS', value: s['YDS'] }, { label: 'TD', value: s['TD'] }, { label: 'AVG', value: s['AVG'] }];
    }
    const src = passing || rushing || receiving || categories[0];
    const s = getCatStats(src);
    return [{ label: 'GP', value: gp }, { label: 'YDS', value: s['YDS'] }, { label: 'TD', value: s['TD'] }];
  }

  if (sport === 'nhl') {
    const s = {};
    categories.forEach((cat) => Object.assign(s, getCatStats(cat)));
    const off = categories.find((c) => c.name === 'offensive');
    if (off) Object.assign(s, getCatStats(off));
    return [{ label: 'G', value: s['G'] }, { label: 'A', value: s['A'] }, { label: 'PTS', value: s['PTS'] }, { label: '+/-', value: s['+/-'] }];
  }

  const s = getCatStats(categories[0]);
  return Object.entries(s).slice(0, 6).map(([label, value]) => ({ label, value }));
}

/* ── Trading Card Component ─────────────────────────── */
export default function PlayerCard({ player, sport }) {
  const { removePlayer } = useFavorites();
  const { stats, loading, error } = usePlayerStats(sport, player.id);

  if (stats) stats._position = player.position || '';
  const seasonStats = extractSeasonStats(stats, sport);

  // Team color for gradient — stored on player or fall back to accent
  const teamColor = player.teamColor ? `#${player.teamColor}` : '#7c3aed';

  return (
    <div className="sports-card">
      {/* Shine overlay */}
      <div className="sports-card-shine" />

      {/* Remove button */}
      <button className="sports-card-remove" onClick={() => removePlayer(player.id)} title="Remove">×</button>

      {/* Photo area */}
      <Link to={`/player/${sport}/${player.id}`} className="sports-card-photo-link">
        <div className="sports-card-photo-wrap" style={{ '--card-color': teamColor }}>
          {player.headshot ? (
            <img src={player.headshot} alt={player.displayName} className="sports-card-photo" />
          ) : (
            <div className="sports-card-photo-placeholder">{player.displayName?.[0]}</div>
          )}
          {/* Gradient fade at bottom of photo */}
          <div className="sports-card-fade" style={{ background: `linear-gradient(to bottom, transparent 40%, ${teamColor} 100%)` }} />
        </div>

        {/* Player info strip */}
        <div className="sports-card-info" style={{ background: teamColor }}>
          <div className="sports-card-name">{player.displayName}</div>
          <div className="sports-card-meta">{player.position} · {player.teamName?.split(' ').pop()}</div>
        </div>
      </Link>

      {/* Stats section */}
      <div className="sports-card-stats">
        {loading && <div className="sports-card-loading">Loading…</div>}
        {!loading && !error && seasonStats.length > 0 && (
          <div className="sports-card-stat-grid">
            {seasonStats.map((s) => (
              <div key={s.label} className="sports-card-stat">
                <div className="sports-card-stat-value">{s.value ?? '—'}</div>
                <div className="sports-card-stat-label">{s.label}</div>
              </div>
            ))}
          </div>
        )}
        {!loading && (error || seasonStats.length === 0) && (
          <div className="sports-card-loading">No stats available</div>
        )}
        <div className="sports-card-season">2025-26 Season</div>
      </div>
    </div>
  );
}
