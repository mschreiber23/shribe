import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getPlayerBio, getPlayerSeasonStats, getPlayerGameLog, getScoreboard, getGameBoxscore } from '../api/espn';

/* ── Position detection helpers ─────────────────────── */
const QB_POS  = ['QB'];
const RB_POS  = ['RB','HB','FB'];
const REC_POS = ['WR','TE'];
const NHL_GOALIE_POS = ['G','GK'];

function getNflKey(pos) {
  if (QB_POS.includes(pos))  return 'nfl_qb';
  if (RB_POS.includes(pos))  return 'nfl_rb';
  if (REC_POS.includes(pos)) return 'nfl_wr';
  return 'nfl_qb'; // fallback
}

/* ── Career table columns ─────────────────────────────── */
const CAREER_COLS = {
  mlb_batting: [
    { key: 'GP', label: 'GP' }, { key: 'AB', label: 'AB' },
    { key: 'AVG', label: 'AVG', hl: true }, { key: 'OBP', label: 'OBP', hl: true },
    { key: 'SLG', label: 'SLG', hl: true }, { key: 'OPS', label: 'OPS', hl: true },
    { key: 'R', label: 'R' }, { key: 'H', label: 'H' },
    { key: '2B', label: '2B' }, { key: '3B', label: '3B' },
    { key: 'HR', label: 'HR', hl: true }, { key: 'RBI', label: 'RBI', hl: true },
    { key: 'BB', label: 'BB' }, { key: 'SO', label: 'SO' },
    { key: 'SB', label: 'SB' }, { key: 'CS', label: 'CS' }, { key: 'WAR', label: 'WAR' },
  ],
  mlb_pitching: [
    { key: 'GP', label: 'G' }, { key: 'W', label: 'W', hl: true }, { key: 'L', label: 'L' },
    { key: 'SV', label: 'SV' }, { key: 'IP', label: 'IP', hl: true },
    { key: 'ERA', label: 'ERA', hl: true }, { key: 'WHIP', label: 'WHIP', hl: true },
    { key: 'SO', label: 'SO', hl: true }, { key: 'BB', label: 'BB' },
    { key: 'H', label: 'H' }, { key: 'HR', label: 'HR' },
  ],
  nba: [
    { key: 'GP', label: 'GP' }, { key: 'MIN', label: 'MIN' },
    { key: 'PTS', label: 'PTS', hl: true }, { key: 'REB', label: 'REB', hl: true },
    { key: 'AST', label: 'AST', hl: true }, { key: 'STL', label: 'STL' },
    { key: 'BLK', label: 'BLK' }, { key: 'FG%', label: 'FG%', hl: true },
    { key: '3P%', label: '3P%' }, { key: 'FT%', label: 'FT%' }, { key: 'TO', label: 'TO' },
  ],
  nfl_qb: [
    { key: 'GP', label: 'GP' }, { key: 'ATT', label: 'ATT' },
    { key: 'YDS', label: 'YDS', hl: true }, { key: 'TD', label: 'TD', hl: true },
    { key: 'INT', label: 'INT' }, { key: 'RTG', label: 'RTG', hl: true },
    { key: 'CAR', label: 'CAR' }, { key: 'RYDS', label: 'RYDS' }, { key: 'RTD', label: 'RTD' },
  ],
  nfl_rb: [
    { key: 'GP', label: 'GP' }, { key: 'CAR', label: 'CAR' },
    { key: 'YDS', label: 'YDS', hl: true }, { key: 'AVG', label: 'AVG' },
    { key: 'TD', label: 'TD', hl: true }, { key: 'REC', label: 'REC' },
    { key: 'RYDS', label: 'REC YDS' }, { key: 'RTD', label: 'REC TD' },
  ],
  nfl_wr: [
    { key: 'GP', label: 'GP' }, { key: 'REC', label: 'REC', hl: true },
    { key: 'YDS', label: 'YDS', hl: true }, { key: 'AVG', label: 'AVG' },
    { key: 'TD', label: 'TD', hl: true }, { key: 'TGTS', label: 'TGT' },
  ],
  nhl_skater: [
    { key: 'GP', label: 'GP' }, { key: 'G', label: 'G', hl: true },
    { key: 'A', label: 'A', hl: true }, { key: 'PTS', label: 'PTS', hl: true },
    { key: '+/-', label: '+/-' }, { key: 'PIM', label: 'PIM' }, { key: 'SOG', label: 'SOG' },
  ],
  nhl_goalie: [
    { key: 'GP', label: 'GP' }, { key: 'W', label: 'W', hl: true },
    { key: 'L', label: 'L' }, { key: 'GAA', label: 'GAA', hl: true },
    { key: 'SV%', label: 'SV%', hl: true }, { key: 'SO', label: 'SO' },
  ],
};

const CAREER_TITLE = {
  mlb_batting: 'Career Batting', mlb_pitching: 'Career Pitching',
  nba: 'Career Stats',
  nfl_qb: 'Career Passing', nfl_rb: 'Career Rushing', nfl_wr: 'Career Receiving',
  nhl_skater: 'Career Stats', nhl_goalie: 'Career Stats',
};

/* ── Game log columns ─────────────────────────────────── */
const GAMELOG_COLS = {
  mlb_batting:  ['AB','R','H','2B','3B','HR','RBI','BB','SO','SB','AVG','OPS'],
  mlb_pitching: ['IP','H','R','ER','BB','K','HR','ERA'],
  nba:   ['MIN','PTS','REB','AST','STL','BLK','FG','3PT','FT','TO'],
  nfl_qb:  ['CMP','ATT','YDS','TD','INT','RTG'],
  nfl_rb:  ['CAR','YDS','AVG','TD','REC','RYDS'],
  nfl_wr:  ['REC','YDS','AVG','TD','TGTS'],
  nhl_skater: ['G','A','PTS','+/-','SOG','TOI'],
  nhl_goalie: ['W','L','GAA','SV%','SO'],
};

/* ── Extract stats from core API response ─────────────── */
function getStats(data, sportKey) {
  if (!data) return {};
  const cats = data.splits?.categories || [];

  if (sportKey === 'mlb' || sportKey === 'mlb_batting' || sportKey === 'mlb_pitching') {
    const cat = cats.find((c) => c.name === 'pitching') || cats.find((c) => c.name === 'batting') || cats[0];
    const result = {};
    (cat?.stats || []).forEach((s) => { result[s.abbreviation] = s.displayValue; });
    return result;
  }

  if (sportKey === 'nba') {
    const result = {};
    cats.forEach((cat) => (cat.stats || []).forEach((s) => { result[s.abbreviation] = s.displayValue; }));
    // Offensive overrides general for accuracy
    const off = cats.find((c) => c.name === 'offensive');
    if (off) (off.stats || []).forEach((s) => { result[s.abbreviation] = s.displayValue; });
    return result;
  }

  if (sportKey?.startsWith('nfl')) {
    const passing   = cats.find((c) => c.name?.includes('pass'));
    const rushing   = cats.find((c) => c.name?.includes('rush'));
    const receiving = cats.find((c) => c.name?.includes('receiv'));
    const general   = cats.find((c) => c.name === 'general');
    const result = {};
    // Always get GP from general
    (general?.stats || []).forEach((s) => { result[s.abbreviation] = s.displayValue; });

    if (sportKey === 'nfl_qb') {
      (passing?.stats || []).forEach((s) => { result[s.abbreviation] = s.displayValue; });
      // Store rushing separately to avoid overwriting passing YDS
      (rushing?.stats || []).forEach((s) => {
        const key = s.abbreviation === 'YDS' ? 'RYDS' : s.abbreviation === 'TD' ? 'RTD' : s.abbreviation === 'AVG' ? 'RAVG' : s.abbreviation;
        if (!result[key]) result[key] = s.displayValue;
      });
      result['CAR'] = rushing ? (rushing.stats || []).find((s) => s.abbreviation === 'CAR')?.displayValue : null;
    } else if (sportKey === 'nfl_rb') {
      (rushing?.stats || []).forEach((s) => { result[s.abbreviation] = s.displayValue; });
      (receiving?.stats || []).forEach((s) => {
        const key = s.abbreviation === 'YDS' ? 'RYDS' : s.abbreviation === 'TD' ? 'RTD' : s.abbreviation;
        if (!result[key]) result[key] = s.displayValue;
      });
    } else {
      (receiving?.stats || []).forEach((s) => { result[s.abbreviation] = s.displayValue; });
    }
    return result;
  }

  if (sportKey === 'nhl_skater' || sportKey === 'nhl_goalie') {
    const result = {};
    cats.forEach((cat) => (cat.stats || []).forEach((s) => { result[s.abbreviation] = s.displayValue; }));
    // Offensive overrides for accurate skater stats
    const off = cats.find((c) => c.name === 'offensive');
    if (off && sportKey === 'nhl_skater') (off.stats || []).forEach((s) => { result[s.abbreviation] = s.displayValue; });
    return result;
  }

  const result = {};
  (cats[0]?.stats || []).forEach((s) => { result[s.abbreviation] = s.displayValue; });
  return result;
}

function hasStats(data, sportKey) {
  const s = getStats(data, sportKey);
  return Object.values(s).some((v) => {
    const n = parseFloat(v);
    return !isNaN(n) && n > 0;
  });
}

export default function PlayerPage() {
  const { sport, playerId } = useParams();
  const navigate = useNavigate();
  const [bio, setBio] = useState(null);
  const [seasons, setSeasons] = useState([]);
  const [gamelog, setGamelog] = useState([]);
  const [loading, setLoading] = useState(true);

  // Derive sport key after bio loads
  const position = (bio?.athlete?.position?.abbreviation || '').toUpperCase();
  const sportKey = (() => {
    if (sport === 'mlb') {
      const PITCHER_POS = ['P','SP','RP','CL','MR','SU'];
      return PITCHER_POS.includes(position) ? 'mlb_pitching' : 'mlb_batting';
    }
    if (sport === 'nba') return 'nba';
    if (sport === 'nfl') return getNflKey(position);
    if (sport === 'nhl') return NHL_GOALIE_POS.includes(position) ? 'nhl_goalie' : 'nhl_skater';
    return sport;
  })();

  const cols        = CAREER_COLS[sportKey] || CAREER_COLS.nba;
  const glCols      = GAMELOG_COLS[sportKey] || GAMELOG_COLS.nba;
  const careerTitle = CAREER_TITLE[sportKey] || 'Career Stats';

  useEffect(() => {
    const currentYear = new Date().getFullYear();

    // Load bio first
    getPlayerBio(sport, playerId)
      .then(setBio)
      .catch(() => {});

    // Game log
    getPlayerGameLog(sport, playerId).then(async (data) => {
      const labels = data.labels || [];
      const eventsMap = data.events || {};
      const seasonTypes = data.seasonTypes || [];
      const games = [];
      for (const st of seasonTypes) {
        for (const cat of st.categories || []) {
          for (const ev of cat.events || []) {
            const info = eventsMap[ev.eventId] || {};
            games.push({
              date: info.gameDate || '',
              opponent: info.opponent?.abbreviation || '',
              atVs: info.atVs || '',
              result: info.gameResult || '',
              stats: Object.fromEntries(labels.map((l, i) => [l, ev.stats?.[i] ?? ''])),
            });
          }
        }
      }
      games.sort((a, b) => new Date(b.date) - new Date(a.date));

      // Prepend today's game if not in log
      const today = new Date().toISOString().slice(0, 10);
      const hasToday = games.some((g) => g.date.startsWith(today));
      if (!hasToday) {
        try {
          const events = await getScoreboard(sport);
          const bioData = await getPlayerBio(sport, playerId).catch(() => null);
          const teamId = bioData?.athlete?.team?.id;
          const todayGame = teamId
            ? events.find((e) => e.competitions?.[0]?.competitors?.some((c) => c.team?.id === teamId))
            : null;
          if (todayGame) {
            const summary = await getGameBoxscore(sport, todayGame.id);
            for (const group of summary?.boxscore?.players || []) {
              for (const sg of group.statistics || []) {
                const bsLabels = sg.labels || [];
                const found = (sg.athletes || []).find((a) => String(a.athlete?.id) === String(playerId));
                if (found?.stats?.length) {
                  const comp = todayGame.competitions?.[0];
                  const myTeam = comp?.competitors?.find((c) => c.team?.id === teamId);
                  const opp = comp?.competitors?.find((c) => c.team?.id !== teamId);
                  const state = comp?.status?.type?.state;
                  games.unshift({
                    date: todayGame.date || new Date().toISOString(),
                    opponent: opp?.team?.abbreviation || '',
                    atVs: myTeam?.homeAway === 'home' ? 'vs' : '@',
                    result: state === 'post' ? (myTeam?.winner ? 'W' : 'L') : state === 'in' ? 'Live' : '',
                    stats: Object.fromEntries(bsLabels.map((l, i) => [l, found.stats[i] ?? ''])),
                    isLive: state === 'in',
                  });
                  break;
                }
              }
            }
          }
        } catch {}
      }
      setGamelog(games.slice(0, 25));
    }).catch(() => {});

    // Season stats — fetch from debut year to current
    getPlayerBio(sport, playerId).then((bioData) => {
      const debutYear = bioData?.athlete?.debutYear || currentYear - 8;
      const years = Array.from(
        { length: currentYear - debutYear + 1 },
        (_, i) => debutYear + i
      );
      Promise.allSettled(years.map((y) => getPlayerSeasonStats(sport, playerId, y)))
        .then((results) => {
          // Determine sport key from bio position
          const pos = (bioData?.athlete?.position?.abbreviation || '').toUpperCase();
          const sk = (() => {
            if (sport === 'mlb') return ['P','SP','RP','CL','MR','SU'].includes(pos) ? 'mlb_pitching' : 'mlb_batting';
            if (sport === 'nba') return 'nba';
            if (sport === 'nfl') return getNflKey(pos);
            if (sport === 'nhl') return NHL_GOALIE_POS.includes(pos) ? 'nhl_goalie' : 'nhl_skater';
            return sport;
          })();

          const valid = results
            .filter((r) => r.status === 'fulfilled')
            .map((r) => r.value)
            .filter((r) => hasStats(r.data, sk));
          setSeasons(valid);
        })
        .finally(() => setLoading(false));
    }).catch(() => setLoading(false));
  }, [sport, playerId]);

  const athlete = bio?.athlete || {};
  const summary = athlete.statsSummary?.statistics || [];
  const teamLogo = athlete.team?.logos?.[0]?.href || athlete.team?.logo;

  const careerTotals = (() => {
    const nonRateKeys = ['AVG','OBP','SLG','OPS','ERA','WHIP','FG%','3P%','FT%','GAA','SV%','RTG','AVG','RAVG'];
    const totals = {};
    seasons.forEach(({ data }) => {
      const s = getStats(data, sportKey);
      cols.forEach(({ key }) => {
        if (nonRateKeys.includes(key)) return;
        const v = parseFloat(s[key]);
        if (!isNaN(v)) totals[key] = (totals[key] || 0) + v;
      });
    });
    const lastStats = seasons.length ? getStats(seasons[seasons.length - 1].data, sportKey) : {};
    nonRateKeys.forEach((k) => { if (lastStats[k]) totals[k] = lastStats[k]; });
    return totals;
  })();

  return (
    <div className="pp-page">
      <button className="tp-back" onClick={() => navigate(-1)}>← Back</button>

      {loading && <div className="tp-loading">Loading…</div>}

      {!loading && athlete.displayName && (
        <>
          <div className="pp-header">
            <div className="pp-hero">
              {athlete.headshot?.href && (
                <img src={athlete.headshot.href} alt={athlete.displayName} className="pp-headshot" />
              )}
              <div className="pp-bio">
                <div className="pp-name">
                  <span className="pp-firstname">{athlete.firstName}</span>
                  <span className="pp-lastname"> {athlete.lastName}</span>
                </div>
                <div className="pp-team-row">
                  {teamLogo && <img src={teamLogo} alt="" className="pp-team-logo" />}
                  <span className="pp-team-name">{athlete.team?.displayName}</span>
                  {athlete.displayJersey && <span className="pp-meta"> · #{athlete.displayJersey}</span>}
                  {athlete.position?.abbreviation && <span className="pp-meta"> · {athlete.position.abbreviation}</span>}
                </div>
                <div className="pp-details">
                  {athlete.displayHeight && athlete.displayWeight && (
                    <div className="pp-detail-row"><span className="pp-detail-label">HT/WT</span><span>{athlete.displayHeight}, {athlete.displayWeight}</span></div>
                  )}
                  {athlete.displayDOB && (
                    <div className="pp-detail-row"><span className="pp-detail-label">BORN</span><span>{athlete.displayDOB}{athlete.age ? ` (${athlete.age})` : ''}</span></div>
                  )}
                  {athlete.displayBatsThrows && (
                    <div className="pp-detail-row"><span className="pp-detail-label">BAT/THR</span><span>{athlete.displayBatsThrows}</span></div>
                  )}
                  {athlete.displayDraft && (
                    <div className="pp-detail-row"><span className="pp-detail-label">DRAFT</span><span>{athlete.displayDraft}</span></div>
                  )}
                </div>
              </div>
            </div>

            {summary.length > 0 && (
              <div className="pp-stat-highlights">
                <div className="pp-highlights-label">{athlete.statsSummary?.displayName || 'Season Stats'}</div>
                <div className="pp-highlights-grid">
                  {summary.map((s) => (
                    <div key={s.abbreviation} className="pp-highlight-pill">
                      <div className="pp-hl-value">{s.displayValue}</div>
                      <div className="pp-hl-label">{s.abbreviation}</div>
                      {s.rankDisplayValue && <div className="pp-hl-rank">{s.rankDisplayValue}</div>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Career stats table */}
          <div className="pp-stats-section">
            <div className="pp-stats-title">{careerTitle}</div>
            <div className="pp-table-wrap">
              <table className="pp-table">
                <thead>
                  <tr>
                    <th className="pp-th pp-th-season">SEASON</th>
                    {cols.map((c) => <th key={c.key} className="pp-th">{c.label}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {seasons.map(({ year, data }) => {
                    const s = getStats(data, sportKey);
                    const isCurrent = year === new Date().getFullYear();
                    return (
                      <tr key={year} className={`pp-tr ${isCurrent ? 'pp-tr-current' : ''}`}>
                        <td className="pp-td pp-td-season">{year}</td>
                        {cols.map((c) => (
                          <td key={c.key} className={`pp-td ${c.hl ? 'pp-td-hl' : ''}`}>
                            {s[c.key] ?? '—'}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                  {seasons.length > 1 && (
                    <tr className="pp-tr-career">
                      <td className="pp-td pp-td-season pp-career-label">Career</td>
                      {cols.map((c) => (
                        <td key={c.key} className={`pp-td ${c.hl ? 'pp-td-hl' : ''}`}>
                          {careerTotals[c.key] !== undefined ? careerTotals[c.key] : '—'}
                        </td>
                      ))}
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Game Log */}
          {gamelog.length > 0 && (
            <div className="pp-stats-section">
              <div className="pp-stats-title">Last {gamelog.length} Games</div>
              <div className="pp-table-wrap">
                <table className="pp-table">
                  <thead>
                    <tr>
                      <th className="pp-th pp-th-season">DATE</th>
                      <th className="pp-th pp-th-season">OPP</th>
                      <th className="pp-th pp-th-season">RESULT</th>
                      {glCols.map((c) => <th key={c} className="pp-th">{c}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {gamelog.map((g, i) => {
                      const date = g.date ? new Date(g.date) : null;
                      const dateStr = date
                        ? date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                        : '—';
                      const isWin = g.result === 'W';
                      return (
                        <tr key={i} className="pp-tr">
                          <td className="pp-td pp-td-season">{dateStr}</td>
                          <td className="pp-td pp-td-season">
                            <span className="pp-gl-atVs">{g.atVs}</span> {g.opponent}
                          </td>
                          <td className="pp-td pp-td-season">
                            {g.isLive ? (
                              <span className="badge badge-live" style={{ fontSize: 10, padding: '2px 6px' }}>
                                <span className="live-dot" />Live
                              </span>
                            ) : (
                              <span className={`pp-gl-result ${isWin ? 'pp-gl-win' : 'pp-gl-loss'}`}>
                                {g.result}
                              </span>
                            )}
                          </td>
                          {glCols.map((c) => (
                            <td key={c} className={`pp-td ${c === 'PTS' || c === 'HR' || c === 'TD' ? 'pp-td-hl' : ''}`}>
                              {g.stats[c] || '0'}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {!loading && !athlete.displayName && (
        <div className="error-banner">Could not load player information.</div>
      )}
    </div>
  );
}
