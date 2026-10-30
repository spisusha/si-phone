// Cloudflare Pages: адреса магазина — https://si-phone.ru и https://si-phone.pages.dev.
// si-phone.pages.dev снова открывает магазин сам (30.10.2026): у части покупателей si-phone.ru не грузится —
// VPN часто пускает .ru-сайты напрямую, а напрямую провайдеры режут Cloudflare; .pages.dev идёт через VPN.
// www.si-phone.ru и предпросмотры *.si-phone.pages.dev переадресуем на si-phone.ru (301).
// Путь и параметры сохраняются, а #… (данные Telegram) браузер переносит сам.
// Какие запросы проходят через этот код — public/_routes.json (собранные /assets/* — мимо, без лишних вызовов).

interface Ctx {
  request: Request;
  next(): Promise<Response>;
}

const SHOP_HOST = 'si-phone.ru';

export const onRequest = async ({ request, next }: Ctx): Promise<Response> => {
  const url = new URL(request.url);
  if (url.hostname === `www.${SHOP_HOST}` || url.hostname.endsWith('.si-phone.pages.dev')) {
    url.protocol = 'https:';
    url.hostname = SHOP_HOST;
    url.port = '';
    return Response.redirect(url.toString(), 301);
  }
  return next();
};
