import { useState } from 'react';
import useTeamGame from '../hooks/useTeamGame';
import { useFavorites } from '../context/FavoritesContext';
import { SPORTS } from '../api/espn';
import BoxScoreModal from './BoxScoreModal';

function GameDisplay({ game, teamId, onOpen }) {
  if (!game) return <div className="team-no-game">No game today</div>;

  const comp = game.competitions?.[0];
  const status = comp?.status;
  const competitors = comp?.competitors || [];
  const [away, home] = competitors;
  const state = status?.type?.state;

  const isLive = state === 'in';
  const isFinal = state === 'post';
  const clock = status?.displayClock;
  const period = status?.period;
  const shortDetail = status?.type?.shortDetail;

  return (
    <button className="team-game" onClick={onOpen} title="View box score">
      <div className="team-game-status">
        {isLive && (
          <span className="badge badge-live">
            <span className="live-dot" />
            {clock} · {period && `Q${period}`}
          </span>
        )}
        {isFinal && <span className="badge badge-final">Final</span>}
        {!isLive && !isFinal && <span className="badge badge-pre">{shortDetail}</span>}
        <span className="team-game-cta">View Box Score →</span>
      </div>
      <div className="team-game-matchup">
        <TeamScore competitor={away} teamId={teamId} />
        <div className="vs-divider">@</div>
        <TeamScore competitor={home} teamId={teamId} />
      </div>
    </button>
  );
}

function TeamScore({ competitor, teamId }) {
  const isMyTeam = competitor?.team?.id === String(teamId);
  const team = competitor?.team || {};
  return (
    <div className={`game-team ${isMyTeam ? 'game-team-mine' : ''} ${competitor?.winner ? 'game-team-winner' : ''}`}>
      {team.logo && <img src={team.logo} alt={team.abbreviation} className="game-team-logo" />}
      <span className="game-team-abbr">{team.abbreviation}</span>
      {competitor?.score != null && (
        <span className="game-team-score">{competitor.score}</span>
      )}
    </div>
  );
}

export default function TeamCard({ sport, team }) {
  const { removeTeam } = useFavorites();
  const { game, loading } = useTeamGame(sport, team.id);
  const [showBoxScore, setShowBoxScore] = useState(false);
  const sportLabel = SPORTS[sport]?.label || sport.toUpperCase();
  const accentColor = `#${team.color || '7c3aed'}`;

  return (
    <>
      <div
        className="team-card"
        style={{ '--team-accent': accentColor, '--team-alt': `#${team.alternateColor || 'ffffff'}` }}
      >
        <div className="team-card-header">
          <div className="team-card-identity">
            {team.logo && (
              <img src={team.logo} alt={team.abbreviation} className="team-card-logo" />
            )}
            <div>
              <div className="team-card-name">{team.displayName}</div>
              <div className="team-card-sport">{sportLabel}</div>
            </div>
          </div>
          <button
            className="remove-btn"
            onClick={() => removeTeam(team.id, sport)}
            title="Remove team"
          >
            ×
          </button>
        </div>

        <div className="team-card-game">
          {loading ? (
            <div className="team-no-game">Loading…</div>
          ) : (
            <GameDisplay
              game={game}
              teamId={team.id}
              onOpen={() => game && setShowBoxScore(true)}
            />
          )}
        </div>
      </div>

      {showBoxScore && game && (
        <BoxScoreModal
          sport={sport}
          game={game}
          onClose={() => setShowBoxScore(false)}
        />
      )}
    </>
  );
}
