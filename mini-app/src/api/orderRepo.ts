import { supabase } from './supabaseClient';
import { getInitData } from '../telegram/telegramWebApp';
import type { DeliveryMethod, PaymentMethod } from '../domain/types';

// С клиента уходит только «что хочу»: id варианта, количество и размер ремешка (у часов).
// Цену и сумму считает сервер по базе — цены из корзины он не принимает.
export interface CreateOrderRequest {
  items: { variantId: string; qty: number; strap?: string }[];
  deliveryMethod: DeliveryMethod;
  address?: string;
  phone?: string;
  paymentMethod: PaymentMethod;
  /** Покупатель отметил согласие на обработку персональных данных (152-ФЗ) */
  consent: true;
}

export interface ServerOrderLine {
  variantId: string;
  title: string;
  options: string;
  price: number;
  qty: number;
}

export type CreateOrderResult =
  | { ok: true; orderId: string; total: number; items: ServerOrderLine[] }
  | { ok: false; error: string };

const NOT_IN_TELEGRAM = 'Откройте магазин через Telegram, чтобы оформить заказ';
const GENERIC_ERROR = 'Ошибка при оформлении. Попробуйте ещё раз.';

export async function createOrder(req: CreateOrderRequest): Promise<CreateOrderResult> {
  if (!supabase) return { ok: false, error: GENERIC_ERROR };

  const initData = getInitData();
  if (!initData) return { ok: false, error: NOT_IN_TELEGRAM };

  try {
    const { data, error } = await supabase.functions.invoke<CreateOrderResult>('create-order', {
      body: { ...req, initData },
    });

    if (error) {
      // Сервер отвечает понятным текстом ошибки (закончился товар, лимит заказов и т.п.)
      const ctx = (error as { context?: Response }).context;
      const body = ctx ? await ctx.json().catch(() => null) : null;
      return { ok: false, error: body?.error || GENERIC_ERROR };
    }
    if (!data?.ok) return { ok: false, error: (data as { error?: string })?.error || GENERIC_ERROR };
    return data;
  } catch (err) {
    console.error('createOrder failed:', err);
    return { ok: false, error: GENERIC_ERROR };
  }
}
