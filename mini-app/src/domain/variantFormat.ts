import type { CartItem, VariantOptions } from './types';

export function formatStorage(gb: number | string): string {
  const n = Number(gb);
  return n >= 1024 ? `${n / 1024} ТБ` : `${n} ГБ`;
}

// MacBook: «16GB/512GB» → «16 ГБ / 512 ГБ», «24GB/1TB» → «24 ГБ / 1 ТБ»
export function formatMemStorage(v: string): string {
  return v.replace(/(\d+)\s*GB/gi, '$1 ГБ').replace(/(\d+)\s*TB/gi, '$1 ТБ').replace('/', ' / ');
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
  if (opts.memStorage) parts.push(formatMemStorage(String(opts.memStorage)));
  if (opts.storage) parts.push(formatStorage(opts.storage));
  const color = opts.colorLabel || opts.color;
  if (color) parts.push(prettifyColor(String(color)));
  if (opts.simType) parts.push(String(opts.simType));
  if (opts.connectivity) parts.push(String(opts.connectivity));
  if (opts.size) parts.push(String(opts.size));
  if (opts.anc === 'Да') parts.push('с шумоподавлением');
  if (opts.ruKeyboard && String(opts.ruKeyboard) !== 'false') parts.push('РУС клавиатура');
  if (opts.keyboard === 'РУС') parts.push('РУС клавиатура');
  return parts;
}

// «Apple iPhone 17 Pro Max • 256 ГБ • Cosmic Orange» → заголовок «iPhone 17 Pro Max»
// и строка «256 ГБ · Cosmic Orange · eSIM» (из опций, а если их нет — из хвоста названия).
export function cartItemDisplay(item: Pick<CartItem, 'titleSnapshot' | 'optionsSnapshot' | 'strap'>): { title: string; subtitle: string } {
  // В старых корзинах части названия разделены « • », в новых — «, »
  const [head, ...rest] = item.titleSnapshot.split(/ • |, /);
  const title = head.replace(/^Apple\s+/, '');
  const fromOptions = describeOptions(item.optionsSnapshot).filter((p) => !title.toLowerCase().includes(p.toLowerCase()));
  const parts = fromOptions.length ? fromOptions : rest;
  return { title, subtitle: [...parts, ...(item.strap ? [`ремешок ${item.strap}`] : [])].join(', ') };
}
