import { useNavigate } from 'react-router-dom';
import { useCartStore } from '../store/cartStore';
import type { CartItem } from '../domain/types';
import { useTelegramMainButton } from '../telegram/hooks';
import { haptic } from '../telegram/telegramWebApp';
import './AddToCart.css';

const rub = (n: number) => `${n.toLocaleString('ru-RU')} ₽`;

interface Props {
  /** Товар для корзины; null — вариант ещё не выбран. */
  item: Omit<CartItem, 'qty'> | null;
  inStock: boolean;
}

/**
 * Кнопка «В корзину» с ценой — всегда под рукой.
 * В Telegram — большая нижняя кнопка Telegram, как в корзине и оформлении;
 * вне Telegram — такая же полоса над нижним меню.
 * После добавления — тихо: кнопка становится «В корзине · Перейти»,
 * значок корзины в меню подпрыгивает (выбор Романа, этап 5.1).
 */
export default function AddToCart({ item, inStock }: Props) {
  const navigate = useNavigate();
  const add = useCartStore((s) => s.add);
  const inCart = useCartStore((s) => !!item && s.items.some((i) => i.variantId === item.variantId));

  const handleAdd = () => {
    if (!item || !inStock) return;
    add(item);
    haptic('add');
  };

  const disabled = !item || !inStock;
  const text = !item ? 'Выберите опции'
    : !inStock ? 'Нет в наличии'
    : inCart ? 'В корзине · Перейти'
    : `В корзину · ${rub(item.priceSnapshot)}`;
  const onClick = inCart ? () => navigate('/cart') : handleAdd;

  const native = useTelegramMainButton({ text, onClick, disabled });
  if (native) return null;

  return (
    <div className="atc-bar">
      <button
        className={`btn btn-primary btn-block atc-bar__btn${inCart ? ' atc-bar__btn--go' : ''}`}
        disabled={disabled}
        onClick={onClick}
      >
        {text}
      </button>
    </div>
  );
}
