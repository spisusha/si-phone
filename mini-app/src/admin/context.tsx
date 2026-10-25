import { createContext, useContext, useMemo } from 'react';
import type { ACost, AdminAuth, AItem, AModel, CatalogData } from './api';

// Общие данные админки: кто вошёл, каталог с закупкой, курс и наценки + удобные справочники.

export interface AdminState {
  auth: AdminAuth;
  data: CatalogData;
  reload: () => Promise<void>;
  call: <T>(action: string, payload?: Record<string, unknown>) => Promise<T>;
  logout: (() => void) | null;   // в Telegram выхода нет — вход по аккаунту
}

export const AdminContext = createContext<AdminState | null>(null);

export function useAdmin(): AdminState {
  const s = useContext(AdminContext);
  if (!s) throw new Error('AdminContext');
  return s;
}

export interface Derived {
  modelById: Map<string, AModel>;
  itemById: Map<number, AItem>;
  costById: Map<number, ACost>;
  markup: Record<string, number>;
  fxMargin: number;
  usd: number | null;          // доллар ЦБ (последний)
  shopRate: number | null;     // курс магазина = ЦБ × (1 + надбавка)
}

export function useDerived(): Derived {
  const { data } = useAdmin();
  return useMemo(() => {
    const markup: Record<string, number> = {};
    for (const m of data.markups) markup[m.category] = Number(m.percent);
    const fxMargin = Number(data.fxMargin);
    const usd = data.fx[0] ? Number(data.fx[0].usd_cbr) : null;
    return {
      modelById: new Map(data.models.map((m) => [m.id, m])),
      itemById: new Map(data.items.map((i) => [i.id, i])),
      costById: new Map(data.costs.map((c) => [c.item_id, c])),
      markup,
      fxMargin,
      usd,
      shopRate: usd != null ? usd * (1 + fxMargin / 100) : null,
    };
  }, [data]);
}
