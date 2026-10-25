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
  /** Позиция «уточнить»: цену и наличие подтверждает менеджер, в корзину пока нельзя. */
  askManager?: boolean;
}

/**
 * Кнопка «В корзину» с ценой — всегда под рукой.
 * Своя полоса над нижним меню — и в Telegram, и в браузере (как в корзине и оформлении).
 * После добавления — тихо: кнопка становится «Перейти в корзину»,
 * значок корзины в меню подпрыгивает (выбор Романа, этап 5.1).
 * Без точек-разделителей (Роман, B2): «В корзину» слева, цена справа.
 */
export default function AddToCart({ item, inStock, askManager }: Props) {
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
    : !inStock && askManager ? 'Цену и наличие уточните у менеджера'
    : !inStock ? 'Нет в наличии'
    : inCart ? 'Перейти в корзину'
    : 'В корзину';
  const price = item && inStock && !inCart ? rub(item.priceSnapshot) : '';
  const onClick = inCart ? () => navigate('/cart') : handleAdd;

  // Системная кнопка Telegram умеет только одну строку текста
  const native = useTelegramMainButton({ text: price ? `${text}  ${price}` : text, onClick, disabled });
  if (native) return null;

  return (
    <div className="action-bar">
      <button
        className={`btn btn-primary btn-block action-bar__btn${inCart ? ' action-bar__btn--go' : ''}${price ? ' action-bar__btn--split' : ''}`}
        disabled={disabled}
        onClick={onClick}
      >
        <span>{text}</span>
        {price && <span>{price}</span>}
      </button>
    </div>
  );
}
