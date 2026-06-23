const express = require('express');
const router = express.Router();
const axios = require('axios');
const db = require('../db');
const requireAuth = require('../middleware/auth');

const WHOOP_CLIENT_ID = process.env.WHOOP_CLIENT_ID;
const WHOOP_CLIENT_SECRET = process.env.WHOOP_CLIENT_SECRET;
const WHOOP_REDIRECT_URI = process.env.WHOOP_REDIRECT_URI || 'https://shribetrakr.com/api/whoop/callback';
const WHOOP_API_V1 = 'https://api.prod.whoop.com/developer/v1';
const WHOOP_API_V2 = 'https://api.prod.whoop.com/developer/v2';
const WHOOP_API = 'https://api.prod.whoop.com/developer'; // legacy
const WHOOP_AUTH = 'https://api.prod.whoop.com/oauth/oauth2';

// GET /api/whoop/connect — redirect to Whoop OAuth
// Accepts token as query param since browser <a> tags can't send auth headers
router.get('/connect', (req, res) => {
  if (!WHOOP_CLIENT_ID) return res.status(500).json({ error: 'Whoop integration not configured' });

  // Verify JWT from query param
  const jwt = require('jsonwebtoken');
  const JWT_SECRET = process.env.JWT_SECRET || 'gymtrack-dev-secret-change-in-production';
  const token = req.query.token ? decodeURIComponent(req.query.token) : null;
  if (!token) return res.status(401).json({ error: 'Not logged in' });

  let userId;
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    userId = decoded.userId;
  } catch {
    return res.status(401).json({ error: 'Invalid session' });
  }

  const crypto = require('crypto');
  const state = `${userId}_${crypto.randomBytes(8).toString('hex')}`;
  const params = new URLSearchParams({
    client_id: WHOOP_CLIENT_ID,
    redirect_uri: WHOOP_REDIRECT_URI,
    response_type: 'code',
    scope: 'read:profile read:recovery read:sleep read:workout read:cycles read:body_measurement offline',
    state,
  });
  res.redirect(`${WHOOP_AUTH}/auth?${params}`);
});

// GET /api/whoop/callback — Whoop redirects here after auth
router.get('/callback', async (req, res) => {
  const { code, state, error, error_description } = req.query;
  console.log('Whoop callback:', { code: !!code, state, error, error_description });
  if (error || !code) return res.redirect(`/?whoop=error&reason=${encodeURIComponent(error_description || error || 'unknown')}`);

  const userId = parseInt(state?.split('_')[0]);
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

// GET /api/whoop/debug — raw API response for debugging
router.get('/debug', requireAuth, async (req, res) => {
  try {
    const token = await getToken(req.userId);
    const headers = { Authorization: `Bearer ${token}` };
    const [c, r, s] = await Promise.allSettled([
      axios.get(`${WHOOP_API_V1}/cycle?limit=3`, { headers }),
      axios.get(`${WHOOP_API_V2}/recovery?limit=3`, { headers }),
      axios.get(`${WHOOP_API_V2}/activity/sleep?limit=3`, { headers }),
    ]);
    res.json({
      cycles: c.status === 'fulfilled' ? c.value.data : c.reason?.response?.data,
      recovery: r.status === 'fulfilled' ? r.value.data : r.reason?.response?.data,
      sleep: s.status === 'fulfilled' ? s.value.data : s.reason?.response?.data,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/whoop/daily — today's recovery, strain, sleep, HRV, RHR
router.get('/daily', requireAuth, async (req, res) => {
  try {
    const token = await getToken(req.userId);
    const headers = { Authorization: `Bearer ${token}` };

    // Fetch latest cycle (strain), recovery, and sleep in parallel
    const [cycleRes, recoveryRes, sleepRes] = await Promise.allSettled([
      axios.get(`${WHOOP_API_V1}/cycle?limit=3`, { headers }),
      axios.get(`${WHOOP_API_V2}/recovery?limit=3`, { headers }),
      axios.get(`${WHOOP_API_V2}/activity/sleep?limit=3`, { headers }),
    ]);

    const cycles = cycleRes.status === 'fulfilled' ? cycleRes.value.data?.records || [] : [];
    const recoveries = recoveryRes.status === 'fulfilled' ? recoveryRes.value.data?.records || [] : [];
    const sleeps = sleepRes.status === 'fulfilled' ? sleepRes.value.data?.records || [] : [];

    // Use most recent record that has actual score data
    const cycle = cycles.find(c => c.score?.strain != null) || cycles[0];
    const recovery = recoveries.find(r => r.score?.recovery_score != null) || recoveries[0];
    const sleep = sleeps.find(s => s.score?.sleep_performance_percentage != null) || sleeps[0];

    console.log('Whoop daily data:', {
      cycles: cycles.length, recoveries: recoveries.length, sleeps: sleeps.length,
      recovery_score: recovery?.score?.recovery_score,
      hrv: recovery?.score?.hrv_rmssd_milli,
      rhr: recovery?.score?.resting_heart_rate,
      strain: cycle?.score?.strain,
      sleep_perf: sleep?.score?.sleep_performance_percentage,
    });

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

// Helper: fetch all pages from a paginated Whoop endpoint up to maxRecords
async function fetchAllPages(baseUrl, headers, maxRecords = 90) {
  const records = [];
  let nextToken = null;
  do {
    const url = nextToken ? `${baseUrl}&nextToken=${nextToken}` : baseUrl;
    const res = await axios.get(url, { headers });
    const data = res.data;
    records.push(...(data.records || []));
    nextToken = data.next_token || null;
  } while (nextToken && records.length < maxRecords);
  return records.slice(0, maxRecords);
}

// GET /api/whoop/history — last N days of metrics
router.get('/history', requireAuth, async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 30, 90);
  try {
    const token = await getToken(req.userId);
    const headers = { Authorization: `Bearer ${token}` };

    const [recoveryRes, sleepRes, cycleRes] = await Promise.allSettled([
      fetchAllPages(`${WHOOP_API_V2}/recovery?limit=25`, headers, limit),
      fetchAllPages(`${WHOOP_API_V2}/activity/sleep?limit=25`, headers, limit),
      fetchAllPages(`${WHOOP_API_V1}/cycle?limit=25`, headers, limit),
    ]);

    const recoveries = recoveryRes.status === 'fulfilled' ? recoveryRes.value : [];
    const sleeps = sleepRes.status === 'fulfilled' ? sleepRes.value : [];
    const cycles = cycleRes.status === 'fulfilled' ? cycleRes.value : [];

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
