// Связь админки с сервером (функция admin-catalog). Доступ проверяет сервер на каждый запрос:
// в Telegram — подписанная initData и ID из списка админов; в браузере — токен после входа по паролю.

const BASE = import.meta.env.VITE_SUPABASE_URL as string;
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export type AdminAuth = { kind: 'tg'; initData: string } | { kind: 'password'; token: string };

export class AdminError extends Error {
  status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}

export async function adminCall<T>(auth: AdminAuth, action: string, payload: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(`${BASE}/functions/v1/admin-catalog`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: ANON,
      Authorization: `Bearer ${auth.kind === 'password' ? auth.token : ANON}`,
    },
    body: JSON.stringify({ action, ...payload, ...(auth.kind === 'tg' ? { initData: auth.initData } : {}) }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new AdminError(data.error || `Ошибка ${res.status}`, res.status);
  return data as T;
}

// ---------- данные ----------

export interface AModel { id: string; category: 'iPhone' | 'iPad' | 'MacBook' | 'Watch' | 'AirPods'; title: string; sort: number }
export interface AItem {
  id: number; model_id: string; name: string; storage: string | null; color: string | null; sim: string | null;
  size: string | null; chip: string | null; ram_ssd: string | null; band: string | null; keyboard: string | null;
  price: number; status: 'в наличии' | 'уточнить'; visible: boolean; photo_url: string | null; confirmed_at: string | null;
}
export interface ACost { item_id: number; purchase_price: number; purchase_date: string; source: string | null }
export interface AFx { rate_date: string; usd_cbr: string; source: string | null; fetched_at: string }
export interface CatalogData {
  who: string;
  models: AModel[];
  items: AItem[];
  costs: ACost[];
  markups: { category: string; percent: string | number }[];
  fxMargin: string | number;
  fx: AFx[];
}

export interface PreviewLine {
  line: number; text: string; price: number | null;
  kind: 'match' | 'choose' | 'unknown' | 'skip';
  itemId?: number; candidates?: number[]; reason?: string;
}

export interface HistoryData {
  changes: Array<{
    id: number; item_id: number; old_purchase: number | null; new_purchase: number | null;
    old_status: string | null; new_status: string | null; old_visible: boolean | null; new_visible: boolean | null;
    source: string; who: string; at: string; catalog_items: { name: string } | null;
  }>;
  imports: Array<{ id: number; at: string; who: string; source: string; lines: number; matched: number; applied: number }>;
  settings: Array<{ id: number; at: string; who: string; what: string }>;
}

// ---------- помощники ----------

export const rub = (n: number | null | undefined) => (n == null ? '—' : `${Math.round(n).toLocaleString('ru-RU')} ₽`);
export const round500 = (n: number) => Math.round(n / 500) * 500;
export const fmtDate = (s: string | null | undefined) =>
  s ? new Date(s).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

/** Подтверждённая цена (из прайса или вручную) — 2 дня такие позиции выше в магазине */
export const isFresh = (confirmedAt: string | null) => !!confirmedAt && Date.now() - new Date(confirmedAt).getTime() < 2 * 24 * 3600 * 1000;

/** «iPhone 17 Pro Max 256GB Cosmic Orange eSIM» без названия модели → «256GB Cosmic Orange eSIM» */
export function shortName(item: AItem, modelTitle: string): string {
  const s = item.name.startsWith(modelTitle) ? item.name.slice(modelTitle.length).trim() : item.name;
  return s || item.name;
}
