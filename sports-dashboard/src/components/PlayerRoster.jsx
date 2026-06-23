import { useState, useEffect } from 'react';
import { useFavorites } from '../context/FavoritesContext';
import PlayerCard from './PlayerCard';
import { getTeamRoster } from '../api/espn';

export default function PlayerRoster() {
  const { favorites, addPlayer } = useFavorites();
  const [roster, setRoster] = useState([]);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [showPicker, setShowPicker] = useState(false);

  useEffect(() => {
    if (!favorites.team?.id) return;
    setRosterLoading(true);
    getTeamRoster(favorites.sport, favorites.team.id)
      .then((athletes) => setRoster(athletes))
      .catch(() => setRoster([]))
      .finally(() => setRosterLoading(false));
  }, [favorites.sport, favorites.team?.id]);

  const allPlayers = roster.flatMap((group) =>
    (group.items || []).map((p) => ({
      id: String(p.id),
      displayName: p.fullName || p.displayName,
      position: p.position?.abbreviation || p.position?.name || '',
      headshot: p.headshot?.href || '',
    }))
  );

  const filtered = allPlayers.filter((p) =>
    p.displayName.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <section className="section">
      <div className="section-header">
        <div>
          <h2 className="section-title">My Players</h2>
          <p className="section-sub">Season stats · auto-refreshed</p>
        </div>
        {favorites.team && (
          <button className="btn-primary" onClick={() => setShowPicker((v) => !v)}>
            {showPicker ? 'Done' : '+ Add Player'}
          </button>
        )}
      </div>

      {showPicker && (
        <div className="picker-panel">
          <input
            className="search-input"
            placeholder={`Search ${favorites.team?.displayName || ''} roster…`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {rosterLoading && <div className="loading-text">Loading roster…</div>}
          <div className="picker-list">
            {filtered.map((p) => {
              const already = favorites.players.some((fp) => fp.id === p.id);
              return (
                <div key={p.id} className="picker-item">
                  <div className="picker-player-info">
                    {p.headshot ? (
                      <img src={p.headshot} alt={p.displayName} className="picker-avatar" />
                    ) : (
                      <div className="picker-avatar-placeholder">{p.displayName?.[0]}</div>
                    )}
                    <div>
                      <div className="picker-name">{p.displayName}</div>
                      <div className="picker-pos">{p.position}</div>
                    </div>
                  </div>
                  <button
                    className={already ? 'btn-ghost btn-sm' : 'btn-primary btn-sm'}
                    disabled={already}
                    onClick={() => addPlayer(p)}
                  >
                    {already ? 'Added' : 'Add'}
                  </button>
                </div>
              );
            })}
            {!rosterLoading && filtered.length === 0 && (
              <div className="loading-text">No players found.</div>
            )}
          </div>
        </div>
      )}

      {favorites.players.length === 0 && !showPicker && (
        <div className="empty-state">
          <div className="empty-icon">🏆</div>
          <p>No players added yet.{favorites.team ? ' Click "+ Add Player" to get started.' : ' Select a team first.'}</p>
        </div>
      )}

      <div className="players-grid">
        {favorites.players.map((player) => (
          <PlayerCard key={player.id} player={player} sport={favorites.sport} />
        ))}
      </div>
    </section>
  );
}
