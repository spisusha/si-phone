// Распознавание прайса поставщика: строка «iPhone 17 Pro 512 (eSIM + SIM) Orange 113000» → позиция каталога и цена.
// Чистый TypeScript без зависимостей: работает и в функциях Supabase (Deno), и в Node (проверка на настоящем прайсе).
//
// Порядок:
// 1. цена — последнее число в строке (115000, 115 000, 115.000, 115к); строки без цены и «актив/предактив» пропускаем;
// 2. артикул Apple (MDHJ4) — самый надёжный признак;
// 3. иначе модель (iPhone 17 Pro Max, iPad Air 11" M3, MacBook Air 13" M5, Watch Ultra 3, AirPods Pro 3),
//    затем память, SIM / связь, RAM/SSD, клавиатура, размер часов, цвет (по синонимам позиции);
// 4. одна подходящая позиция — «узнал»; несколько — «выберите» (не угадываем); ни одной — «не понял».

export interface CatalogRow {
  id: number;
  category: string;          // iPhone | iPad | MacBook | Watch | AirPods
  model: string;             // «iPhone 17 Pro Max», 'MacBook Air 13" M5'
  name: string;
  storage: string | null;    // «256GB», «1TB»
  color: string | null;
  color_ru: string | null;
  sim: string | null;        // eSIM | SIM+eSIM | Wi-Fi | Wi-Fi+Cellular
  size: string | null;       // «46mm», «13"»
  chip: string | null;
  ram_ssd: string | null;    // «16GB/512GB»
  band: string | null;
  keyboard: string | null;   // «РУС» или пусто
  synonyms: string | null;
  apple_parts: string | null;
}

export type LineKind = 'match' | 'choose' | 'unknown' | 'skip';

export interface LineResult {
  line: number;              // номер строки в присланном тексте (с 1)
  text: string;
  price: number | null;
  kind: LineKind;
  itemId?: number;
  candidates?: number[];     // для «выберите» — до 12 вариантов
  reason?: string;
}

// ---------- нормализация ----------

const L = '(?<![a-zа-я0-9])';  // начало слова (\b не работает с кириллицей)
const R = '(?![a-zа-я0-9])';   // конец слова
// Шаблоны собираются только из наших слов ниже (не из присланного текста); сам прайс ограничен: 2000 строк по 300 символов.
const word = (w: string) => new RegExp(`${L}${w}${R}`, 'g'); // nosemgrep: detect-non-literal-regexp

// Русские написания → английские (как пишут в прайсах и в чатах)
const RU: Array<[RegExp, string]> = [
  [word('айфон[а-я]*'), 'iphone'], [word('айпад[а-я]*'), 'ipad'], [word('макбук[а-я]*'), 'macbook'],
  [word('(?:эйр|эир|аир)подс[а-я]*'), 'airpods'], [word('наушники'), 'airpods'], [word('(?:часы|вотч|эпл вотч)'), 'watch'],
  [word('про'), 'pro'], [word('макс'), 'max'], [word('плюс'), 'plus'], [word('(?:эйр|эир)'), 'air'], [word('мини'), 'mini'],
  [word('ультра'), 'ultra'], [word('серия'), 'series'], [word('дуо'), 'duo'], [word('нео'), 'neo'],
  [word('(?:е|и)[\\s-]?сим'), 'esim'], [word('сим(?:ка)?'), 'sim'],
  [/(\d)\s?е(?![a-zа-я0-9])/g, '$1e'], [word('тб'), 'tb'], [word('гб'), 'gb'], [word('мм'), 'mm'], [word('м(\\d)'), 'm$1'],
];

const ABBR: Array<[RegExp, string]> = [
  [/ sp /g, ' space '], [/ ti /g, ' titanium '], [/ al /g, ' aluminum '],
  [/ sb /g, ' sport band '], [/ sl /g, ' sport loop '], [/ tl /g, ' trail loop '], [/ ob /g, ' ocean band '],
  [/ ml /g, ' milanese loop '], [/ tml /g, ' titanium milanese loop '], [/ alp /g, ' alpine loop '],
];

export function normalize(s: string): string {
  let t = ` ${s.toLowerCase().replace(/ё/g, 'е')} `;
  for (const [re, to] of RU) t = t.replace(re, to);
  t = t
    .replace(/(?<![a-z])e[\s-]?sim/g, 'esim') // но не «blue sim»
    .replace(/(?:esim\s*\+\s*sim|sim\s*\+\s*esim|nano[\s-]?sim|dual[\s-]?sim|2\s?sim|physical sim)/g, ' simesim ')
    .replace(/(?<![a-z])sim(?![a-z])/g, 'simesim') // одиночное «sim» — физическая SIM, у Apple это версия SIM+eSIM
    .replace(/wi[\s/-]?fi/g, 'wifi')
    .replace(/usb[\s-]?c|type[\s-]?c/g, 'usbc')
    .replace(/(\d)\s*(gb|tb|mm)(?![a-z])/g, '$1$2')
    .replace(/\.(?!\d)/g, ' ')
    .replace(/[()\[\]{}"'″«»|;:!?,_*#/\\+]+/g, ' ')
    .replace(/\s+/g, ' ');
  t = ` ${t.trim()} `;
  // Сокращения поставщиков: «Sp Gray», у часов «SB» (Sport Band), «TL» (Trail Loop), «OB» (Ocean Band)…
  for (const [re, to] of ABBR) t = t.replace(re, to);
  return t;
}

const has = (t: string, phrase: string) => phrase.length > 0 && t.includes(` ${phrase} `);

// ---------- цена ----------

export function parsePrice(raw: string): number | null {
  const s = raw.replace(/\/[A-Z0-9]{4,6}\//gi, ' ');
  const re = /(\d{1,3}(?:[  .,]\d{3})+|\d{4,7})(?:[.,]\d{1,2})?\s*(к|k|т)?(?![\d])/gi;
  let last: number | null = null;
  for (const m of s.matchAll(re)) {
    let n = Number(m[1].replace(/[  .,]/g, ''));
    if (m[2]) n *= 1000;
    if (n >= 1000 && n <= 5_000_000) last = n;
  }
  // «115к» без четырёх цифр
  for (const m of s.matchAll(/(?<![\d.,])(\d{2,4})\s*(к|k|тыс)(?![a-zа-я])/gi)) last = Number(m[1]) * 1000;
  return last;
}

// ---------- признаки строки ----------

function storageGb(t: string): number | null {
  const tb = /\s(\d)\s?tb\s/.exec(t);
  if (tb) return Number(tb[1]) * 1024;
  const gb = /\s(64|128|256|512)(?:gb)?\s/.exec(t);
  return gb ? Number(gb[1]) : null;
}

function ramSsd(raw: string): string | null {
  const m = /(?:^|[^\d])(8|16|18|24|32|36|48|64|128)\s*(?:gb|гб)?\s*\/\s*(\d+)\s*(tb|тб|gb|гб)?/i.exec(raw);
  if (!m) return null;
  const ssd = Number(m[2]);
  const isTb = /t/i.test(m[3] ?? '') || ssd <= 8;
  return `${m[1]}GB/${isTb ? `${ssd}TB` : `${ssd}GB`}`;
}

function category(t: string): string | null {
  if (/ (watch|ultra [234]|series 1\d|s1[01-9]|se ?3) /.test(t)) return 'Watch';
  if (/ airpods /.test(t)) return 'AirPods';
  if (/ (macbook|mba|mbp) /.test(t) || /^ (air|pro|neo) 1[3-6] /.test(t) || / \(?m\d\/\d/.test(t)) return 'MacBook';
  if (/ ipad /.test(t)) return 'iPad';
  if (/ (iphone|duo) /.test(t) || / 1[4-9] ?(e|pro|pm|promax|plus|air)? /.test(t)) return 'iPhone';
  return null;
}

const cap = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());

// Название модели, как в каталоге
function modelTitle(cat: string, t: string): string | null {
  switch (cat) {
    case 'iPhone': {
      if (/ (duo|fold) /.test(t)) return 'iPhone Duo';
      if (/ air /.test(t)) return 'iPhone Air'; // поставщики пишут и «iPhone Air», и «iPhone 17 Air»
      const m = / (1[4-9])\s?(e)?\s?(pro ?max|promax|pm|pro|plus|\+)? /.exec(t);
      if (!m) return null;
      const kind = !m[3] ? '' : /max|pm/.test(m[3]) ? ' Pro Max' : m[3] === 'pro' ? ' Pro' : ' Plus';
      return `iPhone ${m[1]}${m[2] ? 'e' : ''}${kind}`;
    }
    case 'iPad': {
      const line = / ipad pro /.test(t) ? 'iPad Pro' : / ipad air /.test(t) ? 'iPad Air' : / ipad mini /.test(t) ? 'iPad mini' : 'iPad';
      let chip = / (m[2-5]) /.exec(t)?.[1]?.toUpperCase() ?? (/ a17 ?pro /.test(t) ? 'A17 Pro' : / a16 /.test(t) ? 'A16' : '');
      if (!chip && line === 'iPad mini') chip = 'A17 Pro';
      if (!chip && line === 'iPad') chip = 'A16';
      if (!chip && / air 7 /.test(t)) chip = 'M3';
      if (!chip && / air 8 /.test(t)) chip = 'M4';
      if (line === 'iPad mini') return `iPad mini ${chip}`;
      if (line === 'iPad') return `iPad 11" ${chip}`;
      const size = / (11|13)(?:"|in)? /.exec(t.replace(/ air [78] /, ' air '))?.[1];
      return size && chip ? `${line} ${size}" ${chip}` : null;
    }
    case 'MacBook': {
      if (/ neo /.test(t)) return 'MacBook Neo 13" A18 Pro';
      const line = / pro 1[46] /.test(t) || / mbp /.test(t) || (/ macbook pro /.test(t)) ? 'MacBook Pro' : 'MacBook Air';
      const size = / (13|14|15|16)(?:"|in)? /.exec(t)?.[1];
      const chip = / (m[2-5])(?: ?(pro|max))? /.exec(t.replace(/\//g, ' '));
      if (!size || !chip) return null;
      return `${line} ${size}" ${chip[1].toUpperCase()}${chip[2] ? ' ' + cap(chip[2]) : ''}`;
    }
    case 'Watch': {
      const u = / ultra ?([234]) /.exec(t); if (u) return `Apple Watch Ultra ${u[1]}`;
      const s = / (?:series ?|s)(1\d) /.exec(t); if (s) return `Apple Watch Series ${s[1]}`;
      if (/ se ?3 /.test(t)) return 'Apple Watch SE 3';
      return null;
    }
    case 'AirPods': {
      if (/ max /.test(t)) return / max 2 /.test(t) ? 'AirPods Max 2' : 'AirPods Max USB-C';
      if (/ pro ?3 /.test(t)) return 'AirPods Pro 3';
      if (/ pro ?2 /.test(t) || / pro /.test(t)) return 'AirPods Pro 2 USB-C';
      if (/ 5 /.test(t)) return / (wireless|charging|беспровод[а-я]*|зарядк[а-я]*) /.test(t) ? 'AirPods 5 Wireless Charging' : 'AirPods 5';
      if (/ 4 /.test(t)) return / (anc|шумо[а-я]*) /.test(t) ? 'AirPods 4 ANC' : 'AirPods 4';
      return null;
    }
  }
  return null;
}

// ---------- сопоставление ----------

const normTitle = (s: string) => s.toLowerCase().replace(/[″"]/g, '"').replace(/\s+/g, ' ').trim();

export interface Matcher { match(text: string): LineResult[] }

export function createMatcher(rows: CatalogRow[]): Matcher {
  const byModel = new Map<string, CatalogRow[]>();
  for (const r of rows) {
    const k = normTitle(r.model);
    if (!byModel.has(k)) byModel.set(k, []);
    byModel.get(k)!.push(r);
  }
  // Синонимы, которые отличают позицию от соседей по модели (цвет, ремешок, «рус»), — общие для модели убираем
  const specific = new Map<number, string[]>();
  for (const items of byModel.values()) {
    const lists = items.map((r) => (r.synonyms ?? '').split(',').map((s) => normalize(s).trim()).filter(Boolean));
    const common = lists.length > 1 ? lists.reduce((a, b) => a.filter((x) => b.includes(x))) : [];
    items.forEach((r, i) => {
      const own = lists[i].filter((x) => !common.includes(x));
      const extra = [r.color, r.color_ru].filter(Boolean).map((s) => normalize(String(s)).trim());
      specific.set(r.id, [...new Set([...own, ...extra])].filter((x) => x.length > 1));
    });
  }
  const byPart = new Map<string, CatalogRow[]>();
  for (const r of rows) {
    for (const p of (r.apple_parts ?? '').split(/[,\s]+/).filter((x) => x.length >= 4)) {
      const k = p.toUpperCase();
      if (!byPart.has(k)) byPart.set(k, []);
      byPart.get(k)!.push(r);
    }
  }

  function matchOne(raw: string): Omit<LineResult, 'line' | 'text'> {
    const price = parsePrice(raw);
    if (/(пред)?актив|б\/у|\bused\b|восстанов|refurb|уценк/i.test(raw)) return { price, kind: 'skip', reason: 'активированный / б/у — не берём' };
    if (price == null) return { price, kind: 'skip', reason: 'нет цены' };
    if (/samsung|galaxy|xiaomi|redmi|huawei|honor|google pixel|oneplus|sony|garmin|dyson|самсунг|сяоми/i.test(raw)) {
      return { price, kind: 'skip', reason: 'не Apple' };
    }
    const t = normalize(raw);
    const ru = /(рус|ru кл|кл\.?(?![a-zа-я])|гравир)/i.test(raw);

    // 1) артикул Apple
    const parts = [...raw.toUpperCase().matchAll(/(?<![A-Z0-9])([A-Z]{2}[A-Z0-9]{2,3})(?![A-Z0-9])/g)].map((m) => m[1]);
    let cands: CatalogRow[] = [];
    for (const p of parts) {
      const hit = byPart.get(p) ?? byPart.get(p.slice(0, 4));
      if (hit && /\d/.test(p)) cands = cands.concat(hit);
    }
    cands = [...new Set(cands)];

    // 2) модель
    if (!cands.length) {
      const cat = category(t);
      if (!cat) return { price, kind: 'unknown', reason: 'не понял, что за техника' };
      const title = modelTitle(cat, t);
      if (!title) return { price, kind: 'unknown', reason: `${cat}: не понял модель` };
      cands = byModel.get(normTitle(title)) ?? [];
      if (!cands.length) return { price, kind: 'unknown', reason: `нет в каталоге: ${title}` };
    }

    // 3) уточнение
    const keep = (f: (r: CatalogRow) => boolean) => { const n = cands.filter(f); if (n.length) cands = n; return n.length; };
    const cat = cands[0].category;
    if (cat === 'iPhone' || cat === 'iPad') {
      const st = storageGb(t);
      if (st != null && !keep((r) => storageGb(normalize(r.storage ?? '')) === st)) return { price, kind: 'unknown', reason: 'нет такой памяти' };
    }
    // SIM и связь: если в строке указано явно, а такой версии в каталоге нет — это другой товар, цену не трогаем
    if (cat === 'iPhone') {
      const sim = / simesim /.test(t) ? 'SIM+eSIM' : / esim /.test(t) ? 'eSIM' : null;
      if (sim && !keep((r) => r.sim === sim)) return { price, kind: 'unknown', reason: `версии ${sim} нет в каталоге` };
    }
    if (cat === 'iPad') {
      const conn = / (lte|cellular|4g|5g|сотов[а-я]*) /.test(t) ? 'Wi-Fi+Cellular' : 'Wi-Fi';
      if (!keep((r) => r.sim === conn)) return { price, kind: 'unknown', reason: `версии ${conn} нет в каталоге` };
    }
    if (cat === 'MacBook') {
      const rs = ramSsd(raw);
      if (rs && !keep((r) => (r.ram_ssd ?? '').toUpperCase() === rs.toUpperCase())) return { price, kind: 'unknown', reason: `нет конфигурации ${rs}` };
      keep((r) => (r.keyboard === 'РУС') === ru);
    }
    if (cat === 'Watch') {
      const mm = / (38|40|41|42|44|45|46|49)(?:mm)? /.exec(t)?.[1];
      if (mm) keep((r) => (r.size ?? '').startsWith(mm));
    }
    // цвет / ремешок: оставляем позиции с самым длинным совпавшим отличительным словом
    if (cands.length > 1) {
      const score = (r: CatalogRow) => (specific.get(r.id) ?? []).filter((p) => has(t, p)).reduce((s, p) => s + p.length, 0);
      const best = Math.max(...cands.map(score));
      if (best > 0) cands = cands.filter((r) => score(r) === best);
    }

    if (cands.length === 1) return { price, kind: 'match', itemId: cands[0].id };
    return { price, kind: 'choose', candidates: cands.slice(0, 12).map((r) => r.id), reason: 'несколько вариантов' };
  }

  return {
    match(text: string): LineResult[] {
      return text.split(/\r?\n/).map((s, i) => ({ s: s.trim(), i }))
        .filter(({ s }) => s.length > 2 && /\d/.test(s))
        .slice(0, 2000)
        .map(({ s, i }) => ({ line: i + 1, text: s.slice(0, 300), ...matchOne(s.slice(0, 300)) }));
    },
  };
}
