import { createContext, useContext, useState, useEffect } from 'react';

const FavoritesContext = createContext(null);

const STORAGE_KEY = 'sports_dashboard_favorites';

const DEFAULT_FAVORITES = {
  sport: 'nba',
  team: { id: '13', displayName: 'Los Angeles Lakers', abbreviation: 'LAL', color: '552583', alternateColor: 'FDB927' },
  players: [
    { id: '3945274', displayName: 'LeBron James', position: 'SF', headshot: 'https://a.espncdn.com/i/headshots/nba/players/full/1966.png' },
    { id: '4066261', displayName: "Anthony Davis", position: 'PF/C', headshot: 'https://a.espncdn.com/i/headshots/nba/players/full/6583.png' },
  ],
};

export function FavoritesProvider({ children }) {
  const [favorites, setFavorites] = useState(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : DEFAULT_FAVORITES;
    } catch {
      return DEFAULT_FAVORITES;
    }
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(favorites));
  }, [favorites]);

  const setSport = (sport) =>
    setFavorites((f) => ({ ...f, sport, team: null, players: [] }));

  const setTeam = (team) => setFavorites((f) => ({ ...f, team }));

  const addPlayer = (player) =>
    setFavorites((f) => {
      if (f.players.some((p) => p.id === player.id)) return f;
      return { ...f, players: [...f.players, player] };
    });

  const removePlayer = (playerId) =>
    setFavorites((f) => ({
      ...f,
      players: f.players.filter((p) => p.id !== playerId),
    }));

  return (
    <FavoritesContext.Provider
      value={{ favorites, setSport, setTeam, addPlayer, removePlayer }}
    >
      {children}
    </FavoritesContext.Provider>
  );
}

export const useFavorites = () => useContext(FavoritesContext);
