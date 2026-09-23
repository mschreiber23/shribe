import { createClient } from 'npm:@supabase/supabase-js@2';
import { WHOOP_AUTH, redirectUri, verifyState } from '../_shared/whoop.ts';

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const { code, state } = await req.json();
  const userId = state ? await verifyState(state) : null;
  if (!code || !userId) return json({ error: 'Missing Whoop code' }, 400);

  const tokenRes = await fetch(`${WHOOP_AUTH}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri(),
      client_id: Deno.env.get('WHOOP_CLIENT_ID') || '',
      client_secret: Deno.env.get('WHOOP_CLIENT_SECRET') || '',
    }),
  });
  const tokenJson = await tokenRes.json();
  if (!tokenRes.ok) return json({ error: tokenJson.error_description || 'Whoop token exchange failed' }, 400);

  const profileRes = await fetch('https://api.prod.whoop.com/developer/v1/user/profile/basic', {
    headers: { Authorization: `Bearer ${tokenJson.access_token}` },
  });
  const profile = profileRes.ok ? await profileRes.json() : {};
  const expiresAt = Math.floor(Date.now() / 1000) + Number(tokenJson.expires_in || 0);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { error } = await admin.from('whoop_tokens').upsert({
    user_id: userId,
    access_token: tokenJson.access_token,
    refresh_token: tokenJson.refresh_token,
    expires_at: expiresAt,
    whoop_user_id: profile.user_id ? String(profile.user_id) : null,
  }, { onConflict: 'user_id' });
  if (error) return json({ error: error.message }, 500);
  return json({ ok: true });
});
