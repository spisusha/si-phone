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
public/         call.html (звонок из Telegram), favicon, заглушка фото
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

- **Сайт** — Cloudflare Pages, проект `si-phone` (https://si-phone.pages.dev): `npm run build`, затем `npx wrangler pages deploy dist --project-name si-phone --branch main` (из папки `mini-app`, wrangler — из `bot/`). Вместе с сайтом выкладывается `functions/api/catalog.ts` — каталог из кэша (обновление раз в минуту; секрет проекта `SUPABASE_ANON_KEY`). Заголовки безопасности — `public/_headers`.
- **Функции Supabase** — `npx supabase functions deploy <имя> --no-verify-jwt` (подпись проверяет сама функция). Разрешённые адреса сайта — секрет `ALLOWED_ORIGINS`.
