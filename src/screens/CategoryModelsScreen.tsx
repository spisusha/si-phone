import { useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useCatalogStore } from '../store/catalogStore';
import type { Category, ProductFamily, Variant } from '../domain/types';
import ProductCard from '../components/ProductCard';
import { ListSkeleton } from '../components/Skeleton';
import ManagerHint from '../components/ManagerHint';
import { categoryName } from '../domain/shop';
import { getDisplayImages, getFirstImage } from '../domain/imageUtils';
import { hasNativeBackButton } from '../telegram/telegramWebApp';
import './CatalogScreen.css';
import { CatalogFailed, NotFound } from '../components/EmptyState';

const SLUG_TO_CAT: Record<string, Category> = {
  iphone: 'iPhone',
  ipad: 'iPad',
  macbook: 'MacBook',
  watch: 'Watch',
  airpods: 'AirPods',
};


const CONFIGURATOR_CATEGORIES = new Set<Category>(['iPhone', 'iPad']);

export default function CategoryModelsScreen() {
  // В Telegram «Назад» — системная кнопка в шапке; своя стрелка — только в браузере.
  const nativeBack = hasNativeBackButton();
  const { category: slug } = useParams<{ category: string }>();
  const navigate = useNavigate();
  const { families, variants, loading, failed, load } = useCatalogStore();

  useEffect(() => { load(); }, [load]);

  const category = SLUG_TO_CAT[slug || ''];

  const models = useMemo(() => {
    if (!category) return [];
    return families
      .filter((f) => f.category === category)
      .sort((a, b) => {
        if (b.popularity_score !== a.popularity_score)
          return b.popularity_score - a.popularity_score;
        return a.title.localeCompare(b.title);
      });
  }, [families, category]);


  const stats = useMemo(() => {
    const map = new Map<string, { minPrice: number; totalCount: number; inStockCount: number; image: string }>();
    for (const f of models) {
      const fvRaw = variants.filter((v) => v.family_id === f.id);
      const seen = new Map<string, typeof fvRaw[0]>();
      for (const v of fvRaw) {
        const key = v.supplier_xmlid ? v.supplier_xmlid.replace(/^0+/, '') || '0' : v.id;
        const prev = seen.get(key);
        if (!prev || (v.in_stock && !prev.in_stock)) seen.set(key, v);
      }
      const fv = [...seen.values()];
      const inStock = fv.filter((v) => v.in_stock);
      const pricePool = inStock.length > 0 ? inStock : fv.filter((v) => v.price > 0);
      const minPrice = pricePool.length > 0 ? Math.min(...pricePool.map((v) => v.price)) : 0;
      // Картинка модели: обложка, а если её нет — фото первого варианта в наличии
      const withPhoto = [...inStock, ...fv].find((v) => getDisplayImages(v, f).length > 0);
      const image = withPhoto ? getDisplayImages(withPhoto, f)[0] : getFirstImage(null, f);
      map.set(f.id, { minPrice, totalCount: pricePool.length, inStockCount: inStock.length, image });
    }
    return map;
  }, [models, variants]);

  // В списке: сначала модели в наличии, среди них — от флагманов к простым (по цене «от»).
  const orderedModels = useMemo(() => {
    const st = (id: string) => stats.get(id) ?? { minPrice: 0, totalCount: 0, inStockCount: 0, image: '' };
    return [...models].sort((a, b) => {
      const sa = st(a.id), sb = st(b.id);
      if ((sa.inStockCount > 0) !== (sb.inStockCount > 0)) return sa.inStockCount > 0 ? -1 : 1;
      return sb.minPrice - sa.minPrice;
    });
  }, [models, stats]);

  const isAirpods = category === 'AirPods';

  const airpodsCards = useMemo(() => {
    if (!isAirpods) return [];
    const nonMaxFamilies = models.filter((f) => !/max/i.test(f.title));
    const nonMaxIds = new Set(nonMaxFamilies.map((f) => f.id));
    const allVars = variants.filter((v) => nonMaxIds.has(v.family_id));
    const seen = new Map<string, Variant>();
    for (const v of allVars) {
      const key = v.supplier_xmlid ? v.supplier_xmlid.replace(/^0+/, '') || '0' : v.id;
      const prev = seen.get(key);
      if (!prev || (v.in_stock && !prev.in_stock)) seen.set(key, v);
    }
    return [...seen.values()].sort((a, b) => {
      if (a.in_stock !== b.in_stock) return a.in_stock ? -1 : 1;
      return a.price - b.price;
    });
  }, [isAirpods, models, variants]);

  const maxFamily = isAirpods ? models.find((f) => /max/i.test(f.title)) : null;

  if (loading) return <ListSkeleton rows={6} />;
  if (failed) return <CatalogFailed />;
  if (!category) return <NotFound />;

  return (
    <div className="page">
      <div className="catalog-header">
        {!nativeBack && (
          <button className="catalog-back" onClick={() => navigate('/catalog')}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
        )}
        <h1 className="page-title" style={{ marginBottom: 0 }}>{category}</h1>
      </div>

      {isAirpods ? (
        <>
          {maxFamily && (
            <div className="product-grid" style={{ marginBottom: 12 }}>
              <ProductCard
                family={maxFamily}
                variants={variants.filter((v) => v.family_id === maxFamily.id)}
              />
            </div>
          )}
          <div className="product-grid">
            {airpodsCards.map((v) => {
              const fam = models.find((f) => f.id === v.family_id);
              if (!fam) return null;
              return <ProductCard key={v.id} family={fam} variants={[v]} skuVariant={v} />;
            })}
          </div>
          {airpodsCards.length === 0 && !maxFamily && (
            <ManagerHint title="Сейчас AirPods нет на витрине" text="Напишите менеджеру — он проверит, что есть на складе." />
          )}
        </>
      ) : (
        <div className="catalog-models">
          {orderedModels.map((f) => (
            <ModelCard
              key={f.id}
              family={f}
              stats={stats.get(f.id)!}
              // iPhone и iPad — сразу экран выбора «цвет → память → SIM» с ценой;
              // MacBook и Watch — список вариантов (у одной модели разные чипы/корпуса).
              onClick={() => navigate(CONFIGURATOR_CATEGORIES.has(category) ? `/product/${f.id}` : `/catalog/${slug}/${f.id}`)}
            />
          ))}
          {models.length === 0 && (
            <ManagerHint title={`Сейчас ${categoryName(category)} нет на витрине`} text="Напишите менеджеру — он проверит, что есть на складе." />
          )}
        </div>
      )}
    </div>
  );
}

function ModelCard({ family, stats, onClick }: {
  family: ProductFamily;
  stats: { minPrice: number; totalCount: number; inStockCount: number; image: string };
  onClick: () => void;
}) {
  let priceText: string;
  if (stats.minPrice <= 0) {
    priceText = 'Цена по запросу';
  } else if (stats.totalCount <= 1) {
    priceText = `${stats.minPrice.toLocaleString('ru-RU')} ₽`;
  } else {
    priceText = `от ${stats.minPrice.toLocaleString('ru-RU')} ₽`;
  }
  const outOfStock = stats.inStockCount === 0;

  return (
    <button className={`catalog-model-btn${outOfStock ? ' catalog-model-btn--out' : ''}`} onClick={onClick}>
      <span className="catalog-model-thumb">
        <img src={stats.image || getFirstImage(null, family)} alt="" loading="lazy" />
      </span>
      <div className="catalog-model-info">
        <span className="catalog-model-title">{family.title.replace(/^Apple\s+/, '')}</span>
        <span className="catalog-model-sub">
          {priceText}
          {outOfStock && <span className="catalog-model-out"> · нет в наличии</span>}
        </span>
      </div>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-muted)" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
    </button>
  );
}
