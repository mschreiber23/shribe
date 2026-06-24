import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getScoreboard, SPORTS } from '../api/espn';

function ScoreCard({ game, sport }) {
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
      className={`ts-card ${isLive ? 'ts-card-live' : ''}`}
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

export default function TodaysScores() {
  const [scoresBySport, setScoresBySport] = useState({});
  const [activeTab, setActiveTab] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const sports = Object.keys(SPORTS);
    Promise.allSettled(
      sports.map((s) => getScoreboard(s).then((games) => ({ sport: s, games })))
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
  const games = activeTab ? scoresBySport[activeTab] || [] : [];

  if (loading) return (
    <section className="section">
      <h2 className="section-title">Today's Scores</h2>
      <div className="ts-skeleton-row">
        {[1,2,3].map(i => <div key={i} className="skeleton-card" style={{ height: 90 }} />)}
      </div>
    </section>
  );

  if (availableSports.length === 0) return null;

  return (
    <section className="section">
      <h2 className="section-title">Today's Scores</h2>

      {/* Sport tabs */}
      <div className="ts-tabs">
        {availableSports.map((sport) => {
          const hasLive = scoresBySport[sport]?.some(
            (g) => g.competitions?.[0]?.status?.type?.state === 'in'
          );
          return (
            <button
              key={sport}
              className={`ts-tab ${activeTab === sport ? 'ts-tab-active' : ''}`}
              onClick={() => setActiveTab(sport)}
            >
              {SPORTS[sport].label}
              {hasLive && <span className="ts-live-dot" />}
            </button>
          );
        })}
      </div>

      {/* Score cards */}
      <div className="ts-grid">
        {games.map((game) => (
          <ScoreCard key={game.id} game={game} sport={activeTab} />
        ))}
      </div>
    </section>
  );
}
