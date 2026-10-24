import type { Variant } from '../domain/types';

/** Наличие товара для плашки: в наличии / уточнить у менеджера / нет. */
export type StockState = 'stock' | 'ask' | 'out';

export function stockState(variants: Variant[]): StockState {
  if (variants.some((v) => v.in_stock)) return 'stock';
  if (variants.some((v) => v.status === 'уточнить')) return 'ask';
  return 'out';
}

const TEXT: Record<StockState, string> = {
  stock: 'В наличии',
  ask: 'Цену и наличие уточняйте',
  out: 'Нет в наличии',
};

const CLS: Record<StockState, string> = { stock: 'badge-stock', ask: 'badge-ask', out: 'badge-out' };

export default function StockBadge({ state }: { state: StockState }) {
  return <span className={`badge ${CLS[state]}`}>{TEXT[state]}</span>;
}
