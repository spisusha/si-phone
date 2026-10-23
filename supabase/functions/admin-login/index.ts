import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, withCors } from '../_shared/cors.ts';
import { signAdminToken } from '../_shared/adminAuth.ts';

// Ограничение подбора пароля: не больше 5 неудачных попыток с одного адреса
// и 30 неудачных попыток всего за 15 минут.
const WINDOW_MIN = 15;
const MAX_FAILS_PER_IP = 5;
const MAX_FAILS_TOTAL = 30;
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

function clientIp(req: Request): string {
  return (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
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
    const since = new Date(Date.now() - WINDOW_MIN * 60_000).toISOString();

    const [{ count: ipFails, error: e1 }, { count: totalFails, error: e2 }] = await Promise.all([
      sb.from('admin_login_attempts').select('id', { count: 'exact', head: true })
        .eq('ip', ip).eq('ok', false).gte('created_at', since),
      sb.from('admin_login_attempts').select('id', { count: 'exact', head: true })
        .eq('ok', false).gte('created_at', since),
    ]);
    // Не смогли проверить лимит — не пускаем (а не «пускаем, раз проверка сломалась»).
    if (e1 || e2) {
      console.error('admin-login: rate limit check failed', e1?.message ?? e2?.message);
      return json({ error: 'Попробуйте позже' }, 503);
    }
    if ((ipFails ?? 0) >= MAX_FAILS_PER_IP || (totalFails ?? 0) >= MAX_FAILS_TOTAL) {
      return json({ error: 'Слишком много попыток. Попробуйте через 15 минут' }, 429);
    }

    const body = (await req.json().catch(() => ({}))) as { password?: string; pin?: string };
    const input = String(body.password ?? body.pin ?? '').slice(0, 256);
    const ok = input.length > 0 && (await safeEqual(input, secret));

    await sb.from('admin_login_attempts').insert({ ip, ok });

    if (!ok) return json({ error: 'Неверный пароль' }, 401);

    const { token, expiresAt } = await signAdminToken();
    return json({ token, expiresAt });
  } catch (err) {
    console.error('admin-login error:', err);
    return json({ error: 'Ошибка входа' }, 500);
  }
}));
