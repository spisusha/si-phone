import type { Category, ProductFamily, Variant } from './types';
import { stockState, type StockState } from '../components/StockBadge';

// Каталог «категория → поколение → линейка → карточки по цветам» (этап B2, решение Романа 24–25.10.2026).
// Поколение и линейку выводим из названия модели — отдельных колонок в базе для этого не нужно.

export interface ModelPlace {
  gen: string;   // первый уровень: «iPhone 18», «M5», «Ultra»; '' — уровня нет (AirPods)
  line: string;  // вкладка линейки: «17 Pro Max», «MacBook Air», «iPad Pro»
}

export function modelPlace(f: ProductFamily): ModelPlace {
  const t = f.title.replace(/^Apple\s+/, '');
  switch (f.category) {
    case 'iPhone': {
      // Air вышел вместе с 17-м, Duo — вместе с 18-м
      const n = /^iPhone (\d+)/.exec(t)?.[1] ?? (/Air/.test(t) ? '17' : /Duo/.test(t) ? '18' : '');
      return { gen: n ? `iPhone ${n}` : t, line: t.replace(/^iPhone\s+/, '') };
    }
    case 'MacBook': {
      // MacBook Neo — на чипе A18 Pro, но покупатель ищет его как «Neo»
      const chip = /Neo/.test(t) ? 'Neo' : /\b(M\d+)\b/.exec(t)?.[1] ?? '';
      const line = /Neo/.test(t) ? 'MacBook Neo' : /Pro/.test(t.replace(/M\d+ Pro|A\d+ Pro/, '')) ? 'MacBook Pro' : 'MacBook Air';
      return { gen: chip, line };
    }
    case 'iPad': {
      const chip = /\b(M\d+|A\d+ Pro|A\d+)\b/.exec(t)?.[1] ?? '';
      const line = /Pro/.test(t.replace(/A\d+ Pro/, '')) ? 'iPad Pro' : /Air/.test(t) ? 'iPad Air' : /mini/.test(t) ? 'iPad mini' : 'iPad';
      return { gen: chip, line };
    }
    case 'Watch': {
      // Сначала серия (Ultra / Series / SE), внутри — номер (Роман, 25.10.2026)
      const line = t.replace(/^Watch\s+/, '');
      return { gen: /Ultra/.test(line) ? 'Ultra' : /SE/.test(line) ? 'SE' : 'Series', line };
    }
    case 'AirPods':
      return { gen: '', line: /Max/.test(t) ? 'AirPods Max' : /Pro/.test(t) ? 'AirPods Pro' : 'AirPods' };
  }
}

export interface Tab { id: string; families: ProductFamily[] }

/** Вкладки по порядку: новые (больше popularity_score = выше в таблице каталога) — первыми. */
export function groupTabs(families: ProductFamily[], key: (f: ProductFamily) => string): Tab[] {
  const map = new Map<string, ProductFamily[]>();
  for (const f of [...families].sort((a, b) => b.popularity_score - a.popularity_score)) {
    const k = key(f);
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(f);
  }
  return [...map].map(([id, fs]) => ({ id, families: fs }));
}

export interface ColorCardData {
  key: string;
  family: ProductFamily;
  title: string;      // «iPhone 18 Pro Max»
  subtitle: string;   // цвет; у часов — корпус и ремешок
  image: string;
  minPrice: number;
  several: boolean;   // несколько конфигураций — пишем «от»
  state: StockState;
  href: string;
}

// «Apple» в названии не повторяем, кроме часов: «Apple Watch» — это и есть название
const stripApple = (s: string) => (/^Apple Watch/.test(s) ? s : s.replace(/^Apple\s+/, ''));

/**
 * Карточки по цветам: у iPhone, iPad, MacBook и AirPods Max — одна на цвет (память выбирают внутри),
 * у часов — одна на сочетание «корпус + ремешок» (размер выбирают внутри), у остальных AirPods — одна на модель.
 */
export function buildColorCards(families: ProductFamily[], variants: Variant[]): ColorCardData[] {
  const byFamily = new Map<string, Variant[]>();
  for (const v of variants) {
    if (!byFamily.has(v.family_id)) byFamily.set(v.family_id, []);
    byFamily.get(v.family_id)!.push(v);
  }
  const cards: ColorCardData[] = [];
  for (const f of families) {
    const fv = byFamily.get(f.id) ?? [];
    const groups = new Map<string, Variant[]>();
    for (const v of fv) {
      const k = f.category === 'Watch' ? String(v.options.band ?? v.id) : String(v.options.color ?? '');
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k)!.push(v);
    }
    for (const [k, vs] of groups) {
      const available = vs.filter((v) => v.in_stock);
      const pool = available.length ? available : vs;
      const prices = pool.map((v) => v.price).filter((p) => p > 0);
      const first = [...available, ...vs][0];
      let subtitle = String(first.options.colorLabel ?? '');
      let href = `/product/${f.id}${k ? `?color=${encodeURIComponent(k)}` : ''}`;
      if (f.category === 'Watch') {
        subtitle = String(first.options.band ?? '').replace(' / ', ', ');
        href = `/variant/${first.id}`;
      } else if (f.category === 'AirPods' && !/max/i.test(f.title)) {
        href = `/variant/${first.id}`;
      }
      cards.push({
        key: `${f.id}|${k}`,
        family: f,
        title: stripApple(f.title),
        subtitle,
        image: first.images[0] ?? f.images[0] ?? '',
        minPrice: prices.length ? Math.min(...prices) : 0,
        several: new Set(pool.map((v) => v.price)).size > 1,
        state: stockState(vs),
        href,
      });
    }
  }
  return cards;
}

export const CATEGORY_SLUG: Record<string, Category> = {
  iphone: 'iPhone',
  ipad: 'iPad',
  macbook: 'MacBook',
  watch: 'Watch',
  airpods: 'AirPods',
};
