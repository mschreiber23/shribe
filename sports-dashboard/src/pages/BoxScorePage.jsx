import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import useBoxScore from '../hooks/useBoxScore';

/* ─── helpers ─────────────────────────────────────── */
function teamLogo(team) {
  return team?.logo || team?.logos?.[0]?.href || null;
}
function buildRosterMap(rosters = []) {
  const map = {};
  rosters.forEach((r) =>
    (r.roster || []).forEach((entry) => {
      const a = entry.athlete || {};
      if (a.id) map[String(a.id)] = { ...a, jersey: entry.jersey };
    })
  );
  return map;
}

/* ─── Base Diamond ─────────────────────────────────── */
function BaseDiamond({ onFirst, onSecond, onThird }) {
  return (
    <svg viewBox="0 0 44 44" className="bsp-diamond">
      <rect x="16" y="2"  width="12" height="12" rx="1.5" className={`tr-base ${onSecond ? 'tr-base-on' : ''}`} transform="rotate(45 22 8)" />
      <rect x="2"  y="16" width="12" height="12" rx="1.5" className={`tr-base ${onThird  ? 'tr-base-on' : ''}`} transform="rotate(45 8 22)" />
      <rect x="30" y="16" width="12" height="12" rx="1.5" className={`tr-base ${onFirst  ? 'tr-base-on' : ''}`} transform="rotate(45 36 22)" />
      <rect x="16" y="30" width="12" height="12" rx="1.5" className="tr-base" transform="rotate(45 22 36)" />
    </svg>
  );
}

/* ─── Header ───────────────────────────────────────── */
function GameHeader({ competitors, status }) {
  const away = competitors?.find((c) => c.homeAway === 'away') || competitors?.[0];
  const home = competitors?.find((c) => c.homeAway === 'home') || competitors?.[1];
  const isLive = status?.type?.state === 'in';
  const isFinal = status?.type?.state === 'post';
  const shortDetail = status?.type?.shortDetail || '';

  return (
    <div className="bsp-header">
      <div className="bsp-team">
        {teamLogo(away?.team) && <img src={teamLogo(away.team)} alt="" className="bsp-team-logo" />}
        <div className="bsp-team-abbr">{away?.team?.abbreviation}</div>
        <div className="bsp-score">{away?.score ?? '—'}</div>
        <div className="bsp-record">{away?.record?.[0]?.displayValue}</div>
      </div>

      <div className="bsp-center">
        {isLive && <span className="badge badge-live" style={{ fontSize: 11 }}><span className="live-dot" /> LIVE</span>}
        {isFinal && <span className="badge badge-final" style={{ fontSize: 11 }}>Final</span>}
        <div className="bsp-detail">{shortDetail}</div>
        <BaseDiamond />
      </div>

      <div className="bsp-team bsp-team-right">
        {teamLogo(home?.team) && <img src={teamLogo(home.team)} alt="" className="bsp-team-logo" />}
        <div className="bsp-team-abbr">{home?.team?.abbreviation}</div>
        <div className="bsp-score">{home?.score ?? '—'}</div>
        <div className="bsp-record">{home?.record?.[0]?.displayValue}</div>
      </div>
    </div>
  );
}

/* ─── Line Score ───────────────────────────────────── */
function LineScore({ competitors }) {
  const maxInnings = Math.max(...competitors.map((c) => (c.linescores || []).length), 9);
  const innings = Array.from({ length: maxInnings }, (_, i) => i + 1);
  return (
    <div className="bsp-linescore-wrap">
      <table className="bsp-linescore">
        <thead>
          <tr>
            <th className="bsp-ls-th bsp-ls-team-col" />
            {innings.map((n) => <th key={n} className="bsp-ls-th">{n}</th>)}
            <th className="bsp-ls-th bsp-ls-rhe">R</th>
            <th className="bsp-ls-th bsp-ls-rhe">H</th>
            <th className="bsp-ls-th bsp-ls-rhe">E</th>
          </tr>
        </thead>
        <tbody>
          {competitors.map((c) => (
            <tr key={c.team?.id}>
              <td className="bsp-ls-td bsp-ls-team-col">
                {teamLogo(c.team) && <img src={teamLogo(c.team)} alt="" className="bsp-ls-logo" />}
                <span className="bsp-ls-abbr">{c.team?.abbreviation}</span>
              </td>
              {innings.map((_, i) => (
                <td key={i} className="bsp-ls-td">{c.linescores?.[i]?.displayValue ?? '—'}</td>
              ))}
              <td className="bsp-ls-td bsp-ls-rhe bsp-ls-bold">{c.score ?? '0'}</td>
              <td className="bsp-ls-td bsp-ls-rhe">{c.hits ?? '0'}</td>
              <td className="bsp-ls-td bsp-ls-rhe">{c.errors ?? '0'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ─── Situation Bar ────────────────────────────────── */
function SituationBar({ situation, rosters, status }) {
  if (!situation || status?.type?.state !== 'in') return null;
  const rosterMap = buildRosterMap(rosters);
  const pitcher = rosterMap[String(situation.pitcher?.playerId)];
  const batter  = rosterMap[String(situation.batter?.playerId)];
  const { balls = 0, strikes = 0, outs = 0 } = situation;
  const dots = (filled, total, color) =>
    Array.from({ length: total }).map((_, i) => (
      <span key={i} className={`bsm2-dot ${i < filled ? `bsm2-dot-${color}` : ''}`} />
    ));
  return (
    <div className="bsp-situation">
      {pitcher && (
        <div className="bsp-sit-player">
          <div className="bsp-sit-role">PITCHER</div>
          <div className="bsp-sit-name">{pitcher.shortName || pitcher.displayName}{pitcher.jersey && <span className="bsp-sit-jersey"> #{pitcher.jersey}</span>}</div>
        </div>
      )}
      {batter && (
        <div className="bsp-sit-player">
          <div className="bsp-sit-role">BATTER</div>
          <div className="bsp-sit-name">{batter.shortName || batter.displayName}{batter.jersey && <span className="bsp-sit-jersey"> #{batter.jersey}</span>}</div>
        </div>
      )}
      <div className="bsp-sit-right">
        <div className="bsp-sit-count">
          <div className="bsp-sit-count-row"><span className="bsp-sit-count-label">B</span>{dots(balls, 4, 'green')}</div>
          <div className="bsp-sit-count-row"><span className="bsp-sit-count-label">S</span>{dots(strikes, 3, 'yellow')}</div>
          <div className="bsp-sit-count-row"><span className="bsp-sit-count-label">O</span>{dots(outs, 3, 'red')}</div>
        </div>
        <BaseDiamond onFirst={!!situation.onFirst} onSecond={!!situation.onSecond} onThird={!!situation.onThird} />
      </div>
    </div>
  );
}

/* ─── Stats Table ──────────────────────────────────── */
const COLS = {
  mlb_batting:  ['AB','R','H','RBI','HR','BB','K','AVG','OBP','SLG'],
  mlb_pitching: ['IP','H','R','ER','BB','K','HR','ERA'],
  nba:          ['MIN','PTS','REB','AST','STL','BLK','FG','3PT','+/-'],
  nfl_passing:  ['C/ATT','YDS','TD','INT','RTG'],
  nfl_rushing:  ['CAR','YDS','AVG','TD'],
  nfl_receiving:['REC','YDS','AVG','TD'],
  nhl:          ['G','A','PTS','+/-','SOG','TOI'],
};
const HL = { mlb: ['H','HR','RBI','ERA'], nba: ['PTS','REB','AST'], nfl: ['YDS','TD'], nhl: ['G','A','PTS'] };

function getColKey(sport, type) {
  if (sport === 'mlb') return type === 'pitching' ? 'mlb_pitching' : 'mlb_batting';
  if (sport === 'nba') return 'nba';
  if (sport === 'nhl') return 'nhl';
  if (sport === 'nfl') {
    if (type?.includes('pass')) return 'nfl_passing';
    if (type?.includes('rush')) return 'nfl_rushing';
    return 'nfl_receiving';
  }
  return null;
}

function StatsTable({ statGroup, sport }) {
  const navigate = useNavigate();
  const labels = statGroup.labels || [];
  const athletes = statGroup.athletes || [];
  const totals = statGroup.totals || [];
  const type = (statGroup.type || statGroup.name || '').toLowerCase();
  const key = getColKey(sport, type);
  const want = key ? COLS[key] : [];
  const cols = want.length
    ? want.map((w) => ({ label: w, index: labels.indexOf(w) })).filter((c) => c.index !== -1)
    : labels.map((l, i) => ({ label: l, index: i })).slice(0, 8);
  const hl = HL[sport] || [];
  if (!athletes.length) return null;
  return (
    <div className="bsp-table-wrap">
      <table className="bsp-table">
        <thead>
          <tr>
            <th className="bsp-th bsp-th-player">{type === 'pitching' ? 'PITCHERS' : 'HITTERS'}</th>
            {cols.map((c) => <th key={c.label} className="bsp-th">{c.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {athletes.map((a, i) => {
            const player = a.athlete || {};
            const stats = a.stats || [];
            const dnp = a.didNotPlay || !stats.length;
            const playerId = player.id;
            return (
              <tr
                key={i}
                className={`bsp-tr ${dnp ? 'bsp-dnp' : ''} ${playerId ? 'bsp-tr-clickable' : ''}`}
                onClick={() => playerId && navigate(`/player/${sport}/${playerId}`)}
              >
                <td className="bsp-td bsp-td-player">
                  <div className="bsp-player-cell">
                    {player.headshot?.href && <img src={player.headshot.href} alt="" className="bsp-avatar" />}
                    <div>
                      <span className="bsp-player-name">{player.shortName || player.displayName}</span>
                      <span className="bsp-player-pos"> {a.position?.abbreviation || ''}</span>
                    </div>
                  </div>
                </td>
                {dnp
                  ? <td className="bsp-td" colSpan={cols.length} style={{ color: 'var(--text2)', fontStyle: 'italic' }}>DNP</td>
                  : cols.map((c) => (
                    <td key={c.label} className={`bsp-td ${hl.includes(c.label) ? 'bsp-hl' : ''}`}>
                      {stats[c.index] ?? '—'}
                    </td>
                  ))}
              </tr>
            );
          })}
          {totals.length > 0 && (
            <tr className="bsp-totals">
              <td className="bsp-td bsp-td-player bsp-totals-label">TEAM</td>
              {cols.map((c) => <td key={c.label} className="bsp-td">{totals[c.index] ?? ''}</td>)}
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function TeamStats({ group, sport }) {
  const team = group?.team || {};
  const stats = group?.statistics || [];
  const batting  = stats.find((s) => (s.type || s.name) === 'batting')  || stats[0];
  const pitching = stats.find((s) => (s.type || s.name) === 'pitching') || stats[1];
  return (
    <div className="bsp-team-stats">
      {batting && (
        <>
          <div className="bsp-stats-heading">
            {teamLogo(team) && <img src={teamLogo(team)} alt="" style={{ width: 20, height: 20, objectFit: 'contain' }} />}
            <span>{team.displayName} Hitting</span>
          </div>
          <StatsTable statGroup={batting} sport={sport} />
        </>
      )}
      {pitching && (
        <>
          <div className="bsp-stats-heading" style={{ marginTop: 20 }}>
            {teamLogo(team) && <img src={teamLogo(team)} alt="" style={{ width: 20, height: 20, objectFit: 'contain' }} />}
            <span>{team.displayName} Pitching</span>
          </div>
          <StatsTable statGroup={pitching} sport={sport} />
        </>
      )}
    </div>
  );
}

/* ─── Main Page ─────────────────────────────────────── */
export default function BoxScorePage() {
  const { sport, gameId } = useParams();
  const navigate = useNavigate();
  const { data, loading, error } = useBoxScore(sport, gameId);
  const [activeTeam, setActiveTeam] = useState(0);

  const comp   = data?.header?.competitions?.[0];
  const comps  = comp?.competitors || [];
  const status = comp?.status;
  const players   = data?.boxscore?.players || [];
  const situation = data?.situation;
  const rosters   = data?.rosters || [];

  const away = comps.find((c) => c.homeAway === 'away') || comps[0];
  const home = comps.find((c) => c.homeAway === 'home') || comps[1];
  const awayGroup = players.find((p) => p.team?.id === away?.team?.id) || players[0];
  const homeGroup = players.find((p) => p.team?.id === home?.team?.id) || players[1];
  const groups = [awayGroup, homeGroup].filter(Boolean);

  return (
    <div className="bsp-page">
      <button className="tp-back" onClick={() => navigate(-1)}>← Back</button>

      {loading && <div className="tp-loading">Loading box score…</div>}
      {error   && <div className="error-banner">{error}</div>}

      {!loading && !error && data && (
        <>
          <GameHeader competitors={comps} status={status} />

          {(sport === 'mlb' || sport === 'nhl') && comps.length > 0 && (
            <LineScore competitors={comps} />
          )}

          {situation && (
            <SituationBar situation={situation} rosters={rosters} status={status} />
          )}

          {groups.length > 1 && (
            <div className="bsp-tabs">
              <button className={`bsp-tab ${activeTeam === 0 ? 'bsp-tab-active' : ''}`} onClick={() => setActiveTeam(0)}>
                {away?.team?.abbreviation || 'Away'}
              </button>
              <button className={`bsp-tab ${activeTeam === 1 ? 'bsp-tab-active' : ''}`} onClick={() => setActiveTeam(1)}>
                {home?.team?.abbreviation || 'Home'}
              </button>
            </div>
          )}

          <div className="bsp-body">
            {groups[activeTeam] && <TeamStats group={groups[activeTeam]} sport={sport} />}
            {!groups.length && <div className="empty-state"><div className="empty-icon">📋</div><p>Box score not available yet.</p></div>}
          </div>
        </>
      )}
    </div>
  );
}
