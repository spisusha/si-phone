import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, withCors } from '../_shared/cors.ts';
import { verifyInitData, type TgUser } from '../_shared/telegramInitData.ts';

// Всё, что приходит из мини-аппа, может быть подделано. Поэтому сервер:
// - узнаёт покупателя только по проверенной initData Telegram;
// - берёт цены и наличие из базы и сам считает сумму (цены с телефона не принимаются);
// - ограничивает частоту заказов, чтобы нельзя было завалить админов спамом.

const INIT_DATA_MAX_AGE_SEC = 24 * 60 * 60; // initData не обновляется, пока мини-апп открыт
const MAX_POSITIONS = 20;
const MAX_QTY = 10;
const LIMIT_10_MIN = 3;
const LIMIT_DAY = 20;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PHONE_RE = /^[+\d\s()-]{5,32}$/;

interface RequestBody {
  initData?: string;
  items?: { variantId?: string; qty?: number }[];
  deliveryMethod?: string;
  address?: string;
  phone?: string;
  paymentMethod?: string;
}

interface OrderLine {
  variantId: string;
  title: string;
  options: string;
  price: number;
  qty: number;
}

interface Contacts {
  deliveryMethod: 'pickup' | 'delivery';
  paymentMethod: 'cash' | 'online';
  address: string;
  phone: string;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function formatPrice(n: number): string {
  return n.toLocaleString('ru-RU');
}

function formatStorage(gb: unknown): string {
  const n = Number(gb);
  return n >= 1024 ? `${n / 1024} ТБ` : `${n} ГБ`;
}

// Та же логика, что в src/domain/variantFormat.ts: только понятные покупателю поля.
function describeOptions(o: Record<string, unknown>): string {
  const parts: string[] = [];
  if (o.chip) parts.push(String(o.chip));
  if (o.memStorage) parts.push(String(o.memStorage));
  if (o.storage) parts.push(formatStorage(o.storage));
  const color = o.colorLabel || o.color;
  if (color) parts.push(String(color));
  if (o.simType) parts.push(String(o.simType));
  if (o.connectivity) parts.push(String(o.connectivity));
  if (o.size) parts.push(String(o.size));
  if (o.ruKeyboard && String(o.ruKeyboard) !== 'false') parts.push('RU');
  return parts.join(' · ');
}

function buildMessage(orderId: string, user: TgUser, lines: OrderLine[], total: number, c: Contacts): string {
  const out: string[] = [];
  out.push(`🧾 <b>Заказ:</b> <code>${escapeHtml(orderId.slice(0, 8).toUpperCase())}</code>`);
  const name = [user.first_name, user.last_name].filter(Boolean).join(' ') || 'Без имени';
  const username = user.username ? ` (@${escapeHtml(user.username)})` : '';
  out.push(`👤 <b>Клиент:</b> ${escapeHtml(name)}${username}`);
  out.push(`🆔 <b>Telegram ID:</b> <code>${user.id}</code>`);
  out.push('');
  out.push('📦 <b>Позиции:</b>');
  for (const l of lines) {
    const opts = l.options ? ` (${escapeHtml(l.options)})` : '';
    out.push(`  • ${escapeHtml(l.title)}${opts} ×${l.qty} — ${formatPrice(l.price * l.qty)} ₽`);
  }
  out.push('');
  out.push(`💰 <b>Итого:</b> ${formatPrice(total)} ₽ (цены из базы на момент заказа)`);
  out.push(`🚚 <b>Получение:</b> ${c.deliveryMethod === 'pickup' ? 'Самовывоз' : 'Доставка'}`);
  if (c.deliveryMethod === 'delivery') out.push(`📍 <b>Адрес:</b> ${escapeHtml(c.address)}`);
  if (c.phone) out.push(`📱 <b>Телефон:</b> ${escapeHtml(c.phone)}`);
  out.push(`💳 <b>Оплата:</b> ${c.paymentMethod === 'cash' ? 'Наличными' : 'Перевод'}`);
  out.push(`🕒 <b>Время:</b> ${new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })}`);
  // Telegram не принимает сообщения длиннее 4096 символов
  const text = out.join('\n');
  return text.length > 4000 ? text.slice(0, 3990) + '\n…' : text;
}

Deno.serve(withCors(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const json = (d: unknown, status = 200) =>
    new Response(JSON.stringify(d), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  try {
    const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN') ?? '';
    if (!botToken) {
      console.error('create-order: TELEGRAM_BOT_TOKEN не задан');
      return json({ ok: false, error: 'Заказы временно не принимаются' }, 500);
    }

    const body = (await req.json().catch(() => ({}))) as RequestBody;

    /* ── 1. кто покупатель: только проверенная initData ── */
    const user = await verifyInitData(String(body.initData ?? ''), botToken, INIT_DATA_MAX_AGE_SEC);
    if (!user) {
      return json({ ok: false, code: 'not_telegram', error: 'Откройте магазин через Telegram, чтобы оформить заказ' }, 401);
    }

    /* ── 2. что заказали: только id и количество ── */
    const qtyById = new Map<string, number>();
    for (const it of Array.isArray(body.items) ? body.items : []) {
      const id = String(it?.variantId ?? '');
      const qty = Number(it?.qty);
      if (!UUID_RE.test(id) || !Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) {
        return json({ ok: false, error: 'Некорректная корзина' }, 400);
      }
      qtyById.set(id, Math.min(MAX_QTY, (qtyById.get(id) ?? 0) + qty));
    }
    if (qtyById.size === 0 || qtyById.size > MAX_POSITIONS) {
      return json({ ok: false, error: 'Некорректная корзина' }, 400);
    }

    /* ── 3. доставка и контакты ── */
    const deliveryMethod = body.deliveryMethod === 'delivery' ? 'delivery' : body.deliveryMethod === 'pickup' ? 'pickup' : null;
    const paymentMethod = body.paymentMethod === 'online' ? 'online' : body.paymentMethod === 'cash' ? 'cash' : null;
    const address = String(body.address ?? '').trim().slice(0, 300);
    const phone = String(body.phone ?? '').trim();
    if (!deliveryMethod || !paymentMethod) return json({ ok: false, error: 'Выберите способ получения и оплаты' }, 400);
    if (deliveryMethod === 'delivery' && address.length < 5) return json({ ok: false, error: 'Укажите адрес доставки' }, 400);
    if (phone && !PHONE_RE.test(phone)) return json({ ok: false, error: 'Проверьте номер телефона' }, 400);

    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    /* ── 4. цены и наличие — из базы ── */
    const ids = [...qtyById.keys()];
    const { data: variants, error: vErr } = await sb.from('variants')
      .select('id, family_id, options, price, in_stock').in('id', ids);
    if (vErr) throw new Error(`variants: ${vErr.message}`);
    const familyIds = [...new Set((variants ?? []).map((v) => v.family_id))];
    const { data: families, error: fErr } = await sb.from('product_families')
      .select('id, title, category').in('id', familyIds);
    if (fErr) throw new Error(`families: ${fErr.message}`);
    const familyById = new Map((families ?? []).map((f) => [f.id, f]));

    const lines: OrderLine[] = [];
    for (const id of ids) {
      const v = variants?.find((x) => x.id === id);
      const fam = v ? familyById.get(v.family_id) : undefined;
      const price = Number(v?.price);
      if (!v || !fam || !v.in_stock || !(price > 0)) {
        return json({ ok: false, code: 'stale_cart', error: 'Часть товаров закончилась или изменилась. Обновите корзину' }, 409);
      }
      const opts = (v.options ?? {}) as Record<string, unknown>;
      const isWatch = String(fam.category).toLowerCase() === 'watch';
      lines.push({
        variantId: id,
        title: isWatch && opts.supplierTitle ? String(opts.supplierTitle) : String(fam.title),
        options: isWatch ? '' : describeOptions(opts),
        price,
        qty: qtyById.get(id)!,
      });
    }
    const total = lines.reduce((s, l) => s + l.price * l.qty, 0);

    /* ── 5. сохранить (с лимитом) и отправить админам ── */
    const orderId = crypto.randomUUID();
    const contacts: Contacts = { deliveryMethod, paymentMethod, address, phone };
    const payload = {
      items: lines,
      total,
      deliveryMethod,
      address: deliveryMethod === 'delivery' ? address : null,
      phone: phone || null,
      paymentMethod,
      tgUser: { id: user.id, first_name: user.first_name, last_name: user.last_name, username: user.username },
    };

    // Лимит частоты и запись заказа — одной операцией в базе с блокировкой по пользователю:
    // пачка одновременных запросов не обойдёт лимит. Не смогли проверить — заказ не принимаем.
    const { data: accepted, error: saveErr } = await sb.rpc('create_order_limited', {
      p_id: orderId, p_tg_user_id: user.id, p_payload: payload, p_total: total,
      p_limit_10min: LIMIT_10_MIN, p_limit_day: LIMIT_DAY,
    });
    if (saveErr) {
      console.error('create-order: save failed', saveErr.message);
      return json({ ok: false, error: 'Не удалось оформить заказ. Попробуйте ещё раз или напишите менеджеру' }, 500);
    }
    if (!accepted) {
      return json({ ok: false, code: 'rate_limited', error: 'Слишком много заказов подряд. Напишите менеджеру или попробуйте позже' }, 429);
    }

    const chatIds = (Deno.env.get('TELEGRAM_ADMIN_CHAT_IDS') || '').split(',').map((s) => s.trim()).filter(Boolean);
    const text = buildMessage(orderId, user, lines, total, contacts);
    let tgSent = 0;
    for (const chatId of chatIds) {
      try {
        const resp = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text,
            parse_mode: 'HTML',
            disable_web_page_preview: true,
            reply_markup: { inline_keyboard: [[{ text: '✉️ Написать клиенту', url: `tg://user?id=${user.id}` }]] },
          }),
        });
        const result = await resp.json();
        if (result.ok) tgSent++;
        else console.error('create-order: TG fail', chatId, result.description);
      } catch (err) {
        console.error('create-order: TG error', chatId, err);
      }
    }

    // Заказ уже сохранён в базе; если Telegram не ответил — админы увидят его в базе.
    if (tgSent === 0) console.error('create-order: order saved but not delivered to Telegram', orderId);
    return json({ ok: true, orderId, total, items: lines });
  } catch (err) {
    console.error('create-order error:', err);
    return json({ ok: false, error: 'Не удалось оформить заказ. Попробуйте ещё раз' }, 500);
  }
}));
