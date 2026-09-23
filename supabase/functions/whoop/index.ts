import { createClient } from 'npm:@supabase/supabase-js@2';
import { WHOOP_API_V1, WHOOP_API_V2, WHOOP_AUTH, fetchAllPages } from '../_shared/whoop.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

async function getToken(supabase: ReturnType<typeof createClient>, userId: string) {
  const { data: row } = await supabase.from('whoop_tokens').select('*').eq('user_id', userId).maybeSingle();
  if (!row) throw new Error('Not connected');
  const now = Math.floor(Date.now() / 1000);
  if (row.expires_at - now > 60) return row.access_token as string;

  const res = await fetch(`${WHOOP_AUTH}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: row.refresh_token,
      client_id: Deno.env.get('WHOOP_CLIENT_ID') || '',
      client_secret: Deno.env.get('WHOOP_CLIENT_SECRET') || '',
    }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error_description || 'Whoop refresh failed');
  const expiresAt = now + Number(body.expires_in || 0);
  await supabase.from('whoop_tokens').update({
    access_token: body.access_token,
    refresh_token: body.refresh_token,
    expires_at: expiresAt,
  }).eq('user_id', userId);
  return body.access_token as string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const auth = req.headers.get('Authorization') || '';
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: auth } },
  });
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return json({ error: 'Not logged in' }, 401);
  const userId = userData.user.id;

  let action = 'status';
  let limit = 30;
  try {
    const body = await req.json();
    action = body.action || 'status';
    limit = Math.min(parseInt(body.limit) || 30, 90);
  } catch { /* status by default */ }

  try {
    if (action === 'status') {
      const { data: row } = await supabase.from('whoop_tokens').select('whoop_user_id, created_at').eq('user_id', userId).maybeSingle();
      return json({ connected: !!row, whoop_user_id: row?.whoop_user_id, connected_at: row?.created_at });
    }
    if (action === 'disconnect') {
      await supabase.from('whoop_tokens').delete().eq('user_id', userId);
      return json({ success: true });
    }

    const token = await getToken(supabase, userId);

    if (action === 'daily') {
      const [cycleRes, recoveryRes, sleepRes] = await Promise.allSettled([
        fetch(`${WHOOP_API_V1}/cycle?limit=3`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
        fetch(`${WHOOP_API_V2}/recovery?limit=3`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
        fetch(`${WHOOP_API_V2}/activity/sleep?limit=3`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
      ]);
      const cycles = cycleRes.status === 'fulfilled' ? cycleRes.value.records || [] : [];
      const recoveries = recoveryRes.status === 'fulfilled' ? recoveryRes.value.records || [] : [];
      const sleeps = sleepRes.status === 'fulfilled' ? sleepRes.value.records || [] : [];
      const cycle = cycles.find((c: { score?: { strain?: number } }) => c.score?.strain != null) || cycles[0];
      const recovery = recoveries.find((r: { score?: { recovery_score?: number } }) => r.score?.recovery_score != null) || recoveries[0];
      const sleep = sleeps.find((s: { score?: { sleep_performance_percentage?: number } }) => s.score?.sleep_performance_percentage != null) || sleeps[0];
      return json({
        recovery_score: recovery?.score?.recovery_score ?? null,
        hrv_rmssd: recovery?.score?.hrv_rmssd_milli ?? null,
        resting_heart_rate: recovery?.score?.resting_heart_rate ?? null,
        strain_score: cycle?.score?.strain ?? null,
        avg_heart_rate: cycle?.score?.average_heart_rate ?? null,
        sleep_performance: sleep?.score?.sleep_performance_percentage ?? null,
        sleep_duration_mins: sleep?.score?.stage_summary?.total_in_bed_time_milli
          ? Math.round(sleep.score.stage_summary.total_in_bed_time_milli / 60000)
          : null,
        cycle_start: cycle?.start,
        recovery_date: recovery?.created_at,
      });
    }

    if (action === 'history') {
      const [recoveries, sleeps, cycles] = await Promise.all([
        fetchAllPages(`${WHOOP_API_V2}/recovery?limit=25`, token, limit),
        fetchAllPages(`${WHOOP_API_V2}/activity/sleep?limit=25`, token, limit),
        fetchAllPages(`${WHOOP_API_V1}/cycle?limit=25`, token, limit),
      ]);
      const cycleByDate: Record<string, any> = {};
      for (const c of cycles) {
        const date = String(c.start || '').slice(0, 10);
        if (date) cycleByDate[date] = c;
      }
      const sleepByDate: Record<string, any> = {};
      for (const s of sleeps) {
        const date = String(s.start || '').slice(0, 10);
        if (date) sleepByDate[date] = s;
      }
      const history = recoveries.map(r => {
        const date = String(r.created_at || '').slice(0, 10);
        const cycle = cycleByDate[date];
        const sleep = sleepByDate[date];
        return {
          date,
          recovery_score: r.score?.recovery_score ?? null,
          hrv_rmssd: r.score?.hrv_rmssd_milli ?? null,
          resting_heart_rate: r.score?.resting_heart_rate ?? null,
          strain_score: cycle?.score?.strain ?? null,
          sleep_performance: sleep?.score?.sleep_performance_percentage ?? null,
          sleep_duration_mins: sleep?.score?.stage_summary?.total_in_bed_time_milli
            ? Math.round(sleep.score.stage_summary.total_in_bed_time_milli / 60000)
            : null,
        };
      }).sort((a, b) => a.date < b.date ? -1 : 1);
      return json(history);
    }

    if (action === 'stats') {
      const yearStart = `${new Date().getFullYear()}-01-01T00:00:00.000Z`;
      const [recoveries, workouts] = await Promise.all([
        fetchAllPages(`${WHOOP_API_V2}/recovery?limit=25`, token, 30),
        fetchAllPages(`${WHOOP_API_V2}/activity/workout?limit=25&start=${encodeURIComponent(yearStart)}`, token, 365),
      ]);
      const scores = recoveries.map(r => r.score?.recovery_score).filter((s: number | null) => s != null);
      const hrvs = recoveries.map(r => r.score?.hrv_rmssd_milli).filter((h: number | null) => h != null);
      return json({
        avg_recovery_30d: scores.length ? Math.round(scores.reduce((a: number, b: number) => a + b, 0) / scores.length) : null,
        highest_hrv: hrvs.length ? Math.round(Math.max(...hrvs)) : null,
        activities_this_year: workouts.length,
      });
    }

    if (action === 'workouts') {
      const records = await fetchAllPages(`${WHOOP_API_V2}/activity/workout?limit=25`, token, limit);
      return json(records);
    }

    if (action === 'debug') {
      const headers = { Authorization: `Bearer ${token}` };
      const [c, r, s] = await Promise.allSettled([
        fetch(`${WHOOP_API_V1}/cycle?limit=3`, { headers }).then(res => res.json()),
        fetch(`${WHOOP_API_V2}/recovery?limit=3`, { headers }).then(res => res.json()),
        fetch(`${WHOOP_API_V2}/activity/sleep?limit=3`, { headers }).then(res => res.json()),
      ]);
      return json({
        cycles: c.status === 'fulfilled' ? c.value : String(c.reason),
        recovery: r.status === 'fulfilled' ? r.value : String(r.reason),
        sleep: s.status === 'fulfilled' ? s.value : String(s.reason),
      });
    }

    return json({ error: 'Unknown action' }, 400);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Whoop request failed';
    if (message === 'Not connected' && action === 'stats') {
      return json({ avg_recovery_30d: null, highest_hrv: null, activities_this_year: null });
    }
    if (message === 'Not connected') return json({ error: 'Not connected' }, 401);
    return json({ error: message }, 500);
  }
});
