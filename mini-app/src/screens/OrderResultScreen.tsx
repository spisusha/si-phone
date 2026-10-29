import { useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { OrderPayload } from '../domain/types';
import { cartItemDisplay } from '../domain/variantFormat';
import { IconBox, IconCheckCircle, IconClock } from '../components/icons';
import { openTelegramChat } from '../telegram/telegramWebApp';
import { MANAGER_URL, nextWorkStart } from '../domain/shop';
import { plural } from '../domain/plural';
import './OrderResultScreen.css';

interface LocationState {
  payload: OrderPayload;
  orderId: string;
}

function loadState(locationState: unknown): LocationState | null {
  if (locationState && typeof locationState === 'object' && 'orderId' in locationState) {
    return locationState as LocationState;
  }
  try {
    const raw = sessionStorage.getItem('lastOrder');
    if (raw) return JSON.parse(raw) as LocationState;
  } catch { /* ignore */ }
  return null;
}

export default function OrderResultScreen() {
  const location = useLocation();
  const navigate = useNavigate();
  const state = useMemo(() => loadState(location.state), [location.state]);

  if (!state) {
    return (
      <div className="page result-page">
        <IconBox size={64} className="result-icon" />
        <h1 className="result-title">Заказ отправлен</h1>
        <p className="result-subtitle">
          Ваш заказ в обработке. Менеджер свяжется с вами в ближайшее время.
        </p>
        <button className="btn btn-primary btn-block" onClick={() => navigate('/')}>
          На главную
        </button>
      </div>
    );
  }

  const { payload, orderId } = state;
  const count = payload.items.reduce((n, i) => n + i.qty, 0);
  const offHours = nextWorkStart();

  const goHome = () => {
    sessionStorage.removeItem('lastOrder');
    navigate('/');
  };

  return (
    <div className="page result-page">
      <IconCheckCircle size={64} className="result-icon result-icon--ok" />
      <h1 className="result-title">Заказ оформлен</h1>
      <p className="result-subtitle">
        Менеджер напишет вам в Telegram, подтвердит цену и наличие и договорится о получении.
      </p>
      {offHours && (
        <p className="hours-note result-hours">
          <IconClock size={18} />
          <span>Сейчас нерабочее время — менеджер свяжется с вами {offHours}.</span>
        </p>
      )}

      <div className="tg-group result-group">
        <div className="tg-row">
          <span className="tg-row__main tg-row__title">Номер заказа</span>
          <span className="tg-row__value result-code">{orderId.slice(0, 8).toUpperCase()}</span>
        </div>
        <div className="tg-row">
          <span className="tg-row__main tg-row__title">Получение</span>
          <span className="tg-row__value">{payload.deliveryMethod === 'pickup' ? 'Самовывоз' : 'Доставка'}</span>
        </div>
        {payload.address && (
          <div className="tg-row">
            <span className="tg-row__main tg-row__title">Адрес</span>
            <span className="tg-row__value result-wrap">{payload.address}</span>
          </div>
        )}
        <div className="tg-row">
          <span className="tg-row__main tg-row__title">Оплата</span>
          <span className="tg-row__value">{payload.paymentMethod === 'cash' ? 'Наличными' : 'Переводом'}</span>
        </div>
        {payload.phone && (
          <div className="tg-row">
            <span className="tg-row__main tg-row__title">Телефон</span>
            <span className="tg-row__value">{payload.phone}</span>
          </div>
        )}
      </div>

      <p className="tg-section-title">{plural(count, ['товар', 'товара', 'товаров'])}</p>
      <div className="tg-group">
        {payload.items.map((item, i) => {
          const { title, subtitle } = cartItemDisplay(item);
          return (
            <div key={i} className="tg-row">
              <span className="tg-row__main">
                <span className="tg-row__title result-item-title">{title}</span>
                {subtitle && <span className="tg-row__sub">{subtitle}</span>}
              </span>
              <span className="tg-row__value">
                {item.qty > 1 && <span className="result-qty">{item.qty} × </span>}
                {item.priceSnapshot.toLocaleString('ru-RU')} ₽
              </span>
            </div>
          );
        })}
        {payload.gift && (
          <div className="tg-row">
            <span className="tg-row__main">
              <span className="tg-row__title">🎁 {payload.gift.title}</span>
              <span className="tg-row__sub">Подарок с колеса, код {payload.gift.code}</span>
            </span>
            {payload.gift.discount > 0 && (
              <span className="tg-row__value">−{payload.gift.discount.toLocaleString('ru-RU')} ₽</span>
            )}
          </div>
        )}
        <div className="tg-row">
          <span className="tg-row__main tg-row__title result-total-label">Итого</span>
          <span className="tg-row__value result-total">{payload.totals.toLocaleString('ru-RU')} ₽</span>
        </div>
      </div>

      <button className="btn btn-primary btn-block result-home" onClick={goHome}>
        На главную
      </button>
      <button className="result-link" onClick={() => openTelegramChat(MANAGER_URL)}>
        Написать менеджеру
      </button>
    </div>
  );
}
