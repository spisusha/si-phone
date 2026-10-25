import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useCatalogStore } from '../store/catalogStore';
import { getDisplayImages } from '../domain/imageUtils';
import { DetailSkeleton } from '../components/Skeleton';
import AddToCart from '../components/AddToCart';
import OptionSelector from '../components/OptionSelector';
import StockBadge, { stockState } from '../components/StockBadge';
import { hasNativeBackButton, haptic } from '../telegram/telegramWebApp';
import type { Variant } from '../domain/types';
import './ProductDetailScreen.css';
import { CatalogFailed, NotFound } from '../components/EmptyState';

// Экран одного товара: Apple Watch и AirPods (кроме Max).
// У часов внутри можно сменить размер корпуса и «корпус + ремешок», не выходя назад (Роман, этап B2).

const sizeLabel = (s: string) => s.replace(/mm$/, ' мм');

export default function SkuVariantScreen() {
  // В Telegram «Назад» — системная кнопка в шапке; своя стрелка — только в браузере.
  const nativeBack = hasNativeBackButton();
  const { variantId } = useParams<{ variantId: string }>();
  const navigate = useNavigate();
  const { families, variants, loading, failed, load } = useCatalogStore();
  const [imgIdx, setImgIdx] = useState(0);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setImgIdx(0); }, [variantId]); // другой корпус/размер — с первого фото

  const variant = variants.find((v) => v.id === variantId);
  const family = variant ? families.find((f) => f.id === variant.family_id) : null;
  const isWatch = family?.category === 'Watch';

  // Соседи по модели: другие размеры этого же «корпуса + ремешка» и другие сочетания
  const siblings = useMemo(
    () => (variant ? variants.filter((v) => v.family_id === variant.family_id) : []),
    [variants, variant],
  );
  const sizes = useMemo(
    () => siblings.filter((v) => v.options.band === variant?.options.band),
    [siblings, variant],
  );
  const looks = useMemo(() => {
    const m = new Map<string, Variant>();
    for (const v of siblings) {
      const k = String(v.options.band ?? '');
      const prev = m.get(k);
      // показываем вариант того же размера, что выбран сейчас
      if (!prev || (v.options.size === variant?.options.size && prev.options.size !== variant?.options.size)) m.set(k, v);
    }
    return [...m.values()];
  }, [siblings, variant]);

  if (loading) return <DetailSkeleton />;
  if (failed) return <CatalogFailed />;
  if (!variant || !family) return <NotFound />;

  const title = /^Apple Watch/.test(family.title) ? family.title : family.title.replace(/^Apple\s+/, '');
  const [caseName, band] = String(variant.options.band ?? '').split(' / ');
  const images = getDisplayImages(variant, family);

  const go = (v: Variant) => {
    if (v.id === variant.id) return;
    haptic('select');
    navigate(`/variant/${v.id}`, { replace: true });
  };

  const cartItem = {
    variantId: variant.id,
    familyId: family.id,
    titleSnapshot: variant.name || title,
    optionsSnapshot: variant.options,
    priceSnapshot: variant.price,
    image: images[0] || '',
  };

  return (
    <div className="page detail-page page--action-bar">
      {!nativeBack && (
        <button className="detail-back" onClick={() => navigate(-1)}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
      )}

      <div className="detail-gallery">
        <img src={images[imgIdx] || images[0] || '/placeholder.svg'} alt={variant.name || title} />
        {images.length > 1 && (
          <div className="detail-dots">
            {images.map((_, i) => (
              <span key={i} className={`detail-dot${i === imgIdx ? ' active' : ''}`} onClick={() => setImgIdx(i)} />
            ))}
          </div>
        )}
      </div>

      <h1 className="detail-title">{title}</h1>

      {isWatch && (
        <div className="detail-options">
          {looks.length > 1 && (
            <div className="look-picker">
              <span className="option-selector__label">Корпус и ремешок</span>
              <div className="look-picker__row">
                {looks.map((v) => (
                  <button
                    key={v.id}
                    className={`look-thumb${v.options.band === variant.options.band ? ' look-thumb--active' : ''}`}
                    onClick={() => go(v)}
                    aria-label={String(v.options.band)}
                  >
                    <img src={v.images[0] || '/placeholder.svg'} alt="" loading="lazy" />
                  </button>
                ))}
              </div>
            </div>
          )}
          <OptionSelector
            label="Размер корпуса"
            options={sizes.map((v) => String(v.options.size))}
            value={String(variant.options.size)}
            onChange={(s) => { const v = sizes.find((x) => x.options.size === s); if (v) go(v); }}
            format={sizeLabel}
          />
          <ul className="watch-specs__list">
            {caseName && <li>Корпус: {caseName}</li>}
            {band && <li>Ремешок: {band}</li>}
            {sizes.length <= 1 && variant.options.size && <li>Размер корпуса: {sizeLabel(String(variant.options.size))}</li>}
          </ul>
        </div>
      )}

      <div className="detail-price-section">
        <span className="detail-price">{variant.price.toLocaleString('ru-RU')} ₽</span>
        <StockBadge state={stockState([variant])} />
      </div>

      <p className="detail-disclaimer">*Цена и наличие могут меняться</p>

      <AddToCart item={cartItem} inStock={variant.in_stock} askManager={variant.status === 'уточнить'} />
    </div>
  );
}
