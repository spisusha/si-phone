import { supabase } from './supabaseClient';
import type { ProductFamily, Variant, VariantOptions, Category } from '../domain/types';
import { normalizeColorKey } from '../domain/imageUtils';

// Каталог v2: модели (catalog_models) и товары (catalog_items) из нашей таблицы.
// Экраны пока работают с прежними формами «семейство + варианты», поэтому здесь переводим одно в другое.
// Закупочные цены и наценки витрина не видит: в catalog_items уже готовая цена для покупателя.

interface ModelRow {
  id: string;
  category: Category;
  title: string;
  sort: number;
  created_at: string;
}

interface ItemRow {
  id: number;
  model_id: string;
  name: string;
  year: number | null;
  storage: string | null;
  color: string | null;
  color_hex: string | null;
  sim: string | null;
  size: string | null;
  chip: string | null;
  ram_ssd: string | null;
  band: string | null;
  keyboard: string | null;
  price: number;
  status: 'в наличии' | 'уточнить';
  photo_url: string | null;
  extra_photos: string[] | null;
  confirmed_at: string | null;
  updated_at: string;
}

// Те же колонки — в functions/api/catalog.ts (кэш каталога на Cloudflare): менять вместе
const ITEM_COLUMNS = 'id, model_id, name, year, storage, color, color_hex, sim, size, chip, ram_ssd, band, keyboard, price, status, photo_url, extra_photos, confirmed_at, updated_at';
const PAGE = 1000; // Supabase отдаёт не больше 1000 строк за запрос

// «256GB» → «256», «1TB» → «1024»
function storageGb(s: string | null): string | undefined {
  const m = /^(\d+)\s*(GB|TB)$/i.exec(s ?? '');
  if (!m) return undefined;
  return String(m[2].toUpperCase() === 'TB' ? Number(m[1]) * 1024 : Number(m[1]));
}

function itemOptions(it: ItemRow, category: Category, title: string): VariantOptions {
  const color: VariantOptions = it.color && it.color_hex
    ? { color: normalizeColorKey(it.color), colorHex: it.color_hex, colorLabel: it.color }
    : {};
  switch (category) {
    case 'iPhone':
      return { ...color, storage: storageGb(it.storage), simType: it.sim ?? undefined };
    case 'iPad':
      return { ...color, storage: storageGb(it.storage), connectivity: it.sim ?? undefined, chip: it.chip ?? undefined };
    case 'MacBook':
      // Выбор внутри карточки: цвет → память → клавиатура (РУС — гравировка, решение Романа)
      return {
        ...color,
        chip: it.chip ?? undefined,
        memStorage: it.ram_ssd ?? undefined,
        keyboard: it.keyboard === 'РУС' ? 'РУС' : 'EN',
      };
    case 'Watch':
      // colorHex корпуса — только чтобы плашки в каталоге были разных цветов (выбора цвета у часов нет)
      return { size: it.size ?? undefined, band: it.band ?? undefined, colorHex: it.color_hex ?? undefined };
    case 'AirPods':
      // У AirPods Max выбирают цвет, у остальных выбирать нечего
      return /max/i.test(title) ? color : {};
  }
}

let cache: Promise<{ families: ProductFamily[]; variants: Variant[] }> | null = null;

// На Cloudflare каталог отдаёт /api/catalog (functions/api/catalog.ts) — копия, обновляемая раз в минуту,
// чтобы при наплыве покупателей база не тормозила. Нет такого адреса (локально, Vercel) или он
// не ответил — грузим из Supabase напрямую, как раньше.
async function fetchCached(): Promise<{ models: ModelRow[]; items: ItemRow[] } | null> {
  try {
    const r = await fetch('/api/catalog');
    if (!r.ok || !r.headers.get('content-type')?.includes('application/json')) return null;
    const d = (await r.json()) as { models?: ModelRow[]; items?: ItemRow[] };
    return Array.isArray(d.models) && Array.isArray(d.items) && d.items.length > 0 ? { models: d.models, items: d.items } : null;
  } catch {
    return null;
  }
}

async function fetchRows(): Promise<{ models: ModelRow[]; items: ItemRow[] }> {
  const cached = await fetchCached();
  if (cached) return cached;
  if (!supabase) throw new Error('Supabase не настроен: заполните .env.local по образцу .env.example');
  const sb = supabase;
  const modelsReq = sb.from('catalog_models').select('id, category, title, sort, created_at').order('sort', { ascending: false });
  const items: ItemRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb.from('catalog_items').select(ITEM_COLUMNS).order('id').range(from, from + PAGE - 1);
    if (error) throw new Error(`catalog_items: ${error.message}`);
    items.push(...(data as ItemRow[]));
    if (!data || data.length < PAGE) break;
  }
  const { data: modelData, error: mErr } = await modelsReq;
  if (mErr) throw new Error(`catalog_models: ${mErr.message}`);
  return { models: modelData as ModelRow[], items };
}

async function loadCatalog(): Promise<{ families: ProductFamily[]; variants: Variant[] }> {
  const { models, items } = await fetchRows();
  const modelById = new Map(models.map((m) => [m.id, m]));

  const variants: Variant[] = [];
  const yearByModel = new Map<string, number>();
  const photosByModel = new Map<string, { cover: string[]; byColor: Record<string, string[]> }>();
  for (const it of items) {
    const m = modelById.get(it.model_id);
    if (!m) continue;
    const options = itemOptions(it, m.category, m.title);
    if (it.year) yearByModel.set(m.id, Math.max(yearByModel.get(m.id) ?? 0, it.year));
    // до 5 фото: главное + дополнительные (листаются в карточке товара)
    const images = it.photo_url ? [it.photo_url, ...(it.extra_photos ?? [])] : [];
    variants.push({
      id: String(it.id),
      family_id: m.id,
      options,
      price: it.price,
      // «уточнить» пока нельзя положить в корзину: цену и наличие подтверждает менеджер
      in_stock: it.status === 'в наличии' && it.price > 0,
      status: it.status,
      name: it.name,
      sku_code: String(it.id),
      supplier_xmlid: String(it.id), // экраны склеивают одинаковые товары по этому полю — у нас каждый товар свой
      images,
      confirmed_at: it.confirmed_at,
      updated_at: it.updated_at,
    });
    if (it.photo_url) {
      const p = photosByModel.get(m.id) ?? { cover: [], byColor: {} };
      if (!p.cover.length) p.cover = [it.photo_url];
      const key = options.color;
      if (key && !p.byColor[key]) p.byColor[key] = [it.photo_url];
      photosByModel.set(m.id, p);
    }
  }

  const families: ProductFamily[] = models.map((m) => ({
    id: m.id,
    category: m.category,
    title: m.title,
    description: '',
    images: photosByModel.get(m.id)?.cover ?? [],
    imagesByColor: photosByModel.get(m.id)?.byColor ?? {},
    popularity_score: m.sort,
    created_at: m.created_at,
    year: yearByModel.get(m.id),
  }));

  return { families, variants };
}

function catalog() {
  if (!cache) cache = loadCatalog().catch((e) => { cache = null; throw e; });
  return cache;
}

export async function fetchFamilies(): Promise<ProductFamily[]> {
  return (await catalog()).families;
}

export async function fetchVariants(): Promise<Variant[]> {
  return (await catalog()).variants;
}
