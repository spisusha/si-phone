import { supabase } from './supabaseClient';
import { getInitData } from '../telegram/telegramWebApp';

// Колесо подарков: всё решает сервер (функция wheel) — здесь только запросы.
// Без Telegram (обычный браузер) крутить нельзя. Исключение — локальная разработка (npm run dev):
// там работает демо-розыгрыш в памяти вкладки, чтобы показать колесо до выкладки сервера.
// В сборку для покупателей демо не попадает (import.meta.env.DEV = false).

export const GIFT_MIN_ORDER = 5000; // как в create-order
export const GIFT_DISCOUNT = 1000;

export interface WheelSector { key: string; short: string }

/** Секторы для картинки, пока сервер не ответил или магазин открыт не в Telegram (как в базе) */
export const DEFAULT_SECTORS: WheelSector[] = [
  { key: 'glass', short: 'Стекло' },
  { key: 'delivery', short: 'Доставка 0 ₽' },
  { key: 'case', short: 'Чехол' },
  { key: 'discount', short: '−1 000 ₽' },
  { key: 'again', short: 'Ещё раз' },
];
export interface WheelGift {
  prize: string;
  title: string;
  code: string | null;
  expiresAt: string | null;
  usedAt: string | null;
  nextSpinAt: string;
}
export interface WheelState {
  ok: true;
  sectors: WheelSector[];
  canSpin: boolean;
  gift: WheelGift | null;
  result?: 'won' | 'again' | 'already';
  prize?: string;
  demo?: boolean;
}
export type WheelReply = WheelState | { ok: false; error: string; notTelegram?: boolean };

const NOT_IN_TELEGRAM = 'Колесо работает в магазине внутри Telegram';
const GENERIC_ERROR = 'Колесо временно не работает. Попробуйте позже';

async function call(action: 'status' | 'spin'): Promise<WheelReply> {
  const initData = getInitData();
  if (!initData) {
    if (import.meta.env.DEV) return demo(action);
    return { ok: false, error: NOT_IN_TELEGRAM, notTelegram: true };
  }
  if (!supabase) return { ok: false, error: GENERIC_ERROR };
  try {
    const { data, error } = await supabase.functions.invoke<WheelReply>('wheel', { body: { action, initData } });
    if (error) {
      const ctx = (error as { context?: Response }).context;
      const body = ctx ? await ctx.json().catch(() => null) : null;
      return { ok: false, error: body?.error || GENERIC_ERROR };
    }
    return data ?? { ok: false, error: GENERIC_ERROR };
  } catch {
    return { ok: false, error: GENERIC_ERROR };
  }
}

export const getWheelStatus = () => call('status');
export const spinWheel = () => call('spin');

/* ── Демо только для локальной разработки: те же призы и веса, что в базе ── */
const DEMO_PRIZES = [
  { key: 'glass', short: 'Стекло', title: 'Защитное стекло с оклейкой', weight: 35 },
  { key: 'delivery', short: 'Доставка 0 ₽', title: 'Бесплатная доставка по Москве', weight: 30 },
  { key: 'case', short: 'Чехол', title: 'Чехол в подарок', weight: 20 },
  { key: 'discount', short: '−1 000 ₽', title: 'Скидка 1 000 ₽ на заказ', weight: 10 },
  { key: 'again', short: 'Ещё раз', title: 'Крутите ещё раз', weight: 5 },
];

function demo(action: 'status' | 'spin'): WheelReply {
  const sectors = DEMO_PRIZES.map(({ key, short }) => ({ key, short }));
  let gift: WheelGift | null = null;
  try { gift = JSON.parse(sessionStorage.getItem('wheel-demo') ?? 'null'); } catch { /* ignore */ }
  if (action === 'status' || gift) {
    return { ok: true, demo: true, sectors, gift, canSpin: !gift, ...(action === 'spin' ? { result: 'already' as const } : {}) };
  }
  const forced = new URLSearchParams(window.location.search).get('prize'); // ?prize=again — показать «ещё раз»
  const total = DEMO_PRIZES.reduce((s, p) => s + p.weight, 0);
  let r = Math.random() * total;
  const p = DEMO_PRIZES.find((x) => x.key === forced) ?? DEMO_PRIZES.find((x) => (r -= x.weight) < 0) ?? DEMO_PRIZES[0];
  if (p.key === 'again') return { ok: true, demo: true, sectors, gift: null, canSpin: true, result: 'again', prize: 'again' };
  const now = Date.now();
  gift = {
    prize: p.key, title: p.title, code: 'SI-' + Math.random().toString(36).slice(2, 6).toUpperCase(),
    expiresAt: new Date(now + 30 * 864e5).toISOString(), usedAt: null, nextSpinAt: new Date(now + 30 * 864e5).toISOString(),
  };
  try { sessionStorage.setItem('wheel-demo', JSON.stringify(gift)); } catch { /* ignore */ }
  return { ok: true, demo: true, sectors, gift, canSpin: false, result: 'won', prize: p.key };
}
