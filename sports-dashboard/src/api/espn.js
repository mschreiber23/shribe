import axios from 'axios';

const BASE = 'https://site.api.espn.com/apis/site/v2/sports';

export const SPORTS = {
  nba: { league: 'basketball/nba', label: 'NBA' },
  nfl: { league: 'football/nfl', label: 'NFL' },
  mlb: { league: 'baseball/mlb', label: 'MLB' },
  nhl: { league: 'hockey/nhl', label: 'NHL' },
};

export async function getScoreboard(sport) {
  const { league } = SPORTS[sport];
  const { data } = await axios.get(`${BASE}/${league}/scoreboard`);
  return data.events || [];
}

export async function getTeamRoster(sport, teamId) {
  const { league } = SPORTS[sport];
  const { data } = await axios.get(`${BASE}/${league}/teams/${teamId}/roster`);
  return data.athletes || [];
}

export async function getPlayerGameLog(sport, playerId) {
  const { league } = SPORTS[sport];
  const year = new Date().getFullYear();
  const { data } = await axios.get(
    `https://site.web.api.espn.com/apis/common/v3/sports/${league}/athletes/${playerId}/gamelog?season=${year}`
  );
  return data;
}

export async function getPlayerBio(sport, playerId) {
  const { league } = SPORTS[sport];
  const { data } = await axios.get(
    `https://site.web.api.espn.com/apis/common/v3/sports/${league}/athletes/${playerId}`
  );
  return data;
}

export async function getPlayerSeasonStats(sport, playerId, year) {
  const coreLeague = { nba: 'basketball/leagues/nba', nfl: 'football/leagues/nfl', mlb: 'baseball/leagues/mlb', nhl: 'hockey/leagues/nhl' }[sport];
  const { data } = await axios.get(
    `https://sports.core.api.espn.com/v2/sports/${coreLeague}/seasons/${year}/types/2/athletes/${playerId}/statistics/0`
  );
  return { year, data };
}

export async function getPlayerStats(sport, playerId) {
  const year = new Date().getFullYear();
  // Core API v2 path uses sport/leagues/league format
  const coreLeague = {
    nba: 'basketball/leagues/nba',
    nfl: 'football/leagues/nfl',
    mlb: 'baseball/leagues/mlb',
    nhl: 'hockey/leagues/nhl',
  }[sport];
  const { data } = await axios.get(
    `https://sports.core.api.espn.com/v2/sports/${coreLeague}/seasons/${year}/types/2/athletes/${playerId}/statistics/0`
  );
  return data;
}

export async function searchTeams(sport, query) {
  const { league } = SPORTS[sport];
  // Use standings endpoint — has CORS headers unlike the teams endpoint
  const { data } = await axios.get(
    `https://site.web.api.espn.com/apis/v2/sports/${league}/standings`
  );
  const teams = [];
  const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    const entries = node.standings?.entries || node.entries;
    if (Array.isArray(entries)) {
      entries.forEach((e) => { if (e.team?.id) teams.push(e.team); });
    }
    (node.children || []).forEach(walk);
  };
  walk(data);
  const unique = Array.from(new Map(teams.map((t) => [t.id, t])).values());
  if (!query) return unique;
  return unique.filter((t) => t.displayName.toLowerCase().includes(query.toLowerCase()));
}

export async function getTeamSchedule(sport, teamId) {
  const { league } = SPORTS[sport];
  const { data } = await axios.get(
    `${BASE}/${league}/teams/${teamId}/schedule`
  );
  return data.events || [];
}

export async function getGameBoxscore(sport, gameId) {
  const { league } = SPORTS[sport];
  const { data } = await axios.get(
    `${BASE}/${league}/summary?event=${gameId}`
  );
  return data;
}

export async function getTeamInfo(sport, teamId) {
  const { league } = SPORTS[sport];
  const { data } = await axios.get(`${BASE}/${league}/teams/${teamId}`);
  return data.team || {};
}

export async function getTeamNews(sport, teamId, limit = 10) {
  const { league } = SPORTS[sport];
  const { data } = await axios.get(
    `${BASE}/${league}/news?team=${teamId}&limit=${limit}`
  );
  return data.articles || [];
}

export async function getStandings(sport) {
  const { league } = SPORTS[sport];
  const { data } = await axios.get(
    `https://site.web.api.espn.com/apis/v2/sports/${league}/standings`
  );
  return data;
}
