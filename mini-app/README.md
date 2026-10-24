# Si Phone — мини-приложение

React 19 + TypeScript + Vite, состояние — Zustand, данные — Supabase. Работает внутри Telegram (WebApp API) и в обычном браузере.

## Запуск

```
npm install
cp .env.example .env.local   # VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY (публичный ключ)
npm run dev                  # http://localhost:5173
npm run build                # проверка сборки
```

## Структура

```
src/
  app/          роутер, оболочка, кнопка «Назад» Telegram
  screens/      экраны: главная, каталог, модель, корзина, оформление, заказ, профиль, админка
  components/   общие: полоса «В корзину», пустые экраны, скелетоны, иконки, подсказка менеджера
  telegram/     обёртка WebApp API: тема, цвета шапки, вибрация, звонок, кнопки
  store/        Zustand: каталог (с повтором при ошибке сети), корзина
  domain/       логика каталога и форматирование вариантов
  hooks/        подбор комплектации «цвет → память → SIM»
  styles/       токены темы (контраст от 4,5:1), списки в стиле Telegram
public/         call.html (звонок из Telegram), favicon, заглушка фото
supabase/
  migrations/   схема и защита: RLS, лимиты входа и заказов
  functions/    create-order, admin-login, update-prices, media-* (Deno)
brand/splash/   экран загрузки для BotFather
```

## Серверная часть (Supabase)

- `create-order` — проверяет подпись Telegram, берёт цены из базы, ограничивает частоту заказов, пишет заказ и шлёт его менеджерам.
- `admin-login` — вход в админку: пароль, лимит попыток, подписанный токен.
- `update-prices`, `media-*` — только для админа (токен), загрузка фото — по одноразовой ссылке.

Выкладка и секреты — [`supabase/DEPLOY-SECURITY.md`](supabase/DEPLOY-SECURITY.md).
