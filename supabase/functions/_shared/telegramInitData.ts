// Проверка initData из Telegram Mini App (официальный алгоритм, раздел
// «Validating data received via the Mini App»). Только этой строке можно верить:
// имя и id из initDataUnsafe на клиенте подделываются в два клика.

const encoder = new TextEncoder();

export interface TgUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
}

async function hmac(key: BufferSource, data: string): Promise<ArrayBuffer> {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return crypto.subtle.sign('HMAC', k, encoder.encode(data));
}

function hexToBytes(hex: string): Uint8Array | null {
  if (!/^[0-9a-f]{64}$/i.test(hex)) return null;
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/** Возвращает проверенного пользователя или null, если подпись/срок не подходят. */
export async function verifyInitData(
  initData: string,
  botToken: string,
  maxAgeSec: number,
): Promise<TgUser | null> {
  if (!initData || initData.length > 4096 || !botToken) return null;

  const params = new URLSearchParams(initData);
  const hash = hexToBytes(params.get('hash') ?? '');
  if (!hash) return null;
  params.delete('hash'); // signature не удаляем — так требует алгоритм

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');

  const secretKey = await hmac(encoder.encode('WebAppData'), botToken);
  const calculated = new Uint8Array(await hmac(secretKey, dataCheckString));
  if (!constantTimeEqual(calculated, hash)) return null;

  const authDate = Number(params.get('auth_date'));
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isInteger(authDate) || authDate <= 0) return null;
  if (now - authDate > maxAgeSec || authDate - now > 60) return null;

  try {
    const user = JSON.parse(params.get('user') ?? 'null');
    if (!user || !Number.isSafeInteger(user.id)) return null;
    return user as TgUser;
  } catch {
    return null;
  }
}
