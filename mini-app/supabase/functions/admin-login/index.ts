import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, withCors } from '../_shared/cors.ts';
import { fingerprint } from '../_shared/privacy.ts';
import { signAdminToken, signDeviceToken, verifyDeviceToken } from '../_shared/adminAuth.ts';

// Ограничение подбора пароля за 15 минут:
// - не больше 5 ошибок с одного адреса (IPv6 — с одного блока /64);
// - общий потолок 300 ошибок — против перебора сразу со множества адресов.
//   Владельца он не касается: после верного пароля устройство получает подписанную
//   метку на 90 дней, и с ней общий потолок снимается (чужой перебор не закроет вход);
// - пауза 1,5 с после каждой ошибки.
// Даже при потолке это ~29 тыс. попыток в сутки — для случайного пароля от 16 символов
// подбор нереален. Поэтому слабый пароль (короткий или только цифры) не принимаем вовсе.
const WINDOW_MIN = 15;
const MAX_FAILS_PER_IP = 5;
const MAX_FAILS_PER_IP_TRUSTED = 20;
const MAX_FAILS_GLOBAL = 300;
const FAIL_DELAY_MS = 1500;
const MIN_PASSWORD_LENGTH = 16;

const encoder = new TextEncoder();

// Сравнение без утечки по времени: сравниваем SHA-256 обеих строк побайтно до конца.
async function safeEqual(a: string, b: string): Promise<boolean> {
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(a)),
    crypto.subtle.digest('SHA-256', encoder.encode(b)),
  ]);
  const x = new Uint8Array(ha);
  const y = new Uint8Array(hb);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

// IPv6: у одного абонента обычно целый блок /64 — считаем по нему,
// иначе смена адреса внутри блока обходила бы лимит.
function normalizeIp(ip: string): string {
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(ip);
  if (mapped) return mapped[1]; // IPv4, записанный как IPv6
  if (!ip.includes(':')) return ip;
  const [head, tail = ''] = ip.toLowerCase().split('%')[0].split('::');
  const h = head ? head.split(':') : [];
  const t = tail ? tail.split(':') : [];
  const full = [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill('0'), ...t];
  return `${full.slice(0, 4).map((x) => x || '0').join(':')}::/64`;
}

// Адрес клиента — из заголовка, который ставит инфраструктура, а не браузер.
// Левую часть x-forwarded-for клиент подделывает сам, поэтому её не берём.
function clientIp(req: Request): string {
  const cf = req.headers.get('cf-connecting-ip')?.trim();
  if (cf) return normalizeIp(cf);
  const chain = (req.headers.get('x-forwarded-for') || '').split(',').map((s) => s.trim()).filter(Boolean);
  return chain.length ? normalizeIp(chain[chain.length - 1]) : 'unknown';
}

Deno.serve(withCors(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const json = (d: unknown, status = 200) =>
    new Response(JSON.stringify(d), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  try {
    const secret = Deno.env.get('ADMIN_PASSWORD') ?? '';
    if (secret.length < MIN_PASSWORD_LENGTH || /^\d+$/.test(secret)) {
      console.error('admin-login: ADMIN_PASSWORD не задан, короче 16 символов или из одних цифр');
      return json({ error: 'Вход в админку не настроен' }, 500);
    }

    const sb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const ip = clientIp(req);
    const body = (await req.json().catch(() => ({}))) as { password?: string; pin?: string; deviceToken?: string };
    const trusted = await verifyDeviceToken(body.deviceToken);

    // Попытка записывается ДО проверки пароля одной операцией в базе (с блокировкой по адресу),
    // поэтому пачка одновременных запросов не обойдёт лимит.
    const { data: attemptId, error: limitErr } = await sb.rpc('admin_login_begin', {
      p_ip_key: await fingerprint('login-ip', ip), // в базу — только отпечаток адреса, сутки
      p_window_min: WINDOW_MIN,
      p_max_fails: trusted ? MAX_FAILS_PER_IP_TRUSTED : MAX_FAILS_PER_IP,
      p_max_global: trusted ? null : MAX_FAILS_GLOBAL,
    });
    // Не смогли проверить лимит — не пускаем (а не «пускаем, раз проверка сломалась»).
    if (limitErr) {
      console.error('admin-login: rate limit check failed', limitErr.message);
      return json({ error: 'Попробуйте позже' }, 503);
    }
    if (attemptId === null) {
      return json({ error: 'Слишком много попыток. Попробуйте через 15 минут' }, 429);
    }

    const input = String(body.password ?? body.pin ?? '').slice(0, 256);
    const ok = input.length > 0 && (await safeEqual(input, secret));

    if (!ok) {
      await new Promise((r) => setTimeout(r, FAIL_DELAY_MS));
      return json({ error: 'Неверный пароль' }, 401);
    }
    await sb.from('admin_login_attempts').update({ ok: true }).eq('id', attemptId);

    const { token, expiresAt } = await signAdminToken();
    const device = await signDeviceToken();
    return json({ token, expiresAt, deviceToken: device.token });
  } catch (err) {
    console.error('admin-login error:', err);
    return json({ error: 'Ошибка входа' }, 500);
  }
}));
