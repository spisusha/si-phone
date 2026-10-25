// Cloudflare Pages Function: GET /api/catalog — каталог магазина из кэша.
// Зачем: нагрузочный тест (25.10.2026) показал, что бесплатный Supabase начинает тормозить
// примерно с 200 покупателей, открывших магазин одновременно. Здесь каталог берётся из базы
// не чаще раза в минуту, а всем остальным отдаётся готовая копия — база больше не предел.
// Данные те же, что видит публичный ключ (только видимые товары, без закупки): RLS не обходим.
// Колонки и порядок — как в src/api/catalogRepo.ts (менять вместе).

interface Env { SUPABASE_ANON_KEY?: string }
interface Ctx { request: Request; env: Env; waitUntil(p: Promise<unknown>): void }

const SUPABASE_URL = 'https://zudohmttvlibpugravgb.supabase.co';
const ITEM_COLUMNS = 'id,model_id,name,year,storage,color,color_hex,sim,size,chip,ram_ssd,band,keyboard,price,status,photo_url,extra_photos,confirmed_at,updated_at';
const MODEL_COLUMNS = 'id,category,title,sort,created_at';
const PAGE = 1000;
const TTL_SEC = 60;

// Копия в памяти сервера (живёт, пока жив экземпляр) + общий кэш Cloudflare в дата-центре
let memory: { at: number; body: string } | null = null;

function reply(body: string, source: string): Response {
  return new Response(body, {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': `public, max-age=30, s-maxage=${TTL_SEC}`,
      'X-Catalog-Source': source,
    },
  });
}

async function fromDatabase(key: string): Promise<string | null> {
  const h = { apikey: key, Authorization: `Bearer ${key}`, 'Accept-Encoding': 'gzip' };
  const modelsRes = await fetch(`${SUPABASE_URL}/rest/v1/catalog_models?select=${MODEL_COLUMNS}&order=sort.desc`, { headers: h });
  if (!modelsRes.ok) return null;
  const models = await modelsRes.json();
  const items: unknown[] = [];
  for (let from = 0; ; from += PAGE) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/catalog_items?select=${ITEM_COLUMNS}&order=id&offset=${from}&limit=${PAGE}`, { headers: h });
    if (!r.ok) return null;
    const page = (await r.json()) as unknown[];
    items.push(...page);
    if (page.length < PAGE) break;
  }
  return JSON.stringify({ models, items });
}

export const onRequestGet = async ({ request, env, waitUntil }: Ctx): Promise<Response> => {
  if (memory && Date.now() - memory.at < TTL_SEC * 1000) return reply(memory.body, 'memory');

  const cache = (caches as unknown as { default: Cache }).default;
  const cacheKey = new Request(new URL('/api/catalog', request.url).toString());
  const hit = await cache.match(cacheKey);
  if (hit) return new Response(hit.body, hit);

  if (!env.SUPABASE_ANON_KEY) return new Response('{"error":"not configured"}', { status: 500 });
  const body = await fromDatabase(env.SUPABASE_ANON_KEY);
  // База не ответила — приложение само сходит в Supabase напрямую (запасной путь в catalogRepo)
  if (!body) return new Response('{"error":"upstream"}', { status: 502, headers: { 'Cache-Control': 'no-store' } });

  memory = { at: Date.now(), body };
  const res = reply(body, 'database');
  waitUntil(cache.put(cacheKey, res.clone()));
  return res;
};
