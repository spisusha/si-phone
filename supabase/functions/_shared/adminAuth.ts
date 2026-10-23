// JWT signing & verification using built-in Web Crypto API — no external deps

import { corsHeaders } from './cors.ts';

const encoder = new TextEncoder();

// Срок жизни токена админа. Отозвать все токены сразу — сменить секрет ADMIN_TOKEN_SECRET.
const TOKEN_TTL_SEC = 12 * 60 * 60;

async function getKey(): Promise<CryptoKey> {
  const secret = Deno.env.get('ADMIN_TOKEN_SECRET');
  if (!secret) throw new Error('ADMIN_TOKEN_SECRET not configured');
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

function b64url(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function b64urlEncode(str: string): string {
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(str: string): string {
  let s = str.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return atob(s);
}

export async function signAdminToken(): Promise<{ token: string; expiresAt: string }> {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + TOKEN_TTL_SEC;

  const header = b64urlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64urlEncode(JSON.stringify({ role: 'admin', iat: now, exp }));
  const data = `${header}.${payload}`;

  const key = await getKey();
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(data));

  return {
    token: `${data}.${b64url(sig)}`,
    expiresAt: new Date(exp * 1000).toISOString(),
  };
}

export async function verifyAdminToken(req: Request): Promise<boolean> {
  const auth = req.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) return false;

  const parts = auth.slice(7).split('.');
  if (parts.length !== 3) return false;

  try {
    const key = await getKey();
    const data = `${parts[0]}.${parts[1]}`;
    const sigBytes = Uint8Array.from(
      atob(parts[2].replace(/-/g, '+').replace(/_/g, '/')),
      (c) => c.charCodeAt(0),
    );
    const valid = await crypto.subtle.verify('HMAC', key, sigBytes, encoder.encode(data));
    if (!valid) return false;

    const header = JSON.parse(b64urlDecode(parts[0]));
    if (header.alg !== 'HS256') return false;

    const payload = JSON.parse(b64urlDecode(parts[1]));
    // exp и роль обязательны: токен без срока или без роли не принимаем.
    if (payload.role !== 'admin') return false;
    if (typeof payload.exp !== 'number' || payload.exp < Math.floor(Date.now() / 1000)) return false;

    return true;
  } catch {
    return false;
  }
}

export function unauthorized(): Response {
  return new Response(JSON.stringify({ error: 'Unauthorized' }), {
    status: 401,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
