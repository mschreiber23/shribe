import { useState, useEffect } from 'react';
import { useFavorites } from '../context/FavoritesContext';
import { searchTeams, SPORTS } from '../api/espn';

export default function Header() {
  const { favorites, setSport, setTeam } = useFavorites();
  const [teams, setTeams] = useState([]);
  const [query, setQuery] = useState('');
  const [showTeamPicker, setShowTeamPicker] = useState(false);
  const [loadingTeams, setLoadingTeams] = useState(false);

  useEffect(() => {
    if (!showTeamPicker) return;
    setLoadingTeams(true);
    searchTeams(favorites.sport, query)
      .then(setTeams)
      .catch(() => setTeams([]))
      .finally(() => setLoadingTeams(false));
  }, [showTeamPicker, favorites.sport, query]);

  const teamColor = favorites.team?.color ? `#${favorites.team.color}` : '#7c3aed';

  return (
    <header className="header" style={{ '--team-color': teamColor }}>
      <div className="header-inner">
        <div className="header-brand">
          <div className="brand-icon">🏆</div>
          <div>
            <div className="brand-name">Sports Dashboard</div>
            {favorites.team && (
              <div className="brand-team" style={{ color: `#${favorites.team.alternateColor || 'fbbf24'}` }}>
                {favorites.team.displayName}
              </div>
            )}
          </div>
        </div>

        <nav className="header-nav">
          {Object.entries(SPORTS).map(([key, { label }]) => (
            <button
              key={key}
              className={`sport-tab ${favorites.sport === key ? 'sport-tab-active' : ''}`}
              onClick={() => setSport(key)}
            >
              {label}
            </button>
          ))}
        </nav>

        <div className="header-actions-right">
          <div className="team-selector">
            <button
              className="team-btn"
              onClick={() => setShowTeamPicker((v) => !v)}
            >
              {favorites.team ? (
                <>
                  {favorites.team.logo && (
                    <img src={favorites.team.logo} alt="" className="team-btn-logo" />
                  )}
                  {favorites.team.abbreviation || favorites.team.displayName}
                </>
              ) : (
                'Pick a Team'
              )}
              <span className="chevron">▾</span>
            </button>

            {showTeamPicker && (
              <div className="team-dropdown">
                <input
                  className="search-input"
                  placeholder="Search teams…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  autoFocus
                />
                {loadingTeams && <div className="loading-text">Loading…</div>}
                <div className="dropdown-list">
                  {teams.map((team) => (
                    <button
                      key={team.id}
                      className={`dropdown-item ${favorites.team?.id === team.id ? 'dropdown-item-active' : ''}`}
                      onClick={() => {
                        setTeam(team);
                        setShowTeamPicker(false);
                        setQuery('');
                      }}
                    >
                      {team.logos?.[0]?.href && (
                        <img src={team.logos[0].href} alt="" className="dropdown-logo" />
                      )}
                      {team.displayName}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
