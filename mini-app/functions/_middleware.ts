// Cloudflare Pages: у магазина один адрес — https://si-phone.ru.
// Старый si-phone.pages.dev (его у Pages не удалить, как и предпросмотры *.si-phone.pages.dev) и www.si-phone.ru
// переадресуем сюда навсегда (301). Путь и параметры сохраняются, а #… (данные Telegram) браузер переносит сам.
// Какие запросы проходят через этот код — public/_routes.json (собранные /assets/* — мимо, без лишних вызовов).

interface Ctx {
  request: Request;
  next(): Promise<Response>;
}

const SHOP_HOST = 'si-phone.ru';

export const onRequest = async ({ request, next }: Ctx): Promise<Response> => {
  const url = new URL(request.url);
  if (url.hostname === `www.${SHOP_HOST}` || url.hostname.endsWith('.pages.dev')) {
    url.protocol = 'https:';
    url.hostname = SHOP_HOST;
    url.port = '';
    return Response.redirect(url.toString(), 301);
  }
  return next();
};
