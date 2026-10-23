# Команды для PowerShell (копируй и вставляй)

## 1. Установка

```powershell
cd "C:\Users\spice\Desktop\si-phone\bot"
npm install
```

## 2. Первый вход в Cloudflare

```powershell
npx wrangler login
```

## 3. Секреты (выполни по очереди, подставь свои значения)

```powershell
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put GEMINI_API_KEY
npx wrangler secret put WEBHOOK_SECRET   # случайная строка, та же, что $secret в setWebhook
```

## 4. Деплой

```powershell
npm run deploy
```

## 5. Установка webhook (подставь свои значения)

```powershell
$token = "ТВОЙ_БОТ_ТОКЕН"
$secret = "ТВОЙ_WEBHOOK_SECRET"   # тот же, что в wrangler secret put WEBHOOK_SECRET
$url = "https://si-phone-bot.ТВОЙ_АККАУНТ.workers.dev"
Invoke-RestMethod -Uri "https://api.telegram.org/bot$token/setWebhook" -Method Post -Body @{ url = $url; secret_token = $secret }
```

---

## Где взять значения

| Переменная | Где взять |
|------------|-----------|
| TELEGRAM_BOT_TOKEN | @BotFather → /newbot → токен |
| GEMINI_API_KEY | https://aistudio.google.com/apikey |

Подробнее: `ИНСТРУКЦИЯ_ТОКЕНЫ.md`. Деплой: `DEPLOY.md`.
