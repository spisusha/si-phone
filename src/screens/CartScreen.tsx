import { useNavigate } from 'react-router-dom';
import { useCartStore } from '../store/cartStore';
import { cartItemSubtitle } from '../domain/variantFormat';
import { IconCart, IconInfo } from '../components/icons';
import { useTelegramMainButton } from '../telegram/hooks';
import { haptic } from '../telegram/telegramWebApp';
import './CartScreen.css';

export default function CartScreen() {
  const { items, setQty, remove, total } = useCartStore();
  const navigate = useNavigate();
  const sum = total();

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
        <p>Добавьте товары из каталога</p>
        <button className="btn btn-primary" onClick={() => navigate('/')}>
          На главную
        </button>
      </div>
    );
  }

  return (
    <div className="page">
      <h1 className="page-title">Корзина</h1>
      <div className="cart-items">
        {items.map((item) => (
          <div key={item.variantId} className="cart-item">
            <div className="cart-item__img">
              {item.image ? (
                <img src={item.image} alt={item.titleSnapshot} />
              ) : (
                <div className="cart-item__placeholder" />
              )}
            </div>
            <div className="cart-item__info">
              <h3 className="cart-item__title">{item.titleSnapshot}</h3>
              {cartItemSubtitle(item) && (
                <p className="cart-item__opts">{cartItemSubtitle(item)}</p>
              )}
              <span className="cart-item__price">
                {item.priceSnapshot.toLocaleString('ru-RU')} ₽
              </span>
              <div className="cart-item__qty">
                <button onClick={() => { haptic('select'); setQty(item.variantId, item.qty - 1); }} aria-label="Меньше">−</button>
                <span>{item.qty}</span>
                <button onClick={() => { haptic('select'); setQty(item.variantId, item.qty + 1); }} aria-label="Больше">+</button>
              </div>
            </div>
            <button className="cart-item__remove" onClick={() => { haptic('select'); remove(item.variantId); }} aria-label="Удалить из корзины">
              ✕
            </button>
          </div>
        ))}
      </div>

      <div className="cart-total">
        <span>Итого</span>
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
