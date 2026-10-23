import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, withCors } from '../_shared/cors.ts';
import { signAdminToken } from '../_shared/adminAuth.ts';

// Ограничение подбора пароля: не больше 5 неудачных попыток с одного адреса за 15 минут
// и пауза после каждой ошибки. Общей блокировки на всех нет — иначе злоумышленник
// мог бы нарочно ошибаться и не пускать в админку самого владельца.
const WINDOW_MIN = 15;
const MAX_FAILS_PER_IP = 5;
const FAIL_DELAY_MS = 1500;
// 6-значный PIN подбирается перебором — требуем длинный пароль.
const MIN_PASSWORD_LENGTH = 12;

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

// Адрес клиента — из заголовка, который ставит инфраструктура, а не браузер.
// Левую часть x-forwarded-for клиент подделывает сам, поэтому её не берём.
// После выкладки сверить по логам, что адрес определяется (не 'unknown').
function clientIp(req: Request): string {
  const cf = req.headers.get('cf-connecting-ip')?.trim();
  if (cf) return cf;
  const chain = (req.headers.get('x-forwarded-for') || '').split(',').map((s) => s.trim()).filter(Boolean);
  return chain[chain.length - 1] || 'unknown';
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
    if (secret.length < MIN_PASSWORD_LENGTH) {
      console.error('admin-login: ADMIN_PASSWORD не задан или короче 12 символов');
      return json({ error: 'Вход в админку не настроен' }, 500);
    }

    const sb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const ip = clientIp(req);

    // Попытка записывается ДО проверки пароля одной операцией в базе (с блокировкой по адресу),
    // поэтому пачка одновременных запросов не обойдёт лимит.
    const { data: attemptId, error: limitErr } = await sb.rpc('admin_login_begin', {
      p_ip: ip, p_window_min: WINDOW_MIN, p_max_fails: MAX_FAILS_PER_IP,
    });
    // Не смогли проверить лимит — не пускаем (а не «пускаем, раз проверка сломалась»).
    if (limitErr) {
      console.error('admin-login: rate limit check failed', limitErr.message);
      return json({ error: 'Попробуйте позже' }, 503);
    }
    if (attemptId === null) {
      return json({ error: 'Слишком много попыток. Попробуйте через 15 минут' }, 429);
    }

    const body = (await req.json().catch(() => ({}))) as { password?: string; pin?: string };
    const input = String(body.password ?? body.pin ?? '').slice(0, 256);
    const ok = input.length > 0 && (await safeEqual(input, secret));

    if (!ok) {
      await new Promise((r) => setTimeout(r, FAIL_DELAY_MS));
      return json({ error: 'Неверный пароль' }, 401);
    }
    await sb.from('admin_login_attempts').update({ ok: true }).eq('id', attemptId);

    const { token, expiresAt } = await signAdminToken();
    return json({ token, expiresAt });
  } catch (err) {
    console.error('admin-login error:', err);
    return json({ error: 'Ошибка входа' }, 500);
  }
}));
