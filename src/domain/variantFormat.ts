import type { CartItem, VariantOptions } from './types';

export function formatStorage(gb: number | string): string {
  const n = Number(gb);
  return n >= 1024 ? `${n / 1024} ТБ` : `${n} ГБ`;
}

// "cosmic_orange" → "Cosmic Orange"; "Белый" остаётся как есть.
function prettifyColor(value: string): string {
  if (!/^[a-z0-9_]+$/.test(value)) return value;
  return value
    .split('_')
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ');
}

/**
 * Характеристики варианта, понятные покупателю (память, цвет, SIM…).
 * Служебные поля поставщика (raw, supplierTitle, colorHex, _xmlid_audit, line, market, model)
 * сюда не попадают.
 */
export function describeOptions(opts: VariantOptions): string[] {
  const parts: string[] = [];
  if (opts.chip) parts.push(String(opts.chip));
  if (opts.memStorage) parts.push(String(opts.memStorage));
  if (opts.storage) parts.push(formatStorage(opts.storage));
  const color = opts.colorLabel || opts.color;
  if (color) parts.push(prettifyColor(String(color)));
  if (opts.simType) parts.push(String(opts.simType));
  if (opts.connectivity) parts.push(String(opts.connectivity));
  if (opts.size) parts.push(String(opts.size));
  if (opts.anc === 'Да') parts.push('с шумоподавлением');
  if (opts.ruKeyboard && String(opts.ruKeyboard) !== 'false') parts.push('RU');
  return parts;
}

// Строка под названием товара в корзине и заказе — без повтора того, что уже есть в названии.
export function cartItemSubtitle(item: Pick<CartItem, 'titleSnapshot' | 'optionsSnapshot'>): string {
  const title = item.titleSnapshot.toLowerCase();
  return describeOptions(item.optionsSnapshot)
    .filter((p) => !title.includes(p.toLowerCase()))
    .join(' · ');
}
