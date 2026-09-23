import { createClient } from 'npm:@supabase/supabase-js@2';
import { WHOOP_AUTH, redirectUri, signState } from '../_shared/whoop.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const clientId = Deno.env.get('WHOOP_CLIENT_ID');
  if (!clientId || !Deno.env.get('WHOOP_CLIENT_SECRET')) {
    return new Response(JSON.stringify({ error: 'Add WHOOP_CLIENT_ID and WHOOP_CLIENT_SECRET in Supabase, then deploy the whoop-connect function.' }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') || '' } },
  });
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    return new Response(JSON.stringify({ error: 'Not logged in' }), { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  const state = await signState(data.user.id);
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri(),
    response_type: 'code',
    scope: 'read:profile read:recovery read:sleep read:workout read:cycles read:body_measurement offline',
    state,
  });
  return new Response(JSON.stringify({ url: `${WHOOP_AUTH}/auth?${params}` }), {
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
});
