// Cloudflare Pages Function: GET /api/reviews и /api/reviews/photo/<id>/<n> — отзывы покупателей.
// Отзывы хранит и одобряет бот (bot/src/index.ts: reviewsJson, reviewPhotoFile), здесь — прокси с кэшем:
// магазин ходит только на свой адрес (CSP не расширяем), а бот не дёргается на каждый показ.

interface Ctx {
  request: Request;
  params: { path?: string | string[] };
  waitUntil(p: Promise<unknown>): void;
}

const BOT_URL = 'https://si-phone-bot.spisusha.workers.dev';
const LIST_TTL_SEC = 120;
const PHOTO_TTL_SEC = 24 * 60 * 60;

export const onRequestGet = async ({ request, params, waitUntil }: Ctx): Promise<Response> => {
  const parts = ([] as string[]).concat(params.path ?? []);
  let upstream: string;
  let ttl: number;
  if (parts.length === 0) {
    upstream = '/reviews';
    ttl = LIST_TTL_SEC;
  } else if (parts.length === 3 && parts[0] === 'photo' && /^\d{1,9}$/.test(parts[1]) && /^\d$/.test(parts[2])) {
    upstream = `/reviews/photo/${parts[1]}/${parts[2]}`;
    ttl = PHOTO_TTL_SEC;
  } else {
    return new Response('Not found', { status: 404 });
  }

  const cache = (caches as unknown as { default: Cache }).default;
  const cacheKey = new Request(new URL(`/api${upstream}`, request.url).toString());
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  const r = await fetch(BOT_URL + upstream);
  if (!r.ok) return new Response('Upstream error', { status: r.status === 404 ? 404 : 502, headers: { 'Cache-Control': 'no-store' } });
  const res = new Response(r.body, {
    headers: {
      'Content-Type': r.headers.get('Content-Type') ?? 'application/octet-stream',
      'Cache-Control': `public, max-age=${Math.min(ttl, 300)}, s-maxage=${ttl}`,
      'X-Content-Type-Options': 'nosniff',
    },
  });
  waitUntil(cache.put(cacheKey, res.clone()));
  return res;
};
