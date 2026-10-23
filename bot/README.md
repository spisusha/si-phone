# Telegram-бот Si Phone

Простой бот для Telegram с Mini App, FAQ и ответами через Google Gemini API. Работает на Cloudflare Workers.

## Что умеет бот

- **/start** — приветствие и кнопки
- **Открыть приложение** — открывает твоё Mini App
- **FAQ** — ответы на частые вопросы
- **Поддержка** — контакты поддержки
- Вопросы не из FAQ отправляются в Gemini
- При ошибке или неуверенности — направляет в поддержку

---

## Шаг 1. Установка зависимостей

Открой PowerShell в папке проекта и выполни:

```powershell
npm install
```

---

## Шаг 2. Переменные окружения (секреты)

Тебе нужны 2 значения. **Подробная инструкция:** см. файл `ИНСТРУКЦИЯ_ТОКЕНЫ.md`.

| Переменная | Где взять |
|------------|-----------|
| `TELEGRAM_BOT_TOKEN` | @BotFather в Telegram → /newbot → скопируй токен |
| `GEMINI_API_KEY` | [Google AI Studio](https://aistudio.google.com/apikey) → Create API Key |

Ссылка на Mini App задана в `wrangler.toml` (MINI_APP_URL). Чтобы изменить — отредактируй этот файл.

### Для локального запуска

1. Создай файл `.dev.vars` в корне проекта (рядом с `package.json`)
2. Добавь строки (подставь свои значения):

```
TELEGRAM_BOT_TOKEN=123456:ABC...
GEMINI_API_KEY=AIza...
```

### Для деплоя в Cloudflare

Секреты задаются командами (выполни по очереди, подставь свои значения):

```powershell
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put GEMINI_API_KEY
npx wrangler secret put WEBHOOK_SECRET   # случайная строка, та же, что $secret в setWebhook
```

Каждая команда попросит ввести значение — вставь и нажми Enter.

---

## Шаг 3. Локальный запуск

```powershell
npm run dev
```

Бот запустится локально. Чтобы Telegram отправлял сообщения на твой компьютер, нужен туннель (например ngrok). Для первого теста проще сразу задеплоить.

---

## Шаг 4. Деплой в Cloudflare Workers

**Полная инструкция:** см. `DEPLOY.md`

### Первый раз: войди в Cloudflare

Выполни в PowerShell (откроется браузер для входа):

```powershell
npx wrangler login
```

Откроется браузер — войди в аккаунт Cloudflare (можно создать бесплатный).

### Деплой

1. Установи секреты (см. Шаг 2)
2. Выполни:

```powershell
npm run deploy
```

3. В конце команды появится URL, например:  
   `https://si-phone-bot.твой-аккаунт.workers.dev`

4. **Скопируй этот URL** — он нужен для webhook.

---

## Шаг 5. Установка webhook для Telegram

Замени `ТВОЙ_БОТ_ТОКЕН` и `ТВОЙ_WORKER_URL` на реальные значения и выполни в PowerShell:

```powershell
$token = "ТВОЙ_БОТ_ТОКЕН"
$secret = "ТВОЙ_WEBHOOK_SECRET"   # тот же, что в wrangler secret put WEBHOOK_SECRET
$url = "ТВОЙ_WORKER_URL"
Invoke-RestMethod -Uri "https://api.telegram.org/bot$token/setWebhook" -Method Post -Body @{ url = $url; secret_token = $secret }
```

Пример:
```powershell
$token = "7123456789:AAH..."
$secret = "ТВОЙ_WEBHOOK_SECRET"   # тот же, что в wrangler secret put WEBHOOK_SECRET
$url = "https://si-phone-bot.твой-аккаунт.workers.dev"
Invoke-RestMethod -Uri "https://api.telegram.org/bot$token/setWebhook" -Method Post -Body @{ url = $url; secret_token = $secret }
```

В ответе должно быть `"ok":true`. После этого бот начнёт получать сообщения.

---

## Где подставить свои значения

| Место | Что подставить |
|-------|----------------|
| Секреты (wrangler / .dev.vars) | `TELEGRAM_BOT_TOKEN`, `GEMINI_API_KEY` |
| `src/config.ts` | Текст приветствия `WELCOME_MESSAGE`, список FAQ `FAQ_TEMPLATES` |

---

## Структура проекта

```
bot/
├── src/
│   ├── index.ts    # Основная логика бота
│   └── config.ts   # Приветствие, FAQ (редактируй под себя)
├── package.json
├── wrangler.toml   # Конфиг Cloudflare
├── .env.example    # Пример переменных
├── .dev.vars       # Твои секреты для локального запуска (создай сам)
└── README.md
```

---

## Команды для копирования (PowerShell)

```powershell
# Установка
npm install

# Локальный запуск
npm run dev

# Деплой
npm run deploy

# Установка webhook (подставь свои значения)
$token = "ТВОЙ_БОТ_ТОКЕН"
$secret = "ТВОЙ_WEBHOOK_SECRET"   # тот же, что в wrangler secret put WEBHOOK_SECRET
$url = "https://твой-worker.workers.dev"
Invoke-RestMethod -Uri "https://api.telegram.org/bot$token/setWebhook" -Method Post -Body @{ url = $url; secret_token = $secret }
```

---

## Настройка контента

- **Приветствие** — в `src/config.ts`, константа `WELCOME_MESSAGE`
- **FAQ** — в `src/config.ts`, объект `FAQ_TEMPLATES` (ключ — вопрос, значение — ответ)
- **Поддержка** — в `src/config.ts`, константа `SUPPORT_MESSAGE`

---

## Возможные улучшения (позже)

- Добавить больше вопросов в FAQ
- Логирование в Cloudflare
- Кнопка «Назад» после FAQ
- Ограничение по длине ответа Gemini
