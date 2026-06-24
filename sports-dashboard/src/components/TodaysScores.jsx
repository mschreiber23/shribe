import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getScoreboard, SPORTS } from '../api/espn';
import { useFavorites } from '../context/FavoritesContext';

function ScoreCard({ game, sport, highlight }) {
  const navigate = useNavigate();
  const comp = game.competitions?.[0];
  const competitors = comp?.competitors || [];
  const away = competitors.find((c) => c.homeAway === 'away') || competitors[0];
  const home = competitors.find((c) => c.homeAway === 'home') || competitors[1];
  const status = comp?.status;
  const state = status?.type?.state;
  const isLive = state === 'in';
  const isFinal = state === 'post';
  const shortDetail = status?.type?.shortDetail || '';

  const getScore = (c) => {
    const s = c?.score;
    if (s == null) return null;
    return typeof s === 'object' ? s.displayValue : String(s);
  };

  const canClick = isLive || isFinal;

  return (
    <button
      className={`ts-card ${isLive ? 'ts-card-live' : ''} ${highlight ? 'ts-card-mine' : ''}`}
      onClick={() => canClick && navigate(`/boxscore/${sport}/${game.id}`)}
      style={{ cursor: canClick ? 'pointer' : 'default' }}
    >
      <div className="ts-status">
        {isLive && <span className="badge badge-live" style={{ fontSize: 10 }}><span className="live-dot" />{shortDetail}</span>}
        {isFinal && <span className="badge badge-final" style={{ fontSize: 10 }}>Final</span>}
        {!isLive && !isFinal && <span className="ts-time">{shortDetail}</span>}
      </div>

      <div className="ts-team-row">
        {away?.team?.logo && <img src={away.team.logo} alt="" className="ts-logo" />}
        <span className={`ts-abbr ${away?.winner ? 'ts-winner' : ''}`}>{away?.team?.abbreviation}</span>
        <span className="ts-record">{away?.records?.[0]?.summary}</span>
        <span className={`ts-score ${away?.winner ? 'ts-winner' : ''}`}>{getScore(away) ?? ''}</span>
      </div>

      <div className="ts-team-row">
        {home?.team?.logo && <img src={home.team.logo} alt="" className="ts-logo" />}
        <span className={`ts-abbr ${home?.winner ? 'ts-winner' : ''}`}>{home?.team?.abbreviation}</span>
        <span className="ts-record">{home?.records?.[0]?.summary}</span>
        <span className={`ts-score ${home?.winner ? 'ts-winner' : ''}`}>{getScore(home) ?? ''}</span>
      </div>

      {comp?.venue?.shortName && (
        <div className="ts-venue">{comp.venue.shortName}</div>
      )}
    </button>
  );
}

function sortGames(games, myTeamIds = []) {
  const stateOrder = { in: 0, post: 1, pre: 2 };
  const hasMyTeam = (game) =>
    game.competitions?.[0]?.competitors?.some((c) => myTeamIds.includes(c.team?.id));
  return [...games].sort((a, b) => {
    const aIsMine = hasMyTeam(a) ? 0 : 1;
    const bIsMine = hasMyTeam(b) ? 0 : 1;
    if (aIsMine !== bIsMine) return aIsMine - bIsMine;
    const stateA = a.competitions?.[0]?.status?.type?.state || 'pre';
    const stateB = b.competitions?.[0]?.status?.type?.state || 'pre';
    return (stateOrder[stateA] ?? 2) - (stateOrder[stateB] ?? 2);
  });
}

export default function TodaysScores() {
  const { favorites } = useFavorites();
  const [scoresBySport, setScoresBySport] = useState({});
  const [activeTab, setActiveTab] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(true);

  // IDs of all favorite teams for the current active sport
  const myTeamIds = favorites.teams
    .filter((t) => t.sport === activeTab)
    .map((t) => t.team.id);

  useEffect(() => {
    const sports = Object.keys(SPORTS);
    const d = new Date();
    const todayStr = d.getFullYear().toString()
      + String(d.getMonth() + 1).padStart(2, '0')
      + String(d.getDate()).padStart(2, '0');
    Promise.allSettled(
      sports.map((s) => getScoreboard(s, todayStr).then((games) => ({ sport: s, games })))
    ).then((results) => {
      const data = {};
      results.forEach((r) => {
        if (r.status === 'fulfilled' && r.value.games.length > 0) {
          data[r.value.sport] = r.value.games;
        }
      });
      setScoresBySport(data);
      // Auto-select first sport that has live games, or just first sport
      const liveFirst = Object.entries(data).find(([, games]) =>
        games.some((g) => g.competitions?.[0]?.status?.type?.state === 'in')
      );
      setActiveTab((liveFirst || Object.entries(data)[0])?.[0] || null);
      setLoading(false);
    });
  }, []);

  const availableSports = Object.keys(scoresBySport);
  const games = sortGames(activeTab ? scoresBySport[activeTab] || [] : [], myTeamIds);

  const totalLive = availableSports.reduce((n, s) =>
    n + (scoresBySport[s]?.filter(g => g.competitions?.[0]?.status?.type?.state === 'in').length || 0), 0
  );

  if (!loading && availableSports.length === 0) return null;

  return (
    <section className="section">
      {/* Collapsed header — always visible */}
      <button className="ts-header" onClick={() => setExpanded((v) => !v)}>
        <div className="ts-header-left">
          <h2 className="section-title" style={{ margin: 0 }}>Today's Scores</h2>
          {totalLive > 0 && (
            <span className="ts-live-badge">
              <span className="ts-live-dot" /> {totalLive} Live
            </span>
          )}
        </div>
        <span className="ts-chevron">{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <>
          {loading ? (
            <div className="ts-skeleton-row">
              {[1,2,3].map(i => <div key={i} className="skeleton-card" style={{ height: 90 }} />)}
            </div>
          ) : (
            <>
              {/* Sport tabs */}
              <div className="ts-tabs">
                {availableSports.map((sport) => {
                  const liveCount = scoresBySport[sport]?.filter(
                    (g) => g.competitions?.[0]?.status?.type?.state === 'in'
                  ).length || 0;
                  return (
                    <button
                      key={sport}
                      className={`ts-tab ${activeTab === sport ? 'ts-tab-active' : ''}`}
                      onClick={() => setActiveTab(sport)}
                    >
                      {SPORTS[sport].label}
                      {liveCount > 0 && <span className="ts-live-dot" />}
                    </button>
                  );
                })}
              </div>

              {/* Score cards — my team first, then live */}
              <div className="ts-grid">
                {games.map((game) => {
                  const isMine = game.competitions?.[0]?.competitors?.some(
                    (c) => myTeamIds.includes(c.team?.id)
                  );
                  return <ScoreCard key={game.id} game={game} sport={activeTab} highlight={isMine} />;
                })}
              </div>
            </>
          )}
        </>
      )}
    </section>
  );
}
