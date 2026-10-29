import { useEffect, useState } from 'react';

// Отзывы покупателей — те же, что в боте: комментарии под постом «Ваши отзывы» в канале,
// одобренные Артёмом или Андреем. Берём через /api/reviews (functions/api/reviews/[[path]].ts → бот).

export interface ShopReview {
  id: number;
  name: string;
  date: number | null; // unix, секунды
  text: string;
  photos: number; // сколько фото: /api/reviews/photo/<id>/<0…n-1>
  link: string | null; // сам комментарий в канале
}

export interface ReviewsData {
  all: string | null; // пост со всеми отзывами
  reviews: ShopReview[];
}

// Ссылки только на t.me: адрес приходит с сервера и уходит в openTelegramLink
const tgLink = (v: unknown) => (typeof v === 'string' && v.startsWith('https://t.me/') ? v : null);

function parse(raw: unknown): ReviewsData | null {
  const d = raw as { all?: unknown; reviews?: unknown } | null;
  if (!d || !Array.isArray(d.reviews)) return null;
  const reviews = d.reviews
    .filter((r): r is Record<string, unknown> => !!r && typeof r === 'object')
    .filter((r) => Number.isInteger(r.id) && typeof r.text === 'string' && r.text !== '')
    .map((r) => ({
      id: r.id as number,
      name: typeof r.name === 'string' && r.name ? r.name : 'Покупатель',
      date: typeof r.date === 'number' ? r.date : null,
      text: r.text as string,
      photos: Number.isInteger(r.photos) ? Math.min(Math.max(r.photos as number, 0), 9) : 0,
      link: tgLink(r.link),
    }));
  return { all: tgLink(d.all), reviews };
}

// Один запрос на сессию; не получилось — в следующий раз попробуем снова
let pending: Promise<ReviewsData | null> | null = null;
export function fetchReviews(): Promise<ReviewsData | null> {
  pending ??= fetch('/api/reviews')
    .then((r) => (r.ok ? r.json() : null))
    .then(parse)
    .catch(() => null)
    .then((d) => {
      if (!d) pending = null;
      return d;
    });
  return pending;
}

/** undefined — загружается, null — не получилось */
export function useReviews(): ReviewsData | null | undefined {
  const [data, setData] = useState<ReviewsData | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    fetchReviews().then((d) => { if (alive) setData(d); });
    return () => { alive = false; };
  }, []);
  return data;
}

export const reviewPhotoUrl = (id: number, n: number) => `/api/reviews/photo/${id}/${n}`;

// «16 сентября 2026»
export function reviewDate(unix: number | null): string {
  if (!unix) return '';
  return new Date(unix * 1000)
    .toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Moscow' })
    .replace(/\s*г\.$/, '');
}
