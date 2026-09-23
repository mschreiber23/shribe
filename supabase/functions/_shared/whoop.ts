export const WHOOP_AUTH = 'https://api.prod.whoop.com/oauth/oauth2';
export const WHOOP_API_V1 = 'https://api.prod.whoop.com/developer/v1';
export const WHOOP_API_V2 = 'https://api.prod.whoop.com/developer/v2';

export function siteUrl() {
  return Deno.env.get('SITE_URL') || 'https://shribetrakr.com';
}

export function redirectUri() {
  return Deno.env.get('WHOOP_REDIRECT_URI') || `${siteUrl()}/whoop/callback`;
}

export async function signState(userId: string) {
  const nonce = crypto.randomUUID().replace(/-/g, '');
  const payload = `${userId}.${nonce}`;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(Deno.env.get('WHOOP_CLIENT_SECRET') || ''),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sigBuf = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  const sig = [...new Uint8Array(sigBuf)].map(b => b.toString(16).padStart(2, '0')).join('');
  return `${payload}.${sig}`;
}

export async function verifyState(state: string) {
  const parts = state.split('.');
  if (parts.length !== 3) return null;
  const [userId, nonce, sig] = parts;
  const payload = `${userId}.${nonce}`;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(Deno.env.get('WHOOP_CLIENT_SECRET') || ''),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sigBuf = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  const expected = [...new Uint8Array(sigBuf)].map(b => b.toString(16).padStart(2, '0')).join('');
  if (expected !== sig) return null;
  return userId;
}

export async function fetchAllPages(baseUrl: string, token: string, maxRecords = 90) {
  const records: Record<string, unknown>[] = [];
  let nextToken: string | null = null;
  do {
    const url = nextToken ? `${baseUrl}&nextToken=${encodeURIComponent(nextToken)}` : baseUrl;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) break;
    const data = await res.json();
    records.push(...(data.records || []));
    nextToken = data.next_token || null;
  } while (nextToken && records.length < maxRecords);
  return records.slice(0, maxRecords);
}
