import { useState, useEffect, useCallback } from 'react';
import { getScoreboard } from '../api/espn';

export default function useTeamGame(sport, teamId, refreshInterval = 30000) {
  const [game, setGame] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetch = useCallback(async () => {
    try {
      const events = await getScoreboard(sport);
      const found = events.find((e) =>
        e.competitions?.[0]?.competitors?.some((c) => c.team?.id === String(teamId))
      );
      setGame(found || null);
      setError(null);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [sport, teamId]);

  useEffect(() => {
    setLoading(true);
    setGame(null);
    fetch();
    const id = setInterval(fetch, refreshInterval);
    return () => clearInterval(id);
  }, [fetch, refreshInterval]);

  return { game, loading, error };
}
