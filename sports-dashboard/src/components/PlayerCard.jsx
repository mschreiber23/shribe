import { Link } from 'react-router-dom';
import usePlayerStats from '../hooks/usePlayerStats';
import { useFavorites } from '../context/FavoritesContext';

function StatPill({ label, value }) {
  return (
    <div className="stat-pill">
      <div className="stat-value">{value ?? '—'}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

function extractSeasonStats(statsData, sport) {
  if (!statsData) return [];

  // ESPN core API v2: splits.categories[].stats[{abbreviation, displayValue}]
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
      { label: 'L', value: s['L'] },   { label: 'SO', value: s['SO'] },
      { label: 'IP', value: s['IP'] }, { label: 'WHIP', value: s['WHIP'] },
    ];
    return [
      { label: 'AVG', value: s['AVG'] }, { label: 'OPS', value: s['OPS'] },
      { label: 'HR', value: s['HR'] },   { label: 'RBI', value: s['RBI'] },
      { label: 'R', value: s['R'] },     { label: 'SB', value: s['SB'] },
    ];
  }

  if (sport === 'nba') {
    // Merge all categories — PTS/AST/FG% in 'offensive', REB/GP/+/- in 'general'
    const s = {};
    categories.forEach((cat) => Object.assign(s, getCatStats(cat)));
    return [
      { label: 'PTS', value: s['PTS'] || s['PPG'] }, { label: 'REB', value: s['REB'] || s['RPG'] },
      { label: 'AST', value: s['AST'] || s['APG'] }, { label: 'STL', value: s['STL'] },
      { label: 'BLK', value: s['BLK'] },             { label: 'FG%', value: s['FG%'] || s['FGP'] },
    ];
  }

  if (sport === 'nfl') {
    // Merge all categories first, then determine player type
    const s = {};
    categories.forEach((cat) => Object.assign(s, getCatStats(cat)));
    const passing   = categories.find((c) => c.name?.includes('pass'));
    const rushing   = categories.find((c) => c.name?.includes('rush'));
    if (passing)   return [{ label: 'YDS', value: s['YDS'] }, { label: 'TD', value: s['TD'] }, { label: 'INT', value: s['INT'] }, { label: 'RTG', value: s['RTG'] }];
    if (rushing)   return [{ label: 'YDS', value: s['YDS'] }, { label: 'TD', value: s['TD'] }, { label: 'CAR', value: s['CAR'] }, { label: 'AVG', value: s['AVG'] }];
    return [{ label: 'REC', value: s['REC'] }, { label: 'YDS', value: s['YDS'] }, { label: 'TD', value: s['TD'] }, { label: 'AVG', value: s['AVG'] }];
  }

  if (sport === 'nhl') {
    // Merge all categories — G/GP/+/- in 'general', A/PTS in 'offensive'
    const s = {};
    categories.forEach((cat) => Object.assign(s, getCatStats(cat)));
    // Prefer offensive G over general G (offensive is per-season, general can include playoffs)
    const offCat = categories.find((c) => c.name === 'offensive');
    if (offCat) Object.assign(s, getCatStats(offCat));
    return [{ label: 'G', value: s['G'] }, { label: 'A', value: s['A'] }, { label: 'PTS', value: s['PTS'] }, { label: '+/-', value: s['+/-'] }];
  }

  const s = getCatStats(categories[0]);
  return Object.entries(s).slice(0, 6).map(([label, value]) => ({ label, value }));
}

export default function PlayerCard({ player, sport }) {
  const { removePlayer } = useFavorites();
  const { stats, loading, error } = usePlayerStats(sport, player.id);

  const seasonStats = extractSeasonStats(stats, sport);

  return (
    <div className="player-card">
        <div className="player-card-header">
      <Link to={`/player/${sport}/${player.id}`} className="player-card-link">
      <div className="player-avatar-wrap">
          {player.headshot ? (
            <img src={player.headshot} alt={player.displayName} className="player-avatar" />
          ) : (
            <div className="player-avatar-placeholder">{player.displayName?.[0]}</div>
          )}
        </div>
        <div className="player-meta">
          <div className="player-name">{player.displayName}</div>
          <div className="player-pos">{player.position}</div>
        </div>
      </Link>
        <button
          className="remove-btn"
          onClick={() => removePlayer(player.id)}
          title="Remove player"
        >
          ×
        </button>
      </div>

      <div className="player-stats-section">
        <div className="stats-label">Season Stats</div>
        {loading && <div className="stats-loading">Loading stats…</div>}
        {error && <div className="stats-error">{error}</div>}
        {!loading && !error && seasonStats.length === 0 && (
          <div className="stats-error">No stats available.</div>
        )}
        {!loading && !error && seasonStats.length > 0 && (
          <div className="stat-pills">
            {seasonStats.map((s) => (
              <StatPill key={s.label} label={s.label} value={s.value} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
