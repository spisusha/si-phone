import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useCatalogStore } from '../store/catalogStore';
import { formatWatchDisplay } from '../domain/watchFormat';
import { getDisplayImages } from '../domain/imageUtils';
import { DetailSkeleton } from '../components/Skeleton';
import AddToCart from '../components/AddToCart';
import StockBadge, { stockState } from '../components/StockBadge';
import { hasNativeBackButton } from '../telegram/telegramWebApp';
import './ProductDetailScreen.css';
import { CatalogFailed, NotFound } from '../components/EmptyState';


export default function SkuVariantScreen() {
  // В Telegram «Назад» — системная кнопка в шапке; своя стрелка — только в браузере.
  const nativeBack = hasNativeBackButton();
  const { variantId } = useParams<{ variantId: string }>();
  const navigate = useNavigate();
  const { families, variants, loading, failed, load } = useCatalogStore();
  const [imgIdx, setImgIdx] = useState(0);

  useEffect(() => { load(); }, [load]);

  const variant = variants.find((v) => v.id === variantId);
  const family = variant ? families.find((f) => f.id === variant.family_id) : null;

  if (loading) return <DetailSkeleton />;
  if (failed) return <CatalogFailed />;
  if (!variant || !family) return <NotFound />;

  const isWatch = family.category === 'Watch';
  const isIphone = family.category === 'iPhone';

  let title: string;
  let subtitleParts: string[] = [];
  if (isWatch && variant.options.band) {
    // Каталог v2: размер, корпус и ремешок уже разложены по колонкам таблицы
    title = family.title;
    const size = String(variant.options.size || '').replace(/mm$/, ' мм');
    subtitleParts = [size, ...String(variant.options.band).split(' / ')].filter(Boolean);
  } else if (isWatch) {
    const raw = variant.options.supplierTitle || variant.options.raw || '';
    const wd = formatWatchDisplay(raw);
    title = wd.shortTitle || family.title;
    subtitleParts = wd.subtitleParts;
  } else if (isIphone) {
    title = family.title;
    const opts = variant.options || {};
    const parts: string[] = [];
    if (opts.storage) {
      const gb = Number(opts.storage);
      parts.push(gb >= 1024 ? `${gb / 1024} ТБ` : `${gb} ГБ`);
    }
    if (opts.colorLabel) parts.push(String(opts.colorLabel));
    if (opts.simType) parts.push(String(opts.simType));
    subtitleParts = parts;
  } else if (family.category === 'iPad') {
    title = family.title;
    const opts = variant.options || {};
    const parts: string[] = [];
    if (opts.colorLabel) parts.push(String(opts.colorLabel));
    if (opts.storage) {
      const gb = Number(opts.storage);
      parts.push(gb >= 1024 ? `${gb / 1024} ТБ` : `${gb} ГБ`);
    }
    if (opts.connectivity) parts.push(String(opts.connectivity));
    subtitleParts = parts;
  } else if (family.category === 'MacBook') {
    title = family.title;
    const opts = variant.options || {};
    const parts: string[] = [];
    if (opts.chip) parts.push(String(opts.chip));
    if (opts.memStorage) parts.push(String(opts.memStorage));
    if (opts.colorLabel) parts.push(String(opts.colorLabel));
    if (opts.ruKeyboard) parts.push('RU');
    subtitleParts = parts;
  } else {
    title = family.title;
  }

  const images = getDisplayImages(variant, family);

  const subtitle = subtitleParts.join(' • ');
  const cartItem = {
    variantId: variant.id,
    familyId: family.id,
    titleSnapshot: subtitle ? `${title} • ${subtitle}` : title,
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
        <img
          src={images[imgIdx] || '/placeholder.svg'}
          alt={title}
        />
        {images.length > 1 && (
          <div className="detail-dots">
            {images.map((_, i) => (
              <span
                key={i}
                className={`detail-dot${i === imgIdx ? ' active' : ''}`}
                onClick={() => setImgIdx(i)}
              />
            ))}
          </div>
        )}
      </div>

      <h1 className="detail-title">{title.replace(/^Apple\s+/, '')}</h1>

      {subtitleParts.length > 0 && (
        <p className="detail-desc">{subtitleParts.join(' • ')}</p>
      )}

      {isWatch && subtitleParts.length > 0 && (
        <div className="watch-specs">
          <WatchSpecs parts={subtitleParts} />
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

function WatchSpecs({ parts }: { parts: string[] }) {
  if (parts.length === 0) return null;

  const labels: string[] = [];

  for (const p of parts) {
    if (/мм$/.test(p)) {
      labels.push(`Размер корпуса: ${p}`);
    } else if (/Titanium|Aluminum|Ceramic|Space Gr[ae]y|Jet Black|Rose Gold|Starlight|Midnight|Silver|Slate|Natural|Black|Gold/i.test(p)
      && !/Band|Loop/i.test(p)) {
      labels.push(`Корпус: ${p}`);
    } else if (/Band|Loop/i.test(p)) {
      labels.push(`Ремешок: ${p}`);
    } else if (/^(S\/M|M\/L|[SML])$/.test(p)) {
      labels.push(`Размер ремешка: ${p}`);
    } else if (/^[A-Za-z0-9]{4,6}$/.test(p) && /[A-Za-z]/.test(p) && /\d/.test(p)) {
      labels.push(`Код: ${p}`);
    } else {
      labels.push(p);
    }
  }

  return (
    <ul className="watch-specs__list">
      {labels.map((l, i) => (
        <li key={i}>{l}</li>
      ))}
    </ul>
  );
}
