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

/* ── Small base diamond ─────────────────────────────── */
function SmallDiamond({ onFirst, onSecond, onThird }) {
  return (
    <svg viewBox="0 0 36 36" className="lv-diamond">
      <rect x="12" y="1" width="12" height="12" rx="2" className={`lv-base ${onSecond ? 'lv-base-on' : ''}`} transform="rotate(45 18 7)" />
      <rect x="1" y="12" width="12" height="12" rx="2" className={`lv-base ${onThird ? 'lv-base-on' : ''}`} transform="rotate(45 7 18)" />
      <rect x="23" y="12" width="12" height="12" rx="2" className={`lv-base ${onFirst ? 'lv-base-on' : ''}`} transform="rotate(45 29 18)" />
      <rect x="12" y="23" width="12" height="12" rx="2" className="lv-base" transform="rotate(45 18 29)" />
    </svg>
  );
}

/* ── Live bar ───────────────────────────────────────── */
function LiveBar({ game, teamId, sport, liveData, onBoxScore }) {
  const navigate = useNavigate();
  const comp = game.competitions?.[0];
  const status = comp?.status;
  const shortDetail = status?.type?.shortDetail || '';
  const competitors = comp?.competitors || [];
  const away = competitors.find((c) => c.homeAway === 'away') || competitors[0];
  const home = competitors.find((c) => c.homeAway === 'home') || competitors[1];
  const sit = liveData?.situation || {};
  const lastPlay = liveData?.lastPlay;
  const broadcast = comp?.broadcasts?.[0]?.names?.[0] || '';

  const goTo = (tab) => navigate(`/boxscore/${sport}/${game.id}#tab=${encodeURIComponent(tab)}`);

  // ── MLB (baseball) ──────────────────────────────────────────
  if (sport === 'mlb') {
    const pitcher = liveData?.pitcher;
    const pitcherStats = liveData?.pitcherStats;
    const batter = liveData?.batter;
    const batterStats = liveData?.batterStats;
    const isBot = shortDetail.toLowerCase().startsWith('bot');
    return (
      <div className="lv-bar">
        <div className="lv-status-row">
          <span className={`lv-inning ${isBot ? 'lv-bot' : 'lv-top'}`}>{isBot ? '▼' : '▲'} {shortDetail}</span>
          {broadcast && <span className="lv-broadcast">{broadcast}</span>}
        </div>
        {/* Row: Teams+RHE on left, Diamond+count on right */}
        <div className="lv-top-section">
          <div className="lv-teams-section">
            <div className="lv-rhe-header">
              <div className="lv-rhe-spacer" />
              <span className="lv-rhe-label">R</span><span className="lv-rhe-label">H</span><span className="lv-rhe-label">E</span>
            </div>
            {[away, home].filter(Boolean).map((c) => (
              <div key={c.team?.id} className={`lv-team-row ${c.team?.id === String(teamId) ? 'lv-my-team' : ''}`}>
                <div className="lv-team-left">
                  {c.team?.logo && <img src={c.team.logo} alt="" className="lv-logo" />}
                  <div>
                    <div className="lv-name">{c.team?.shortDisplayName || c.team?.abbreviation}</div>
                    {c.records?.[0]?.summary && <div className="lv-record">{c.records[0].summary} · {c.homeAway === 'home' ? 'Home' : 'Away'}</div>}
                  </div>
                </div>
                <span className="lv-rhe-val">{getScore(c) ?? '0'}</span>
                <span className="lv-rhe-val lv-rhe-secondary">{c.hits ?? '0'}</span>
                <span className="lv-rhe-val lv-rhe-secondary">{c.errors ?? '0'}</span>
              </div>
            ))}
            {broadcast && <div className="lv-broadcast-bottom">{broadcast}</div>}
          </div>
          <div className="lv-diamond-count">
            <SmallDiamond onFirst={!!sit.onFirst} onSecond={!!sit.onSecond} onThird={!!sit.onThird} />
            <div className="lv-count-col">
              <div className="lv-count-row"><span className="lv-cl">B</span>{Array.from({length:4}).map((_,i)=><span key={i} className={`lv-dot ${i<(sit.balls??0)?'lv-dot-g':''}`}/>)}</div>
              <div className="lv-count-row"><span className="lv-cl">S</span>{Array.from({length:3}).map((_,i)=><span key={i} className={`lv-dot ${i<(sit.strikes??0)?'lv-dot-y':''}`}/>)}</div>
              <div className="lv-count-row"><span className="lv-cl">O</span>{Array.from({length:3}).map((_,i)=><span key={i} className={`lv-dot ${i<(sit.outs??0)?'lv-dot-r':''}`}/>)}</div>
            </div>
          </div>
        </div>
        {lastPlay && <div className="lv-last-play"><span className="lv-lp-label">LAST PLAY</span><span className="lv-lp-text">{lastPlay}</span></div>}
        <button className="lv-pbp-link" onClick={() => goTo('Play-by-Play')}>Play-by-Play →</button>
        <div className="lv-body">
          <div className="lv-players">
            {pitcher && (
              <div className="lv-player">
                <div className="lv-player-role">PITCHING</div>
                <div className="lv-player-row">
                  {pitcher.headshot?.href && <img src={pitcher.headshot.href} alt="" className="lv-avatar" />}
                  <div>
                    <div className="lv-player-name">{pitcher.shortName || pitcher.displayName}{pitcher.jersey && <span className="lv-jersey"> #{pitcher.jersey}</span>}</div>
                    {pitcherStats && <div className="lv-player-stats">{[pitcherStats.IP&&`${pitcherStats.IP} IP`,pitcherStats.ER!==null&&`${pitcherStats.ER} ER`,pitcherStats.H!==null&&`${pitcherStats.H} H`,pitcherStats.K!==null&&`${pitcherStats.K} K`,pitcherStats.BB!==null&&`${pitcherStats.BB} BB`].filter(Boolean).join(', ')}</div>}
                  </div>
                </div>
              </div>
            )}
            {batter && (
              <div className="lv-player">
                <div className="lv-player-role">BATTING</div>
                <div className="lv-player-row">
                  {batter.headshot?.href && <img src={batter.headshot.href} alt="" className="lv-avatar" />}
                  <div>
                    <div className="lv-player-name">{batter.shortName || batter.displayName}{batter.jersey && <span className="lv-jersey"> #{batter.jersey}</span>}</div>
                    {batterStats && <div className="lv-player-stats">{batterStats['H-AB'] || '0-0'}{batterStats.HR > 0 ? `, ${batterStats.HR} HR` : ''}{batterStats.RBI > 0 ? `, ${batterStats.RBI} RBI` : ''}</div>}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="lv-actions">
          <button className="lv-btn" onClick={() => goTo('Gamecast')}>Gamecast</button>
          <button className="lv-btn" onClick={() => goTo('Box Score')}>Box Score</button>
        </div>
      </div>
    );
  }

  // ── NBA (basketball) ────────────────────────────────────────
  if (sport === 'nba') {
    const quarter = status?.period ? `Q${status.period}` : '';
    const clock = status?.displayClock && status.displayClock !== '0:00' ? status.displayClock : '';
    const possession = sit.possessionText || '';
    return (
      <div className="lv-bar">
        <div className="lv-status-row">
          <span className="lv-inning lv-top">● {quarter}{clock ? ` · ${clock}` : ''}</span>
          {broadcast && <span className="lv-broadcast">{broadcast}</span>}
        </div>
        <div className="lv-body">
          <div className="lv-teams-section">
            {[away, home].filter(Boolean).map((c) => (
              <div key={c.team?.id} className={`lv-team-row ${c.team?.id === String(teamId) ? 'lv-my-team' : ''}`}>
                <div className="lv-team-left">
                  {c.team?.logo && <img src={c.team.logo} alt="" className="lv-logo" />}
                  <div>
                    <div className="lv-name">{c.team?.shortDisplayName || c.team?.abbreviation}</div>
                    {c.records?.[0]?.summary && <div className="lv-record">{c.records[0].summary}</div>}
                  </div>
                </div>
                <span className="lv-rhe-val">{getScore(c) ?? '0'}</span>
              </div>
            ))}
          </div>
          {(possession || lastPlay) && (
            <div className="lv-center">
              {possession && <div className="lv-possession">🏀 {possession} possession</div>}
              {lastPlay && <div className="lv-last-play"><span className="lv-lp-label">LAST PLAY</span><span className="lv-lp-text">{lastPlay}</span></div>}
            </div>
          )}
        </div>
        <div className="lv-actions">
          <button className="lv-btn" onClick={() => goTo('Gamecast')}>Gamecast</button>
          <button className="lv-btn" onClick={() => goTo('Box Score')}>Box Score</button>
        </div>
      </div>
    );
  }

  // ── NFL (football) ──────────────────────────────────────────
  if (sport === 'nfl') {
    const quarter = status?.period ? `Q${status.period}` : '';
    const clock = status?.displayClock && status.displayClock !== '0:00' ? status.displayClock : '';
    const downDist = sit.downDistanceText || '';
    const possession = sit.possessionText || '';
    const isRedZone = sit.isRedZone;
    return (
      <div className="lv-bar">
        <div className="lv-status-row">
          <span className="lv-inning lv-top">● {quarter}{clock ? ` · ${clock}` : ''}</span>
          {broadcast && <span className="lv-broadcast">{broadcast}</span>}
        </div>
        <div className="lv-body">
          <div className="lv-teams-section">
            {[away, home].filter(Boolean).map((c) => (
              <div key={c.team?.id} className={`lv-team-row ${c.team?.id === String(teamId) ? 'lv-my-team' : ''}`}>
                <div className="lv-team-left">
                  {c.team?.logo && <img src={c.team.logo} alt="" className="lv-logo" />}
                  <div>
                    <div className="lv-name">{c.team?.shortDisplayName || c.team?.abbreviation}</div>
                    {c.records?.[0]?.summary && <div className="lv-record">{c.records[0].summary}</div>}
                  </div>
                </div>
                <span className="lv-rhe-val">{getScore(c) ?? '0'}</span>
              </div>
            ))}
          </div>
          {(downDist || lastPlay) && (
            <div className="lv-center">
              {downDist && <div className="lv-down-dist">{isRedZone ? '🔴 ' : '🏈 '}{downDist}{possession ? ` · ${possession}` : ''}</div>}
              {lastPlay && <div className="lv-last-play"><span className="lv-lp-label">LAST PLAY</span><span className="lv-lp-text">{lastPlay}</span></div>}
            </div>
          )}
        </div>
        <div className="lv-actions">
          <button className="lv-btn" onClick={() => goTo('Gamecast')}>Gamecast</button>
          <button className="lv-btn" onClick={() => goTo('Box Score')}>Box Score</button>
        </div>
      </div>
    );
  }

  // ── NHL (hockey) ────────────────────────────────────────────
  const period = status?.period;
  const periodLabel = period === 1 ? '1st' : period === 2 ? '2nd' : period === 3 ? '3rd' : period ? `OT${period-3}` : '';
  const clock = status?.displayClock && status.displayClock !== '0:00' ? status.displayClock : '';
  const powerPlay = sit.powerPlayText || '';
  return (
    <div className="lv-bar">
      <div className="lv-status-row">
        <span className="lv-inning lv-top">● {periodLabel}{clock ? ` · ${clock}` : ''}</span>
        {broadcast && <span className="lv-broadcast">{broadcast}</span>}
      </div>
      <div className="lv-body">
        <div className="lv-teams-section">
          {[away, home].filter(Boolean).map((c) => (
            <div key={c.team?.id} className={`lv-team-row ${c.team?.id === String(teamId) ? 'lv-my-team' : ''}`}>
              <div className="lv-team-left">
                {c.team?.logo && <img src={c.team.logo} alt="" className="lv-logo" />}
                <div>
                  <div className="lv-name">{c.team?.shortDisplayName || c.team?.abbreviation}</div>
                  {c.records?.[0]?.summary && <div className="lv-record">{c.records[0].summary}</div>}
                </div>
              </div>
              <span className="lv-rhe-val">{getScore(c) ?? '0'}</span>
            </div>
          ))}
        </div>
        {(powerPlay || lastPlay) && (
          <div className="lv-center">
            {powerPlay && <div className="lv-down-dist">🏒 {powerPlay}</div>}
            {lastPlay && <div className="lv-last-play"><span className="lv-lp-label">LAST PLAY</span><span className="lv-lp-text">{lastPlay}</span></div>}
          </div>
        )}
      </div>
      <div className="lv-actions">
        <button className="lv-btn" onClick={() => goTo('Gamecast')}>Gamecast</button>
        <button className="lv-btn" onClick={() => goTo('Box Score')}>Box Score</button>
      </div>
    </div>
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
