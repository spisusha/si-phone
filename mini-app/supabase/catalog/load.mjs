// Загрузка нашей таблицы каталога в Supabase (этап B1).
// Скрипт ничего не отправляет сам: он собирает SQL-файл, а применяем его потом командой
//   npx supabase db query --linked --file <файл>
// Ключи не нужны. В файле лежат закупочные цены, поэтому пишем его ВНЕ репозитория.
//
// Запуск: node supabase/catalog/load.mjs <папка-для-sql>
//   → <папка>/catalog-load.sql   — модели, товары, закупка, пересчёт цен
//   → <папка>/photos-upload/     — только .webp, для загрузки в хранилище products/catalog/
//
// Порядок на сервере: миграция 20261024000000_catalog_v2 → fetch_cbr_usd() (курс на сегодня) → этот SQL.
// Закупка запоминается по курсу магазина на сегодня, поэтому сегодня цена = закупка × (1 + наценка).

import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = process.argv[2];
if (!OUT) {
  console.error('Укажите папку для SQL (вне репозитория): node supabase/catalog/load.mjs <папка>');
  process.exit(1);
}
if (OUT.replace(/\\/g, '/').includes('/si-phone/')) {
  console.error('Папка внутри репозитория — нельзя: в SQL закупочные цены.');
  process.exit(1);
}

const PROJECT_URL = 'https://zudohmttvlibpugravgb.supabase.co';
const PHOTO_BASE = `${PROJECT_URL}/storage/v1/object/public/products/catalog`;
const PHOTO_VERSION = '1'; // поменять, если перезаливаем фото с теми же именами (сброс кэша у покупателей)

// ---------- чтение CSV ----------
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field.replace(/\r$/, '')); rows.push(row); row = []; field = ''; }
    else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const head = rows[0];
  return rows.slice(1).filter((r) => r.length > 1).map((r) => Object.fromEntries(head.map((k, i) => [k, (r[i] ?? '').trim()])));
}

const rows = parseCsv(readFileSync(join(HERE, 'si-phone-catalog.csv'), 'utf8').replace(/^﻿/, ''));

// ---------- цвета (кружки на витрине) ----------
// Приближённые цвета корпуса Apple. Ключ — «Категория|Цвет», запасной — просто «Цвет».
const HEX = {
  'Star White': '#F2F1EC', 'Night Sky': '#2B3140', 'Black': '#2E2E30', 'Silver': '#E3E4E5',
  'Burgundy': '#6E2B3A', 'Glacier': '#D7E4EA', 'Cosmic Orange': '#E8742C', 'Deep Blue': '#2F3D57',
  'Space Black': '#2C2C2E', 'Cloud White': '#F4F4F2', 'Light Gold': '#E9DCC3', 'Sky Blue': '#BFD6E6',
  'White': '#F5F5F3', 'Mist Blue': '#A9BCD0', 'Sage': '#B5BFA3', 'Lavender': '#CDBFE0', 'Soft Pink': '#F1D2D6',
  'Black Titanium': '#3C3C3D', 'White Titanium': '#ECEBE7', 'Natural Titanium': '#BEB7AC', 'Desert Titanium': '#C5A88A',
  'Pink': '#F3C6CF', 'Teal': '#A7CFCB', 'Ultramarine': '#7B83D6', 'Blue': '#9DB6CF', 'Green': '#C9D7BF',
  'Yellow': '#F4E39A', 'Midnight': '#2E3642', 'Starlight': '#EFE7DA', 'Purple': '#CFC3DD', 'Red': '#C4283A',
  'Space Gray': '#7D7E80', 'Blush': '#EBCFC9', 'Citrus': '#E6DE8C', 'Indigo': '#3D4A73',
  'Natural': '#C2BBAF', 'Dark Bronze': '#6B5848', 'Radiant Gold': '#D9C08F', 'Pearl White': '#F1EEE8',
  'Night Blue': '#2D3A55', 'Jet Black': '#1F1F21', 'Rose Gold': '#E6C7BC', 'Orange': '#E9935A',
  'iPad|Blue': '#A9C1DC', 'iPad|Purple': '#C9BEDF', 'iPad|Yellow': '#F2DE85', 'iPad|Pink': '#F0C3CC',
  'MacBook|Sky Blue': '#C8D9E6', 'Watch|Black': '#2B2B2D', 'Watch|Silver': '#DADBDC',
  'AirPods|Blue': '#7F9BC0', 'AirPods|Purple': '#B7A9CF', 'AirPods|Midnight': '#2E3540', 'AirPods|Starlight': '#ECE4D6',
};

// ---------- помощники ----------
const q = (v) => (v === null || v === undefined || v === '' ? 'null' : `'${String(v).replace(/'/g, "''")}'`);
const slug = (s) => s.toLowerCase().replace(/["″]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// ---------- проверки таблицы ----------
const problems = [];
const ids = new Set(), names = new Set();
for (const r of rows) {
  const id = Number(r.ID);
  if (!Number.isInteger(id) || id <= 0) problems.push(`плохой ID: ${r.ID}`);
  if (ids.has(id)) problems.push(`повтор ID ${id}`);
  ids.add(id);
  if (names.has(r['Название'])) problems.push(`повтор названия ${r['Название']}`);
  names.add(r['Название']);
  const price = Number(r['Цена, ₽']);
  if (!(price > 0)) problems.push(`нет цены у ID ${id}`);
  if (!['в наличии', 'уточнить'].includes(r['Наличие'])) problems.push(`Наличие у ID ${id}: «${r['Наличие']}»`);
  if (!['iPhone', 'iPad', 'MacBook', 'Watch', 'AirPods'].includes(r['Категория'])) problems.push(`категория у ID ${id}`);
  if (r['Фото'] && !existsSync(join(HERE, 'photos', `${r['Фото']}.webp`))) problems.push(`нет файла фото ${r['Фото']} (ID ${id})`);
  if (r['Цвет'] && !HEX[`${r['Категория']}|${r['Цвет']}`] && !HEX[r['Цвет']]) problems.push(`нет цвета для «${r['Цвет']}»`);
}
if (problems.length) {
  console.error('Таблица не прошла проверку:\n  ' + [...new Set(problems)].join('\n  '));
  process.exit(1);
}

// ---------- модели ----------
// Порядок в таблице: внутри категории сверху новые → больше sort.
const models = new Map();
rows.forEach((r, i) => {
  const id = slug(r['Модель']);
  if (!models.has(id)) models.set(id, { id, category: r['Категория'], title: r['Модель'], sort: 10000 - i });
});

// ---------- SQL ----------
const out = [];
out.push('-- Сгенерировано supabase/catalog/load.mjs. Содержит закупочные цены — не коммитить, не пересылать.');
out.push('begin;');
out.push(`do $$ begin if public.shop_rate() is null then raise exception 'сначала нужен курс: select public.fetch_cbr_usd();'; end if; end $$;`);

out.push('insert into public.catalog_models (id, category, title, sort) values');
out.push([...models.values()].map((m) => `  (${q(m.id)}, ${q(m.category)}, ${q(m.title)}, ${m.sort})`).join(',\n'));
out.push('on conflict (id) do update set category = excluded.category, title = excluded.title, sort = excluded.sort;');

const itemCols = ['id', 'model_id', 'name', 'year', 'storage', 'color', 'color_ru', 'color_hex', 'sim', 'size', 'chip', 'ram_ssd', 'band', 'keyboard', 'status', 'visible', 'photo_key', 'photo_url', 'synonyms', 'apple_parts'];
out.push(`insert into public.catalog_items (${itemCols.join(', ')}) values`);
out.push(rows.map((r) => {
  const hex = r['Цвет'] ? HEX[`${r['Категория']}|${r['Цвет']}`] || HEX[r['Цвет']] : null;
  const photo = r['Фото'] ? `${PHOTO_BASE}/${r['Фото']}.webp?v=${PHOTO_VERSION}` : null;
  const vals = [
    Number(r.ID), q(slug(r['Модель'])), q(r['Название']), r['Год'] ? Number(r['Год']) : 'null',
    q(r['Память']), q(r['Цвет']), q(r['Цвет (рус)']), q(hex), q(r['SIM/связь']), q(r['Размер']), q(r['Чип']),
    q(r['RAM/SSD']), q(r['Корпус/ремешок']), q(r['Клавиатура'] === 'РУС' ? 'РУС' : ''), q(r['Наличие']),
    r['Показывать'] === 'нет' ? 'false' : 'true', q(r['Фото']), q(photo), q(r['Синонимы']), q(r['Артикул Apple']),
  ];
  return `  (${vals.join(', ')})`;
}).join(',\n'));
out.push(`on conflict (id) do update set ${itemCols.filter((c) => c !== 'id').map((c) => `${c} = excluded.${c}`).join(', ')}, updated_at = now();`);

out.push('insert into public.catalog_costs (item_id, purchase_price, purchase_rate, purchase_date, source) values');
out.push(rows.map((r) => `  (${Number(r.ID)}, ${Number(r['Цена, ₽'])}, public.shop_rate(), current_date, ${q(r['Комментарий'] || 'таблица каталога 24.10.2026')})`).join(',\n'));
out.push('on conflict (item_id) do update set purchase_price = excluded.purchase_price, purchase_rate = excluded.purchase_rate, purchase_date = excluded.purchase_date, source = excluded.source, updated_at = now();');

out.push('select public.recalc_catalog_prices() as "пересчитано цен";');
out.push('commit;');

mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, 'catalog-load.sql'), out.join('\n') + '\n');

// ---------- фото для хранилища ----------
const photoDir = join(OUT, 'photos-upload');
mkdirSync(photoDir, { recursive: true });
const used = new Set(rows.map((r) => r['Фото']).filter(Boolean));
let copied = 0;
for (const f of readdirSync(join(HERE, 'photos'))) {
  if (f.endsWith('.webp') && used.has(f.replace(/\.webp$/, ''))) { copyFileSync(join(HERE, 'photos', f), join(photoDir, f)); copied++; }
}

const byCat = {};
for (const r of rows) byCat[r['Категория']] = (byCat[r['Категория']] || 0) + 1;
console.log(`Готово: моделей ${models.size}, товаров ${rows.length} (${Object.entries(byCat).map(([k, v]) => `${k} ${v}`).join(', ')}),`
  + ` «уточнить» ${rows.filter((r) => r['Наличие'] === 'уточнить').length}, фото ${copied}.`);
console.log(`SQL: ${join(OUT, 'catalog-load.sql')}`);
