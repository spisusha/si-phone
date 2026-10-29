import { useNavigate } from 'react-router-dom';
import { shortGroup, type ColorCardData } from '../domain/catalogTree';
import StockBadge from './StockBadge';
import './ProductCard.css';

/** Карточка «модель в одном цвете»: листаешь список — сразу видишь все цвета (решение Романа, этап B2). */
export default function ColorCard({ card }: { card: ColorCardData }) {
  const navigate = useNavigate();
  const price = card.minPrice > 0
    ? `${card.several ? 'от ' : ''}${card.minPrice.toLocaleString('ru-RU')} ₽`
    : 'Цена по запросу';

  return (
    <div className="product-card" data-group={shortGroup(card.family)} onClick={() => navigate(card.href)}>
      <div className="product-card__img-wrap">
        <img src={card.image || '/placeholder.svg'} alt={`${card.title} ${card.subtitle}`} loading="lazy" />
      </div>
      <div className="product-card__info">
        <h3 className="product-card__title">{card.title}</h3>
        {card.subtitle && <p className="product-card__desc">{card.subtitle}</p>}
        <div className="product-card__footer">
          <span className="product-card__price">{price}</span>
          <StockBadge state={card.state} />
        </div>
      </div>
    </div>
  );
}
