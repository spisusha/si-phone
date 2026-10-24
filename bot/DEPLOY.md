# Деплой бота на Cloudflare Workers

## Шаг 1. Вход в Cloudflare (один раз)

Открой PowerShell в папке проекта и выполни:

```powershell
npx wrangler login
```

Откроется браузер — войди в аккаунт Cloudflare (можно создать бесплатный на cloudflare.com).

---

## Шаг 2. Добавь секреты

Выполни по очереди (токены возьми из `.dev.vars`):

```powershell
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put WEBHOOK_SECRET   # случайная строка, та же, что $secret в setWebhook
npx wrangler secret put ADMIN_CHAT_ID    # chat_id админов через запятую
```

Когда появится `Enter a secret value:` — вставь значение и нажми Enter.

---

## Шаг 3. Деплой

```powershell
npm run deploy
```

В конце появится URL, например: `https://si-phone-bot.ТВОЙ_АККАУНТ.workers.dev`

Скопируй его.

---

## Шаг 4. Установи webhook для Telegram

Подставь свои значения и выполни:

```powershell
$token = "ТВОЙ_ТОКЕН_ИЗ_DEV_VARS"
$secret = "ТВОЙ_WEBHOOK_SECRET"   # тот же, что в wrangler secret put WEBHOOK_SECRET
$url = "https://si-phone-bot.ТВОЙ_АККАУНТ.workers.dev"
Invoke-RestMethod -Uri "https://api.telegram.org/bot$token/setWebhook" -Method Post -Body @{ url = $url; secret_token = $secret }
```

В ответе должно быть `"ok": true`.

---

## Шаг 5. Проверка

1. Открой URL в браузере — должно быть: `Si Phone Bot is running`
2. Найди своего бота в Telegram и напиши `/start`

Готово.
