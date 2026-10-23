// JWT signing & verification using built-in Web Crypto API — no external deps

import { corsHeaders } from './cors.ts';

const encoder = new TextEncoder();

// Срок жизни токена админа. Отозвать все токены сразу — сменить секрет ADMIN_TOKEN_SECRET.
const TOKEN_TTL_SEC = 12 * 60 * 60;
const DEVICE_TTL_SEC = 90 * 24 * 60 * 60;

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

type TokenRole = 'admin' | 'device';

async function signToken(role: TokenRole, ttlSec: number): Promise<{ token: string; expiresAt: string }> {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + ttlSec;

  const header = b64urlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64urlEncode(JSON.stringify({ role, iat: now, exp }));
  const data = `${header}.${payload}`;

  const key = await getKey();
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(data));

  return {
    token: `${data}.${b64url(sig)}`,
    expiresAt: new Date(exp * 1000).toISOString(),
  };
}

async function verifyToken(token: string, role: TokenRole): Promise<boolean> {
  const parts = token.split('.');
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
    // exp и роль обязательны: токен без срока или с чужой ролью не принимаем
    // (метка устройства не открывает админку, токен админа не заменяет метку).
    if (payload.role !== role) return false;
    if (typeof payload.exp !== 'number' || payload.exp < Math.floor(Date.now() / 1000)) return false;

    return true;
  } catch {
    return false;
  }
}

export function signAdminToken(): Promise<{ token: string; expiresAt: string }> {
  return signToken('admin', TOKEN_TTL_SEC);
}

export async function verifyAdminToken(req: Request): Promise<boolean> {
  const auth = req.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) return false;
  return verifyToken(auth.slice(7), 'admin');
}

// «Доверенное устройство»: выдаётся после верного пароля и живёт 90 дней.
// Сама по себе ничего не открывает — только снимает с владельца общий потолок
// неудачных попыток, чтобы чужой перебор не мог закрыть ему вход.
export function signDeviceToken(): Promise<{ token: string; expiresAt: string }> {
  return signToken('device', DEVICE_TTL_SEC);
}

export function verifyDeviceToken(token: unknown): Promise<boolean> {
  return typeof token === 'string' && token.length < 2048 ? verifyToken(token, 'device') : Promise.resolve(false);
}

export function unauthorized(): Response {
  return new Response(JSON.stringify({ error: 'Unauthorized' }), {
    status: 401,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
