import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useCartStore } from '../store/cartStore';
import { createOrder } from '../api/orderRepo';
import { cartItemDisplay } from '../domain/variantFormat';
import { plural } from '../domain/plural';
import { getTgUser, haptic, setClosingConfirmation } from '../telegram/telegramWebApp';
import { useTelegramMainButton } from '../telegram/hooks';
import type { DeliveryMethod, PaymentMethod, OrderPayload } from '../domain/types';
import './CheckoutScreen.css';

export default function CheckoutScreen() {
  const { items, total, clear } = useCartStore();
  const navigate = useNavigate();

  const [delivery, setDelivery] = useState<DeliveryMethod>('pickup');
  const [payment, setPayment] = useState<PaymentMethod>('cash');
  // Доставка — только переводом: чтобы не было «привезли, а наличными передумал платить» (Роман, 23.10.2026).
  const cashAllowed = delivery === 'pickup';
  const paymentMethod: PaymentMethod = cashAllowed ? payment : 'online';
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (submitting) return; // защита от двойного нажатия
    if (delivery === 'delivery' && !address.trim()) {
      haptic('error');
      setError('Укажите адрес доставки');
      return;
    }
    setError('');
    setSubmitting(true);

    const result = await createOrder({
      items: items.map((i) => ({ variantId: i.variantId, qty: i.qty })),
      deliveryMethod: delivery,
      address: delivery === 'delivery' ? address.trim() : undefined,
      phone: phone.trim() || undefined,
      paymentMethod,
    });
    setSubmitting(false);

    if (!result.ok) {
      haptic('error');
      setError(result.error);
      return;
    }

    // На экране заказа — цены и сумма, которые посчитал сервер (total -1 — демо-режим без базы).
    const serverPrice = new Map(result.items.map((l) => [l.variantId, l.price]));
    const payload: OrderPayload = {
      items: items.map((i) => ({ ...i, priceSnapshot: serverPrice.get(i.variantId) ?? i.priceSnapshot })),
      totals: result.total >= 0 ? result.total : total(),
      deliveryMethod: delivery,
      address: delivery === 'delivery' ? address.trim() : undefined,
      phone: phone.trim() || undefined,
      paymentMethod,
      tgUser: getTgUser(),
      createdAt: new Date().toISOString(),
    };
    const resultState = { payload, orderId: result.orderId };
    haptic('success');
    sessionStorage.setItem('lastOrder', JSON.stringify(resultState));
    clear();
    navigate('/result', { state: resultState, replace: true });
  };

  // На этом экране легко потерять введённый адрес — Telegram спросит «Закрыть?».
  useEffect(() => {
    setClosingConfirmation(true);
    return () => setClosingConfirmation(false);
  }, []);

  // Итоговое действие — большая кнопка Telegram с суммой и крутилкой на время отправки.
  const nativeMain = useTelegramMainButton({
    text: `Подтвердить заказ  ${total().toLocaleString('ru-RU')} ₽`,
    onClick: handleSubmit,
    visible: items.length > 0,
    progress: submitting,
  });

  if (items.length === 0) {
    // Корзина пуста: после оформления — на экран заказа, иначе — в корзину.
    // <Navigate> вместо navigate() прямо в рендере.
    let lastOrder: unknown = null;
    try {
      lastOrder = JSON.parse(sessionStorage.getItem('lastOrder') ?? 'null');
    } catch { /* ignore */ }
    return lastOrder
      ? <Navigate to="/result" state={lastOrder} replace />
      : <Navigate to="/cart" replace />;
  }

  const count = items.reduce((n, i) => n + i.qty, 0);

  return (
    <div className="page checkout page--action-bar">
      <h1 className="page-title">Оформление</h1>

      {/* Экран в стиле настроек Telegram: сгруппированные блоки и подписи над ними */}
      <p className="tg-section-title">Ваш заказ</p>
      <div className="tg-group">
        {items.map((item) => {
          const { title, subtitle } = cartItemDisplay(item);
          return (
            <div key={item.variantId} className="tg-row checkout-item">
              <img className="checkout-item__img" src={item.image || '/placeholder.svg'} alt="" />
              <div className="tg-row__main">
                <span className="tg-row__title">{title}</span>
                {subtitle && <span className="tg-row__sub">{subtitle}</span>}
              </div>
              <span className="tg-row__value checkout-item__price">
                {item.qty > 1 && <span className="checkout-item__qty">{item.qty} × </span>}
                {item.priceSnapshot.toLocaleString('ru-RU')} ₽
              </span>
            </div>
          );
        })}
      </div>

      <p className="tg-section-title">Получение</p>
      <div className="tg-group" role="radiogroup" aria-label="Способ получения">
        <OptionRow title="Самовывоз" sub="Забрать в магазине, Москва" checked={delivery === 'pickup'} onSelect={() => setDelivery('pickup')} />
        <OptionRow title="Доставка" sub="Курьером по городу" checked={delivery === 'delivery'} onSelect={() => setDelivery('delivery')} />
      </div>
      {delivery === 'delivery' && (
        <div className="tg-group tg-group--spaced">
          <label className="tg-row tg-row--input">
            <span className="tg-row__label">Адрес</span>
            <input
              type="text"
              placeholder="Улица, дом, квартира"
              value={address}
              maxLength={300}
              autoComplete="street-address"
              onChange={(e) => setAddress(e.target.value)}
            />
          </label>
        </div>
      )}

      <p className="tg-section-title">Оплата</p>
      <div className="tg-group" role="radiogroup" aria-label="Способ оплаты">
        <OptionRow
          title="Наличными"
          sub={cashAllowed ? 'При получении' : 'Только при самовывозе'}
          checked={paymentMethod === 'cash'}
          disabled={!cashAllowed}
          onSelect={() => setPayment('cash')}
        />
        <OptionRow title="Переводом" sub="Реквизиты пришлёт менеджер" checked={paymentMethod === 'online'} onSelect={() => setPayment('online')} />
      </div>

      <p className="tg-section-title">Связь</p>
      <div className="tg-group">
        <label className="tg-row tg-row--input">
          <span className="tg-row__label">Телефон</span>
          <input
            type="tel"
            inputMode="tel"
            placeholder="+7 900 000-00-00"
            value={phone}
            maxLength={32}
            autoComplete="tel"
            onChange={(e) => setPhone(e.target.value)}
          />
        </label>
      </div>
      <p className="tg-section-footer">Необязательно — менеджер и так напишет вам в Telegram.</p>

      <div className="tg-group checkout-summary">
        <div className="tg-row">
          <span className="tg-row__main tg-row__title">Итого за {plural(count, ['товар', 'товара', 'товаров'])}</span>
          <span className="tg-row__value checkout-summary__total">{total().toLocaleString('ru-RU')} ₽</span>
        </div>
      </div>
      <p className="tg-section-footer">Цену и наличие менеджер подтвердит после заказа.</p>

      {error && <p className="checkout-error" role="alert">{error}</p>}

      {!nativeMain && (
        <div className="action-bar">
          <button
            className={`btn btn-primary btn-block action-bar__btn${submitting ? '' : ' action-bar__btn--split'}`}
            onClick={handleSubmit}
            disabled={submitting}
          >
            {submitting ? 'Оформляем…' : (
              <>
                <span>Подтвердить заказ</span>
                <span>{total().toLocaleString('ru-RU')} ₽</span>
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}

// Строка-вариант «как в настройках Telegram»: название, пояснение и галочка справа.
function OptionRow({ title, sub, checked, disabled, onSelect }: {
  title: string;
  sub: string;
  checked: boolean;
  disabled?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      aria-disabled={disabled || undefined}
      className={`tg-row tg-row--option${disabled ? ' is-disabled' : ''}`}
      onClick={() => {
        if (disabled) { haptic('warning'); return; }
        if (!checked) haptic('select');
        onSelect();
      }}
    >
      <span className="tg-row__main">
        <span className="tg-row__title">{title}</span>
        <span className="tg-row__sub">{sub}</span>
      </span>
      <span className={`tg-check${checked ? ' is-on' : ''}`} aria-hidden="true">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
      </span>
    </button>
  );
}
