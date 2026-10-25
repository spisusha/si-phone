import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, withCors } from '../_shared/cors.ts';
import { verifyAdminToken } from '../_shared/adminAuth.ts';
import { verifyInitData } from '../_shared/telegramInitData.ts';
import { createMatcher, type CatalogRow } from '../_shared/priceMatch.ts';

// Админка каталога (этап B3): товары и цены, загрузка прайса, наценки и курс, история.
// Каждый запрос проверяется здесь, на сервере:
//   - в Telegram — подпись initData + ID из списка админов (TELEGRAM_ADMIN_CHAT_IDS): у каждого свой вход;
//   - в браузере — токен после входа по паролю (admin-login).
// Менять данные можно только через функции базы admin_* — они проверяют значения и пишут историю «кто и когда».

const MAX_TEXT = 300_000;       // прайс текстом — до ~300 КБ
const MAX_ITEMS = 2000;
const INIT_DATA_MAX_AGE_SEC = 12 * 60 * 60; // админка строже заказа: старая подпись Telegram не открывает её

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

async function whoIsAdmin(req: Request, body: Record<string, unknown>): Promise<string | null> {
  if (await verifyAdminToken(req)) return 'вход по паролю';
  const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN') ?? '';
  const admins = (Deno.env.get('TELEGRAM_ADMIN_CHAT_IDS') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const user = await verifyInitData(String(body.initData ?? ''), botToken, INIT_DATA_MAX_AGE_SEC);
  if (!user || !admins.includes(String(user.id))) return null;
  const name = [user.first_name, user.last_name].filter(Boolean).join(' ') || 'Без имени';
  return `${name}${user.username ? ` @${user.username}` : ''} (${user.id})`.slice(0, 120);
}

const int = (v: unknown) => (typeof v === 'number' && Number.isInteger(v) ? v : Number.NaN);

Deno.serve(withCors(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const who = await whoIsAdmin(req, body);
  if (!who) return json({ error: 'Нет доступа' }, 401);

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const action = String(body.action ?? '');

  try {
    switch (action) {
      // Кто вошёл (админка показывает имя и не спрашивает пароль в Telegram)
      case 'whoami':
        return json({ who });

      // Весь каталог с закупкой — для экранов «Товары и цены» и «Наценки и курс»
      case 'catalog': {
        const [models, items, costs, markups, settings, fx] = await Promise.all([
          sb.from('catalog_models').select('id, category, title, sort').order('sort', { ascending: false }),
          sb.from('catalog_items').select('id, model_id, name, storage, color, sim, size, chip, ram_ssd, band, keyboard, price, status, visible, photo_url, confirmed_at').order('id').range(0, 4999),
          sb.from('catalog_costs').select('item_id, purchase_price, purchase_date, source').range(0, 4999),
          sb.from('markup_rules').select('category, percent'),
          sb.from('pricing_settings').select('fx_margin_pct').eq('id', 1).single(),
          sb.from('fx_rates').select('rate_date, usd_cbr, source, fetched_at').order('rate_date', { ascending: false }).limit(7),
        ]);
        for (const r of [models, items, costs, markups, settings, fx]) if (r.error) throw new Error(r.error.message);
        return json({
          who,
          models: models.data, items: items.data, costs: costs.data,
          markups: markups.data, fxMargin: settings.data?.fx_margin_pct, fx: fx.data,
        });
      }

      // Ручная правка одной позиции: закупка и/или наличие и видимость
      case 'save-item': {
        const id = int(body.id);
        if (!(id > 0)) return json({ error: 'Неверная позиция' }, 400);
        if (body.purchase !== undefined && body.purchase !== null) {
          const p = int(body.purchase);
          if (!(p >= 1000 && p <= 5_000_000)) return json({ error: 'Закупка — от 1 000 до 5 000 000 ₽' }, 400);
          const { error } = await sb.rpc('admin_apply_prices', { p_items: [{ id, price: p }], p_source: 'вручную', p_who: who });
          if (error) throw new Error(error.message);
        }
        if (body.status !== undefined || body.visible !== undefined) {
          const status = String(body.status);
          if (!['в наличии', 'уточнить'].includes(status) || typeof body.visible !== 'boolean') return json({ error: 'Неверные данные' }, 400);
          const { error } = await sb.rpc('admin_set_item', { p_id: id, p_status: status, p_visible: body.visible, p_who: who });
          if (error) throw new Error(error.message);
        }
        return json({ ok: true });
      }

      // Прайс: распознать строки (ничего не меняет)
      case 'preview-import': {
        const text = String(body.text ?? '');
        if (!text.trim() || text.length > MAX_TEXT) return json({ error: 'Пустой или слишком большой прайс' }, 400);
        const { data, error } = await sb.from('catalog_items')
          .select('id, name, storage, color, color_ru, sim, size, chip, ram_ssd, band, keyboard, synonyms, apple_parts, catalog_models(title, category)')
          .range(0, 4999);
        if (error) throw new Error(error.message);
        // deno-lint-ignore no-explicit-any
        const rows: CatalogRow[] = (data ?? []).map((r: any) => ({ ...r, model: r.catalog_models.title, category: r.catalog_models.category }));
        return json({ lines: createMatcher(rows).match(text) });
      }

      // Прайс: применить выбранное (менеджер подтвердил)
      case 'apply-import': {
        const list = Array.isArray(body.items) ? body.items : [];
        if (!list.length || list.length > MAX_ITEMS) return json({ error: 'Нечего применять' }, 400);
        // на одну позицию — одна цена (если в прайсе две, берём меньшую)
        const byId = new Map<number, number>();
        for (const it of list as Array<Record<string, unknown>>) {
          const id = int(it.id), price = int(it.price);
          if (!(id > 0) || !(price >= 1000 && price <= 5_000_000)) return json({ error: 'Неверная строка в списке' }, 400);
          byId.set(id, Math.min(price, byId.get(id) ?? Infinity));
        }
        const source = String(body.source ?? 'прайс').slice(0, 80);
        const items = [...byId].map(([id, price]) => ({ id, price }));
        const { data, error } = await sb.rpc('admin_apply_prices', { p_items: items, p_source: `прайс: ${source}`, p_who: who });
        if (error) throw new Error(error.message);
        await sb.from('price_imports').insert({
          who, source, lines: Math.min(int(body.lines) || 0, 100_000), matched: Math.min(int(body.matched) || 0, 100_000), applied: data ?? 0,
        });
        return json({ ok: true, applied: data });
      }

      // Наценки по категориям и надбавка к курсу ЦБ
      case 'save-pricing': {
        const margin = Number(body.fxMargin);
        const markups = (body.markups ?? {}) as Record<string, unknown>;
        const clean: Record<string, number> = {};
        for (const [k, v] of Object.entries(markups)) {
          if (!['iPhone', 'iPad', 'MacBook', 'Watch', 'AirPods'].includes(k)) return json({ error: 'Неверная категория' }, 400);
          const n = Number(v);
          if (!(n >= 0 && n <= 50)) return json({ error: 'Наценка — от 0 до 50 %' }, 400);
          clean[k] = Math.round(n * 100) / 100;
        }
        if (!(margin >= 0 && margin <= 20)) return json({ error: 'Надбавка к курсу — от 0 до 20 %' }, 400);
        const { error } = await sb.rpc('admin_set_pricing', { p_fx_margin: Math.round(margin * 100) / 100, p_markups: clean, p_who: who });
        if (error) throw new Error(error.message);
        return json({ ok: true });
      }

      // Курс ЦБ — обновить сейчас (обычно сам, дважды в день)
      case 'refresh-fx': {
        const { data, error } = await sb.rpc('fetch_cbr_usd');
        if (error) return json({ error: `Курс не обновлён: ${error.message}` }, 502);
        return json({ ok: true, usd: data });
      }

      // История: последние изменения цен, загрузки прайсов, наценки
      case 'history': {
        const [changes, imports, settings] = await Promise.all([
          sb.from('price_history').select('id, item_id, old_purchase, new_purchase, old_status, new_status, old_visible, new_visible, source, who, at, catalog_items(name)').order('at', { ascending: false }).limit(100),
          sb.from('price_imports').select('*').order('at', { ascending: false }).limit(30),
          sb.from('settings_history').select('*').order('at', { ascending: false }).limit(30),
        ]);
        for (const r of [changes, imports, settings]) if (r.error) throw new Error(r.error.message);
        return json({ changes: changes.data, imports: imports.data, settings: settings.data });
      }

      default:
        return json({ error: 'Неизвестное действие' }, 400);
    }
  } catch (e) {
    console.error('admin-catalog', action, e instanceof Error ? e.message : e);
    return json({ error: 'Не получилось. Попробуйте ещё раз' }, 500);
  }
}));
