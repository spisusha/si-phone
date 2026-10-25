import { useNavigate } from 'react-router-dom';
import { useCartStore } from '../store/cartStore';
import { cartItemDisplay } from '../domain/variantFormat';
import { lineKey } from '../domain/types';
import { OFFER_NOTE, SELLER_LINE } from '../domain/legal';
import { plural } from '../domain/plural';
import { IconInfo } from '../components/icons';
import EmptyState from '../components/EmptyState';
import { useTelegramMainButton } from '../telegram/hooks';
import { haptic } from '../telegram/telegramWebApp';
import './CartScreen.css';

export default function CartScreen() {
  const { items, setQty, remove, total } = useCartStore();
  const navigate = useNavigate();
  const sum = total();
  const count = items.reduce((n, i) => n + i.qty, 0);

  // В Telegram итоговое действие — большая нижняя кнопка с суммой; своя — только в браузере.
  const nativeMain = useTelegramMainButton({
    text: `Оформить  ${sum.toLocaleString('ru-RU')} ₽`,
    onClick: () => navigate('/checkout'),
    visible: items.length > 0,
  });

  if (items.length === 0) {
    return (
      <EmptyState
        kind="cart"
        action={{ label: 'Перейти в каталог', onClick: () => navigate('/catalog') }}
      />
    );
  }

  return (
    <div className="page page--action-bar">
      <h1 className="page-title">Корзина</h1>
      <div className="cart-items">
        {items.map((item) => {
          const { title, subtitle } = cartItemDisplay(item);
          return (
            <div key={lineKey(item)} className="cart-item">
              <div className="cart-item__img">
                <img src={item.image || '/placeholder.svg'} alt="" />
              </div>
              <div className="cart-item__info">
                <h3 className="cart-item__title">{title}</h3>
                {subtitle && <p className="cart-item__opts">{subtitle}</p>}
                <div className="cart-item__bottom">
                  <span className="cart-item__price">
                    {(item.priceSnapshot * item.qty).toLocaleString('ru-RU')} ₽
                  </span>
                  <div className="cart-item__qty">
                    <button onClick={() => { haptic('select'); setQty(lineKey(item), item.qty - 1); }} aria-label="Меньше">−</button>
                    <span aria-live="polite">{item.qty}</span>
                    {/* больше 10 штук одного товара сервер не примет */}
                    <button onClick={() => { haptic('select'); setQty(lineKey(item), item.qty + 1); }} disabled={item.qty >= 10} aria-label="Больше">+</button>
                  </div>
                </div>
              </div>
              <button className="cart-item__remove" onClick={() => { haptic('select'); remove(lineKey(item)); }} aria-label="Удалить из корзины">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
              </button>
            </div>
          );
        })}
      </div>

      <div className="cart-total">
        <span>Итого за {plural(count, ['товар', 'товара', 'товаров'])}</span>
        <span className="cart-total__value">{sum.toLocaleString('ru-RU')} ₽</span>
      </div>

      <p className="cart-price-note">
        <IconInfo size={18} className="cart-price-note__icon" />
        <span>Мы стараемся держать цены актуальными, но из-за высокой волатильности
        рынка цены на сайте носят информативный характер. Менеджер зафиксирует для
        вас лучшее предложение после размещения заказа!</span>
      </p>
      <p className="cart-legal">{OFFER_NOTE} {SELLER_LINE}</p>

      {!nativeMain && (
        <div className="action-bar">
          <button className="btn btn-primary btn-block action-bar__btn action-bar__btn--split" onClick={() => navigate('/checkout')}>
            <span>Оформить</span>
            <span>{sum.toLocaleString('ru-RU')} ₽</span>
          </button>
        </div>
      )}
    </div>
  );
}
