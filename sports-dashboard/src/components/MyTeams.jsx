import { useState, useEffect } from 'react';
import { useFavorites } from '../context/FavoritesContext';
import TeamCard from './TeamCard';
import { searchTeams, SPORTS } from '../api/espn';

export default function MyTeams() {
  const { favorites, addTeam } = useFavorites();
  const [showPicker, setShowPicker] = useState(false);
  const [pickerSport, setPickerSport] = useState('nba');
  const [query, setQuery] = useState('');
  const [teams, setTeams] = useState([]);
  const [loadingTeams, setLoadingTeams] = useState(false);

  useEffect(() => {
    if (!showPicker) return;
    setLoadingTeams(true);
    searchTeams(pickerSport, query)
      .then(setTeams)
      .catch(() => setTeams([]))
      .finally(() => setLoadingTeams(false));
  }, [showPicker, pickerSport, query]);

  return (
    <section className="section">
      <div className="section-header">
        <div>
          <h2 className="section-title">My Teams</h2>
          <p className="section-sub">Today's games · updates every 30s</p>
        </div>
        <button className="btn-primary" onClick={() => setShowPicker((v) => !v)}>
          {showPicker ? 'Done' : '+ Add Team'}
        </button>
      </div>

      {showPicker && (
        <div className="picker-panel">
          <div className="sport-tabs-row">
            {Object.entries(SPORTS).map(([key, { label }]) => (
              <button
                key={key}
                className={`sport-tab ${pickerSport === key ? 'sport-tab-active' : ''}`}
                onClick={() => { setPickerSport(key); setQuery(''); }}
              >
                {label}
              </button>
            ))}
          </div>
          <input
            className="search-input"
            placeholder={`Search ${SPORTS[pickerSport]?.label} teams…`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ marginTop: 12 }}
          />
          {loadingTeams && <div className="loading-text">Loading…</div>}
          <div className="picker-list">
            {teams.map((team) => {
              const already = favorites.teams.some(
                (t) => t.team.id === team.id && t.sport === pickerSport
              );
              return (
                <div key={team.id} className="picker-item">
                  <div className="picker-player-info">
                    {team.logos?.[0]?.href && (
                      <img src={team.logos[0].href} alt={team.abbreviation} className="picker-avatar" />
                    )}
                    <div>
                      <div className="picker-name">{team.displayName}</div>
                      <div className="picker-pos">{SPORTS[pickerSport]?.label}</div>
                    </div>
                  </div>
                  <button
                    className={already ? 'btn-ghost btn-sm' : 'btn-primary btn-sm'}
                    disabled={already}
                    onClick={() => addTeam(pickerSport, {
                      id: team.id,
                      displayName: team.displayName,
                      abbreviation: team.abbreviation,
                      color: team.color,
                      alternateColor: team.alternateColor,
                      logo: team.logos?.[0]?.href || '',
                    })}
                  >
                    {already ? 'Added' : 'Add'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {favorites.teams.length === 0 && !showPicker && (
        <div className="empty-state">
          <div className="empty-icon">🏆</div>
          <p>No teams added. Click "+ Add Team" to get started.</p>
        </div>
      )}

      <div className="teams-grid">
        {favorites.teams.map(({ sport, team }) => (
          <TeamCard key={`${sport}-${team.id}`} sport={sport} team={team} />
        ))}
      </div>
    </section>
  );
}
