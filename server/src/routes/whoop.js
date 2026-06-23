const express = require('express');
const router = express.Router();
const axios = require('axios');
const db = require('../db');
const requireAuth = require('../middleware/auth');

const WHOOP_CLIENT_ID = process.env.WHOOP_CLIENT_ID;
const WHOOP_CLIENT_SECRET = process.env.WHOOP_CLIENT_SECRET;
const WHOOP_REDIRECT_URI = process.env.WHOOP_REDIRECT_URI || 'https://shribetrakr.com/api/whoop/callback';
const WHOOP_API = 'https://api.prod.whoop.com/developer';
const WHOOP_AUTH = 'https://api.prod.whoop.com/oauth/oauth2';

// GET /api/whoop/connect — redirect to Whoop OAuth
// This route needs to pass the user's JWT so we can link back after callback
router.get('/connect', requireAuth, (req, res) => {
  if (!WHOOP_CLIENT_ID) return res.status(500).json({ error: 'Whoop integration not configured' });
  const params = new URLSearchParams({
    client_id: WHOOP_CLIENT_ID,
    redirect_uri: WHOOP_REDIRECT_URI,
    response_type: 'code',
    scope: 'read:profile read:recovery read:sleep read:workout read:cycles read:body_measurement offline',
    state: req.userId.toString(), // pass user ID through OAuth state
  });
  res.redirect(`${WHOOP_AUTH}/auth?${params}`);
});

// GET /api/whoop/callback — Whoop redirects here after auth
router.get('/callback', async (req, res) => {
  const { code, state, error } = req.query;
  if (error || !code) return res.redirect('/?whoop=error');

  const userId = parseInt(state);
  if (!userId) return res.redirect('/?whoop=error');

  try {
    const tokenRes = await axios.post(`${WHOOP_AUTH}/token`, new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: WHOOP_REDIRECT_URI,
      client_id: WHOOP_CLIENT_ID,
      client_secret: WHOOP_CLIENT_SECRET,
    }), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });

    const { access_token, refresh_token, expires_in } = tokenRes.data;
    const expires_at = Math.floor(Date.now() / 1000) + expires_in;

    // Get Whoop user ID
    const profileRes = await axios.get(`${WHOOP_API}/v1/user/profile/basic`, {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    const whoopUserId = profileRes.data.user_id?.toString();

    db.prepare(`
      INSERT INTO whoop_tokens (user_id, access_token, refresh_token, expires_at, whoop_user_id)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        access_token = excluded.access_token,
        refresh_token = excluded.refresh_token,
        expires_at = excluded.expires_at,
        whoop_user_id = excluded.whoop_user_id
    `).run(userId, access_token, refresh_token, expires_at, whoopUserId);

    res.redirect('/profile?whoop=connected');
  } catch (err) {
    console.error('Whoop callback error:', err.response?.data || err.message);
    res.redirect('/?whoop=error');
  }
});

// Helper: get valid access token (refresh if expired)
async function getToken(userId) {
  const row = db.prepare('SELECT * FROM whoop_tokens WHERE user_id = ?').get(userId);
  if (!row) throw new Error('Not connected to Whoop');

  const now = Math.floor(Date.now() / 1000);
  if (row.expires_at - now > 60) return row.access_token;

  // Refresh
  const res = await axios.post(`${WHOOP_AUTH}/token`, new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: row.refresh_token,
    client_id: WHOOP_CLIENT_ID,
    client_secret: WHOOP_CLIENT_SECRET,
  }), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });

  const { access_token, refresh_token, expires_in } = res.data;
  const expires_at = now + expires_in;
  db.prepare('UPDATE whoop_tokens SET access_token = ?, refresh_token = ?, expires_at = ? WHERE user_id = ?')
    .run(access_token, refresh_token, expires_at, userId);
  return access_token;
}

// GET /api/whoop/status
router.get('/status', requireAuth, (req, res) => {
  const row = db.prepare('SELECT whoop_user_id, created_at FROM whoop_tokens WHERE user_id = ?').get(req.userId);
  res.json({ connected: !!row, whoop_user_id: row?.whoop_user_id, connected_at: row?.created_at });
});

// DELETE /api/whoop/disconnect
router.delete('/disconnect', requireAuth, (req, res) => {
  db.prepare('DELETE FROM whoop_tokens WHERE user_id = ?').run(req.userId);
  res.json({ success: true });
});

// GET /api/whoop/daily — today's recovery, strain, sleep, HRV, RHR
router.get('/daily', requireAuth, async (req, res) => {
  try {
    const token = await getToken(req.userId);
    const headers = { Authorization: `Bearer ${token}` };

    // Fetch latest cycle (strain), recovery, and sleep in parallel
    const [cycleRes, recoveryRes, sleepRes] = await Promise.allSettled([
      axios.get(`${WHOOP_API}/v1/cycle?limit=1`, { headers }),
      axios.get(`${WHOOP_API}/v1/recovery?limit=1`, { headers }),
      axios.get(`${WHOOP_API}/v1/activity/sleep?limit=1`, { headers }),
    ]);

    const cycle = cycleRes.status === 'fulfilled' ? cycleRes.value.data?.records?.[0] : null;
    const recovery = recoveryRes.status === 'fulfilled' ? recoveryRes.value.data?.records?.[0] : null;
    const sleep = sleepRes.status === 'fulfilled' ? sleepRes.value.data?.records?.[0] : null;

    res.json({
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
  } catch (err) {
    if (err.message === 'Not connected to Whoop') return res.status(401).json({ error: 'Not connected' });
    console.error('Whoop daily error:', err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to fetch Whoop data' });
  }
});

// GET /api/whoop/history — last N days of metrics
router.get('/history', requireAuth, async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 30, 90);
  try {
    const token = await getToken(req.userId);
    const headers = { Authorization: `Bearer ${token}` };

    const [recoveryRes, sleepRes, cycleRes] = await Promise.allSettled([
      axios.get(`${WHOOP_API}/v1/recovery?limit=${limit}`, { headers }),
      axios.get(`${WHOOP_API}/v1/activity/sleep?limit=${limit}`, { headers }),
      axios.get(`${WHOOP_API}/v1/cycle?limit=${limit}`, { headers }),
    ]);

    const recoveries = recoveryRes.status === 'fulfilled' ? recoveryRes.value.data?.records || [] : [];
    const sleeps = sleepRes.status === 'fulfilled' ? sleepRes.value.data?.records || [] : [];
    const cycles = cycleRes.status === 'fulfilled' ? cycleRes.value.data?.records || [] : [];

    // Map cycles by date
    const cycleByDate = {};
    for (const c of cycles) {
      const date = c.start?.slice(0, 10);
      if (date) cycleByDate[date] = c;
    }

    const sleepByDate = {};
    for (const s of sleeps) {
      const date = s.start?.slice(0, 10);
      if (date) sleepByDate[date] = s;
    }

    const history = recoveries.map(r => {
      const date = r.created_at?.slice(0, 10);
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

    res.json(history);
  } catch (err) {
    if (err.message === 'Not connected to Whoop') return res.status(401).json({ error: 'Not connected' });
    res.status(500).json({ error: 'Failed to fetch Whoop history' });
  }
});

module.exports = router;
