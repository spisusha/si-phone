import { useEffect, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useCatalogStore } from '../store/catalogStore';
import type { Category, SortOption, ProductFamily } from '../domain/types';
import { ALL_CATEGORIES } from '../domain/types';
import { getMinPrice } from '../domain/catalogLogic';
import ProductCard from '../components/ProductCard';
import CategoryFilter from '../components/CategoryFilter';
import SortBar from '../components/SortBar';
import { ProductGridSkeleton } from '../components/Skeleton';
import ManagerHint from '../components/ManagerHint';
import { categoryName } from '../domain/shop';
import './HomeScreen.css';
import { CatalogFailed } from '../components/EmptyState';

function catFromParam(val: string | null): Category | null {
  if (!val) return null;
  return ALL_CATEGORIES.find((c) => c.toLowerCase() === val.toLowerCase()) ?? null;
}

export default function HomeScreen() {
  const { families, variants, loading, failed, load, sort, setSort } = useCatalogStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const category = catFromParam(searchParams.get('cat'));

  const setCategory = useCallback((c: Category | null) => {
    setSearchParams(c ? { cat: c } : {}, { replace: true });
  }, [setSearchParams]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    let list = families;
    if (category) list = list.filter((f) => f.category === category);

    const sorted = [...list];
    switch (sort) {
      case 'price_asc':
        sorted.sort((a, b) => (getMinPrice(variants, a.id) ?? Infinity) - (getMinPrice(variants, b.id) ?? Infinity));
        break;
      case 'price_desc':
        sorted.sort((a, b) => (getMinPrice(variants, b.id) ?? 0) - (getMinPrice(variants, a.id) ?? 0));
        break;
      case 'popularity':
        sorted.sort((a, b) => b.popularity_score - a.popularity_score);
        break;
      case 'newest':
        sorted.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        break;
    }
    return sorted;
  }, [families, variants, category, sort]);

  if (loading) return <ProductGridSkeleton />;
  if (failed) return <CatalogFailed />;

  // Карточки, которые реально видны: у Watch и AirPods — по одной на вариант в наличии,
  // поэтому модель без вариантов в наличии карточек не даёт.
  const cards = filtered.flatMap((f: ProductFamily) => {
    const isSkuPerRow =
      f.category === 'Watch' ||
      (f.category === 'AirPods' && !/max/i.test(f.title));
    if (isSkuPerRow) {
      const fvAll = variants.filter((v) => v.family_id === f.id && v.in_stock);
      const seen = new Map<string, typeof fvAll[0]>();
      for (const v of fvAll) {
        const key = v.supplier_xmlid ? v.supplier_xmlid.replace(/^0+/, '') || '0' : v.id;
        if (!seen.has(key)) seen.set(key, v);
      }
      return [...seen.values()].map((v) => (
        <ProductCard key={v.id} family={f} variants={[v]} skuVariant={v} />
      ));
    }
    return [
      <ProductCard
        key={f.id}
        family={f}
        variants={variants.filter((v) => v.family_id === f.id)}
      />,
    ];
  });

  return (
    <div className="page">
      <header className="home-header">
        <h1 className="page-title">Si Phone</h1>
        <p className="home-header__sub">Оригинальная техника Apple</p>
      </header>
      <CategoryFilter value={category} onChange={setCategory} />
      <SortBar value={sort} onChange={(v: SortOption) => setSort(v)} />
      <div className="product-grid">
        {cards}
        {cards.length === 0 && (
          <div style={{ gridColumn: '1/-1' }}>
            <ManagerHint
              title={category ? `Сейчас ${categoryName(category)} нет на витрине` : 'Витрина пока пустая'}
              text="Напишите менеджеру — он проверит, что есть на складе, и подберёт модель."
            />
          </div>
        )}
      </div>

      {/* В конце витрины — для тех, кто долистал и не нашёл; при пустом фильтре — своя подсказка выше */}
      {cards.length > 0 && <ManagerHint />}
    </div>
  );
}
