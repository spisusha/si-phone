import { useNavigate } from 'react-router-dom';
import { useCartStore } from '../store/cartStore';
import { cartItemDisplay } from '../domain/variantFormat';
import { plural } from '../domain/plural';
import { IconCart, IconInfo } from '../components/icons';
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
    text: `Оформить · ${sum.toLocaleString('ru-RU')} ₽`,
    onClick: () => navigate('/checkout'),
    visible: items.length > 0,
  });

  if (items.length === 0) {
    return (
      <div className="page cart-empty">
        <IconCart size={56} className="cart-empty-icon" />
        <h2>Корзина пуста</h2>
        <p>Загляните в каталог — там вся техника в наличии</p>
        <button className="btn btn-primary" onClick={() => navigate('/catalog')}>
          Перейти в каталог
        </button>
      </div>
    );
  }

  return (
    <div className="page">
      <h1 className="page-title">Корзина</h1>
      <div className="cart-items">
        {items.map((item) => {
          const { title, subtitle } = cartItemDisplay(item);
          return (
            <div key={item.variantId} className="cart-item">
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
                    <button onClick={() => { haptic('select'); setQty(item.variantId, item.qty - 1); }} aria-label="Меньше">−</button>
                    <span aria-live="polite">{item.qty}</span>
                    {/* больше 10 штук одного товара сервер не примет */}
                    <button onClick={() => { haptic('select'); setQty(item.variantId, item.qty + 1); }} disabled={item.qty >= 10} aria-label="Больше">+</button>
                  </div>
                </div>
              </div>
              <button className="cart-item__remove" onClick={() => { haptic('select'); remove(item.variantId); }} aria-label="Удалить из корзины">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
              </button>
            </div>
          );
        })}
      </div>

      <div className="cart-total">
        <span>Итого · {plural(count, ['товар', 'товара', 'товаров'])}</span>
        <span className="cart-total__value">{sum.toLocaleString('ru-RU')} ₽</span>
      </div>

      <p className="cart-price-note">
        <IconInfo size={18} className="cart-price-note__icon" />
        <span>Мы стараемся держать цены актуальными, но из-за высокой волатильности
        рынка цены на сайте носят информативный характер. Менеджер зафиксирует для
        вас лучшее предложение после размещения заказа!</span>
      </p>

      {!nativeMain && (
        <button className="btn btn-primary btn-block" onClick={() => navigate('/checkout')}>
          Оформить заказ
        </button>
      )}
    </div>
  );
}
