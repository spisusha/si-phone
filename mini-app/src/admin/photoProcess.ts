// Подготовка фото товара в браузере — чтобы все фото магазина были одного вида, как наши 111:
// белый/однотонный фон → прозрачный (заливкой от краёв, белое внутри товара не трогаем), обрезка пустых краёв,
// товар по центру квадрата 1000×1000 (не больше 880 px), сохранение в WebP (прозрачный фон, малый вес).
// Картинка рисуется заново на холсте — из файла уходят метаданные и всё постороннее.

const CANVAS = 1000;
const BOX = 880;
const MAX_SRC = 2000;            // большие фото уменьшаем до обработки (быстрее, качество то же)
const MAX_FILE = 15 * 1024 * 1024;
const HARD = 12, SOFT = 36;      // насколько цвет может отличаться от фона: до HARD — фон, до SOFT — мягкая кромка

export interface Processed {
  blob: Blob;
  url: string;          // для предпросмотра
  ext: 'webp' | 'png';
  bgRemoved: boolean;
  warnings: string[];
}

export async function processPhoto(file: File): Promise<Processed> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type) && !/\.(jpe?g|png|webp)$/i.test(file.name)) {
    throw new Error('Нужна картинка JPG, PNG или WebP');
  }
  if (file.size > MAX_FILE) throw new Error('Файл больше 15 МБ');
  const warnings: string[] = [];
  const bmp = await createImageBitmap(file).catch(() => { throw new Error('Не получилось открыть картинку'); });
  if (Math.min(bmp.width, bmp.height) < 600) warnings.push('Фото маленькое (меньше 600 px) — может быть нечётким. Лучше найти от 800 px');

  const k = Math.min(1, MAX_SRC / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * k), h = Math.round(bmp.height * k);
  const src = document.createElement('canvas');
  src.width = w; src.height = h;
  const sctx = src.getContext('2d', { willReadFrequently: true })!;
  sctx.drawImage(bmp, 0, 0, w, h);
  const img = sctx.getImageData(0, 0, w, h);
  const d = img.data;

  // ---- фон: смотрим на края картинки ----
  const border: number[] = [];
  const step = Math.max(1, Math.floor((w + h) / 800));
  for (let x = 0; x < w; x += step) border.push((x) * 4, ((h - 1) * w + x) * 4);
  for (let y = 0; y < h; y += step) border.push((y * w) * 4, (y * w + w - 1) * 4);
  const transparentShare = border.filter((i) => d[i + 3] < 16).length / border.length;

  let bgRemoved = false;
  if (transparentShare < 0.6) {
    const opaque = border.filter((i) => d[i + 3] >= 16);
    const avg = [0, 1, 2].map((c) => opaque.reduce((s, i) => s + d[i + c], 0) / opaque.length);
    const dist = (i: number) => Math.max(Math.abs(d[i] - avg[0]), Math.abs(d[i + 1] - avg[1]), Math.abs(d[i + 2] - avg[2]));
    const flatShare = opaque.filter((i) => dist(i) <= HARD).length / opaque.length;
    const light = (avg[0] + avg[1] + avg[2]) / 3 >= 200;
    if (flatShare >= 0.8 && light) {
      // заливка от краёв: стираем только фон, связанный с краем картинки
      const seen = new Uint8Array(w * h);
      const stack: number[] = [];
      for (let x = 0; x < w; x++) stack.push(x, (h - 1) * w + x);
      for (let y = 0; y < h; y++) stack.push(y * w, y * w + w - 1);
      while (stack.length) {
        const p = stack.pop()!;
        if (seen[p]) continue;
        seen[p] = 1;
        const i = p * 4;
        if (d[i + 3] >= 16) {
          const dd = dist(i);
          if (dd > SOFT) continue;
          d[i + 3] = dd <= HARD ? 0 : Math.round(d[i + 3] * ((dd - HARD) / (SOFT - HARD)));
          if (dd > HARD) continue; // кромку не расширяем дальше
        }
        const x = p % w, y = (p - x) / w;
        if (x > 0) stack.push(p - 1);
        if (x < w - 1) stack.push(p + 1);
        if (y > 0) stack.push(p - w);
        if (y < h - 1) stack.push(p + w);
      }
      sctx.putImageData(img, 0, 0);
      bgRemoved = true;
    } else {
      warnings.push('Фон не однотонный — убрать его не получилось. Найдите фото на белом фоне, без теней и «пола»');
    }
  }

  // ---- обрезка пустых краёв ----
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (d[(y * w + x) * 4 + 3] > 12) {
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) throw new Error('На фото не нашлось товара');
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
  if (bw * bh < w * h * 0.04) warnings.push('Товар на фото очень маленький — лучше найти крупнее');
  if (bgRemoved) {
    // Тень бывает только снизу: полупрозрачная полоса у низа товара, а у верха края чёткие.
    // Мягкий скруглённый край самого товара полупрозрачен и сверху, и снизу — его не считаем.
    const semiShare = (ys: number[]) => {
      let semi = 0, total = 0;
      for (const y of ys) for (let x = x0; x <= x1; x += 3) {
        const a = d[(y * w + x) * 4 + 3];
        if (a > 12) { total++; if (a < 200) semi++; }
      }
      return total > 10 ? semi / total : 0;
    };
    // Тёмная тень не становится прозрачной — остаётся светло-серой бесцветной полосой под товаром
    const grayShare = (ys: number[]) => {
      let gray = 0, total = 0;
      for (const y of ys) for (let x = x0; x <= x1; x += 3) {
        const i = (y * w + x) * 4;
        if (d[i + 3] <= 12) continue;
        total++;
        const mx = Math.max(d[i], d[i + 1], d[i + 2]), mn = Math.min(d[i], d[i + 1], d[i + 2]);
        if (mx - mn <= 18 && (d[i] + d[i + 1] + d[i + 2]) / 3 >= 110 && (d[i] + d[i + 1] + d[i + 2]) / 3 <= 240) gray++;
      }
      return total > 10 ? gray / total : 0;
    };
    const band = Math.max(2, Math.round((y1 - y0) * 0.03));
    const rows = (from: number, dir: 1 | -1) => Array.from({ length: band }, (_, i) => from + dir * i);
    const bottom = rows(y1, -1), top = rows(y0, 1);
    if ((semiShare(bottom) > 0.6 && semiShare(top) < 0.3) || (grayShare(bottom) > 0.5 && grayShare(top) < 0.2)) {
      warnings.push('Похоже, на фото есть тень — проверьте результат; лучше фото без тени');
    }
  }

  // ---- товар по центру квадрата 1000×1000 ----
  const scale = Math.min(BOX / bw, BOX / bh, 2);
  const tw = Math.round(bw * scale), th = Math.round(bh * scale);
  const out = document.createElement('canvas');
  out.width = CANVAS; out.height = CANVAS;
  const octx = out.getContext('2d')!;
  octx.imageSmoothingEnabled = true;
  octx.imageSmoothingQuality = 'high';
  octx.drawImage(src, x0, y0, bw, bh, Math.round((CANVAS - tw) / 2), Math.round((CANVAS - th) / 2), tw, th);

  let blob = await new Promise<Blob | null>((r) => out.toBlob(r, 'image/webp', 0.88));
  let ext: 'webp' | 'png' = 'webp';
  if (!blob || blob.type !== 'image/webp') { // старые Safari не умеют WebP — тогда PNG
    blob = await new Promise<Blob | null>((r) => out.toBlob(r, 'image/png'));
    ext = 'png';
  }
  if (!blob) throw new Error('Не получилось сохранить картинку');
  if (blob.size > 3 * 1024 * 1024) throw new Error('После обработки файл больше 3 МБ — попробуйте другое фото');
  return { blob, url: URL.createObjectURL(blob), ext, bgRemoved, warnings };
}
