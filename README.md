# Si Phone

Telegram-магазин оригинальной техники Apple: мини-приложение и бот в одном репозитории.

| Папка | Что внутри | Где работает |
|---|---|---|
| `mini-app/` | Мини-приложение: React + TypeScript + Vite, каталог, корзина, оформление, админка; серверные функции и миграции Supabase — `mini-app/supabase/` | Vercel (Root Directory — `mini-app`), Supabase |
| `bot/` | Telegram-бот: кнопка «Открыть магазин», FAQ, отзывы, ответы Gemini | Cloudflare Workers (`si-phone-bot`) |

## Запуск локально

```
cd mini-app
npm install
npm run dev        # http://localhost:5173
npm run build      # проверка сборки
```

Бот: `cd bot && npm install`, секреты для локального запуска — в `bot/.dev.vars` (образец — `bot/.env.example`, в git не попадает).

## Документы

- `PLAN.md` — план работ, статус этапов, решения, что важно помнить.
- `mini-app/supabase/DEPLOY-SECURITY.md` — выкладка сервера; `bot/DEPLOY.md` — выкладка бота.
- `mini-app/brand/splash/` — экран загрузки для BotFather.
- `CLAUDE.md`, `AGENTS.md` — правила для ИИ-помощников.

Ключи и пароли — только в секретах Supabase, Cloudflare и Vercel, никогда в коде и git.
