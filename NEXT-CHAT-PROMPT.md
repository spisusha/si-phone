# Промпт для продолжения в новом чате / другом аккаунте

Скопировать целиком в новый чат Claude Code, открытый в папке `C:\Users\spice\Desktop\si-phone`:

---

Привет! Мы продолжаем проект Si Phone — Telegram мини-апп магазина техники Apple. Работаем в папке C:\Users\spice\Desktop\si-phone.

1. Сначала прочитай PLAN.md и CLAUDE.md в этой папке: там всё о проекте, правила работы, статус этапов и что осталось.

2. Перед любой работой проверь окружение по разделу 7 PLAN.md и выдай мне короткий отчёт «есть / нет / не работает»:
   - навыки design-base и security-base (C:\Users\spice\.claude\skills\) — загрузи оба и работай по ним;
   - базы C:\Users\spice\Desktop\design-base и C:\Users\spice\Desktop\security-base (git, хук post-commit, связь с GitHub);
   - плагины Claude Code из раздела 7 (security-guidance, insecure-defaults, audit-context-building, fp-check, static-analysis, claude-security, supabase, playwright и др.) — включены ли и доступны ли в этой сессии;
   - сканеры gitleaks, osv-scanner, semgrep; node, npm, git, gh (и вход `gh auth status`);
   - что требует входа заново (Supabase MCP, context7 — через /mcp);
   - состояние mini-app: ветка redesign, последний коммит, тег before-redesign, `npm install` и `npm run build` проходят;
   - локальный сервер (`.claude/launch.json`, имя mini-app, порт 5173) запускается.
   Если чего-то не хватает или что-то выключено — скажи, как включить/установить, и сделай это после моего «ок».

3. Потом продолжаем со следующего этапа по PLAN.md (см. «Последнее обновление» в PLAN.md). Правила: этап делаем целиком (все пункты сразу, не останавливаясь на каждом) → показать мне вживую на локальном сервере и сказать, где что смотреть → моё «ок» или правки → коммит локально в redesign → обновить PLAN.md и журналы баз → пауза. Сначала доделываем дизайн, «внутрянку» (парсеры, база) обсуждаем потом. Ничего не пушить и не выкладывать без меня.
