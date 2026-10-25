// Отпечатки вместо персональных данных (152-ФЗ, решение Романа 25.10.2026).
// В базу пишем не Telegram ID и не IP, а HMAC-SHA256 от них: одинаковый вход — одинаковый отпечаток
// (лимиты работают), а обратно ID или IP без секрета сервера не восстановить и не подобрать перебором.
// Ключ выводится из ADMIN_TOKEN_SECRET отдельной меткой — токены админки им не подделать.
// Отпечатки живут сутки (privacy_cleanup в базе).

const encoder = new TextEncoder();
let keyPromise: Promise<CryptoKey> | null = null;

function hmacKey(raw: BufferSource): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
}

function privacyKey(): Promise<CryptoKey> {
  if (!keyPromise) {
    keyPromise = (async () => {
      const secret = Deno.env.get('ADMIN_TOKEN_SECRET') ?? '';
      if (secret.length < 16) throw new Error('ADMIN_TOKEN_SECRET not configured');
      const master = await hmacKey(encoder.encode(secret));
      const derived = await crypto.subtle.sign('HMAC', master, encoder.encode('si-phone/privacy-key/v1'));
      return hmacKey(derived);
    })();
    keyPromise.catch(() => { keyPromise = null; }); // не вышло (нет секрета) — в следующий раз попробуем снова
  }
  return keyPromise;
}

/** Отпечаток значения: 64 шестнадцатеричных символа. kind разделяет назначения ('order-user', 'login-ip'). */
export async function fingerprint(kind: string, value: string): Promise<string> {
  const sig = await crypto.subtle.sign('HMAC', await privacyKey(), encoder.encode(`${kind}:${value}`));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
