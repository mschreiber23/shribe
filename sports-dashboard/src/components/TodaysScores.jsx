import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { getScoreboard, SPORTS } from '../api/espn';
import { useFavorites } from '../context/FavoritesContext';

function getScore(c) {
  const s = c?.score;
  if (s == null) return null;
  return typeof s === 'object' ? s.displayValue : String(s);
}

function teamLogo(team) { return team?.logo || team?.logos?.[0]?.href || null; }

function toDateStr(date) {
  return date.getFullYear().toString()
    + String(date.getMonth() + 1).padStart(2, '0')
    + String(date.getDate()).padStart(2, '0');
}

function formatDateLabel(date) {
  const today = new Date(); today.setHours(0,0,0,0);
  const d = new Date(date); d.setHours(0,0,0,0);
  const diff = Math.round((d - today) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === -1) return 'Yesterday';
  if (diff === 1) return 'Tomorrow';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/* ── Compact ticker card ──────────────────────────────── */
function TickerCard({ game, sport, myTeamIds }) {
  const navigate = useNavigate();
  const comp = game.competitions?.[0];
  const competitors = comp?.competitors || [];
  const away = competitors.find((c) => c.homeAway === 'away') || competitors[0];
  const home = competitors.find((c) => c.homeAway === 'home') || competitors[1];
  const status = comp?.status;
  const state = status?.type?.state;
  const isLive = state === 'in';
  const isFinal = state === 'post';
  const isPre = state === 'pre';
  const shortDetail = status?.type?.shortDetail || '';
  const isMine = myTeamIds.some((id) => competitors.some((c) => c.team?.id === id));
  const broadcast = comp?.broadcasts?.[0]?.names?.[0] || '';

  return (
    <button
      className={`ticker-card ${isMine ? 'ticker-card-mine' : ''}`}
      onClick={() => navigate(`/boxscore/${sport}/${game.id}`)}
    >
      {/* Top status row */}
      <div className="ticker-status">
        {isLive && <span className="ticker-live"><span className="live-dot" />{shortDetail}</span>}
        {isFinal && <span className="ticker-final">Final</span>}
        {isPre && (
          <span className="ticker-date">
            {new Date(game.date).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' })}
          </span>
        )}
        {/* Show broadcast only for live or pre-game, not final */}
        {broadcast && !isFinal && <span className="ticker-broadcast">{broadcast}</span>}
      </div>

      {/* Teams */}
      <div className="ticker-teams">
        {[away, home].filter(Boolean).map((c) => (
          <div key={c.team?.id} className={`ticker-team ${c.winner ? 'ticker-winner' : ''} ${myTeamIds.includes(c.team?.id) ? 'ticker-my-team' : ''}`}>
            <div className="ticker-team-left">
              {teamLogo(c.team) && <img src={teamLogo(c.team)} alt="" className="ticker-logo" />}
              <div>
                <span className="ticker-abbr">{c.team?.abbreviation}</span>
                {c.records?.[0]?.summary && <span className="ticker-record"> {c.records[0].summary}</span>}
              </div>
            </div>
            {(isLive || isFinal) && (
              <span className={`ticker-score ${c.winner ? 'ticker-score-win' : ''}`}>{getScore(c) ?? '0'}</span>
            )}
          </div>
        ))}
      </div>

      {/* Bottom — game time for pre-game, context for live */}
      <div className="ticker-bottom">
        {isPre && <span className="ticker-time">{shortDetail}</span>}
        {isLive && status?.type?.detail && <span className="ticker-context-text">{status.type.detail}</span>}
      </div>
    </button>
  );
}

/* ── Full grid card (expanded view) ───────────────────── */
function GridCard({ game, sport, myTeamIds }) {
  const navigate = useNavigate();
  const comp = game.competitions?.[0];
  const competitors = comp?.competitors || [];
  const away = competitors.find((c) => c.homeAway === 'away') || competitors[0];
  const home = competitors.find((c) => c.homeAway === 'home') || competitors[1];
  const status = comp?.status;
  const state = status?.type?.state;
  const isLive = state === 'in';
  const isFinal = state === 'post';
  const isPre = state === 'pre';
  const shortDetail = status?.type?.shortDetail || '';
  const isMine = myTeamIds.some((id) => competitors.some((c) => c.team?.id === id));

  return (
    <button
      className={`scores-card ${isMine ? 'scores-card-mine' : ''} ${isLive ? 'scores-card-live' : ''}`}
      onClick={() => navigate(`/boxscore/${sport}/${game.id}`)}
    >
      <div className="scores-card-status">
        {isLive && <span className="badge badge-live" style={{fontSize:10}}><span className="live-dot"/>{shortDetail}</span>}
        {isFinal && <span className="badge badge-final" style={{fontSize:10}}>Final</span>}
        {isPre && <span className="scores-time">{shortDetail}</span>}
      </div>
      {[away, home].filter(Boolean).map((c) => (
        <div key={c.team?.id} className={`scores-team-row ${c.winner ? 'scores-winner' : ''}`}>
          <div className="scores-team-left">
            {teamLogo(c.team) && <img src={teamLogo(c.team)} alt="" className="scores-team-logo" />}
            <div>
              <span className={`scores-team-name ${myTeamIds.includes(c.team?.id) ? 'scores-my-team' : ''}`}>{c.team?.abbreviation}</span>
              {c.records?.[0]?.summary && <span className="scores-record"> {c.records[0].summary}</span>}
            </div>
          </div>
          {(isLive || isFinal) && <span className="scores-score">{getScore(c) ?? '0'}</span>}
        </div>
      ))}
    </button>
  );
}

/* ── Main Component ──────────────────────────────────── */
export default function TodaysScores() {
  const { favorites, sportOrder, reorderSport } = useFavorites();
  const [activeSport, setActiveSport] = useState(sportOrder[0] || 'mlb');
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [editOrder, setEditOrder] = useState(false);

  // Date navigation
  const todayMidnight = () => { const d = new Date(); d.setHours(0,0,0,0); return d; };
  const [selectedDate, setSelectedDate] = useState(todayMidnight);
  const isToday = toDateStr(selectedDate) === toDateStr(todayMidnight());
  const shiftDate = (n) => setSelectedDate((d) => { const next = new Date(d); next.setDate(next.getDate() + n); return next; });

  const myTeamIds = favorites.teams.filter((t) => t.sport === activeSport).map((t) => t.team.id);

  useEffect(() => {
    setLoading(true);
    setGames([]);
    const dateStr = toDateStr(selectedDate);
    getScoreboard(activeSport, dateStr)
      .then((evts) => {
        // Sort: my teams first, then live, final, pre
        const stateOrder = { in: 0, post: 1, pre: 2 };
        const sorted = [...evts].sort((a, b) => {
          const aMine = a.competitions?.[0]?.competitors?.some((c) => myTeamIds.includes(c.team?.id)) ? 0 : 1;
          const bMine = b.competitions?.[0]?.competitors?.some((c) => myTeamIds.includes(c.team?.id)) ? 0 : 1;
          if (aMine !== bMine) return aMine - bMine;
          const sa = a.competitions?.[0]?.status?.type?.state || 'pre';
          const sb = b.competitions?.[0]?.status?.type?.state || 'pre';
          return (stateOrder[sa] ?? 2) - (stateOrder[sb] ?? 2);
        });
        setGames(sorted);
      })
      .catch(() => setGames([]))
      .finally(() => setLoading(false));
  }, [activeSport, selectedDate]);

  const liveCount = games.filter((g) => g.competitions?.[0]?.status?.type?.state === 'in').length;

  return (
    <section className="section ts-section">
      {/* ── Ticker bar ── */}
      <div className="ts-ticker-bar">
        {/* Row 1: sport selector + expand button */}
        <div className="ts-top-row">
          <select
            className="ts-sport-select"
            value={activeSport}
            onChange={(e) => { setActiveSport(e.target.value); setGames([]); }}
          >
            {sportOrder.map((s) => (
              <option key={s} value={s}>{SPORTS[s]?.label}</option>
            ))}
          </select>

          {/* Date selector */}
          <div className="ts-date-nav">
            <button className="ts-date-btn" onClick={() => shiftDate(-1)}>‹</button>
            <span className="ts-date-label">{formatDateLabel(selectedDate)}</span>
            <button className="ts-date-btn" onClick={() => shiftDate(1)}>›</button>
          </div>

          <button className="ts-all-scores-btn" onClick={() => setExpanded((v) => !v)}>
            {expanded ? '✕ Close' : 'All Scores'}
          </button>
        </div>

        {/* Row 2: horizontal scrolling ticker */}
        <div className="ts-ticker-scroll">
          {loading && [1,2,3,4].map((i) => <div key={i} className="ticker-skeleton" />)}
          {!loading && games.length === 0 && <span className="ts-no-games">No games</span>}
          {!loading && games.map((game) => (
            <TickerCard key={game.id} game={game} sport={activeSport} myTeamIds={myTeamIds} />
          ))}
        </div>
      </div>

      {/* ── Expanded full grid ── */}
      {expanded && (
        <div className="ts-expanded">
          <div className="ts-expanded-header">
            <span className="ts-expanded-title">
              {SPORTS[activeSport]?.label} · {formatDateLabel(selectedDate)}
              {liveCount > 0 && <span className="ts-live-badge" style={{marginLeft:8}}><span className="ts-live-dot" />{liveCount} Live</span>}
            </span>
            <button className="btn-ghost btn-sm" onClick={() => setExpanded(false)}>Close</button>
          </div>
          <div className="scores-grid">
            {games.map((game) => (
              <GridCard key={game.id} game={game} sport={activeSport} myTeamIds={myTeamIds} />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
