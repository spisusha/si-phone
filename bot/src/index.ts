/**
 * Telegram-бот на Cloudflare Workers
 * Обрабатывает webhook от Telegram, показывает кнопки, FAQ и отправляет вопросы в Gemini.
 */

import { WELCOME_MESSAGE, SUPPORT_MESSAGE } from "./config.js";

// Типы для Telegram API
interface TelegramUpdate {
  message?: {
    chat: { id: number };
    text?: string;
    photo?: Array<{ file_id: string }>;
    from?: { first_name?: string };
  };
  callback_query?: {
    id: string;
    data: string;
    message?: { chat: { id: number }; message_id: number };
  };
}

// Отзыв: file_id фото + текст
type Review = { file_id: string; text: string };

// Состояние админа при добавлении отзыва
type AddReviewState = { step: "photo"; file_id?: string } | { step: "text"; file_id: string };

interface Env {
  TELEGRAM_BOT_TOKEN: string;
  GEMINI_API_KEY: string;
  MINI_APP_URL: string;
  ADMIN_CHAT_ID: string; // Твой chat_id для команды /addreview
  WEBHOOK_SECRET: string; // секрет вебхука: Telegram присылает его в X-Telegram-Bot-Api-Secret-Token
  KV: KVNamespace;
}

// История: массив сообщений user/model
type ChatMessage = { role: "user" | "model"; text: string };

const MAX_HISTORY = 8;
// Переписка хранится 30 дней, потом удаляется сама (персональные данные не держим вечно).
const HISTORY_TTL_SEC = 30 * 24 * 60 * 60;
// Не больше 20 вопросов к Gemini в час на один чат — иначе один человек сожжёт бюджет.
const GEMINI_LIMIT_PER_HOUR = 20;

// Сравнение секрета без утечки по времени.
function safeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const x = enc.encode(a);
  const y = enc.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Системная инструкция для Gemini
const GEMINI_SYSTEM_INSTRUCTION = `Ты — Telegram-помощник магазина техники Apple "Si Phone".

ВАЖНО: У тебя НЕТ доступа к интернету и актуальным данным. Ты НЕ знаешь: какие товары есть в наличии, цены, характеристики конкретных моделей (iPhone 16, MacBook и т.д.), сроки доставки. Твои знания о продуктах Apple устарели.

Правила (строго):
1. Вопросы про наличие, цену, характеристики, доставку, гарантию, конкретную модель — ВСЕГДА отвечай: "По этому вопросу лучше уточнить в поддержке. Контакты: @l_bobr_l, @andr3i23"
2. Если просят контакты/поддержку — сразу дай: @l_bobr_l, @andr3i23, телефоны +7 916 405-04-44, +7 925 201-02-34
3. Отвечай МАКСИМУМ 2–3 короткими предложениями. Без воды.
4. Не выдумывай модели, цены, наличие. Если не уверен — в поддержку.
5. Общие вопросы (как оформить заказ, как открыть каталог) — отвечай кратко по FAQ.

Стиль: дружелюбно, коротко, по делу.`;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // GET — проверка работоспособности (можно открыть URL в браузере)
    if (request.method === "GET") {
      return new Response("Si Phone Bot is running", { status: 200, headers: { "Content-Type": "text/plain" } });
    }

    // Telegram отправляет POST на webhook
    if (request.method !== "POST") {
      return new Response("OK", { status: 200 });
    }

    // Принимаем только запросы от Telegram: он присылает наш секрет в заголовке.
    // Без этой проверки любой, кто знает адрес воркера, мог слать поддельные сообщения
    // от имени админа (например, добавлять отзывы). Секрет не задан — не принимаем ничего.
    const secret = request.headers.get("X-Telegram-Bot-Api-Secret-Token") ?? "";
    if (!env.WEBHOOK_SECRET || !safeEqual(secret, env.WEBHOOK_SECRET)) {
      return new Response("Unauthorized", { status: 401 });
    }

    try {
      const update: TelegramUpdate = await request.json();

      // Обычное сообщение от пользователя
      if (update.message) {
        const chatId = update.message.chat.id;
        const text = update.message.text?.trim() || "";
        const photo = update.message.photo;
        const firstName = update.message.from?.first_name || "Пользователь";

        if (text === "/start") {
          await sendWelcome(env, chatId);
          return new Response("OK", { status: 200 });
        }

        if (text === "/myid") {
          await sendMessage(env, chatId, `Ваш chat_id: <code>${chatId}</code>`);
          return new Response("OK", { status: 200 });
        }

        const adminIds = (env.ADMIN_CHAT_ID || "").split(",").map((id) => id.trim()).filter(Boolean);
        const isAdmin = adminIds.includes(chatId.toString());

        if (text === "/addreview" && isAdmin) {
          await setAddReviewState(env, chatId, { step: "photo" });
          await sendMessage(env, chatId, "Отправьте фото отзыва:");
          return new Response("OK", { status: 200 });
        }

        if (text === "/cancel" && isAdmin) {
          await clearAddReviewState(env, chatId);
          await sendMessage(env, chatId, "Отменено.");
          return new Response("OK", { status: 200 });
        }

        const addReviewState = await getAddReviewState(env, chatId);
        if (addReviewState && isAdmin) {
          if (photo && photo.length > 0) {
            const fileId = photo[photo.length - 1].file_id;
            if (addReviewState.step === "photo") {
              await setAddReviewState(env, chatId, { step: "text", file_id: fileId });
              await sendMessage(env, chatId, "Фото сохранено. Теперь отправьте текст отзыва:");
            }
          } else if (text) {
            if (addReviewState.step === "text" && "file_id" in addReviewState) {
              await addReview(env, { file_id: addReviewState.file_id, text });
              await clearAddReviewState(env, chatId);
              await sendMessage(env, chatId, "Отзыв добавлен.");
            }
          }
          return new Response("OK", { status: 200 });
        }

        if (text) {
          await handleUserMessage(env, chatId, text, firstName);
        }

        return new Response("OK", { status: 200 });
      }

      // Нажатие на inline-кнопку (callback)
      if (update.callback_query) {
        const chatId = update.callback_query.message!.chat.id;
        const data = update.callback_query.data;

        const messageId = update.callback_query.message!.message_id;
        if (data === "faq") {
          await sendFAQList(env, chatId);
        } else if (data === "faq_back") {
          await showFAQList(env, chatId, messageId);
        } else if (data.startsWith("faq_")) {
          const indexStr = data.slice(4);
          await showFAQAnswer(env, chatId, messageId, indexStr);
        } else         if (data === "support") {
          await sendSupport(env, chatId);
        } else if (data === "reviews") {
          await showReview(env, chatId, 0);
        } else if (data.startsWith("reviews_")) {
          const index = parseInt(data.slice(8), 10);
          if (!isNaN(index)) await showReview(env, chatId, index, messageId);
        }

        // Подтверждаем callback, чтобы убрать "часики" на кнопке
        await answerCallback(env, update.callback_query.id);
        return new Response("OK", { status: 200 });
      }

      return new Response("OK", { status: 200 });
    } catch (err) {
      console.error(err);
      return new Response("OK", { status: 200 }); // Telegram требует 200 даже при ошибке
    }
  },
};

// Отправка приветствия с кнопками
async function sendWelcome(env: Env, chatId: number): Promise<void> {
  const keyboard = {
    inline_keyboard: [
      [{ text: "📱 Открыть магазин", web_app: { url: env.MINI_APP_URL } }],
      [{ text: "⭐ Отзывы", callback_data: "reviews" }, { text: "❓ FAQ", callback_data: "faq" }],
      [{ text: "💬 Поддержка", callback_data: "support" }],
    ],
  };
  await sendMessage(env, chatId, WELCOME_MESSAGE, keyboard);
}

// Форматирование вопроса: с большой буквы и с ?
function formatQuestion(text: string): string {
  if (!text.trim()) return text;
  const t = text.trim();
  const first = t[0].toUpperCase();
  const rest = t.slice(1);
  return rest.endsWith("?") ? first + rest : first + rest + "?";
}

// Клавиатура со списком вопросов FAQ
async function getFAQKeyboard(): Promise<object> {
  const { FAQ_TEMPLATES } = await import("./config.js");
  const questions = Object.keys(FAQ_TEMPLATES);
  return {
    inline_keyboard: questions.map((q, i) => [{ text: formatQuestion(q), callback_data: `faq_${i}` }]),
  };
}

// Список FAQ — показываем кнопки с вопросами
async function sendFAQList(env: Env, chatId: number): Promise<void> {
  const keyboard = await getFAQKeyboard();
  await sendMessage(env, chatId, "Выбери вопрос:", keyboard);
}

// Показать список FAQ (редактирование сообщения — для кнопки «Назад»)
async function showFAQList(env: Env, chatId: number, messageId: number): Promise<void> {
  const keyboard = await getFAQKeyboard();
  await editMessage(env, chatId, messageId, "Выбери вопрос:", keyboard);
}

// Ответ на вопрос — редактируем то же сообщение, чтобы не было спама
async function showFAQAnswer(env: Env, chatId: number, messageId: number, indexStr: string): Promise<void> {
  const { FAQ_TEMPLATES } = await import("./config.js");
  const questions = Object.keys(FAQ_TEMPLATES);
  const index = parseInt(indexStr, 10);
  const questionKey = questions[index];
  const answer = questionKey ? FAQ_TEMPLATES[questionKey] : null;
  if (answer) {
    const keyboard = { inline_keyboard: [[{ text: "← Назад к списку", callback_data: "faq_back" }]] };
    await editMessage(env, chatId, messageId, answer, keyboard);
  }
}

// Поддержка
async function sendSupport(env: Env, chatId: number): Promise<void> {
  await sendMessage(env, chatId, SUPPORT_MESSAGE);
}

// Фразы, при которых сразу показываем контакты поддержки
const SUPPORT_TRIGGERS = [
  "поддержк", "контакт", "связаться", "написать вам", "позвонить", "телефон", "андрей", "артем",
  "андр3и23", "l_bobr_l", "помогите", "помоги",
];

// Фразы, при которых сразу направляем в поддержку (наличие, характеристики, цена)
const REDIRECT_TO_SUPPORT_TRIGGERS = [
  "наличие", "есть в наличии", "есть ли", "есть iphone", "есть айфон", "характеристик", "спецификаци",
  "цена на", "сколько стоит", "стоимость", "доставк", "гаранти", "конфигураци", "цвет", "память",
  "iphone 16", "iphone 15", "айфон 16", "айфон 15", "macbook", "ipad", "airpods",
];

// Обработка текстового сообщения: FAQ или Gemini с историей
async function handleUserMessage(env: Env, chatId: number, text: string, _firstName: string): Promise<void> {
  const { FAQ_TEMPLATES } = await import("./config.js");
  const normalized = text.toLowerCase().replace(/\s+/g, " ").trim();

  // 1. Запрос контактов/поддержки — сразу выдаём контакты
  if (SUPPORT_TRIGGERS.some((t) => normalized.includes(t))) {
    await sendMessage(env, chatId, SUPPORT_MESSAGE);
    const history = await loadHistory(env, chatId);
    history.push({ role: "user", text });
    history.push({ role: "model", text: SUPPORT_MESSAGE });
    await saveHistory(env, chatId, trimHistory(history));
    return;
  }

  // 2. Вопрос про наличие/характеристики/цену — сразу в поддержку (без Gemini)
  if (REDIRECT_TO_SUPPORT_TRIGGERS.some((t) => normalized.includes(t))) {
    await sendFallbackToSupport(env, chatId);
    const history = await loadHistory(env, chatId);
    history.push({ role: "user", text });
    history.push({ role: "model", text: "Направлен в поддержку." });
    await saveHistory(env, chatId, trimHistory(history));
    return;
  }

  // 3. FAQ
  let faqAnswer: string | null = null;
  for (const [key, answer] of Object.entries(FAQ_TEMPLATES)) {
    if (normalized.includes(key) || key.includes(normalized)) {
      faqAnswer = answer;
      break;
    }
  }

  if (faqAnswer) {
    await sendMessage(env, chatId, faqAnswer);
    const history = await loadHistory(env, chatId);
    history.push({ role: "user", text });
    history.push({ role: "model", text: faqAnswer });
    await saveHistory(env, chatId, trimHistory(history));
    return;
  }

  // 4. Gemini с историей (с лимитом на чат)
  const history = await loadHistory(env, chatId);
  if (!(await takeGeminiQuota(env, chatId))) {
    await sendFallbackToSupport(env, chatId);
    return;
  }
  try {
    const geminiAnswer = await askGemini(env, history, text);
    if (geminiAnswer) {
      // Ответ ИИ — не наш текст: экранируем, чтобы < и & не ломали сообщение.
      await sendMessage(env, chatId, escapeHtml(geminiAnswer));
      history.push({ role: "user", text });
      history.push({ role: "model", text: geminiAnswer });
      await saveHistory(env, chatId, trimHistory(history));
    } else {
      await sendFallbackToSupport(env, chatId);
      history.push({ role: "user", text });
      history.push({ role: "model", text: "Направлен в поддержку." });
      await saveHistory(env, chatId, trimHistory(history));
    }
  } catch {
    await sendFallbackToSupport(env, chatId);
  }
}

// Загрузка истории из KV
async function loadHistory(env: Env, chatId: number): Promise<ChatMessage[]> {
  const key = `chat:${chatId}`;
  const raw = await env.KV.get(key);
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw) as ChatMessage[];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

// Сохранение истории в KV
async function saveHistory(env: Env, chatId: number, history: ChatMessage[]): Promise<void> {
  const key = `chat:${chatId}`;
  await env.KV.put(key, JSON.stringify(history), { expirationTtl: HISTORY_TTL_SEC });
}

// Счётчик вопросов к Gemini за текущий час. false — лимит исчерпан.
async function takeGeminiQuota(env: Env, chatId: number): Promise<boolean> {
  const key = `gemini:${chatId}:${Math.floor(Date.now() / 3_600_000)}`;
  const used = Number((await env.KV.get(key)) ?? "0");
  if (used >= GEMINI_LIMIT_PER_HOUR) return false;
  await env.KV.put(key, String(used + 1), { expirationTtl: 3600 });
  return true;
}

// Обрезка до последних N сообщений
function trimHistory(history: ChatMessage[]): ChatMessage[] {
  if (history.length <= MAX_HISTORY) return history;
  return history.slice(-MAX_HISTORY);
}

// Запрос к Gemini API с историей диалога
async function askGemini(env: Env, history: ChatMessage[], newMessage: string): Promise<string | null> {
  // Ключ — в заголовке, а не в адресе: адреса попадают в логи.
  const url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent";

  // Формируем contents: история + новое сообщение
  const contents: Array<{ role: "user" | "model"; parts: Array<{ text: string }> }> = history.map((m) => ({
    role: m.role,
    parts: [{ text: m.text }],
  }));
  contents.push({ role: "user", parts: [{ text: newMessage }] });

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
    body: JSON.stringify({
      contents,
      systemInstruction: { parts: [{ text: GEMINI_SYSTEM_INSTRUCTION }] },
      generationConfig: {
        maxOutputTokens: 120,
        temperature: 0.5,
      },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error("Gemini API error:", response.status, errText);
    return null;
  }

  const data = (await response.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  return text || null;
}

// Сообщение при ошибке или неуверенности — направляем в поддержку
async function sendFallbackToSupport(env: Env, chatId: number): Promise<void> {
  const text = `К сожалению, я не могу ответить на этот вопрос. Нажмите кнопку «Поддержка» в меню бота — там указаны все контакты.`;
  await sendMessage(env, chatId, text);
}

// Отправка сообщения в Telegram
async function sendMessage(env: Env, chatId: number, text: string, replyMarkup?: object): Promise<void> {
  const body: Record<string, unknown> = {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
  };
  if (replyMarkup) body.reply_markup = replyMarkup;

  const url = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    console.error("Telegram sendMessage error:", await res.text());
  }
}

// Редактирование сообщения
async function editMessage(env: Env, chatId: number, messageId: number, text: string, replyMarkup?: object): Promise<void> {
  const body: Record<string, unknown> = {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: "HTML",
  };
  if (replyMarkup) body.reply_markup = replyMarkup;
  const url = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/editMessageText`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    console.error("Telegram editMessageText error:", await res.text());
  }
}

// --- Отзывы ---
const REVIEWS_KEY = "reviews";
const ADDREVIEW_STATE_KEY = (chatId: number) => `addreview:${chatId}`;

async function loadReviews(env: Env): Promise<Review[]> {
  const raw = await env.KV.get(REVIEWS_KEY);
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw) as Review[];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

async function saveReviews(env: Env, reviews: Review[]): Promise<void> {
  await env.KV.put(REVIEWS_KEY, JSON.stringify(reviews));
}

async function addReview(env: Env, review: Review): Promise<void> {
  const reviews = await loadReviews(env);
  reviews.push(review);
  await saveReviews(env, reviews);
}

async function getAddReviewState(env: Env, chatId: number): Promise<AddReviewState | null> {
  const raw = await env.KV.get(ADDREVIEW_STATE_KEY(chatId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AddReviewState;
  } catch {
    return null;
  }
}

async function setAddReviewState(env: Env, chatId: number, state: AddReviewState): Promise<void> {
  await env.KV.put(ADDREVIEW_STATE_KEY(chatId), JSON.stringify(state));
}

async function clearAddReviewState(env: Env, chatId: number): Promise<void> {
  await env.KV.delete(ADDREVIEW_STATE_KEY(chatId));
}

async function showReview(env: Env, chatId: number, index: number, messageId?: number): Promise<void> {
  const reviews = await loadReviews(env);
  if (reviews.length === 0) {
    const msg = "Пока нет отзывов.";
    if (messageId) await editMessage(env, chatId, messageId, msg);
    else await sendMessage(env, chatId, msg);
    return;
  }
  const i = ((index % reviews.length) + reviews.length) % reviews.length;
  const review = reviews[i];
  const caption = `Отзыв ${i + 1} из ${reviews.length}\n\n${review.text}`;
  const keyboard = {
    inline_keyboard: [
      [
        { text: "← Назад", callback_data: `reviews_${i - 1}` },
        { text: "Следующий →", callback_data: `reviews_${i + 1}` },
      ],
      [
        { text: "📱 Открыть магазин", web_app: { url: env.MINI_APP_URL } },
        { text: "💬 Поддержка", callback_data: "support" },
      ],
    ],
  };

  if (messageId) {
    await editMessageMedia(env, chatId, messageId, review.file_id, caption, keyboard);
  } else {
    await sendPhoto(env, chatId, review.file_id, caption, keyboard);
  }
}

async function sendPhoto(env: Env, chatId: number, fileId: string, caption: string, replyMarkup?: object): Promise<void> {
  const body: Record<string, unknown> = {
    chat_id: chatId,
    photo: fileId,
    caption,
    parse_mode: "HTML",
  };
  if (replyMarkup) body.reply_markup = replyMarkup;
  const url = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendPhoto`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    console.error("Telegram sendPhoto error:", await res.text());
  }
}

async function editMessageMedia(
  env: Env,
  chatId: number,
  messageId: number,
  fileId: string,
  caption: string,
  replyMarkup?: object
): Promise<void> {
  const body: Record<string, unknown> = {
    chat_id: chatId,
    message_id: messageId,
    media: JSON.stringify({ type: "photo", media: fileId, caption }),
  };
  if (replyMarkup) body.reply_markup = replyMarkup;
  const url = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/editMessageMedia`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    console.error("Telegram editMessageMedia error:", await res.text());
  }
}

// Подтверждение callback
async function answerCallback(env: Env, callbackId: string): Promise<void> {
  const url = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/answerCallbackQuery`;
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ callback_query_id: callbackId }),
  });
}

