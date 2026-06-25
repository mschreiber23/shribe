import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import useTeamGame from '../hooks/useTeamGame';
import useLiveSituation from '../hooks/useLiveSituation';
import { useFavorites } from '../context/FavoritesContext';
import { SPORTS } from '../api/espn';

function getScore(c) {
  const s = c?.score;
  if (s == null) return null;
  return typeof s === 'object' ? s.displayValue : String(s);
}

/* ── Score display for non-live ─────────────────────── */
function GameScore({ game, teamId, sport, onOpen }) {
  if (!game) return <div className="tr2-no-game">No game scheduled</div>;

  const comp = game.competitions?.[0];
  const competitors = comp?.competitors || [];
  const away = competitors.find((c) => c.homeAway === 'away') || competitors[0];
  const home = competitors.find((c) => c.homeAway === 'home') || competitors[1];
  const status = comp?.status;
  const state = status?.type?.state;
  const isFinal = state === 'post';
  const isPre   = state === 'pre';
  const shortDetail = status?.type?.shortDetail || '';
  const showScore = isFinal;

  return (
    <button className="tr2-game" onClick={onOpen}>
      <div className="tr2-status">
        {isFinal && <span className="badge badge-final">Final</span>}
        {isPre && <span className="tr2-time">{shortDetail}</span>}
      </div>
      <div className="tr2-matchup">
        <TeamScoreRow competitor={away} teamId={teamId} showScore={showScore} />
        <TeamScoreRow competitor={home} teamId={teamId} showScore={showScore} />
      </div>
      <div className="tr2-tap-hint">{isPre ? 'Preview →' : 'Box Score →'}</div>
    </button>
  );
}

function TeamScoreRow({ competitor, teamId, showScore }) {
  const team = competitor?.team || {};
  const isMine = team.id === String(teamId);
  const score = getScore(competitor);
  const won = competitor?.winner;

  return (
    <div className={`tr2-team-row ${isMine ? 'tr2-mine' : ''}`}>
      <div className="tr2-team-left">
        {team.logo && <img src={team.logo} alt="" className="tr2-team-logo" />}
        <div>
          <span className={`tr2-team-name ${isMine ? 'tr2-mine-name' : ''}`}>
            {team.shortDisplayName || team.displayName || team.abbreviation}
          </span>
          {competitor?.records?.[0]?.summary && (
            <span className="tr2-record"> · {competitor.records[0].summary}</span>
          )}
        </div>
      </div>
      {showScore && score != null && (
        <span className={`tr2-score ${won ? 'tr2-winner-score' : ''}`}>{score}</span>
      )}
    </div>
  );
}

/* ── Live bar ───────────────────────────────────────── */
function LiveBar({ game, teamId, sport, liveData, onBoxScore }) {
  const comp = game.competitions?.[0];
  const status = comp?.status;
  const shortDetail = status?.type?.shortDetail || '';
  const competitors = liveData?.competitors || comp?.competitors || [];
  const away = competitors.find((c) => c.homeAway === 'away') || competitors[0];
  const home = competitors.find((c) => c.homeAway === 'home') || competitors[1];
  const sit = liveData?.situation || {};

  return (
    <button className="tr2-live-bar" onClick={onBoxScore}>
      {/* Status */}
      <div className="tr2-live-status">
        <span className="badge badge-live"><span className="live-dot" />{shortDetail}</span>
      </div>

      {/* Teams + RHE */}
      <div className="tr2-matchup">
        {[away, home].filter(Boolean).map((c) => (
          <div key={c.team?.id} className={`tr2-team-row ${c.team?.id === String(teamId) ? 'tr2-mine' : ''}`}>
            <div className="tr2-team-left">
              {c.team?.logo && <img src={c.team.logo} alt="" className="tr2-team-logo" />}
              <div>
                <span className={`tr2-team-name ${c.team?.id === String(teamId) ? 'tr2-mine-name' : ''}`}>
                  {c.team?.shortDisplayName || c.team?.abbreviation}
                </span>
                {c.record?.[0]?.summary && <span className="tr2-record"> · {c.record[0].summary}</span>}
              </div>
            </div>
            <span className="tr2-score">{getScore(c) ?? '0'}</span>
          </div>
        ))}
      </div>

      {/* Count + bases */}
      {sit.balls !== undefined && (
        <div className="tr2-situation">
          <div className="tr2-count">
            <span>{sit.balls ?? 0}-{sit.strikes ?? 0}</span>
            <span className="tr2-outs">{sit.outs ?? 0} out{sit.outs !== 1 ? 's' : ''}</span>
          </div>
          <div className="tr2-tap-hint">Box Score →</div>
        </div>
      )}
    </button>
  );
}

/* ── Main TeamRow ────────────────────────────────────── */
export default function TeamRow({ sport, team, dateStr, onHiddenChange }) {
  const { removeTeam } = useFavorites();
  const { game, loading, hasUpcomingGame } = useTeamGame(sport, team.id, 30000, dateStr);
  const navigate = useNavigate();

  const isLive = game?.competitions?.[0]?.status?.type?.state === 'in';
  const liveData = useLiveSituation(sport, isLive ? game : null);
  const sportLabel = SPORTS[sport]?.label || sport.toUpperCase();
  const accentColor = `#${team.color || '7c3aed'}`;

  useEffect(() => {
    if (hasUpcomingGame !== undefined) {
      onHiddenChange?.(team.id, sport, !hasUpcomingGame);
    }
  }, [hasUpcomingGame]);

  const goToBoxScore = () => game && navigate(`/boxscore/${sport}/${game.id}`);

  return (
    <div className="tr2-card" style={{ '--team-accent': accentColor }}>
      {/* Card header */}
      <div className="tr2-header">
        <Link to={`/team/${sport}/${team.id}`} className="tr2-identity">
          {team.logo && <img src={team.logo} alt="" className="tr2-logo" />}
          <div>
            <div className="tr2-name">{team.displayName}</div>
            <div className="tr2-sport">{sportLabel}</div>
          </div>
        </Link>
      </div>

      {/* Game section */}
      <div className="tr2-body">
        {loading ? (
          <div className="tr2-no-game">Loading…</div>
        ) : isLive ? (
          <LiveBar game={game} teamId={team.id} sport={sport} liveData={liveData} onBoxScore={goToBoxScore} />
        ) : game ? (
          <GameScore game={game} teamId={team.id} sport={sport} onOpen={goToBoxScore} />
        ) : (
          <div className="tr2-no-game">No game today</div>
        )}
      </div>
    </div>
  );
}
