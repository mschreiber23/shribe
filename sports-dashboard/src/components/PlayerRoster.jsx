import { useState, useEffect } from 'react';
import { useFavorites } from '../context/FavoritesContext';
import PlayerCard from './PlayerCard';
import { getTeamRoster, searchTeams, SPORTS } from '../api/espn';

export default function PlayerRoster() {
  const { favorites, addPlayer } = useFavorites();

  const [showPicker, setShowPicker]   = useState(false);
  const [pickerSport, setPickerSport] = useState('mlb');
  const [teamQuery, setTeamQuery]     = useState('');
  const [allTeams, setAllTeams]       = useState([]);
  const [loadingTeams, setLoadingTeams] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState(null); // { sport, id, displayName }
  const [roster, setRoster]           = useState([]);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [playerSearch, setPlayerSearch]   = useState('');

  // Load teams when sport tab changes
  useEffect(() => {
    if (!showPicker) return;
    setLoadingTeams(true);
    setAllTeams([]);
    setSelectedTeam(null);
    setRoster([]);
    setTeamQuery('');
    setPlayerSearch('');
    searchTeams(pickerSport, '')
      .then(setAllTeams)
      .catch(() => setAllTeams([]))
      .finally(() => setLoadingTeams(false));
  }, [pickerSport, showPicker]);

  // Load roster when a team is selected
  useEffect(() => {
    if (!selectedTeam) return;
    setRosterLoading(true);
    setRoster([]);
    setPlayerSearch('');
    getTeamRoster(selectedTeam.sport, selectedTeam.id)
      .then(setRoster)
      .catch(() => setRoster([]))
      .finally(() => setRosterLoading(false));
  }, [selectedTeam]);

  const filteredTeams = teamQuery
    ? allTeams.filter((t) => t.displayName.toLowerCase().includes(teamQuery.toLowerCase()))
    : allTeams;

  const allPlayers = roster.flatMap((group) =>
    (group.items || []).map((p) => ({
      id: String(p.id),
      displayName: p.fullName || p.displayName,
      position: p.position?.abbreviation || p.position?.name || '',
      headshot: p.headshot?.href || '',
      sport: selectedTeam?.sport,
      teamId: selectedTeam?.id,
      teamName: selectedTeam?.displayName,
    }))
  );

  const filteredPlayers = allPlayers.filter((p) =>
    p.displayName.toLowerCase().includes(playerSearch.toLowerCase())
  );

  const close = () => {
    setShowPicker(false);
    setSelectedTeam(null);
    setRoster([]);
    setTeamQuery('');
    setPlayerSearch('');
  };

  return (
    <section className="section">
      <div className="section-header">
        <div>
          <h2 className="section-title">My Players</h2>
          <p className="section-sub">Season stats</p>
        </div>
        <button className="btn-primary" onClick={() => showPicker ? close() : setShowPicker(true)}>
          {showPicker ? 'Done' : '+ Add Player'}
        </button>
      </div>

      {showPicker && (
        <div className="picker-panel">
          {/* Sport tabs */}
          <div className="sport-tabs-row">
            {Object.entries(SPORTS).map(([key, { label }]) => (
              <button
                key={key}
                className={`sport-tab ${pickerSport === key ? 'sport-tab-active' : ''}`}
                onClick={() => setPickerSport(key)}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Team search */}
          {!selectedTeam && (
            <>
              <input
                className="search-input"
                placeholder={`Search ${SPORTS[pickerSport]?.label} teams…`}
                value={teamQuery}
                onChange={(e) => setTeamQuery(e.target.value)}
                style={{ marginTop: 12 }}
              />
              {loadingTeams && <div className="loading-text">Loading teams…</div>}
              <div className="picker-list">
                {filteredTeams.map((team) => (
                  <div
                    key={team.id}
                    className="picker-item"
                    style={{ cursor: 'pointer' }}
                    onClick={() => setSelectedTeam({ sport: pickerSport, id: team.id, displayName: team.displayName, logo: team.logos?.[0]?.href })}
                  >
                    <div className="picker-player-info">
                      {team.logos?.[0]?.href && (
                        <img src={team.logos[0].href} alt="" className="picker-avatar" />
                      )}
                      <div>
                        <div className="picker-name">{team.displayName}</div>
                        <div className="picker-pos">{SPORTS[pickerSport]?.label}</div>
                      </div>
                    </div>
                    <span style={{ fontSize: 16, color: 'var(--text2)' }}>›</span>
                  </div>
                ))}
                {!loadingTeams && filteredTeams.length === 0 && (
                  <div className="loading-text">No teams found.</div>
                )}
              </div>
            </>
          )}

          {/* Roster */}
          {selectedTeam && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 }}>
                <button
                  className="btn-ghost btn-sm"
                  onClick={() => { setSelectedTeam(null); setRoster([]); }}
                >
                  ← Teams
                </button>
                <span style={{ fontSize: 14, fontWeight: 700 }}>{selectedTeam.displayName}</span>
              </div>
              <input
                className="search-input"
                placeholder="Search players…"
                value={playerSearch}
                onChange={(e) => setPlayerSearch(e.target.value)}
                style={{ marginTop: 10 }}
              />
              {rosterLoading && <div className="loading-text">Loading roster…</div>}
              <div className="picker-list">
                {filteredPlayers.map((p) => {
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
                {!rosterLoading && filteredPlayers.length === 0 && selectedTeam && (
                  <div className="loading-text">No players found.</div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {favorites.players.length === 0 && !showPicker && (
        <div className="empty-state">
          <div className="empty-icon">⭐</div>
          <p>No players added yet. Click "+ Add Player" to get started.</p>
        </div>
      )}

      <div className="players-grid">
        {favorites.players.map((player) => (
          <PlayerCard key={player.id} player={player} sport={player.sport} />
        ))}
      </div>
    </section>
  );
}
