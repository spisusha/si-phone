import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.98.0';
import { corsHeaders, withCors } from '../_shared/cors.ts';
import { verifyInitData } from '../_shared/telegramInitData.ts';
import { fingerprint } from '../_shared/privacy.ts';

// Колесо подарков (Роман, 29.10.2026). Всё решает сервер — телефон только показывает анимацию
// до сектора, который вернул сервер (иначе приз «накрутят»).
//   status — что у покупателя сейчас: можно ли крутить, какой приз действует;
//   spin   — розыгрыш: подпись Telegram, «раз в 30 дней» на аккаунт, приз по весам из wheel_prizes.
// Покупатель узнаётся по отпечатку Telegram ID (тот же, что у заказов): имени и ID в базе нет.

const INIT_DATA_MAX_AGE_SEC = 24 * 60 * 60;
const PERIOD_DAYS = 30;          // одна попытка в 30 дней, приз действует 30 дней
const AGAIN_PER_DAY = 3;         // «ещё раз» — не больше трёх в сутки, дальше только призы
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // без похожих 0/O, 1/I/L

interface Prize { key: string; title: string; short: string; weight: number; sort: number }
interface SpinRow { prize_key: string; code: string | null; created_at: string; expires_at: string | null; used_at?: string | null }

const json = (d: unknown, status = 200) =>
  new Response(JSON.stringify(d), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

function randomInt(max: number): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] % max;
}

function pickPrize(prizes: Prize[]): Prize {
  const total = prizes.reduce((s, p) => s + p.weight, 0);
  let r = randomInt(total);
  for (const p of prizes) {
    if (r < p.weight) return p;
    r -= p.weight;
  }
  return prizes[prizes.length - 1];
}

function newCode(): string {
  let s = '';
  for (let i = 0; i < 4; i++) s += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return `SI-${s}`;
}

Deno.serve(withCors(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405);

  try {
    const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN') ?? '';
    const body = (await req.json().catch(() => ({}))) as { action?: string; initData?: string };
    const user = await verifyInitData(String(body.initData ?? ''), botToken, INIT_DATA_MAX_AGE_SEC);
    if (!user) return json({ ok: false, code: 'not_telegram', error: 'Откройте магазин через Telegram, чтобы крутить колесо' }, 401);

    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const userKey = await fingerprint('order-user', String(user.id));

    const { data: prizeRows, error: pErr } = await sb.from('wheel_prizes')
      .select('key, title, short, weight, sort').eq('active', true).order('sort');
    if (pErr) throw new Error(pErr.message);
    const prizes = (prizeRows ?? []) as Prize[];
    const titleOf = (key: string) => prizes.find((p) => p.key === key)?.title ?? key;
    const sectors = prizes.map(({ key, short }) => ({ key, short }));

    // Последний настоящий приз за 30 дней (не «ещё раз»)
    const since = new Date(Date.now() - PERIOD_DAYS * 864e5).toISOString();
    const { data: last } = await sb.from('wheel_spins')
      .select('prize_key, code, created_at, expires_at, used_at')
      .eq('user_key', userKey).neq('prize_key', 'again').gt('created_at', since)
      .order('created_at', { ascending: false }).limit(1).maybeSingle();

    const state = (s: SpinRow | null) => s && {
      prize: s.prize_key, title: titleOf(s.prize_key), code: s.code,
      expiresAt: s.expires_at, usedAt: s.used_at ?? null,
      nextSpinAt: new Date(new Date(s.created_at).getTime() + PERIOD_DAYS * 864e5).toISOString(),
    };

    if (body.action === 'status') {
      return json({ ok: true, sectors, gift: state(last as SpinRow | null), canSpin: !last });
    }

    if (body.action !== 'spin') return json({ ok: false, error: 'Неизвестное действие' }, 400);
    if (last) return json({ ok: true, sectors, result: 'already', gift: state(last as SpinRow), canSpin: false });

    // «Ещё раз» не больше AGAIN_PER_DAY в сутки — дальше разыгрываются только призы
    const dayAgo = new Date(Date.now() - 864e5).toISOString();
    const { count: againToday } = await sb.from('wheel_spins')
      .select('id', { count: 'exact', head: true })
      .eq('user_key', userKey).eq('prize_key', 'again').gt('created_at', dayAgo);
    const pool = prizes.filter((p) => p.weight > 0 && (p.key !== 'again' || (againToday ?? 0) < AGAIN_PER_DAY));
    if (!pool.length) return json({ ok: false, error: 'Колесо временно не работает' }, 503);
    const prize = pickPrize(pool);

    // Код уникальный: при редком совпадении — новая попытка
    for (let attempt = 0; attempt < 5; attempt++) {
      const { data, error } = await sb.rpc('wheel_spin', {
        p_user_key: userKey, p_prize_key: prize.key, p_code: newCode(), p_days: PERIOD_DAYS,
      });
      if (error) {
        if (/duplicate key|wheel_spins_code_key/.test(error.message)) continue;
        throw new Error(error.message);
      }
      const r = data as SpinRow & { status: string };
      if (r.status === 'already') return json({ ok: true, sectors, result: 'already', gift: state(r), canSpin: false });
      if (r.prize_key === 'again') return json({ ok: true, sectors, result: 'again', prize: 'again', canSpin: true });
      return json({ ok: true, sectors, result: 'won', prize: r.prize_key, gift: state(r), canSpin: false });
    }
    throw new Error('не удалось подобрать код');
  } catch (err) {
    console.error('wheel error:', err instanceof Error ? err.message : err);
    return json({ ok: false, error: 'Колесо временно не работает. Попробуйте позже' }, 500);
  }
}));
