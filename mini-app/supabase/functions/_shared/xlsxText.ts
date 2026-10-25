// Excel (.xlsx) → текст «ячейки через табуляцию, строки через перевод строки» для распознавания прайса.
// Без сторонних библиотек: .xlsx — это zip с XML внутри; распаковка — встроенная DecompressionStream
// (есть в браузерах, Telegram, Deno и Cloudflare Workers). Старый .xls (двоичный) не читаем — просим сохранить как .xlsx.
// Свой маленький разбор вместо библиотеки: у популярной xlsx в npm уязвимости разбора чужих файлов без исправления.

const MAX_FILE = 10 * 1024 * 1024;   // 10 МБ
const MAX_ROWS = 20_000;
const MAX_UNZIPPED = 60 * 1024 * 1024;

interface ZipEntry { name: string; method: number; size: number; offset: number }

function readZipEntries(buf: Uint8Array): ZipEntry[] {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 66_000); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Это не файл .xlsx');
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const out: ZipEntry[] = [];
  const dec = new TextDecoder();
  for (let i = 0; i < count && p + 46 <= buf.length; i++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true);
    const size = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    const offset = dv.getUint32(p + 42, true);
    const name = dec.decode(buf.subarray(p + 46, p + 46 + nameLen));
    out.push({ name, method, size, offset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

async function readEntry(buf: Uint8Array, e: ZipEntry): Promise<string> {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (dv.getUint32(e.offset, true) !== 0x04034b50) throw new Error('Файл повреждён');
  const start = e.offset + 30 + dv.getUint16(e.offset + 26, true) + dv.getUint16(e.offset + 28, true);
  const data = buf.slice(start, start + e.size); // копия с обычным ArrayBuffer — так её принимает Blob
  if (e.method === 0) return new TextDecoder().decode(data);
  if (e.method !== 8) throw new Error('Неизвестное сжатие в файле');
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > MAX_UNZIPPED) throw new Error('Файл слишком большой');
    chunks.push(value);
  }
  const all = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) { all.set(c, o); o += c.length; }
  return new TextDecoder().decode(all);
}

const ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const unxml = (s: string) => s.replace(/&(#x?[0-9a-f]+|amp|lt|gt|quot|apos);/gi, (_, e: string) =>
  e[0] === '#' ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENT[e.toLowerCase()] ?? '');
const texts = (xml: string) => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => unxml(m[1])).join('');

/** Текст всех листов книги .xlsx: строка таблицы = строка текста, ячейки через табуляцию. */
export async function xlsxToText(bytes: ArrayBuffer | Uint8Array): Promise<string> {
  const buf = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (buf.length > MAX_FILE) throw new Error('Файл больше 10 МБ');
  if (buf[0] === 0xd0 && buf[1] === 0xcf) throw new Error('Это старый формат .xls — сохраните файл как .xlsx или вставьте прайс текстом');
  const entries = readZipEntries(buf);
  const shared: string[] = [];
  const ss = entries.find((e) => e.name === 'xl/sharedStrings.xml');
  if (ss) for (const m of (await readEntry(buf, ss)).matchAll(/<si>([\s\S]*?)<\/si>/g)) shared.push(texts(m[1]));
  const sheets = entries.filter((e) => /^xl\/worksheets\/sheet\d+\.xml$/.test(e.name))
    .sort((a, b) => Number(a.name.match(/\d+/)![0]) - Number(b.name.match(/\d+/)![0]));
  if (!sheets.length) throw new Error('В файле нет листов');
  const lines: string[] = [];
  for (const sh of sheets) {
    const xml = await readEntry(buf, sh);
    for (const row of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
      const cells: string[] = [];
      for (const c of row[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const attrs = c[1], inner = c[2] ?? '';
        const type = /\bt="([^"]+)"/.exec(attrs)?.[1];
        const v = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1];
        let val = '';
        if (type === 's' && v != null) val = shared[Number(v)] ?? '';
        else if (type === 'inlineStr') val = texts(inner);
        else if (v != null) val = unxml(v);
        val = val.replace(/[\t\r\n]+/g, ' ').trim();
        if (val) cells.push(val);
      }
      if (cells.length) lines.push(cells.join('\t'));
      if (lines.length >= MAX_ROWS) return lines.join('\n');
    }
  }
  return lines.join('\n');
}
