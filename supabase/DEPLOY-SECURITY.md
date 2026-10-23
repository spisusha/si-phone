# Выкладка этапа 1б (безопасность) — по шагам

Код готов локально (ветка `redesign`). Чтобы защита заработала у живого магазина, нужно выложить **всё вместе**:
сервер (Supabase), фронтенд (Vercel) и бот (Cloudflare). По отдельности нельзя: новая админка и оформление
заказа работают только с новыми функциями, а старые — только со старыми.

Секреты в этот файл не писать. Команды запускать в PowerShell.

## 1. Supabase (из папки `mini-app`)
```
npx supabase login                     # откроется браузер — вход в аккаунт Supabase
npx supabase link --project-ref <ref>  # ref — в supabase/.temp/project-ref
npx supabase secrets list              # должны быть TELEGRAM_BOT_TOKEN, TELEGRAM_ADMIN_CHAT_IDS, ADMIN_TOKEN_SECRET
```
Новые секреты:
```
npx supabase secrets set ADMIN_PASSWORD=<случайный пароль от 20 символов>   # меньше 16 или одни цифры — вход не откроется
# сгенерировать: node -e "console.log(require('crypto').randomBytes(18).toString('base64url'))"
npx supabase secrets set ALLOWED_ORIGINS=https://mini-app-andrew.vercel.app
```
Сменить `ADMIN_TOKEN_SECRET` (новая случайная строка) — так старые токены админки перестанут работать.

Миграции (закрывают хранилище и таблицы на запись, добавляют лимиты входа и заказов):
```
npx supabase db push
```
Функции (все проверяют доступ сами, поэтому `--no-verify-jwt`):
```
npx supabase functions deploy create-order admin-login media-sign-upload update-prices media-upload-and-apply media-remove-image media-clear-color media-set-family-cover media-watch-apply media-watch-clear media-watch-remove --no-verify-jwt
npx supabase functions delete admin-setup
npx supabase functions delete send-order-telegram
```
После — открыть Supabase → Advisors → Security: ошибок уровня ERROR быть не должно.

## 2. Фронтенд
Пуш ветки в GitHub → Vercel соберёт сам. Делать вместе с шагом 1.

## 3. Бот (из папки `bot`)
```
npx wrangler secret put WEBHOOK_SECRET   # случайная строка, сгенерировать командой из .env.example
npm run deploy
```
Затем заново установить вебхук с тем же секретом (команда — в `DEPLOY.md`). Без этого бот перестанет отвечать:
он теперь отклоняет запросы без правильного секрета.

## 4. Проверка (только на своём проекте)
- `update-prices` без токена админа → 401.
- Загрузка файла в бакет `products` публичным ключом → отказ.
- Чтение `orders` публичным ключом → пусто или ошибка.
- Заказ из Telegram доходит админам, сумма в сообщении — из базы.
- Запрос на адрес воркера без заголовка секрета → 401.
- Вход в админку: в логах функции `admin-login` адрес клиента определяется (не `unknown`).
  Запрос со своим заголовком `cf-connecting-ip: 1.2.3.4` не должен менять адрес в логах — иначе лимит по адресу обходится.
