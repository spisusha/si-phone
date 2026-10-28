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
interface TelegramMessage {
  message_id: number;
  chat: { id: number; type: string };
  from?: { id: number; is_bot?: boolean };
  sender_chat?: { id: number }; // пишет канал или группа, а не человек
  is_automatic_forward?: boolean; // пост канала, автоматически попавший в группу обсуждений
  message_thread_id?: number;
  reply_to_message?: { message_id: number };
  media_group_id?: string; // альбом: несколько фото одним комментарием
  text?: string;
  caption?: string;
  photo?: Array<{ file_id: string }>;
}

interface TelegramUpdate {
  message?: TelegramMessage;
  callback_query?: {
    id: string;
    data: string;
    message?: { chat: { id: number }; message_id: number };
  };
}

// Отзыв из группы — номера комментариев: бот пересылает сам комментарий, и сверху видно
// «Переслано от <имя>» — понятно, что писал покупатель, а не магазин. Удалит автор — пропадёт и тут.
// Отзыв не из группы (добавлен админом вручную) — копия: фото (file_id или путь на сайте) + текст;
// у отзыва без фото — фирменная карточка REVIEW_NO_PHOTO.
type GroupReview = { group_ids: number[] };
type CopyReview = { file_id: string; text: string };
type Review = GroupReview | CopyReview;

// Состояние админа при добавлении отзыва
type AddReviewState = { step: "photo"; file_id?: string } | { step: "text"; file_id: string };

interface Env {
  TELEGRAM_BOT_TOKEN: string;
  MINI_APP_URL: string;
  ADMIN_CHAT_ID: string; // chat_id админов через запятую: кнопка «Админка» и добавление отзывов
  WEBHOOK_SECRET: string; // секрет вебхука: Telegram присылает его в X-Telegram-Bot-Api-Secret-Token
  KV: KVNamespace;
  SUPABASE_URL?: string; // база магазина — для ежедневной «побудки»
  SUPABASE_ANON_KEY?: string; // публичный ключ магазина (тот же, что на сайте), секрет воркера
  REVIEWS_GROUP_ID?: string; // группа обсуждений канала, где под постом оставляют отзывы
  REVIEWS_POST_ID?: string; // номер поста «Ваши отзывы» в этой группе
  REVIEW_CHAT_IDS?: string; // кому приходят новые отзывы на одобрение (секрет; не задан — админам)
}

// Бесплатный Supabase засыпает, если неделю к нему никто не обращается. Раз в день бот
// делает лёгкий запрос к каталогу (одна строка) — магазин не уснёт, даже если год без покупателей.
async function pingSupabase(env: Env): Promise<void> {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    console.error("keepalive: SUPABASE_URL или SUPABASE_ANON_KEY не заданы");
    return;
  }
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/catalog_models?select=id&limit=1`, {
    headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${env.SUPABASE_ANON_KEY}` },
  });
  if (!res.ok) console.error("keepalive: Supabase ответил", res.status);
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

const idList = (s?: string) => (s || "").split(",").map((id) => id.trim()).filter(Boolean);

function isAdmin(env: Env, chatId: number): boolean {
  return idList(env.ADMIN_CHAT_ID).includes(String(chatId));
}

function reviewModerators(env: Env): string[] {
  return env.REVIEW_CHAT_IDS ? idList(env.REVIEW_CHAT_IDS) : idList(env.ADMIN_CHAT_ID);
}

function isModerator(env: Env, chatId: number): boolean {
  return isAdmin(env, chatId) || reviewModerators(env).includes(String(chatId));
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
      // В группах и каналах бот не разговаривает — только замечает новые отзывы
      if (update.message?.chat.type === "private") await handleMessage(env, update.message);
      else if (update.message) await handleGroupMessage(env, update.message);
      else if (update.callback_query) await handleCallback(env, update.callback_query);
    } catch (err) {
      console.error(err);
    }
    return new Response("OK", { status: 200 }); // Telegram требует 200 даже при ошибке
  },

  // Расписание из wrangler.toml ([triggers] crons) — ежедневная «побудка» базы магазина
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(pingSupabase(env));
  },
};

/* ── Сообщения ── */

async function handleMessage(env: Env, message: TelegramMessage): Promise<void> {
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

  // Админ добавляет отзыв: фото, потом текст. Фото с подписью (например, пересланный комментарий
  // из группы) — сразу целиком; текст без фото — отзыв с фирменной карточкой вместо фото.
  if (admin) {
    const state = await getAddReviewState(env, chatId);
    if (state) {
      const photo = message.photo;
      const caption = message.caption?.trim() || "";
      if (photo && photo.length > 0 && state.step === "photo") {
        const fileId = photo[photo.length - 1].file_id;
        if (caption) return finishAddReview(env, chatId, { file_id: fileId, text: caption });
        await setAddReviewState(env, chatId, { step: "text", file_id: fileId });
        return sendMessage(env, chatId, "Фото сохранено. Теперь отправьте текст отзыва (или /cancel):");
      }
      if (text && !text.startsWith("/") && state.step === "photo") {
        return finishAddReview(env, chatId, { file_id: REVIEW_NO_PHOTO, text });
      }
      if (text && state.step === "text" && "file_id" in state) {
        return finishAddReview(env, chatId, { file_id: state.file_id, text });
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
  else if (data.startsWith("rv:") || data.startsWith("reviews_")) {
    // Листание: убираем показанный отзыв (пересланные сообщения + строку с кнопками) и показываем другой.
    // rv:<куда>:<первое пересланное>:<сколько>; reviews_<куда> — кнопки со старых сообщений.
    const [target, first, count] = data.replace(/^reviews_/, "rv:").slice(3).split(":").map((n) => parseInt(n, 10));
    if (!isNaN(target)) {
      const old = [messageId];
      if (first > 0 && count > 0 && count <= 10) for (let k = 0; k < count; k++) old.push(first + k);
      await callTelegram(env, "deleteMessages", { chat_id: chatId, message_ids: old });
      await showReview(env, chatId, target);
    }
  } else if ((data.startsWith("rva:") || data.startsWith("rvs:")) && isModerator(env, chatId)) {
    const groupMsgId = parseInt(data.slice(4), 10);
    if (groupMsgId > 0) await moderateReview(env, chatId, messageId, groupMsgId, data.startsWith("rva:"));
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

// Как callTelegram, но возвращает ответ Telegram (например, номера пересланных сообщений)
async function telegramResult<T>(env: Env, method: string, body: Record<string, unknown>): Promise<T | null> {
  const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => null)) as { ok?: boolean; result?: T; description?: string } | null;
  if (!data?.ok) {
    console.error(`Telegram ${method} error:`, data?.description ?? res.status);
    return null;
  }
  return data.result ?? null;
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

// Новые отзывы — первыми
async function addReview(env: Env, review: Review): Promise<void> {
  const reviews = await loadReviews(env);
  reviews.unshift(review);
  await env.KV.put(REVIEWS_KEY, JSON.stringify(reviews));
}

async function finishAddReview(env: Env, chatId: number, review: Review): Promise<void> {
  await addReview(env, review);
  await clearAddReviewState(env, chatId);
  await sendMessage(env, chatId, "Отзыв добавлен ✅ Он показывается первым.");
}

async function startAddReview(env: Env, chatId: number): Promise<void> {
  await setAddReviewState(env, chatId, { step: "photo" });
  await sendMessage(
    env,
    chatId,
    "Отзывы из группы приходят на одобрение сами. Здесь — отзыв не из группы (например, из личных сообщений): отправьте фото, потом текст — или фото с подписью одним сообщением. Без фото — сразу текст. Отмена — /cancel",
  );
}

// Фото отзыва: file_id Telegram или путь к картинке на сайте магазина
const REVIEW_NO_PHOTO = "reviews/no-photo.png";
function reviewPhoto(env: Env, fileId: string): string {
  return fileId.startsWith("reviews/") ? new URL(fileId, env.MINI_APP_URL).toString() : fileId;
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

// Отзыв из группы — пересылаем комментарий (к пересланному Telegram не даёт прикрепить кнопки,
// поэтому под ним отдельная строка «Отзыв N из M» с листанием). Кнопки помнят, какие сообщения
// убрать при листании: rv:<куда>:<первое пересланное>:<сколько>.
async function showReview(env: Env, chatId: number, index: number): Promise<void> {
  const reviews = await loadReviews(env);
  // Комментарий в группе могли удалить — тогда показываем следующий отзыв
  for (let tries = 0; tries < reviews.length; tries++) {
    const i = (((index + tries) % reviews.length) + reviews.length) % reviews.length;
    const review = reviews[i];
    const nav = (first = 0, count = 0): Keyboard => ({
      inline_keyboard: [
        [
          { text: "← Назад", callback_data: `rv:${i - 1}:${first}:${count}` },
          { text: "Следующий →", callback_data: `rv:${i + 1}:${first}:${count}` },
        ],
        [shopButton(env), managerButton],
      ],
    });
    const title = `⭐ Отзыв ${i + 1} из ${reviews.length}`;

    if ("group_ids" in review) {
      const sent = await telegramResult<Array<{ message_id: number }>>(env, "forwardMessages", {
        chat_id: chatId,
        from_chat_id: env.REVIEWS_GROUP_ID,
        message_ids: review.group_ids,
      });
      if (!sent?.length) continue;
      const ids = sent.map((m) => m.message_id).sort((a, b) => a - b);
      const inRow = ids[ids.length - 1] - ids[0] === ids.length - 1;
      await sendMessage(env, chatId, `${title} — из комментариев в нашей группе`, inRow ? nav(ids[0], ids.length) : nav());
      return;
    }
    const caption = `${title}\n\n${review.text}`;
    await callTelegram(env, "sendPhoto", { chat_id: chatId, photo: reviewPhoto(env, review.file_id), caption, reply_markup: nav() });
    return;
  }
  await sendMessage(env, chatId, "Пока нет отзывов.");
}

/* ── Новые отзывы из группы — на одобрение ── */

const PENDING_KEY = (groupMsgId: number) => `rvp:${groupMsgId}`;
const ALBUM_KEY = (album: string, groupMsgId?: number) => `rvmg:${album}:${groupMsgId ?? ""}`;
const MONTH = 30 * 24 * 60 * 60;

// Комментарий покупателя под постом «Ваши отзывы» → Артёму и Андрею: сам комментарий и кнопки
// «Добавить в отзывы» / «Пропустить». Сами по себе в бота отзывы не попадают — спам и случайные
// сообщения не проскочат.
async function handleGroupMessage(env: Env, m: TelegramMessage): Promise<void> {
  const postId = Number(env.REVIEWS_POST_ID);
  if (!env.REVIEWS_GROUP_ID || String(m.chat.id) !== env.REVIEWS_GROUP_ID || !postId) return;
  if (m.message_thread_id !== postId && m.reply_to_message?.message_id !== postId) return;
  // Не покупатель: бот, канал, сам пост или ответ магазина в комментариях
  if (!m.from || m.from.is_bot || m.sender_chat || m.is_automatic_forward || isModerator(env, m.from.id)) return;

  if (m.media_group_id) await env.KV.put(ALBUM_KEY(m.media_group_id, m.message_id), "1", { expirationTtl: MONTH });
  if (!(m.text || m.caption || "").trim()) return; // фото без подписи — часть альбома, само по себе не отзыв
  await env.KV.put(PENDING_KEY(m.message_id), JSON.stringify({ album: m.media_group_id ?? null }), { expirationTtl: MONTH });

  const keyboard: Keyboard = {
    inline_keyboard: [[
      { text: "✅ Добавить в отзывы", callback_data: `rva:${m.message_id}` },
      { text: "Пропустить", callback_data: `rvs:${m.message_id}` },
    ]],
  };
  for (const id of reviewModerators(env)) {
    await callTelegram(env, "forwardMessage", { chat_id: id, from_chat_id: m.chat.id, message_id: m.message_id });
    await sendMessage(env, Number(id), "⭐ Новый комментарий под постом с отзывами. Добавить его в отзывы бота?", keyboard);
  }
}

async function moderateReview(env: Env, chatId: number, messageId: number, groupMsgId: number, approve: boolean): Promise<void> {
  const reviews = await loadReviews(env);
  if (reviews.some((r) => "group_ids" in r && r.group_ids.includes(groupMsgId))) {
    return editMessage(env, chatId, messageId, "Этот отзыв уже в боте ✅");
  }
  if (!approve) return editMessage(env, chatId, messageId, "Пропущен — в отзывы бота не попал.");

  // Альбом — все его фото одним отзывом
  const ids = new Set([groupMsgId]);
  let album: string | null = null;
  try {
    album = (JSON.parse((await env.KV.get(PENDING_KEY(groupMsgId))) ?? "{}") as { album?: string | null }).album ?? null;
  } catch { /* нет записи — одно сообщение */ }
  if (album) {
    const list = await env.KV.list({ prefix: ALBUM_KEY(album) });
    for (const k of list.keys) ids.add(Number(k.name.split(":").pop()));
  }
  reviews.unshift({ group_ids: [...ids].filter((n) => n > 0).sort((a, b) => a - b) });
  await env.KV.put(REVIEWS_KEY, JSON.stringify(reviews));
  await editMessage(env, chatId, messageId, "✅ Добавлен в отзывы — показывается первым.");
}
