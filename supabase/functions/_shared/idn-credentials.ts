// Generator kredensial playback IDN (hanabira48). Dipakai oleh idn-stream-token
// (penonton berbayar/membership) dan free-token (mode gratis).

export const X_TOKEN_ID = '114e0e89-f8b4-44ee-9354-bb06805cc02f';
export const X_SEC_KEY = '49c647f3-c84b-4b93-9b84-9d1ad158428e';
export const PARTNER_SECRET = Deno.env.get('HANABIRA_PARTNER_SECRET') || 'Hanabirastream2026';
export const PLAYBACK_URL = 'https://rt.mediastream48.workers.dev/playback';

function b64url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}
function b64urlStr(s: string): string {
  return b64url(new TextEncoder().encode(s));
}
function toHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Aturan HANABIRA48: umur token maksimal 90 detik, frontend rotasi tiap 60 detik.
export const API_TOKEN_TTL = 90;
export async function generateApiToken(showId: string, _ttlSec = API_TOKEN_TTL): Promise<string> {
  const ttlSec = API_TOKEN_TTL;
  // Step A: JWT secret = HEX(SHA256(secKey:tokenId:partnerSecret))
  const seed = `${X_SEC_KEY}:${X_TOKEN_ID}:${PARTNER_SECRET}`;
  const seedHash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(seed));
  const jwtSecret = toHex(new Uint8Array(seedHash));

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = { tid: X_TOKEN_ID, sid: String(showId), iat: now, exp: now + ttlSec };
  const signingInput = `${b64urlStr(JSON.stringify(header))}.${b64urlStr(JSON.stringify(payload))}`;

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(jwtSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signingInput));
  return `${signingInput}.${b64url(new Uint8Array(sig))}`;
}

export const ALLOWED_ORIGINS = [
  'https://realtime48show.my.id',
  'https://www.realtime48show.my.id',
  'https://realtime48stream.my.id',
  'https://www.realtime48stream.my.id',
  'https://replaytime.lovable.app',
  'http://localhost:8080',
];

export function cors(origin: string | null) {
  const allowed = origin && (ALLOWED_ORIGINS.includes(origin) || /^https:\/\/[a-z0-9.-]+$/i.test(origin) || /^https:\/\/[a-z0-9-]+\.lovable\.app$/.test(origin))
    ? origin
    : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Vary': 'Origin',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  } as Record<string, string>;
}
