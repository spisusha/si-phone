import { useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useCatalogStore } from '../store/catalogStore';
import { useConfigurator } from '../hooks/useConfigurator';
import OptionSelector from '../components/OptionSelector';
import AddToCart from '../components/AddToCart';
import StockBadge, { stockState } from '../components/StockBadge';
import { DetailSkeleton } from '../components/Skeleton';
import { formatStorage, formatMemStorage } from '../domain/variantFormat';
import { hasNativeBackButton, haptic } from '../telegram/telegramWebApp';
import './ProductDetailScreen.css';
import { CatalogFailed, NotFound } from '../components/EmptyState';

// Как показывать значения опций: «1024» → «1 ТБ»
const OPTION_FORMAT: Record<string, (v: string) => string> = {
  storage: (v) => formatStorage(v),
  memStorage: (v) => formatMemStorage(v),
  keyboard: (v) => (v === 'РУС' ? 'С русскими буквами' : 'Английская'),
  size: (v) => (/^\d+(\.\d+)?$/.test(v) ? `${v}″` : v),
};

const OPTION_LABELS: Record<string, string> = {
  storage: 'Память',
  memStorage: 'Память и накопитель',
  keyboard: 'Клавиатура',
  simType: 'SIM',
  connectivity: 'Связь',
  size: 'Размер',
  anc: 'Шумоподавление',
};


export default function ProductDetailScreen() {
  // В Telegram «Назад» — системная кнопка в шапке; своя стрелка — только в браузере.
  const nativeBack = hasNativeBackButton();
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { families, variants, loading, failed, load } = useCatalogStore();

  useEffect(() => { load(); }, [load]);

  const family = families.find((f) => f.id === id);
  const familyVariants = variants.filter((v) => v.family_id === id);

  const {
    hasColorOptions,
    colorEntries,
    selectedColorHex,
    selectedColorLabel,
    handleColorSelect,
    nonColorKeys,
    allOptionValues,
    disabledOptionValues,
    selectedOptions,
    handleOptionChange,
    resolvedVariant,
    displayImages,
    imgIdx,
    setImgIdx,
  } = useConfigurator(familyVariants, family?.images ?? [], family, searchParams.get('color'));

  if (loading) return <DetailSkeleton />;
  if (failed) return <CatalogFailed />;
  if (!family) return <NotFound />;

  const cartItem = resolvedVariant ? {
    variantId: resolvedVariant.id,
    familyId: family.id,
    titleSnapshot: family.title,
    optionsSnapshot: resolvedVariant.options,
    priceSnapshot: resolvedVariant.price,
    image: displayImages[0] || family.images[0] || '',
  } : null;

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
        <img src={displayImages[imgIdx] || '/placeholder.svg'} alt={family.title} />
        {displayImages.length > 1 && (
          <div className="detail-dots">
            {displayImages.map((_, i) => (
              <span
                key={i}
                className={`detail-dot${i === imgIdx ? ' active' : ''}`}
                onClick={() => setImgIdx(i)}
              />
            ))}
          </div>
        )}
      </div>

      <h1 className="detail-title">{family.title.replace(/^Apple\s+/, '')}</h1>
      <p className="detail-desc">{family.description}</p>

      <div className="detail-options">
        {hasColorOptions && colorEntries.length > 0 && (
          <div className="color-picker">
            <span className="option-selector__label">Цвет</span>
            <div className="color-picker__swatches">
              {colorEntries.map((entry) => (
                <button
                  key={entry.hex}
                  className={`color-swatch${selectedColorHex === entry.hex ? ' color-swatch--active' : ''}`}
                  style={{ '--swatch-color': entry.hex } as React.CSSProperties}
                  onClick={() => { if (selectedColorHex !== entry.hex) haptic('select'); handleColorSelect(entry); }}
                  aria-label={entry.label}
                />
              ))}
            </div>
            {selectedColorLabel && (
              <span className="color-picker__label">{selectedColorLabel}</span>
            )}
          </div>
        )}

        {nonColorKeys.map((key) => (
          <OptionSelector
            key={key}
            label={OPTION_LABELS[key] ?? key}
            options={allOptionValues[key] ?? []}
            value={selectedOptions[key]}
            onChange={(val) => handleOptionChange(key, val)}
            disabledOptions={disabledOptionValues[key] ?? []}
            format={OPTION_FORMAT[key]}
          />
        ))}
      </div>

      {resolvedVariant?.options?.chip && (
        <p className="detail-chip-info">Чип: {resolvedVariant.options.chip}</p>
      )}

      <div className="detail-price-section">
        {resolvedVariant ? (
          <>
            <span className="detail-price">{resolvedVariant.price.toLocaleString('ru-RU')} ₽</span>
            <StockBadge state={stockState([resolvedVariant])} />
          </>
        ) : (
          <span className="detail-no-variant">Выберите опции</span>
        )}
      </div>

      <p className="detail-disclaimer">*Цена и наличие могут меняться</p>

      <AddToCart item={cartItem} inStock={!!resolvedVariant?.in_stock} askManager={resolvedVariant?.status === 'уточнить'} />
    </div>
  );
}
