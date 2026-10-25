import { useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useCatalogStore } from '../store/catalogStore';
import { filterVariants, getMinPrice } from '../domain/catalogLogic';
import type { SortOption } from '../domain/types';
import ColorCard from '../components/ColorCard';
import { buildColorCards } from '../domain/catalogTree';
import SortBar from '../components/SortBar';
import { ProductGridSkeleton } from '../components/Skeleton';
import './ProductListScreen.css';
import { CatalogFailed } from '../components/EmptyState';

export default function ProductListScreen() {
  const { families, variants, loading, failed, load, sort, setSort } = useCatalogStore();
  const [params] = useSearchParams();

  useEffect(() => { load(); }, [load]);

  const filters = useMemo(() => {
    const f: Record<string, string> = {};
    params.forEach((val, key) => { f[key] = val; });
    return f;
  }, [params]);

  const matchedFamilies = useMemo(() => {
    const matched = filterVariants(variants, filters, families);
    const familyIds = [...new Set(matched.map((v) => v.family_id))];
    let list = families.filter((f) => familyIds.includes(f.id));

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
  }, [families, variants, filters, sort]);

  if (loading) return <ProductGridSkeleton />;
  if (failed) return <CatalogFailed />;

  const filterDesc = Object.entries(filters)
    .map(([k, v]) => `${k}: ${v}`)
    .join(', ');

  return (
    <div className="page">
      <h1 className="page-title">Товары</h1>
      {filterDesc && <p className="list-filter-desc">{filterDesc}</p>}
      <SortBar value={sort} onChange={(v: SortOption) => setSort(v)} />
      <div className="product-grid">
        {/* Карточка на каждый цвет — как на главной и в каталоге (этап B2) */}
        {buildColorCards(matchedFamilies, variants).map((c) => <ColorCard key={c.key} card={c} />)}
        {matchedFamilies.length === 0 && (
          <p style={{ gridColumn: '1/-1', textAlign: 'center', color: 'var(--color-muted)', padding: '32px 0' }}>
            Ничего не найдено по этим фильтрам
          </p>
        )}
      </div>
    </div>
  );
}
