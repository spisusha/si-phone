/**
 * Telegram-бот Si Phone на Cloudflare Workers.
 * Приветствие с кнопками, частые вопросы по разделам, ответы на свободный текст по ключевым словам,
 * связь с менеджером, отзывы. Без нейросети: отвечает только готовыми текстами из config.ts.
 */

import {
  WELCOME_MESSAGE,
  CONTACTS_MESSAGE,
  FALLBACK_MESSAGE,
  OTHER_CITY_MESSAGE,
  OTHER_CITY_KEYS,
  FAQ,
  MANAGER,
  MANAGER_URL,
  type FaqItem,
} from "./config.js";

// Типы для Telegram API
interface TelegramUpdate {
  message?: {
    chat: { id: number };
    text?: string;
    photo?: Array<{ file_id: string }>;
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
  MINI_APP_URL: string;
  ADMIN_CHAT_ID: string; // chat_id админов через запятую: кнопка «Админка» и добавление отзывов
  WEBHOOK_SECRET: string; // секрет вебхука: Telegram присылает его в X-Telegram-Bot-Api-Secret-Token
  KV: KVNamespace;
}

type Keyboard = { inline_keyboard: Array<Array<Record<string, unknown>>> };

// Сравнение секрета без утечки по времени.
function safeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const x = enc.encode(a);
  const y = enc.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

function isAdmin(env: Env, chatId: number): boolean {
  return (env.ADMIN_CHAT_ID || "").split(",").map((id) => id.trim()).filter(Boolean).includes(String(chatId));
}

// Общие кнопки
const shopButton = (env: Env) => ({ text: "📱 Открыть магазин", web_app: { url: env.MINI_APP_URL }, style: "success" });
const managerButton = { text: "💬 Написать менеджеру", url: MANAGER_URL };
const allQuestionsButton = { text: "❓ Все вопросы", callback_data: "faq" };

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
      if (update.message) await handleMessage(env, update.message);
      else if (update.callback_query) await handleCallback(env, update.callback_query);
    } catch (err) {
      console.error(err);
    }
    return new Response("OK", { status: 200 }); // Telegram требует 200 даже при ошибке
  },
};

/* ── Сообщения ── */

async function handleMessage(env: Env, message: NonNullable<TelegramUpdate["message"]>): Promise<void> {
  const chatId = message.chat.id;
  const text = message.text?.trim() || "";
  const command = text.split(/[\s@]/)[0].toLowerCase();
  const admin = isAdmin(env, chatId);

  if (command === "/start" || command === "/menu") return sendWelcome(env, chatId);
  if (command === "/faq") return sendFaqHome(env, chatId);
  if (command === "/manager" || command === "/contacts") return sendContacts(env, chatId);
  if (command === "/reviews") return showReview(env, chatId, 0);
  if (command === "/myid") return sendMessage(env, chatId, `Ваш chat_id: <code>${chatId}</code>`);

  if (admin && command === "/addreview") return startAddReview(env, chatId);
  if (admin && command === "/cancel") {
    await clearAddReviewState(env, chatId);
    return sendMessage(env, chatId, "Отменено.");
  }

  // Админ добавляет отзыв: сначала фото, потом текст
  if (admin) {
    const state = await getAddReviewState(env, chatId);
    if (state) {
      const photo = message.photo;
      if (photo && photo.length > 0 && state.step === "photo") {
        await setAddReviewState(env, chatId, { step: "text", file_id: photo[photo.length - 1].file_id });
        return sendMessage(env, chatId, "Фото сохранено. Теперь отправьте текст отзыва (или /cancel):");
      }
      if (text && state.step === "text" && "file_id" in state) {
        await addReview(env, { file_id: state.file_id, text });
        await clearAddReviewState(env, chatId);
        return sendMessage(env, chatId, "Отзыв добавлен ✅");
      }
      return sendMessage(env, chatId, state.step === "photo" ? "Жду фото отзыва (или /cancel)." : "Жду текст отзыва (или /cancel).");
    }
  }

  if (text) await answerFreeText(env, chatId, text);
}

// Свободный текст: ищем подходящий вопрос по ключевым словам, иначе — к менеджеру.
// Ответ — без «заголовка-вопроса» и с двумя кнопками: так он похож на ответ человека, а не на справочник.
async function answerFreeText(env: Env, chatId: number, text: string): Promise<void> {
  const t = ` ${text.toLowerCase().replace(/ё/g, "е").replace(/[?!.,;:()]/g, " ").replace(/\s+/g, " ")} `;

  if (/^ (привет|здравств|добрый|доброе|хай|салам|старт|меню)/.test(t)) return sendWelcome(env, chatId);

  // Короткий уточняющий вопрос («а в Красноярск сколько?») продолжает прошлую тему, а не начинает новую.
  const lastTopic = await env.KV.get(TOPIC_KEY(chatId));
  const startsAsFollowUp = /^ (а|и|ну|еще) /.test(t);
  const shortPriceQuestion = t.trim().split(" ").length <= 3;
  let item = findFaqItem(t);
  if (lastTopic && ((startsAsFollowUp && (!item || item.id === "price")) || (shortPriceQuestion && item?.id === "price"))) {
    item = findFaqItemById(lastTopic) ?? item;
  }

  const keyboard: Keyboard = { inline_keyboard: [[managerButton, allQuestionsButton]] };

  // Доставка в другой город — честно говорим, что пока только Москва
  const aboutDelivery = item?.id === "delivery" || item?.id === "price" || /доставк|привез|отправ/.test(t);
  if (aboutDelivery && OTHER_CITY_KEYS.some((k) => t.includes(k))) {
    await rememberTopic(env, chatId, "delivery");
    return sendMessage(env, chatId, OTHER_CITY_MESSAGE, keyboard);
  }

  if (!item) return sendMessage(env, chatId, FALLBACK_MESSAGE, keyboard);

  await rememberTopic(env, chatId, item.id);
  // Где ответ ведёт в магазин — добавляем зелёную кнопку
  if (["how_order", "price", "availability"].includes(item.id)) keyboard.inline_keyboard.push([shopButton(env)]);
  await sendMessage(env, chatId, item.answer, keyboard);
}

// Тема последнего ответа — 15 минут, только её id (не текст переписки).
const TOPIC_KEY = (chatId: number) => `topic:${chatId}`;
async function rememberTopic(env: Env, chatId: number, itemId: string): Promise<void> {
  await env.KV.put(TOPIC_KEY(chatId), itemId, { expirationTtl: 15 * 60 });
}

function findFaqItemById(id: string): FaqItem | null {
  for (const section of FAQ) for (const item of section.items) if (item.id === id) return item;
  return null;
}

// Вопрос с наибольшим «весом» совпавших ключевых слов: длиннее слово — точнее совпадение
// («сколько стоит доставка» — это доставка, а не цены). При равенстве — тот, что выше в списке.
function findFaqItem(normalizedText: string): FaqItem | null {
  let best: FaqItem | null = null;
  let bestScore = 0;
  for (const section of FAQ) {
    for (const item of section.items) {
      const score = item.keys.filter((k) => normalizedText.includes(k)).reduce((sum, k) => sum + k.length, 0);
      if (score > bestScore) {
        best = item;
        bestScore = score;
      }
    }
  }
  return best;
}

/* ── Кнопки ── */

async function handleCallback(env: Env, cq: NonNullable<TelegramUpdate["callback_query"]>): Promise<void> {
  const chatId = cq.message?.chat.id;
  const messageId = cq.message?.message_id;
  const data = cq.data || "";
  if (!chatId || !messageId) return answerCallback(env, cq.id);

  if (data === "faq") await sendFaqHome(env, chatId);
  else if (data === "faq_home") await showFaqHome(env, chatId, messageId);
  else if (data.startsWith("faq_s:")) await showFaqSection(env, chatId, messageId, data.slice(6));
  else if (data.startsWith("faq_q:")) await showFaqAnswer(env, chatId, messageId, data.slice(6));
  else if (data === "contacts" || data === "support") await sendContacts(env, chatId);
  else if (data === "reviews") await showReview(env, chatId, 0);
  else if (data.startsWith("reviews_")) {
    const index = parseInt(data.slice(8), 10);
    if (!isNaN(index)) await showReview(env, chatId, index, messageId);
  } else if (data === "admin_addreview" && isAdmin(env, chatId)) await startAddReview(env, chatId);

  // Подтверждаем callback, чтобы убрать «часики» на кнопке
  await answerCallback(env, cq.id);
}

// Приветствие. Админам — ещё ряд кнопок: «Админка» и «Добавить отзыв».
// style: "success" — зелёная кнопка (клиенты Telegram с февраля 2026; старые покажут обычную).
async function sendWelcome(env: Env, chatId: number): Promise<void> {
  const keyboard: Keyboard = {
    inline_keyboard: [
      [shopButton(env)],
      [allQuestionsButton, { text: "⭐ Отзывы", callback_data: "reviews" }],
      [managerButton, { text: "📞 Контакты", callback_data: "contacts" }],
    ],
  };
  if (isAdmin(env, chatId)) {
    // Кнопку видят только админы; сама админка всё равно спрашивает пароль.
    keyboard.inline_keyboard.push([
      { text: "🛠 Админка", web_app: { url: new URL("admin", env.MINI_APP_URL).toString() } },
      { text: "➕ Добавить отзыв", callback_data: "admin_addreview" },
    ]);
  }
  await sendMessage(env, chatId, WELCOME_MESSAGE, keyboard);
}

async function sendContacts(env: Env, chatId: number): Promise<void> {
  const keyboard: Keyboard = { inline_keyboard: [[{ text: `💬 Написать ${MANAGER.name}у`, url: MANAGER_URL }], [shopButton(env)]] };
  await sendMessage(env, chatId, CONTACTS_MESSAGE, keyboard);
}

/* ── Частые вопросы: разделы → вопросы → ответ (одно сообщение, без спама) ── */

const FAQ_HOME_TEXT = "<b>Частые вопросы</b>\nВыберите тему — или просто напишите свой вопрос в чат.";

function faqHomeKeyboard(): Keyboard {
  return {
    inline_keyboard: [
      ...FAQ.map((s) => [{ text: s.title, callback_data: `faq_s:${s.id}` }]),
      [managerButton],
    ],
  };
}

async function sendFaqHome(env: Env, chatId: number): Promise<void> {
  await sendMessage(env, chatId, FAQ_HOME_TEXT, faqHomeKeyboard());
}

async function showFaqHome(env: Env, chatId: number, messageId: number): Promise<void> {
  await editMessage(env, chatId, messageId, FAQ_HOME_TEXT, faqHomeKeyboard());
}

async function showFaqSection(env: Env, chatId: number, messageId: number, sectionId: string): Promise<void> {
  const section = FAQ.find((s) => s.id === sectionId);
  if (!section) return showFaqHome(env, chatId, messageId);
  const keyboard: Keyboard = {
    inline_keyboard: [
      ...section.items.map((q) => [{ text: q.question, callback_data: `faq_q:${q.id}` }]),
      [{ text: "← Все темы", callback_data: "faq_home" }],
    ],
  };
  await editMessage(env, chatId, messageId, `<b>${section.title}</b>`, keyboard);
}

async function showFaqAnswer(env: Env, chatId: number, messageId: number, itemId: string): Promise<void> {
  const section = FAQ.find((s) => s.items.some((q) => q.id === itemId));
  const item = section?.items.find((q) => q.id === itemId);
  if (!section || !item) return showFaqHome(env, chatId, messageId);
  const keyboard: Keyboard = {
    inline_keyboard: [
      [{ text: "← Назад", callback_data: `faq_s:${section.id}` }, managerButton],
    ],
  };
  await editMessage(env, chatId, messageId, `<b>${item.question}</b>\n\n${item.answer}`, keyboard);
}

/* ── Отправка в Telegram ── */

async function callTelegram(env: Env, method: string, body: Record<string, unknown>): Promise<void> {
  const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) console.error(`Telegram ${method} error:`, await res.text());
}

async function sendMessage(env: Env, chatId: number, text: string, replyMarkup?: Keyboard): Promise<void> {
  await callTelegram(env, "sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  });
}

async function editMessage(env: Env, chatId: number, messageId: number, text: string, replyMarkup?: Keyboard): Promise<void> {
  await callTelegram(env, "editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  });
}

async function answerCallback(env: Env, callbackId: string): Promise<void> {
  await callTelegram(env, "answerCallbackQuery", { callback_query_id: callbackId });
}

/* ── Отзывы ── */

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

async function addReview(env: Env, review: Review): Promise<void> {
  const reviews = await loadReviews(env);
  reviews.push(review);
  await env.KV.put(REVIEWS_KEY, JSON.stringify(reviews));
}

async function startAddReview(env: Env, chatId: number): Promise<void> {
  await setAddReviewState(env, chatId, { step: "photo" });
  await sendMessage(env, chatId, "Отправьте фото отзыва (скриншот, фото с покупкой). Отмена — /cancel");
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
  // Незавершённое добавление само сбрасывается через сутки
  await env.KV.put(ADDREVIEW_STATE_KEY(chatId), JSON.stringify(state), { expirationTtl: 24 * 60 * 60 });
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
  const keyboard: Keyboard = {
    inline_keyboard: [
      [
        { text: "← Назад", callback_data: `reviews_${i - 1}` },
        { text: "Следующий →", callback_data: `reviews_${i + 1}` },
      ],
      [shopButton(env), managerButton],
    ],
  };

  if (messageId) {
    await callTelegram(env, "editMessageMedia", {
      chat_id: chatId,
      message_id: messageId,
      media: { type: "photo", media: review.file_id, caption },
      reply_markup: keyboard,
    });
  } else {
    await callTelegram(env, "sendPhoto", { chat_id: chatId, photo: review.file_id, caption, reply_markup: keyboard });
  }
}
