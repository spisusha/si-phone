# Si Phone — мини-приложение (витрина и админка)

React 19 + TypeScript + Vite, состояние — Zustand, данные — Supabase. Работает внутри Telegram (WebApp API) и в обычном браузере.

## Запуск

```bash
npm install
cp .env.example .env.local   # VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY (публичный ключ)
npm run dev                  # http://localhost:5173
npm run build                # проверка типов и сборки
```

## Структура

```
src/
  app/          роутер, оболочка, кнопка «Назад» Telegram
  screens/      главная, каталог, карточки товаров, корзина, оформление, заказ, профиль, вход в админку
  admin/        админка: товары и цены, загрузка прайса, наценки и курс, новые позиции, фото, история
  components/   общие: кнопка «В корзину», выбор опций, пустые экраны, скелетоны, иконки
  domain/       дерево каталога (категория → поколение → модель), форматирование вариантов
  hooks/        подбор комплектации «цвет → память → SIM»
  store/        Zustand: каталог, корзина
  telegram/     обёртка WebApp API: тема, цвета шапки, вибрация, кнопки, звонок
  styles/       токены темы, списки в стиле Telegram
public/         call.html (звонок из Telegram), favicon, заглушка фото, _headers (CSP), _routes.json
functions/      Cloudflare Pages: _middleware (pages.dev и www → si-phone.ru), api/catalog (кэш каталога), api/reviews (отзывы от бота)
supabase/
  migrations/   схема базы, защита (RLS), расчёт цен, курс ЦБ по расписанию
  functions/    create-order, admin-login, admin-catalog (Deno); _shared — общий код
brand/splash/   экран загрузки для BotFather
```

## Серверная часть (Supabase)

- `create-order` — проверяет подпись Telegram, берёт цены из базы, проверяет размер ремешка, ограничивает частоту заказов, пишет заказ и отправляет его менеджерам.
- `admin-login` — вход в админку из браузера: пароль с лимитом попыток, выдаёт подписанный токен.
- `admin-catalog` — все действия админки (цены, прайсы, наценки, курс, новые позиции, фото, история). В Telegram пускает по подписи `initData` и списку админов, в браузере — по токену.

## Выкладка

- **Сайт** — **https://si-phone.ru** (Cloudflare Pages, проект `si-phone`; домен — зона в Cloudflare, регистратор Бегет, владелец Артём). Выкладка: `npm run build`, затем `../bot/node_modules/.bin/wrangler pages deploy dist --project-name si-phone --branch main` (из папки `mini-app`). Технический адрес `si-phone.pages.dev` и `www.si-phone.ru` навсегда переадресуются на si-phone.ru (`functions/_middleware.ts`). Вместе с сайтом выкладываются функции: `api/catalog` — каталог из кэша (раз в минуту; секрет проекта `SUPABASE_ANON_KEY`), `api/reviews` — отзывы от бота с кэшем. Заголовки безопасности — `public/_headers`.
- **Локально с отзывами**: в `.claude/launch.json` есть `bot-local` (бот на :8787) и `mini-app-local-reviews` (магазин на :5174 берёт отзывы у него, `REVIEWS_API`). Обычный `npm run dev` берёт отзывы у выложенного бота.
- **Функции Supabase** — `npx supabase functions deploy <имя> --no-verify-jwt` (подпись проверяет сама функция). Разрешённые адреса сайта — секрет `ALLOWED_ORIGINS` (сейчас только `https://si-phone.ru`).
