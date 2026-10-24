// Генератор стартовой таблицы каталога Si Phone (этап A).
// Запуск (из папки mini-app):
//   node supabase/catalog/generate.mjs <прайс поставщика.tsv> [магазин1.txt магазин2.txt ...]
// <рынок.tsv> — выжимка цен другого магазина: «Артикул<TAB>Наименование<TAB>Цена». Файл не хранится в репозитории.
// Результат: supabase/catalog/si-phone-catalog.xlsx и .csv — их Роман импортирует в Google Таблицу.
// После импорта главная — Google Таблица; генератор повторно не запускаем (ID не должны «съехать»).

import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  IPHONES, STORAGE_STEP, ESIM_DISCOUNT, IPADS, IPAD_STORAGE_STEP, CELLULAR_EXTRA,
  MACS, RU_KEYBOARD_EXTRA, WATCHES, AIRPODS,
} from './models.mjs';

const require = createRequire(import.meta.url);
const XLSX = require('xlsx');
const here = dirname(fileURLToPath(import.meta.url));
const outName = process.env.OUT_NAME ?? 'si-phone-catalog'; // другое имя — если прежний файл открыт в Excel

// ---------- общие помощники ----------
const round500 = (n) => Math.round(n / 500) * 500;
const median = (a) => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const gb = (n) => (n >= 1024 ? `${n / 1024}TB` : `${n}GB`);
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const norm = (s) => ` ${s.toLowerCase().replace(/[./()\-+,"]+/g, ' ').replace(/\s+/g, ' ').trim()} `;
const hasWord = (text, w) => text.includes(` ${w.toLowerCase()} `);
const ruWords = (s) => s.replace(/pro/g, 'про').replace(/max/g, 'макс').replace(/plus/g, 'плюс').replace(/air/g, 'эйр').replace(/mini/g, 'мини')
  .replace(/neo/g, 'нео').replace(/duo/g, 'дуо').replace(/ultra/g, 'ультра').replace(/series/g, 'серия').replace(/(\d)e\b/g, '$1е');
// Как продавцы пишут английские названия русскими буквами (для разбора прайсов: «бургунди», «миднайт», «космик оранж»)
const TRANSLIT = {
  star: 'стар', white: 'вайт', night: 'найт', sky: 'скай', black: 'блэк', silver: 'сильвер', burgundy: 'бургунди', glacier: 'глейшер',
  cosmic: 'космик', orange: 'оранж', deep: 'дип', blue: 'блю', space: 'спейс', cloud: 'клауд', light: 'лайт', gold: 'голд', mist: 'мист',
  sage: 'сейдж', lavender: 'лавандер', soft: 'софт', pink: 'пинк', titanium: 'титаниум', natural: 'натурал', desert: 'дезерт', teal: 'тил',
  ultramarine: 'ультрамарин', green: 'грин', yellow: 'йеллоу', midnight: 'миднайт', starlight: 'старлайт', purple: 'перпл', red: 'ред',
  gray: 'грей', blush: 'блаш', citrus: 'цитрус', indigo: 'индиго', dark: 'дарк', bronze: 'бронз', radiant: 'рэдиант', pearl: 'перл',
  jet: 'джет', rose: 'роуз', sand: 'сэнд', trail: 'трейл', loop: 'луп', alpine: 'альпайн', translucent: 'транслюсент', ocean: 'оушен',
  band: 'бэнд', milanese: 'миланиз', umber: 'амбер', olive: 'олив', sport: 'спорт', navy: 'нэви', anchor: 'анкор', charcoal: 'чаркоул',
  fog: 'фог', aluminum: 'алюминий', ceramic: 'керамика',
};
const ruTranslit = (en) => en.toLowerCase().split(/\s+/).map((w) => TRANSLIT[w] ?? w).join(' ');
const colorSyn = (c) => [...c.syn, c.ru.toLowerCase().replace(/ё/g, 'е'), ruTranslit(c.en)];
const uniq = (a) => [...new Set(a.filter(Boolean))];

function findColor(text, colors) {
  // сначала полное английское название, потом синонимы
  return colors.find((c) => hasWord(text, norm(c.en).trim())) ?? colors.find((c) => c.syn.some((s) => hasWord(text, s)));
}

// ---------- рынок ----------
const marketPath = process.argv[2];
if (!marketPath) { console.error('Укажите путь к выжимке цен рынка (.tsv)'); process.exit(1); }
const market = readFileSync(marketPath, 'utf8').split(/\r?\n/).filter(Boolean).map((line) => {
  const [code, name, price] = line.split('\t');
  return { code, name, price: Number(price) };
}).filter((r) => r.name && r.price > 0 && !/актив/i.test(r.name)); // активированные и «предактив» не берём

// iPhone: { model -> [{storage, sim, color, price}] }
const iphoneMarket = new Map();
for (const r of market) {
  const m = r.name.match(/^iPhone (\d\d)(e)?(?: (Pro Max|Pro|Plus|Air))?\s+(\d+)\s*(Gb|Tb)?/i);
  if (!m) continue;
  const [, num, e, kind, size, unit] = m;
  const kindNorm = kind ? kind.toLowerCase().replace(/\b\w/g, (x) => x.toUpperCase()) : '';
  const model = kindNorm === 'Air' ? 'iPhone Air' : `iPhone ${num}${e ? 'e' : ''}${kindNorm ? ' ' + kindNorm : ''}`;
  const def = IPHONES.find((x) => x.model === model);
  if (!def) continue;
  const storage = /tb/i.test(unit ?? '') ? Number(size) * 1024 : Number(size);
  const text = norm(r.name);
  let sim = /esim \+ sim|2sim/i.test(r.name) ? 'SIM+eSIM' : /\(esim \)|e-sim/i.test(r.name) ? 'eSIM' : null;
  if (sim && !def.sims.includes(sim)) continue; // явная eSIM-версия модели, которую мы продаём только с SIM+eSIM
  if (def.sims.length === 1) sim = def.sims[0];
  if (!sim) continue;
  const color = findColor(text, def.colors);
  if (!color) { console.warn('iPhone: не понял цвет —', r.name); continue; }
  if (!iphoneMarket.has(model)) iphoneMarket.set(model, []);
  iphoneMarket.get(model).push({ storage, sim, color: color.en, price: r.price });
}

// iPad: { key(line size chip) -> [{storage, conn, color, price}] }
const ipadKey = (d) => `${d.line}|${d.size}|${d.chip}`;
const ipadMarket = new Map();
for (const r of market) {
  if (!/ipad/i.test(r.name)) continue;
  const t = norm(r.name.replace(/Air \d /i, 'Air '));
  const line = /ipad pro/.test(t) ? 'iPad Pro' : /ipad air/.test(t) ? 'iPad Air' : /ipad mini/.test(t) ? 'iPad mini' : 'iPad';
  const chip = (t.match(/ (m\d|a1\d(?: pro)?) /)?.[1] ?? '').toUpperCase().replace('PRO', 'Pro');
  const size = line === 'iPad' ? 11 : line === 'iPad mini' ? 8.3 : Number(t.match(/ (11|13) /)?.[1]);
  const def = IPADS.find((d) => d.line === line && d.size === size && d.chip === chip);
  if (!def) { console.warn('iPad: нет модели —', r.name); continue; }
  const sm = t.match(/ (128|256|512) | ([12]) ?tb /);
  if (!sm) continue;
  const storage = sm[1] ? Number(sm[1]) : Number(sm[2]) * 1024;
  const conn = /lte|cellular/.test(t) ? 'Wi-Fi+Cellular' : 'Wi-Fi';
  const color = findColor(t, def.colors);
  if (!color) { console.warn('iPad: не понял цвет —', r.name); continue; }
  const k = ipadKey(def);
  if (!ipadMarket.has(k)) ipadMarket.set(k, []);
  ipadMarket.get(k).push({ storage, conn, color: color.en, price: r.price });
}

// MacBook: точные позиции с артикулами Apple
const macMarket = [];
for (const r of market) {
  const m = r.name.match(/^(Air|Pro|MacBook Neo) (13|14|15|16)" \(([^/]+)\/(\d+)\/(\d+|\d+tb)\) (.+?) \/(\w+)\/\s*(.*)$/i);
  if (!m) continue;
  const [, l, size, chip, ram, ssdRaw, colorText, art, rest] = m;
  const line = l === 'MacBook Neo' ? 'MacBook Neo' : `MacBook ${l}`;
  const ssd = /tb/i.test(ssdRaw) ? parseInt(ssdRaw, 10) * 1024 : Number(ssdRaw);
  const def = MACS.find((d) => d.line === line && d.size === Number(size) && d.chip === chip);
  if (!def) { console.warn('Mac: нет модели —', r.name); continue; }
  const color = findColor(norm(colorText), def.colors);
  if (!color) { console.warn('Mac: не понял цвет —', r.name); continue; }
  macMarket.push({ def, ram: Number(ram), ssd, color: color.en, art, ru: /кл/.test(rest), price: r.price });
}

// AirPods Max: артикулы по цветам
const airpodsArt = new Map();
for (const r of market) {
  const m = r.name.match(/AirPods MAX 2 .*?\) (\w+)\s*\/\s*(\w+)/i);
  if (m) airpodsArt.set(m[1].toLowerCase(), { art: m[2], price: r.price });
}

// ---------- расчёт цены по лестнице «память × SIM/связь» ----------
// rows: рыночные позиции модели; optKey — 'sim' | 'conn'; steps — доплата за ступень памяти
function makePricer({ rows, storages, opts, optKey, steps, anchor, optDiffDefault, cheapOpt }) {
  const any = (st, o) => { const p = rows.filter((r) => r.storage === st && r[optKey] === o).map((r) => r.price); return p.length ? median(p) : null; };
  // разница между вариантами (SIM+eSIM − eSIM; Cellular − Wi-Fi) — по рынку на ближайшей памяти, где есть оба
  const diffs = storages.map((st, i) => { const a = any(st, opts[0]), b = opts[1] ? any(st, opts[1]) : null; return a != null && b != null ? { i, d: Math.abs(b - a) } : null; }).filter(Boolean);
  const optDiffAt = (idx) => (diffs.length ? diffs.reduce((best, x) => (Math.abs(x.i - idx) < Math.abs(best.i - idx) ? x : best)).d : optDiffDefault);
  const adjustOpt = (price, from, to, idx) => (from === to ? price : to === cheapOpt ? price - optDiffAt(idx) : price + optDiffAt(idx));
  const anchorOpt = opts.includes('SIM+eSIM') ? 'SIM+eSIM' : opts[0];
  const cum = (from, to) => { let s = 0; for (let k = from + 1; k <= to; k++) s += steps[storages[k]]; return s; };
  const base = (st, o) => {
    const idx = storages.indexOf(st);
    const direct = any(st, o);
    if (direct != null) return { price: direct, how: 'market' };
    // рыночная цена на ступени j (любой вариант), приведённая к варианту o
    const marketAt = (j) => { for (const other of [o, ...opts.filter((x) => x !== o)]) { const p = any(storages[j], other); if (p != null) return adjustOpt(p, other, o, j); } return null; };
    if (marketAt(idx) != null) return { price: marketAt(idx), how: 'estimate' };
    // младшая память без рынка — опорная цена из справочника
    const known = (j) => marketAt(j) ?? (j === 0 ? adjustOpt(anchor, anchorOpt, o, 0) : null);
    if (idx === 0) return { price: known(0), how: 'estimate' };
    let lo = -1, hi = -1;
    for (let j = idx - 1; j >= 0 && lo < 0; j--) if (known(j) != null) lo = j;
    for (let j = idx + 1; j < storages.length && hi < 0; j++) if (known(j) != null) hi = j;
    // есть цены и ниже, и выше — делим разницу пропорционально шагам; иначе — шагами от нижней
    if (hi >= 0) return { price: known(lo) + (known(hi) - known(lo)) * (cum(lo, idx) / cum(lo, hi)), how: 'estimate' };
    return { price: known(lo) + cum(lo, idx), how: 'estimate' };
  };
  return (st, o, color) => {
    const exact = rows.filter((r) => r.storage === st && r[optKey] === o && r.color === color).map((r) => r.price);
    if (exact.length) return { price: round500(median(exact)), how: 'market' };
    const b = base(st, o);
    return { price: round500(b.price), how: b.how === 'market' ? 'market-color' : 'estimate' };
  };
}

// ---------- строки таблицы ----------
const COLUMNS = ['ID', 'Категория', 'Модель', 'Название', 'Год', 'Память', 'Цвет', 'Цвет (рус)', 'SIM/связь', 'Размер', 'Чип',
  'RAM/SSD', 'Корпус/ремешок', 'Клавиатура', 'Цена, ₽', 'Показывать', 'Наличие', 'Фото', 'Синонимы', 'Артикул Apple', 'Комментарий'];
const rows = [];
const add = (r) => rows.push({ ID: rows.length + 1, Показывать: 'да', Наличие: 'в наличии', ...r });
const note = (...parts) => uniq(parts).join('; ');
const priceNote = (how) => (how === 'estimate' ? 'цена — оценка' : how === 'market-color' ? 'цена по другому цвету' : '');

const IPHONE_CHIP = {
  'iPhone Duo': 'A20 Pro', 'iPhone 18 Pro Max': 'A20 Pro', 'iPhone 18 Pro': 'A20 Pro', 'iPhone 17 Pro Max': 'A19 Pro', 'iPhone 17 Pro': 'A19 Pro', 'iPhone Air': 'A19 Pro',
  'iPhone 17': 'A19', 'iPhone 17e': 'A19', 'iPhone 16 Pro Max': 'A18 Pro', 'iPhone 16 Pro': 'A18 Pro', 'iPhone 16 Plus': 'A18', 'iPhone 16': 'A18',
  'iPhone 16e': 'A18', 'iPhone 15 Plus': 'A16 Bionic', 'iPhone 15': 'A16 Bionic', 'iPhone 14 Plus': 'A15 Bionic', 'iPhone 14': 'A15 Bionic',
};

for (const d of IPHONES) {
  const pricer = makePricer({ rows: iphoneMarket.get(d.model) ?? [], storages: d.storages, opts: d.sims, optKey: 'sim',
    steps: d.steps ?? STORAGE_STEP, anchor: d.anchor, optDiffDefault: ESIM_DISCOUNT, cheapOpt: 'eSIM' });
  const short = d.model.replace('iPhone ', '').toLowerCase();
  const modelSyn = uniq([short, short.replace(/ /g, ''), short.replace(' pro max', 'pm'), ruWords(short), `айфон ${ruWords(short)}`, ...(d.syn ?? [])]);
  for (const color of d.colors) for (const st of d.storages) for (const sim of d.sims) {
    const { price, how } = pricer(st, sim, color.en);
    add({
      Категория: 'iPhone', Модель: d.model, Название: `${d.model} ${gb(st)} ${color.en} ${sim}`, Год: d.year, Память: gb(st),
      Цвет: color.en, 'Цвет (рус)': color.ru, 'SIM/связь': sim, Чип: IPHONE_CHIP[d.model], 'Цена, ₽': price,
      Фото: `${d.design}-${slug(color.en)}`, Синонимы: uniq([...modelSyn, ...colorSyn(color)]).join(', '),
      Комментарий: note(d.rare && 'редко', d.note, priceNote(how)), _how: how,
    });
  }
}

for (const d of IPADS) {
  const conns = ['Wi-Fi', 'Wi-Fi+Cellular'];
  const pricer = makePricer({ rows: ipadMarket.get(ipadKey(d)) ?? [], storages: d.storages, opts: conns, optKey: 'conn',
    steps: IPAD_STORAGE_STEP, anchor: d.anchor, optDiffDefault: CELLULAR_EXTRA, cheapOpt: 'Wi-Fi' });
  const model = d.line === 'iPad' ? `iPad 11" ${d.chip}` : d.line === 'iPad mini' ? `iPad mini ${d.chip}` : `${d.line} ${d.size}" ${d.chip}`;
  const short = d.line.replace('iPad', '').trim().toLowerCase();
  const modelSyn = uniq([`ipad ${short} ${d.size} ${d.chip.toLowerCase()}`.replace(/\s+/g, ' '), `айпад ${ruWords(short)}`.trim(), d.chip.toLowerCase(), d.line === 'iPad Air' && (d.chip === 'M4' ? 'air 8' : 'air 7')]);
  for (const color of d.colors) for (const st of d.storages) for (const conn of conns) {
    const { price, how } = pricer(st, conn, color.en);
    add({
      Категория: 'iPad', Модель: model, Название: `${d.line} ${d.size}" ${d.chip} ${gb(st)} ${conn} ${color.en}`, Год: d.year, Память: gb(st),
      Цвет: color.en, 'Цвет (рус)': color.ru, 'SIM/связь': conn, Размер: `${d.size}"`, Чип: d.chip, 'Цена, ₽': price,
      Фото: `${d.design}-${slug(color.en)}`, Синонимы: uniq([...modelSyn, conn === 'Wi-Fi' ? 'wifi, вайфай' : 'lte, cellular, сотовая', ...colorSyn(color)]).join(', '),
      Комментарий: note(d.rare && 'редко', priceNote(how)), _how: how,
    });
  }
}

for (const d of MACS) {
  const model = `${d.line} ${d.size}" ${d.chip}`;
  const short = d.line.replace('MacBook ', '').toLowerCase();
  const modelSyn = uniq([`${short} ${d.size} ${d.chip.toLowerCase()}`, `макбук ${ruWords(short)}`, `macbook ${short}`, `${ruWords(short)} ${d.size} ${d.chip.toLowerCase().replace('m', 'м')}`]);
  for (const color of d.colors) for (const [ram, ssd, cfgPrice] of d.configs) for (const ru of [false, true]) {
    const same = macMarket.filter((m) => m.def === d && m.ram === ram && m.ssd === ssd);
    const exact = same.filter((m) => m.color === color.en && m.ru === ru);
    const exactPlain = same.filter((m) => m.color === color.en && !m.ru);
    let price, how;
    if (exact.length) { price = median(exact.map((m) => m.price)); how = 'market'; }
    else if (ru && exactPlain.length) { price = median(exactPlain.map((m) => m.price)) + RU_KEYBOARD_EXTRA; how = 'market'; }
    else { price = cfgPrice + (ru ? RU_KEYBOARD_EXTRA : 0); how = same.length ? 'market-color' : 'estimate'; }
    const art = uniq(same.filter((m) => m.color === color.en).map((m) => m.art)).join(', ');
    add({
      Категория: 'MacBook', Модель: model, Название: `${model} ${ram}GB/${gb(ssd)} ${color.en}${ru ? ' РУС' : ''}`, Год: d.year, Память: gb(ssd),
      Цвет: color.en, 'Цвет (рус)': color.ru, Размер: `${d.size}"`, Чип: d.chip, 'RAM/SSD': `${ram}GB/${gb(ssd)}`,
      Клавиатура: ru ? 'РУС' : 'обычная', 'Цена, ₽': round500(price), Фото: `${d.design}-${slug(color.en)}`,
      Синонимы: uniq([...modelSyn, ru && 'рус, ру клавиатура, гравировка, кл', ...colorSyn(color)]).join(', '), 'Артикул Apple': art,
      Комментарий: note(d.rare && 'редко', d.check && 'проверить конфигурацию', priceNote(how)), _how: how,
    });
  }
}

for (const d of WATCHES) {
  const short = d.series.replace('Apple Watch ', '');
  const lower = short.toLowerCase();
  const modelSyn = uniq([lower, lower.replace('series ', 's'), lower.replace(/ /g, ''), `эпл вотч ${lower.replace('series', 'серия').replace('ultra', 'ультра')}`]);
  for (const [size, sizePrice] of Object.entries(d.sizes)) for (const c of d.cases) {
    const estimated = c.material !== 'Aluminum' && !d.series.includes('Ultra');
    add({
      Категория: 'Watch', Модель: d.series, Название: `${d.series} ${size}mm ${c.material} ${c.en} ${c.band}`, Год: d.year,
      Цвет: c.en, 'Цвет (рус)': c.ru, Размер: `${size}mm`, 'Корпус/ремешок': `${c.material} ${c.en} / ${c.band}`,
      'Цена, ₽': round500(sizePrice + c.extra), Фото: `${d.design}-${slug(c.en)}-${slug(c.band)}`,
      Синонимы: uniq([...modelSyn, `${size}мм`, c.material.toLowerCase(), ruTranslit(c.material), c.en.toLowerCase(), c.ru.toLowerCase().replace(/ё/g, 'е'), ruTranslit(c.en), c.band.toLowerCase(), ruTranslit(c.band), c.bandRu.toLowerCase().replace(/ё/g, 'е')]).join(', '),
      Комментарий: note(d.rare && 'редко', 'размер ремешка S/M или M/L — при заказе', estimated && 'цена — оценка'), _how: estimated ? 'estimate' : 'market',
    });
  }
}

for (const d of AIRPODS) {
  const lower = d.name.replace('AirPods ', '').toLowerCase();
  const modelSyn = uniq([`airpods ${lower}`, `эйрподс ${ruWords(lower)}`, /anc|5/i.test(d.name) && 'шумоподавление']);
  for (const color of d.colors ?? [null]) {
    // рыночные цены и артикулы по цветам есть только у AirPods Max 2
    const m = color && d.name === 'AirPods Max 2' ? airpodsArt.get(color.en.toLowerCase()) : null;
    const estimated = d.estimate || (color && !m);
    add({
      Категория: 'AirPods', Модель: d.name, Название: color ? `${d.name} ${color.en}` : d.name, Год: d.year,
      Цвет: color?.en ?? '', 'Цвет (рус)': color?.ru ?? '', 'Цена, ₽': round500(m?.price ?? d.price),
      Фото: color ? `${d.design}-${slug(color.en)}` : d.design, Синонимы: uniq([...modelSyn, ...(color ? colorSyn(color) : [])]).join(', '),
      'Артикул Apple': m?.art ?? d.arts?.[color?.en] ?? '', Комментарий: note(d.rare && 'редко', estimated && 'цена — оценка'), _how: estimated ? 'estimate' : 'market',
    });
  }
}

// ---------- Розничные магазины (Store77, apple-market и др.): цены для позиций, которых нет у поставщика ----------
// Розница дороже поставщика. По позициям, которые есть и там, и в прайсе поставщика, считаем, во сколько раз поставщик
// дешевле (по каждой линейке, иначе по категории), и этим множителем приводим цены магазина к уровню закупки.
// Файлы магазинов — аргументы после прайса поставщика, по порядку надёжности: первый закрывает позицию, следующие — оставшиеся.
const kReport = [];
for (const s77Path of process.argv.slice(3)) {
  const label = s77Path.replace(/^.*[\\/]/, '').replace(/\.txt$/, '');
  for (const r of rows) delete r._s77;
  const lowerFirst = (s) => s.toLowerCase();
  const bandKey = (color, type) => {
    const c = lowerFirst(color).replace('grey', 'gray').replace('blue/bright blue', 'blue').replace('/', ' ');
    const t = { trail: 'trail loop', alpine: 'alpine loop', ocean: 'ocean band' }[lowerFirst(type)] ?? lowerFirst(type);
    return `${c} ${t}`.replace(/[^a-z]/g, '');
  };
  const caseColor = (s) => s.replace(/ (Aluminium|Aluminum|Titanium)$/, '').replace('Space Grey', 'Space Gray');
  const S = new Map();
  const put = (key, price, id) => {
    const art = id.replace(/(LL|CH)\/A$/, '').replace(/\s*\d?(рус|рцс)\d?$/, '').replace(/2Sim$/, '');
    const o = S.get(key) ?? { price: Infinity, ids: new Set() };
    o.price = Math.min(o.price, price);
    if (/^M[A-Z0-9]{3,4}$/.test(art)) o.ids.add(art);
    S.set(key, o);
  };
  const MAX_RU = { 'Фиолетовый': 'Purple', 'Оранжевый': 'Orange', 'Синий': 'Blue', 'Сияющая звезда': 'Starlight', 'Полуночный черный': 'Midnight' };
  for (const line of readFileSync(s77Path, 'utf8').split(/\r?\n/).filter(Boolean)) {
    const f = line.split('|');
    const price = Number(f.at(-2)), id = f.at(-1);
    // защита от опечаток на сайтах магазинов (например, часы за 3 663 ₽): такие цены не берём вовсе
    const MIN_PRICE = { iPhone: 25000, iPad: 25000, MacBook: 50000, Watch: 12000, AirPods: 5000 };
    if (!(price >= (MIN_PRICE[f[0]] ?? 5000))) continue;
    if (f[0] === 'iPhone') {
      const def = IPHONES.find((d) => d.model === f[1]);
      if (!def || !def.sims.includes(f[4])) continue; // например, американские eSIM-версии 14–16 — у нас их нет
      const color = findColor(norm(f[3]), def.colors);
      if (color) put(`i|${f[1]}|${gb(+f[2])}|${color.en}|${f[4]}`, price, id);
    } else if (f[0] === 'iPad') {
      const model = f[1] === 'iPad' ? 'iPad 11" A16' : f[1] === 'iPad mini' ? 'iPad mini A17 Pro' : `${f[1]} ${f[2]}" ${f[3]}`;
      put(`p|${model}|${gb(+f[4])}|${f[5]}|${f[6]}`, price, id);
    } else if (f[0] === 'MacBook') {
      put(`m|${f[1]} ${f[2]}" ${f[3]}|${f[4]}GB/${gb(+f[5])}|${f[6]}|${f[7]}`, price, id);
    } else if (f[0] === 'Watch') {
      const series = 'Apple Watch ' + f[1].replace(/ \(\d{4}\)$/, '');
      put(`w|${series}|${f[2]}|${caseColor(f[3])}|${bandKey(f[5], f[4])}`, price, id);
    } else if (f[0] === 'AirPods') {
      const n = f[1];
      if (rows.some((r) => r.Название === n)) { put(`a|${n}`, price, id); continue; } // в файле уже наше название
      const name = /Max 2/.test(n) ? `AirPods Max 2 ${MAX_RU[n.match(/\(([^)]+)\)/)?.[1]] ?? '?'}`
        : /AirPods 5 \(беспровод/.test(n) ? 'AirPods 5 Wireless Charging'
          : /AirPods 5 M/.test(n) ? 'AirPods 5'
            : /AirPods 4 \(с шумо/.test(n) ? 'AirPods 4 ANC'
              : /AirPods 4 M/.test(n) ? 'AirPods 4'
                : /Pro 3 \(MFHP4\)/.test(n) ? 'AirPods Pro 3' : null;
      if (name) put(`a|${name}`, price, id);
    }
  }
  const rowKey = (r) => {
    if (r.Категория === 'iPhone') return `i|${r.Модель}|${r.Память}|${r.Цвет}|${r['SIM/связь']}`;
    if (r.Категория === 'iPad') return `p|${r.Модель}|${r.Память}|${r['SIM/связь']}|${r.Цвет}`;
    if (r.Категория === 'MacBook') return `m|${r.Модель}|${r['RAM/SSD']}|${r.Цвет}|${r.Клавиатура === 'РУС' ? 'РУС' : ''}`;
    if (r.Категория === 'Watch') {
      const band = r['Корпус/ремешок'].split(' / ')[1];
      const type = band.match(/(Sport Band|Trail Loop|Alpine Loop|Ocean Band|Milanese Loop)$/)?.[1] ?? '';
      return `w|${r.Модель}|${parseInt(r.Размер, 10)}|${r.Цвет}|${bandKey(band.slice(0, band.length - type.length).trim(), type)}`;
    }
    return `a|${r.Название}`;
  };
  // множители «каталог / Store77»
  const groupsOf = (r) => [r.Категория === 'iPhone' ? `${r.Модель} · ${r['SIM/связь']}` : r.Модель, r.Категория];
  const ratios = new Map();
  for (const r of rows) {
    const s = S.get(rowKey(r));
    if (!s) continue;
    r._s77 = s;
    if (r._how !== 'market') continue;
    for (const g of groupsOf(r)) { if (!ratios.has(g)) ratios.set(g, []); ratios.get(g).push(r['Цена, ₽'] / s.price); }
  }
  const allRatios = [...ratios.entries()].filter(([g]) => ['iPhone', 'iPad', 'MacBook', 'Watch', 'AirPods'].includes(g)).flatMap(([, v]) => v);
  // Процент принимаем, только если он правдоподобный: поставщик дешевле магазина на 0–20 %.
  // Иначе (например, у поставщика распродажа старших версий) — процент категории, а если и он странный — 10 %.
  const plausible = (k) => k >= 0.8 && k <= 1.0;
  const kFor = (r) => {
    for (const g of groupsOf(r)) { const v = ratios.get(g); if (v && v.length >= 3 && plausible(median(v))) return { k: median(v), g, n: v.length }; }
    const all = median(allRatios);
    return plausible(all) ? { k: all, g: 'все категории', n: allRatios.length } : { k: 0.9, g: 'по умолчанию', n: 0 };
  };
  let changed = 0, outliers = 0;
  for (const r of rows) {
    if (!r._s77 || r._how === 'retail') continue; // уже закрыта более надёжным магазином
    if (!r['Артикул Apple'] && r._s77.ids.size) r['Артикул Apple'] = [...r._s77.ids].join(', ');
    const { k } = kFor(r);
    if (r._how === 'market') {
      // iPhone: цена поставщика сильно выбивается из закономерности — скорее всего, другая версия (eSIM без пометки).
      // Для остальных категорий цене поставщика верим всегда (бывают распродажи старых моделей).
      if (r.Категория !== 'iPhone' || Math.abs(r['Цена, ₽'] / r._s77.price / k - 1) <= 0.12) continue;
      outliers++;
      r.Комментарий = note(...r.Комментарий.split('; ').filter(Boolean), `в каталоге ${r['Цена, ₽']} — выбивается`);
    }
    r['Цена, ₽'] = round500(r._s77.price * k);
    r.Комментарий = note(...r.Комментарий.split('; ').filter((x) => !/^цена/.test(x)), `цена: ${label} −${Math.round((1 - k) * 100)}%`);
    r._how = 'retail';
    changed++;
  }
  for (const [g, v] of [...ratios.entries()].sort()) kReport.push([label, g, v.length, Math.round((1 - median(v)) * 100)]);
  console.log(`${label}: позиций в файле ${S.size}, совпало с таблицей ${rows.filter((r) => r._s77).length}, цен поставлено ${changed} (из них выбивались у поставщика: ${outliers})`);
}

// ---------- оценки → цена той же конфигурации в другом цвете; «РУС» = обычная + 1 500 ----------
{
  const sameConfig = (r) => {
    if (r.Категория === 'iPhone') return `${r.Модель}|${r.Память}|${r['SIM/связь']}`;
    if (r.Категория === 'iPad') return `${r.Модель}|${r.Память}|${r['SIM/связь']}`;
    if (r.Категория === 'MacBook') return `${r.Модель}|${r['RAM/SSD']}|${r.Клавиатура}`;
    if (r.Категория === 'Watch') return `${r.Модель}|${r.Размер}|${r['Корпус/ремешок'].split(' ')[0]}`; // тот же материал корпуса
    return `${r.Модель}`;
  };
  const known = new Map();
  for (const r of rows) {
    if (!['market', 'retail'].includes(r._how)) continue;
    const k = sameConfig(r);
    if (!known.has(k)) known.set(k, []);
    known.get(k).push(r['Цена, ₽']);
  }
  // цена поставщика на эту конфигурацию в другом цвете важнее цены магазина, если та отличается больше чем на 10 %
  const supplier = new Map();
  for (const r of rows) {
    if (r._how !== 'market') continue;
    const k = sameConfig(r);
    if (!supplier.has(k)) supplier.set(k, []);
    supplier.get(k).push(r['Цена, ₽']);
  }
  for (const r of rows) {
    if (r._how !== 'retail') continue;
    const p = supplier.get(sameConfig(r));
    if (!p || Math.abs(r['Цена, ₽'] / median(p) - 1) <= 0.1) continue;
    r['Цена, ₽'] = round500(median(p));
    r.Комментарий = note(...r.Комментарий.split('; ').filter((x) => x && !/^цена/.test(x)), 'цена поставщика (другой цвет)');
    r._how = 'market-color';
  }
  for (const r of rows) {
    if (['market', 'retail', 'market-color'].includes(r._how)) continue;
    const p = known.get(sameConfig(r));
    if (!p) continue;
    r['Цена, ₽'] = round500(median(p));
    r.Комментарий = note(...r.Комментарий.split('; ').filter((x) => x && !/^цена/.test(x)), 'цена по другому цвету');
    r._how = 'market-color';
  }
  // «РУС» — та же конфигурация с гравировкой: обычная + 1 500 ₽ (если в каталоге нет точной цены с «кл»)
  const byName = new Map(rows.map((r) => [r.Название, r]));
  for (const r of rows) {
    if (r.Клавиатура !== 'РУС' || r._how === 'market') continue;
    const base = byName.get(r.Название.replace(/ РУС$/, ''));
    if (!base) continue;
    r['Цена, ₽'] = base['Цена, ₽'] + RU_KEYBOARD_EXTRA;
    r.Комментарий = note(...r.Комментарий.split('; ').filter((x) => x && !/^цена/.test(x)), 'РУС: обычная + 1 500');
    r._how = base._how === 'market' || base._how === 'retail' ? base._how : r._how;
  }
}

// ---------- важные актуальные позиции без рынка: цена США × «курс линейки» ----------
// «Курс линейки» = рыночная цена ÷ цена США у позиций той же модели (иначе того же поколения), у которых есть обе цены.
// Цены США — официальные (apple.com, iClarified, Macworld, 24.10.2026).
const US_PRICE = {
  'MacBook Air 13" M5|16GB/512GB': 1099, 'MacBook Air 13" M5|16GB/1TB': 1299, 'MacBook Air 13" M5|24GB/512GB': 1299, 'MacBook Air 13" M5|24GB/1TB': 1499,
  'MacBook Air 15" M5|16GB/512GB': 1299, 'MacBook Air 15" M5|16GB/1TB': 1499, 'MacBook Air 15" M5|24GB/512GB': 1499, 'MacBook Air 15" M5|24GB/1TB': 1699,
  'MacBook Air 13" M4|16GB/256GB': 999, 'MacBook Air 13" M4|16GB/512GB': 1199, 'MacBook Air 13" M4|24GB/512GB': 1399,
  'MacBook Air 15" M4|16GB/256GB': 1199, 'MacBook Air 15" M4|16GB/512GB': 1399, 'MacBook Air 15" M4|24GB/512GB': 1599,
  'MacBook Pro 14" M4|16GB/512GB': 1599, 'MacBook Pro 14" M4|16GB/1TB': 1799, 'MacBook Pro 14" M4|24GB/1TB': 1999,
  'MacBook Pro 14" M4 Pro|24GB/512GB': 1999, 'MacBook Pro 14" M4 Pro|24GB/1TB': 2399,
  'MacBook Pro 16" M4 Pro|24GB/512GB': 2499, 'MacBook Pro 16" M4 Pro|48GB/512GB': 2899,
  'MacBook Pro 14" M5|16GB/1TB': 1699, 'MacBook Pro 14" M5|24GB/1TB': 1899, 'MacBook Pro 14" M5|32GB/1TB': 2099,
  'Apple Watch Series 12|42mm|Aluminum': 399, 'Apple Watch Series 12|46mm|Aluminum': 429,
  'Apple Watch Series 12|42mm|Titanium': 749, 'Apple Watch Series 12|46mm|Titanium': 799,
  'iPad mini A17 Pro|128GB|Wi-Fi': 499, 'iPad mini A17 Pro|256GB|Wi-Fi': 599, 'iPad mini A17 Pro|512GB|Wi-Fi': 799,
  'iPad mini A17 Pro|128GB|Wi-Fi+Cellular': 649, 'iPad mini A17 Pro|256GB|Wi-Fi+Cellular': 749, 'iPad mini A17 Pro|512GB|Wi-Fi+Cellular': 949,
  'iPad Pro 11" M5|256GB|Wi-Fi': 999, 'iPad Pro 11" M5|512GB|Wi-Fi': 1199, 'iPad Pro 11" M5|1TB|Wi-Fi': 1599, 'iPad Pro 11" M5|2TB|Wi-Fi': 1999,
  'iPad Pro 11" M5|256GB|Wi-Fi+Cellular': 1199, 'iPad Pro 11" M5|512GB|Wi-Fi+Cellular': 1399, 'iPad Pro 11" M5|1TB|Wi-Fi+Cellular': 1799, 'iPad Pro 11" M5|2TB|Wi-Fi+Cellular': 2199,
};
// Старые модели: если рыночной цены нет — не угадываем, а пишем «уточнить» (в магазине — оранжевая плашка «Цену и наличие уточняйте»)
const ASK_MODELS = new Set(['iPhone 14', 'iPhone 14 Plus', 'iPhone 15', 'iPhone 15 Plus', 'MacBook Air 13" M2', 'MacBook Air 13" M3', 'MacBook Air 15" M3', 'iPad Air 11" M3', 'iPad Air 13" M3']);
{
  const usKey = (r) => (r.Категория === 'MacBook' ? `${r.Модель}|${r['RAM/SSD']}`
    : r.Категория === 'Watch' ? `${r.Модель}|${r.Размер}|${r['Корпус/ремешок'].split(' ')[0]}`
      : `${r.Модель}|${r.Память}|${r['SIM/связь']}`);
  const gen = (r) => r.Чип?.match(/^M(\d)/)?.[1] ?? '';
  const rates = new Map();
  for (const r of rows) {
    if (!['market', 'retail'].includes(r._how) || r.Клавиатура === 'РУС') continue;
    const usd = US_PRICE[usKey(r)];
    if (!usd) continue;
    for (const g of [r.Модель, `${r.Модель.split(' ').slice(0, 2).join(' ')}|M${gen(r)}`, `${r.Категория}|M${gen(r)}`]) { if (!rates.has(g)) rates.set(g, []); rates.get(g).push(r['Цена, ₽'] / usd); }
  }
  let n = 0;
  for (const r of rows) {
    if (r._how !== 'estimate' || r.Клавиатура === 'РУС' || ASK_MODELS.has(r.Модель)) continue;
    const usd = US_PRICE[usKey(r)];
    const rate = [r.Модель, `${r.Модель.split(' ').slice(0, 2).join(' ')}|M${gen(r)}`, `${r.Категория}|M${gen(r)}`].map((g) => rates.get(g)).find((v) => v?.length);
    if (!usd || !rate) continue;
    const k = median(rate);
    r['Цена, ₽'] = round500(usd * k);
    r.Комментарий = note(...r.Комментарий.split('; ').filter((x) => x && !/^цена/.test(x)), `цена: США $${usd} × ${k.toFixed(1)} ₽/$ (курс линейки)`);
    r._how = 'usd';
    n++;
  }
  // «РУС»-версии — вслед за обычными, иначе выравнивание потянет обычную вниз к старой оценке «РУС»
  const byName = new Map(rows.map((r) => [r.Название, r]));
  for (const r of rows) {
    if (r.Клавиатура !== 'РУС' || r._how === 'market') continue;
    const base = byName.get(r.Название.replace(/ РУС$/, ''));
    if (base?._how !== 'usd') continue;
    r['Цена, ₽'] = base['Цена, ₽'] + RU_KEYBOARD_EXTRA;
    r.Комментарий = note(...r.Комментарий.split('; ').filter((x) => x && !/^цена/.test(x)), 'РУС: обычная + 1 500');
    r._how = 'usd';
  }
  if (n) console.log(`Цена США × курс линейки: ${n} позиций`);
}

// ---------- выравнивание: больше памяти — дороже; eSIM не дороже SIM+eSIM; Wi-Fi не дороже Cellular ----------
// Поднимаем более дорогую позицию; опускаем, только если над ней точная цена каталога (её не трогаем).
{
  const RANK = { estimate: 1, 'market-color': 1, usd: 2, retail: 2, market: 3 };
  const rank = (r) => RANK[r._how] ?? 1;
  const byName = new Map(rows.map((r) => [r.Название, r]));
  // [дешевле, дороже, наценка второй над первой: доля, рубли]
  const pairs = [];
  const ladders = new Map();
  const addLadder = (k, r) => { if (!ladders.has(k)) ladders.set(k, []); ladders.get(k).push(r); };
  for (const r of rows) {
    if (r.Категория === 'iPhone' || r.Категория === 'iPad') {
      addLadder(`${r.Модель}|${r.Цвет}|${r['SIM/связь']}`, r); // больше памяти — дороже (+5 %)
      const twin = r.Категория === 'iPhone' && r['SIM/связь'] === 'eSIM' ? byName.get(r.Название.replace(/ eSIM$/, ' SIM+eSIM'))
        : r.Категория === 'iPad' && r['SIM/связь'] === 'Wi-Fi' ? byName.get(r.Название.replace(' Wi-Fi ', ' Wi-Fi+Cellular ')) : null;
      if (twin) pairs.push([r, twin, 0, 0]);
      if (r.Категория === 'iPhone' && / Pro$/.test(r.Модель)) { // Pro не дороже Pro Max той же памяти, цвета и SIM
        const max = byName.get(r.Название.replace(r.Модель, `${r.Модель} Max`));
        if (max) pairs.push([r, max, 0, 0]);
      }
    }
    if (r.Категория === 'Watch') addLadder(`${r.Модель}|${r['Корпус/ремешок']}`, r); // больший размер — не дешевле
    if (r.Категория === 'MacBook' && r.Клавиатура === 'РУС') {
      const base = byName.get(r.Название.replace(/ РУС$/, ''));
      if (base) pairs.push([base, r, 0, RU_KEYBOARD_EXTRA]); // «РУС» — минимум на 1 500 дороже обычной
    }
  }
  // Цены поставщика — опорные точки (по ним Артём реально покупает), их не трогаем. Остальные позиции линейки
  // укладываются между ними: младшая не дороже старшей поставщика, старшая не дешевле младшей (+5 % за ступень).
  const isAnchor = (r) => rank(r) === 3;
  const touched = new Set();
  const setPrice = (r, p) => { p = round500(p); if (p !== r['Цена, ₽']) { r['Цена, ₽'] = p; touched.add(r); } };
  const fitLadder = (l, gap) => {
    for (let i = 0; i < l.length; i++) {
      if (isAnchor(l[i])) continue;
      let lb = 0, ub = Infinity;
      for (let j = 0; j < l.length; j++) {
        if (j === i || !isAnchor(l[j])) continue;
        const f = (1 + gap) ** Math.abs(i - j);
        if (j < i) lb = Math.max(lb, l[j]['Цена, ₽'] * f); else ub = Math.min(ub, l[j]['Цена, ₽'] / f);
      }
      const p = l[i]['Цена, ₽'];
      setPrice(l[i], lb > ub ? ub : Math.min(Math.max(p, lb), ub));
    }
    for (let i = 1; i < l.length; i++) {
      if (isAnchor(l[i])) continue;
      const need = l[i - 1]['Цена, ₽'] * (1 + gap);
      if (l[i]['Цена, ₽'] >= need) continue;
      let ub = Infinity;
      for (let j = i + 1; j < l.length; j++) if (isAnchor(l[j])) { ub = l[j]['Цена, ₽'] / (1 + gap) ** (j - i); break; }
      setPrice(l[i], Math.min(need, ub));
    }
    // обратный проход: если старшая упёрлась в цену поставщика, младшая опускается под неё
    for (let i = l.length - 2; i >= 0; i--) {
      if (isAnchor(l[i])) continue;
      const cap = l[i + 1]['Цена, ₽'] / (1 + gap);
      if (l[i]['Цена, ₽'] > cap) setPrice(l[i], cap);
    }
  };
  // eSIM ≤ SIM+eSIM, Wi-Fi ≤ Cellular, обычная + 1 500 ≤ «РУС», младшая конфигурация / старое поколение ≤ старшей / новому
  const fitPair = (lo, hi, gap, abs) => {
    const need = Math.max(lo['Цена, ₽'] + abs, lo['Цена, ₽'] * (1 + gap));
    if (hi['Цена, ₽'] >= need - 1) return;
    // опускаем более дешёвую версию (так цены не раздуваются); поднимаем, только если она — цена поставщика
    if (!isAnchor(lo)) setPrice(lo, Math.min(hi['Цена, ₽'] - abs, hi['Цена, ₽'] / (1 + gap)));
    else if (!isAnchor(hi)) setPrice(hi, need);
  };
  // MacBook и iPad: старшая конфигурация того же поколения — дороже (+3 %); старое поколение с той же
  // или меньшей конфигурацией — не дороже нового (M2 → M3 → M4 → M5 и т. д.; цвета не важны)
  const chipInfo = (chip) => { const m = chip.match(/^M(\d)( Pro| Max)?$/); return m ? { gen: +m[1], tier: (m[2] ?? '').trim() } : null; };
  const num = (s) => (/TB/.test(s) ? parseFloat(s) * 1024 : parseFloat(s));
  const families = new Map();
  for (const r of rows) {
    if (!['MacBook', 'iPad'].includes(r.Категория) || r.Клавиатура === 'РУС') continue;
    const ci = chipInfo(r.Чип);
    if (!ci) continue;
    const line = r.Категория === 'MacBook' ? r.Модель.replace(/ M\d.*$/, '') : `${r.Модель.replace(/ M\d.*$/, '')}|${r['SIM/связь']}`;
    const key = `${line}|${ci.tier}`;
    if (!families.has(key)) families.set(key, []);
    const [ram, ssd] = r.Категория === 'MacBook' ? r['RAM/SSD'].split('/').map(num) : [0, num(r.Память)];
    families.get(key).push({ r, gen: ci.gen, ram, ssd });
  }
  for (const list of families.values()) {
    for (const a of list) for (const b of list) {
      if (a === b || a.gen > b.gen || a.ram > b.ram || a.ssd > b.ssd) continue;
      const sameConfig = a.ram === b.ram && a.ssd === b.ssd;
      if (sameConfig && a.gen === b.gen) continue; // другой цвет той же конфигурации
      pairs.push([a.r, b.r, 0.03, 0]); // и старшая конфигурация, и новое поколение — минимум +3 %
    }
  }
  for (let pass = 0; pass < 10; pass++) {
    const before = [...touched].length;
    for (const l of ladders.values()) fitLadder(l, l[0].Категория === 'Watch' ? 0.03 : 0.05);
    for (const [lo, hi, gap, abs] of pairs) fitPair(lo, hi, gap, abs);
    if (pass > 0 && touched.size === before) break;
  }
  for (const r of touched) if (!r.Комментарий.includes('выровнена')) r.Комментарий = note(...r.Комментарий.split('; ').filter(Boolean), 'цена выровнена');
  if (touched.size) console.log(`Выравнивание: поправлено позиций ${touched.size}`);
  // «РУС» после всех выравниваний: обычная + 1 500 (кроме точной цены поставщика с «кл»)
  for (const r of rows) {
    if (r.Клавиатура !== 'РУС' || r._how === 'market') continue;
    const base = byName.get(r.Название.replace(/ РУС$/, ''));
    if (base) r['Цена, ₽'] = base['Цена, ₽'] + RU_KEYBOARD_EXTRA;
  }
  // старые модели без рыночной цены — «уточнить» (в магазине оранжевая плашка «Цену и наличие уточняйте»)
  for (const r of rows) {
    const base = r.Клавиатура === 'РУС' ? byName.get(r.Название.replace(/ РУС$/, '')) : r;
    if (ASK_MODELS.has(r.Модель) && base?._how === 'estimate') {
      r.Наличие = 'уточнить';
      r.Комментарий = note(...r.Комментарий.split('; ').filter(Boolean), 'цену и наличие уточнять');
    }
  }
}

// ---------- проверки ----------
const problems = [];
const seen = new Set();
const NAME_RULES = {
  iPhone: /^iPhone (1[4-8](e| Plus| Pro| Pro Max)?|Air|Duo) \d+(GB|TB) [A-Za-z ]+ (eSIM|SIM\+eSIM)$/,
  iPad: /^iPad( Air| Pro| mini)? [\d.]+" (M\d|A1\d( Pro)?) \d+(GB|TB) (Wi-Fi|Wi-Fi\+Cellular) [A-Za-z ]+$/,
  MacBook: /^MacBook (Air|Pro|Neo) 1[3-6]" (M\d( Pro| Max)?|A18 Pro) \d+GB\/\d+(GB|TB) [A-Za-z ]+( РУС)?$/,
  Watch: /^Apple Watch (Series 1[12]|SE 3|Ultra [34]) \d\dmm (Aluminum|Titanium|Ceramic) [A-Za-z ]+$/,
  AirPods: /^AirPods [A-Za-z0-9 -]+$/,
};
for (const r of rows) {
  if (seen.has(r.Название)) problems.push(`дубль названия: ${r.Название}`);
  seen.add(r.Название);
  if (!NAME_RULES[r.Категория].test(r.Название)) problems.push(`название не по правилу: ${r.Название}`);
  if (!(r['Цена, ₽'] > 0) || r['Цена, ₽'] % 500) problems.push(`цена: ${r.Название} = ${r['Цена, ₽']}`);
  if (r.Цвет && !r['Цвет (рус)']) problems.push(`нет русского цвета: ${r.Название}`);
}
rows.forEach((r, i) => { if (r.ID !== i + 1) problems.push(`ID не по порядку: ${r.ID}`); });
// здравый смысл: eSIM не дороже SIM+eSIM; больше памяти — не дешевле
const byName = new Map(rows.map((r) => [r.Название, r]));
for (const r of rows) {
  if (r.Категория === 'iPhone' && r['SIM/связь'] === 'eSIM') {
    const twin = byName.get(r.Название.replace(/ eSIM$/, ' SIM+eSIM'));
    if (twin && twin['Цена, ₽'] < r['Цена, ₽']) problems.push(`eSIM дороже SIM+eSIM: ${r.Название}`);
  }
  if (r.Категория === 'iPad' && r['SIM/связь'] === 'Wi-Fi') {
    const twin = byName.get(r.Название.replace(' Wi-Fi ', ' Wi-Fi+Cellular '));
    if (twin && twin['Цена, ₽'] < r['Цена, ₽']) problems.push(`Wi-Fi дороже Cellular: ${r.Название}`);
  }
}
const groups = new Map();
for (const r of rows) {
  if (!['iPhone', 'iPad'].includes(r.Категория)) continue;
  const k = `${r.Модель} | ${r.Цвет} | ${r['SIM/связь']}`;
  if (!groups.has(k)) groups.set(k, []);
  groups.get(k).push(r);
}
for (const [k, g] of groups) for (let i = 1; i < g.length; i++) {
  if (g[i]['Цена, ₽'] <= g[i - 1]['Цена, ₽']) problems.push(`память больше, а цена не выше: ${k}: ${g[i - 1].Память} ${g[i - 1]['Цена, ₽']} → ${g[i].Память} ${g[i]['Цена, ₽']}`);
}

// ---------- запись файлов ----------
const table = rows.map((r) => COLUMNS.map((c) => r[c] ?? ''));
const csvCell = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
writeFileSync(join(here, `${outName}.csv`), '﻿' + [COLUMNS, ...table].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n');

const ws = XLSX.utils.aoa_to_sheet([COLUMNS, ...table]);
ws['!cols'] = [5, 10, 24, 52, 6, 8, 18, 22, 14, 8, 10, 12, 40, 11, 10, 11, 11, 32, 40, 14, 40].map((wch) => ({ wch }));
ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: table.length, c: COLUMNS.length - 1 } }) };
const help = XLSX.utils.aoa_to_sheet([
  ['Как устроена таблица'],
  [''],
  ['Одна строка — один товар, который можно купить. ID не меняем и не используем повторно (новый товар — новый номер в конце).'],
  ['Цена, ₽ — ЗАКУПОЧНАЯ цена (уровень поставщика, у которого берёт Артём). Наценка магазина добавляется отдельно, её размер ещё решается. Цена может отличаться даже у разных цветов.'],
  ['Магазин сам пересчитывает цены каждый день по курсу «доллар ЦБ + 4 %» и округляет до 500 ₽: закупка × курс сегодня ÷ курс в день закупки + наценка. Новая закупочная цена становится новой точкой отсчёта на курс этого дня.'],
  ['Показывать: «да» — товар виден в магазине, «нет» — скрыт (строку не удаляем).'],
  ['Наличие: «в наличии» — обычная карточка с ценой; «уточнить» — старая модель без рыночной цены: в магазине оранжевая плашка «Цену и наличие уточняйте».'],
  ['Фото — ключ фотографии: одинаковый у моделей одного дизайна (17 Pro и 17 Pro Max) и одного цвета.'],
  ['Синонимы и Артикул Apple — подсказки, по которым позже будем узнавать товар в прайсах поставщиков.'],
  ['Комментарий: «цена — оценка» — на рынке такой позиции не нашлось, цена посчитана по соседним; «цена по другому цвету» — взята цена той же конфигурации в другом цвете; «редко» — старая модель, бывает не всегда.'],
  ['Apple Watch: размер ремешка (S/M или M/L) покупатель выбирает при заказе, на цену не влияет.'],
  ['MacBook: «РУС» — клавиатура с русской гравировкой (обычно +1 500 ₽).'],
  [''],
  ['Цены — стартовые, по рынку на 24.10.2026.'],
]);
help['!cols'] = [{ wch: 140 }];
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, 'Каталог');
XLSX.utils.book_append_sheet(wb, help, 'Как пользоваться');
if (kReport.length) {
  const how = XLSX.utils.aoa_to_sheet([
    ['Откуда цены (закупочные, 24.10.2026)'],
    ['1) Есть позиция в прайсе поставщика — его цена (опорная, не меняется).'],
    ['2) Нет — цена розничного магазина (Store77, apple-market) минус процент, на который поставщик дешевле этого магазина в линейке (если совпадений меньше 3 или процент странный — по категории).'],
    ['3) Нет нигде — цена той же конфигурации другого цвета, иначе оценка по соседним вариантам (комментарий «цена — оценка»).'],
    ['4) Выравнивание: больше памяти — дороже; eSIM ≤ SIM+eSIM; Wi-Fi ≤ Cellular; Pro ≤ Pro Max; старое поколение Mac/iPad ≤ новое; «РУС» = обычная + 1 500.'],
    [''],
    ['Магазин', 'Линейка / категория', 'Совпадений', 'Поставщик дешевле магазина на, %'],
    ...kReport,
  ]);
  how['!cols'] = [{ wch: 16 }, { wch: 40 }, { wch: 12 }, { wch: 30 }];
  XLSX.utils.book_append_sheet(wb, how, 'Как считали цены');
}
XLSX.writeFile(wb, join(here, `${outName}.xlsx`));

// ---------- отчёт ----------
const count = (f) => rows.filter(f).length;
console.log(`Строк: ${rows.length}`);
for (const cat of ['iPhone', 'iPad', 'MacBook', 'Watch', 'AirPods']) {
  const inCat = (f) => count((r) => r.Категория === cat && f(r));
  console.log(`  ${cat}: ${inCat(() => true)} (каталог: ${inCat((r) => r._how === 'market')}, магазины: ${inCat((r) => r._how === 'retail')}, по другому цвету: ${inCat((r) => r._how === 'market-color')}, оценка: ${inCat((r) => r._how === 'estimate')}, выровнено: ${inCat((r) => r.Комментарий.includes('выровнена'))})`);
}
console.log(problems.length ? `Проблемы (${problems.length}):\n  ${problems.join('\n  ')}` : 'Проверки: всё чисто');
