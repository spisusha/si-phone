// Сборщик фото каталога Si Phone (этап C).
// Для каждого ключа из колонки «Фото» берёт официальное фото Apple с прозрачным фоном,
// обрезает пустые края, ставит по центру квадрата 1000×1000 и сохраняет в photos/<ключ>.webp.
// Запуск (из папки mini-app):
//   SHARP_FROM=<папка, где установлен sharp> node supabase/catalog/photos.mjs [ключ ...]
// Без ключей — все. Готовые файлы не перекачивает (удалите файл, чтобы взять заново).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const sharp = createRequire(join(process.env.SHARP_FROM ?? here, 'noop.js'))('sharp');
const OUT = join(here, 'photos');
mkdirSync(OUT, { recursive: true });

const CDN = 'https://store.storeimages.cdn-apple.com/1/as-images.apple.com/is/';
const SHOP = 'https://www.apple.com/shop/';
const UA = { 'user-agent': 'Mozilla/5.0' };
const CANVAS = 1000, BOX = 880; // холст и максимальный размер товара на нём

// ---------- строки таблицы: ключ фото → описание ----------
function parseCsv(text) {
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') q = false; else cell += ch; }
    else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n') { row.push(cell.replace(/\r$/, '')); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [head, ...body] = rows;
  return body.filter((r) => r.length > 1).map((r) => Object.fromEntries(head.map((h, i) => [h.replace(/^﻿/, ''), r[i] ?? ''])));
}
const rows = parseCsv(readFileSync(join(here, 'si-phone-catalog.csv'), 'utf8'));
const keys = new Map();
for (const r of rows) if (!keys.has(r.Фото)) keys.set(r.Фото, r);

// ---------- откуда брать фото ----------
const squash = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const dash = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-');
const IPHONE = {
  'iphone-duo': (c) => [`iphone-duo-finish-select-${dash(c)}-202609`],
  'iphone-18-pro': (c) => [`iphone-18-pro-finish-select-${squash(c)}-202609`],
  'iphone-17-pro': (c) => [`iphone-17-pro-finish-select-${squash(c)}-202509`, `iphone-17-pro-finish-select-202509-6-3inch-${squash(c)}`, `iphone-17-pro-max-finish-select-${squash(c)}-202509`],
  'iphone-air': (c) => [`iphone-air-finish-select-${squash(c)}-202509`],
  'iphone-17': (c) => [`iphone-17-finish-select-${squash(c)}-202509_GEO_US`, `iphone-17-finish-select-${squash(c)}-202509`],
  'iphone-17e': (c) => [`iphone-17e-finish-select-${squash(c)}-202603`],
  'iphone-16-pro': (c) => [`iphone-16-pro-finish-select-202409-6-3inch-${squash(c)}`, `iphone-16-pro-finish-select-${squash(c)}-202409`],
  'iphone-16': (c) => [`iphone-16-${squash(c)}-select-202409`],
  'iphone-16e': (c) => [`iphone-16e-finish-select-202502-${squash(c)}`, `iphone-16e-finish-select-${squash(c)}-202502`, `iphone-16e-${squash(c)}-select-202502`],
  'iphone-15': (c) => [`iphone-15-finish-select-202309-6-1inch-${squash(c)}`],
  'iphone-14': (c) => (c === 'Red' ? ['iphone-14-finish-select-202209-6-1inch-product-red', 'iphone-14-finish-select-202209-6-1inch-red']
    : c === 'Yellow' ? ['iphone-14-finish-select-202303-6-1inch-yellow', 'iphone-14-finish-select-202209-6-1inch-yellow']
      : [`iphone-14-finish-select-202209-6-1inch-${squash(c)}`]),
};
const OTHER = {
  'ipad-pro': (c) => [`ipad-pro-13-select-wifi-${squash(c)}-202405`],
  'ipad-air': (c) => [`ipad-air-select-13in-wifi-${squash(c)}-202405`],
  'ipad-mini': (c) => [`ipad-mini-select-wifi-${squash(c)}-202410`, `ipad-mini-finish-${squash(c)}-202410`],
  ipad: (c) => [`ipad-2022-hero-${squash(c)}-wifi-select`],
  'macbook-air-13': (c) => (c === 'Space Gray' ? ['mba13-spacegray-select-202402', 'mba13-spacegray-select-202206'] : [`mba13-${squash(c)}-select-202503`]),
  'macbook-air-15': (c) => (c === 'Space Gray' ? ['mba15-spacegray-select-202402', 'mba15-spacegray-select-202306'] : [`mba15-${squash(c)}-select-202503`]),
  'macbook-neo': (c) => [`macbook-neo-${squash(c)}-cto-hero-202603`],
  'macbook-pro-14': (c) => [`mbp14-${squash(c)}-cto-hero-202410`, `mbp14-${squash(c)}-select-202410`],
  'macbook-pro-16': (c) => [`mbp16-${squash(c)}-cto-hero-202410`, `mbp16-${squash(c)}-select-202410`],
  'airpods-5': () => ['airpods-5-select-202609_FV1', 'airpods-5-hero-select-202609'],
  'airpods-4': () => ['airpods-4-select-202409', 'airpods-4-anc-select-202409', 'airpods-4-hero-select-202409'],
  'airpods-pro-3': () => ['airpods-pro-3-hero-select-202509', 'airpods-pro-3-select-202509'],
  'airpods-pro-2': () => ['airpods-pro-2-hero-select-202409', 'airpods-pro-2-hero-select-202209'],
  'airpods-max': (c) => [`airpods-max-select-202409-${squash(c)}_FV1`, `airpods-max-select-202409-${squash(c)}`],
};

// Часы: Apple собирает картинку из слоёв (ремешок + корпус + циферблат); готовое имя — на странице конфигурации.
function watchPages(r) {
  const [caseText, band] = r['Корпус/ремешок'].split(' / ');
  const material = caseText.split(' ')[0].toLowerCase();
  const caseColor = dash(caseText.split(' ').slice(1).join(' '));
  const b = dash(band);
  if (r.Модель === 'Apple Watch Ultra 4') return [`buy-watch/apple-watch-ultra/49mm-cellular-${caseColor}-titanium-${b}`];
  if (r.Модель === 'Apple Watch SE 3') return ['gps', 'cellular'].flatMap((n) => [44, 40].map((s) => `buy-watch/apple-watch-se/${s}mm-${n}-${caseColor}-aluminum-${b}-se`));
  if (r.Модель === 'Apple Watch Series 12') return ['gps', 'cellular'].flatMap((n) => [46, 42].map((s) => `buy-watch/apple-watch/${s}mm-${n}-${caseColor}-${material}-${b}`));
  return []; // Ultra 3 и Series 11 сняты с продажи — страниц нет (см. OLD_WATCHES)
}
const COMPOSITE = /[A-Z0-9]+(?:ref)?_[A-Z0-9_]*VW_34FR[A-Z_]*\+watch-case-[a-z0-9-]+_VW_34FR\+watch-face-[a-z0-9-]+_VW_34FR[A-Z_]*/;
async function pageComposite(p) {
  const res = await fetch(SHOP + p, { headers: UA, redirect: 'follow' });
  if (!res.ok || !res.url.includes(p.split('/').pop())) return null;
  return (await res.text()).match(COMPOSITE)?.[0] ?? null;
}
// Снятые часы (Series 11, Ultra 3): старый корпус и циферблат (слои ещё лежат у Apple) + слой ремешка.
// bandLayer — слой ремешка по его артикулу Apple (найдены перебором артикулов 2024–2025 годов);
// band — страница(ы) нынешней конфигурации, откуда взять слой, если артикула нет.
const s12Band = (b) => ['black', 'space-gray', 'light-gold', 'dark-bronze'].flatMap((c) => ['gps', 'cellular'].map((n) => `buy-watch/apple-watch/46mm-${n}-${c}-aluminum-${b}`));
const s11 = (c) => (b) => `${b}+watch-case-46-aluminum-${c}-nc-s11_VW_34FR+watch-face-46-aluminum-${c}-s11_VW_34FR`;
const ultra3 = (c) => (b) => `${b}+watch-case-49-titanium-${c}-ultra3_VW_34FR+watch-face-49-ultra4_VW_34FR_GEO_US`;
const OLD_WATCHES = {
  'watch-series-11-jet-black-black-sport-band': { band: 'buy-watch/apple-watch/46mm-gps-black-aluminum-black-sport-band', layers: s11('jetblack') },
  'watch-series-11-space-gray-black-sport-band': { band: 'buy-watch/apple-watch/46mm-gps-black-aluminum-black-sport-band', layers: s11('spacegray') },
  'watch-series-11-silver-purple-fog-sport-band': { bandLayer: 'MFH04ref_VW_34FR', layers: s11('silver') }, // Purple Fog 46 мм (MFH04)
  // Light Blush (MXM83) — слоя «в ракурсе» у Apple нет; на фото — ближайший светлый ремешок Sand
  'watch-series-11-rose-gold-light-blush-sport-band': { band: s12Band('sand-sport-band'), layers: s11('rosegold'), approx: 'на фото ремешок Sand вместо Light Blush (слоя Light Blush нет)' },
  'watch-ultra-natural-anchor-blue-ocean-band': { bandLayer: 'MGCC4_VW_34FR', layers: ultra3('natural') }, // Anchor Blue, светлая застёжка
  'watch-ultra-natural-blue-trail-loop': { bandLayer: 'MGCT4_VW_34FR', layers: ultra3('natural') }, // Blue/Bright Blue Trail Loop
  'watch-ultra-black-black-ocean-band': { bandLayer: 'MYPD3ref_VW_34FR', layers: ultra3('black') }, // Ocean Band Black, чёрная застёжка
  'watch-ultra-black-black-charcoal-trail-loop': { bandLayer: 'MGCP4_VW_34FR', layers: ultra3('black') }, // Black/Charcoal Trail Loop
};

async function exists(name) {
  const res = await fetch(`${CDN}${name}?wid=200&hei=200&fmt=png-alpha`, { headers: UA });
  return res.ok;
}
async function findWatch(r) {
  for (const p of watchPages(r)) {
    const name = await pageComposite(p);
    if (name) return { name, page: SHOP + p };
  }
  const old = OLD_WATCHES[r.Фото];
  if (old) {
    let band = old.bandLayer ?? null;
    if (!band) {
      let src = null;
      for (const p of [old.band ?? []].flat()) if ((src = await pageComposite(p))) break;
      band = src?.split('+')[0] ?? null;
    }
    if (band) {
      const name = old.layers(band);
      const note = old.approx ?? 'снятая модель: слои Apple (корпус, циферблат, ремешок) склеены локально';
      if (await exists(name)) return { name, note };
      // сервер не склеивает слои разных поколений — склеиваем сами
      const layers = name.split('+');
      let ok = true;
      for (const l of layers) if (!(await exists(l))) { ok = false; break; }
      if (ok) return { name, local: true, note };
    }
  }
  return null;
}
async function findName(key, r) {
  if (r.Категория === 'Watch') return findWatch(r);
  const table = r.Категория === 'iPhone' ? IPHONE : OTHER;
  const design = Object.keys(table).sort((a, b) => b.length - a.length).find((d) => key === d || key.startsWith(d + '-'));
  if (!design) return null;
  for (const name of table[design](r.Цвет)) if (await exists(name)) return { name };
  return null;
}

// У старых фото Apple (iPhone 14–16 Pro и др.) фон не прозрачный, а светло-серый.
// Убираем его «заливкой» от краёв: исчезает только фон, связанный с краем картинки, — белый корпус внутри не трогаем.
async function removeFlatBackground(buf) {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const px = (x, y) => (y * w + x) * 4;
  // Серый фон — это прямоугольник: первый непрозрачный пиксель слева на средней строке
  // и почти вся вертикаль через него одного цвета. У товара с прозрачным фоном такого не бывает.
  let x0 = 0;
  const mid = h >> 1;
  while (x0 < w && data[px(x0, mid) + 3] <= 250) x0++;
  if (x0 >= w) return buf;
  const c = px(x0, mid);
  const [br, bg, bb] = [data[c], data[c + 1], data[c + 2]];
  const dist = (i) => Math.max(Math.abs(data[i] - br), Math.abs(data[i + 1] - bg), Math.abs(data[i + 2] - bb));
  const sameAt = (y) => { const i = px(x0, y); return data[i + 3] > 250 && dist(i) <= 3; };
  let run = 1;
  for (let y = mid - 1; y >= 0 && sameAt(y); y--) run++;
  for (let y = mid + 1; y < h && sameAt(y); y++) run++;
  if (br < 225 || run < h * 0.25) return buf; // фон уже прозрачный
  const HARD = 6, SOFT = 24; // до HARD — фон, до SOFT — полупрозрачная кромка
  const seen = new Uint8Array(w * h);
  const stack = [];
  for (let x = 0; x < w; x++) stack.push(x, (h - 1) * w + x);
  for (let y = 0; y < h; y++) stack.push(y * w, y * w + w - 1);
  while (stack.length) {
    const p = stack.pop();
    if (seen[p]) continue;
    seen[p] = 1;
    const i = p * 4;
    if (data[i + 3] < 5) { /* уже прозрачно — идём дальше */ }
    else {
      const d = dist(i);
      if (d > SOFT) continue;
      data[i + 3] = d <= HARD ? 0 : Math.round(data[i + 3] * ((d - HARD) / (SOFT - HARD)));
      if (d > HARD) continue; // кромку не расширяем дальше
    }
    const x = p % w, y = (p - x) / w;
    if (x > 0) stack.push(p - 1);
    if (x < w - 1) stack.push(p + 1);
    if (y > 0) stack.push(p - w);
    if (y < h - 1) stack.push(p + w);
  }
  return sharp(data, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
}

async function download(name, tries = 3) {
  for (let i = 1; ; i++) {
    try {
      const res = await fetch(`${CDN}${name}?wid=2000&hei=2000&fmt=png-alpha`, { headers: UA });
      if (!res.ok) throw new Error(`скачивание ${res.status}`);
      return Buffer.from(await res.arrayBuffer());
    } catch (e) {
      if (i >= tries) throw e; // сервер Apple иногда обрывает большие картинки — повторяем
      await new Promise((r) => setTimeout(r, 2000 * i));
    }
  }
}
async function save(key, found) {
  let raw;
  if (found.local) {
    const [base, ...over] = await Promise.all(found.name.split('+').map(download));
    raw = await sharp(base).composite(over.map((input) => ({ input }))).png().toBuffer();
  } else raw = await download(found.name);
  const clean = await removeFlatBackground(raw);
  const trimmed = await sharp(clean).ensureAlpha().trim({ threshold: 1 }).toBuffer();
  const fitted = await sharp(trimmed).resize(BOX, BOX, { fit: 'inside' }).toBuffer({ resolveWithObject: true });
  const { width, height } = fitted.info;
  const left = Math.floor((CANVAS - width) / 2), top = Math.floor((CANVAS - height) / 2);
  await sharp(fitted.data)
    .extend({ top, left, bottom: CANVAS - height - top, right: CANVAS - width - left, background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .webp({ quality: 86, alphaQuality: 100, effort: 5 })
    .toFile(join(OUT, `${key}.webp`));
}

// ---------- основной проход ----------
const only = new Set(process.argv.slice(2));
const reportPath = join(OUT, 'sources.json');
const report = existsSync(reportPath) ? JSON.parse(readFileSync(reportPath, 'utf8')) : {};
for (const [key, r] of keys) {
  if (only.size && !only.has(key)) continue;
  if (existsSync(join(OUT, `${key}.webp`)) && report[key]?.name) continue;
  try {
    const found = await findName(key, r);
    if (!found) { report[key] = { missing: true }; console.log('НЕТ   ', key); continue; }
    await save(key, found);
    report[key] = found;
    console.log('ok    ', key);
  } catch (e) {
    report[key] = { missing: true, error: String(e.message ?? e) };
    console.log('ОШИБКА', key, e.message);
  }
}
writeFileSync(reportPath, JSON.stringify(report, null, 2));
const missing = [...keys.keys()].filter((k) => report[k]?.missing);

// ---------- страница-просмотр для Романа ----------
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const usedBy = new Map();
for (const r of rows) {
  const label = r.Категория === 'Watch' ? `${r.Модель} ${r.Размер}` : r.Модель;
  if (!usedBy.has(r.Фото)) usedBy.set(r.Фото, { models: new Set(), color: r.Категория === 'Watch' ? r['Корпус/ремешок'] : r.Цвет, cat: r.Категория, count: 0 });
  const u = usedBy.get(r.Фото); u.models.add(label); u.count++;
}
const sections = ['iPhone', 'iPad', 'MacBook', 'Watch', 'AirPods'].map((cat) => {
  const cards = [...usedBy].filter(([, u]) => u.cat === cat).map(([key, u]) => {
    const miss = report[key]?.missing;
    return `<figure class="card${miss ? ' miss' : ''}">${miss ? '<div class="ph">нет фото</div>' : `<img src="${esc(key)}.webp" alt="" loading="lazy">`}
<figcaption><b>${esc([...u.models].join(', '))}</b><span>${esc(u.color || '—')}</span><small>${esc(key)} · позиций: ${u.count}</small></figcaption></figure>`;
  }).join('\n');
  return `<h2>${cat}</h2><div class="grid">${cards}</div>`;
}).join('\n');
writeFileSync(join(OUT, 'index.html'), `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Фото каталога</title><style>
:root{--bg:#f2f2f7;--card:#fff;--text:#111;--muted:#6b6b70}
body.dark{--bg:#000;--card:#1c1c1e;--text:#f2f2f7;--muted:#9a9aa0}
body{margin:0;padding:16px;background:var(--bg);color:var(--text);font:14px/1.35 -apple-system,Segoe UI,Roboto,sans-serif}
header{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:8px}h1{font-size:20px;margin:0}
button{font:inherit;padding:6px 12px;border-radius:10px;border:1px solid #8884;background:var(--card);color:var(--text);cursor:pointer}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:12px}
.card{margin:0;background:var(--card);border-radius:16px;padding:10px;display:flex;flex-direction:column;gap:6px}
.card img,.ph{width:100%;aspect-ratio:1;object-fit:contain}
.ph{display:grid;place-items:center;color:#d33;border:2px dashed #d33;border-radius:12px;font-weight:600}
figcaption{display:flex;flex-direction:column;gap:2px}figcaption span{color:var(--muted)}figcaption small{color:var(--muted);font-size:11px;word-break:break-all}
h2{margin:24px 0 10px}</style></head><body>
<header><h1>Фото каталога — ${keys.size - missing.length} из ${keys.size}</h1><button onclick="document.body.classList.toggle('dark')">Светлая / тёмная</button>
<span style="color:var(--muted)">Одно фото — на все позиции с этим ключом (например, 17 Pro и 17 Pro Max одного цвета).</span></header>
${sections}</body></html>`);
console.log(`Готово: ${keys.size - missing.length} из ${keys.size}; без фото: ${missing.join(', ') || '—'}`);
