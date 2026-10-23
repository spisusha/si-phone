import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useCatalogStore } from '../store/catalogStore';
import type { Category, Variant } from '../domain/types';
import ProductCard from '../components/ProductCard';
import { DetailSkeleton, ProductGridSkeleton } from '../components/Skeleton';
import { hasNativeBackButton } from '../telegram/telegramWebApp';
import { haptic } from '../telegram/telegramWebApp';
import { plural } from '../domain/plural';
import ManagerHint from '../components/ManagerHint';
import './CatalogScreen.css';
import { CatalogFailed, NotFound } from '../components/EmptyState';

function isConfigurator(category: Category, _title: string): boolean {
  if (category === 'AirPods' && /max/i.test(_title)) return true;
  return false;
}


export default function FamilyProductsScreen() {
  // В Telegram «Назад» — системная кнопка в шапке; своя стрелка — только в браузере.
  const nativeBack = hasNativeBackButton();
  const { category: slug, familyId } = useParams<{ category: string; familyId: string }>();
  const navigate = useNavigate();
  const { families, variants, loading, failed, load } = useCatalogStore();

  useEffect(() => { load(); }, [load]);

  const family = families.find((f) => f.id === familyId);
  const familyVariants = useMemo(
    () => variants.filter((v) => v.family_id === familyId),
    [variants, familyId],
  );

  const redirect = family ? isConfigurator(family.category, family.title) : false;

  useEffect(() => {
    if (!loading && family && redirect) {
      navigate(`/product/${family.id}`, { replace: true });
    }
  }, [loading, family, redirect, navigate]);

  // Все хуки — до ранних return: иначе при прямом открытии ссылки
  // (сначала loading, потом данные) React падает с ошибкой #310.
  const deduped = useMemo(() => {
    const seen = new Map<string, Variant>();
    for (const v of familyVariants) {
      // Deduplicate by supplier_xmlid first
      const xmlKey = v.supplier_xmlid
        ? v.supplier_xmlid.replace(/^0+/, '') || '0'
        : null;
      if (xmlKey) {
        const prev = seen.get(`x:${xmlKey}`);
        if (!prev || (v.in_stock && !prev.in_stock)) seen.set(`x:${xmlKey}`, v);
        continue;
      }
      // For variants without xmlid, deduplicate by options signature
      const sig = Object.entries(v.options)
        .filter(([k]) => !['raw', 'supplierTitle', '_xmlid_audit', 'line'].includes(k))
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, val]) => `${k}=${val}`)
        .join('|');
      const optKey = `o:${sig}`;
      const prev = seen.get(optKey);
      if (!prev || (v.in_stock && !prev.in_stock)) seen.set(optKey, v);
    }
    return [...seen.values()];
  }, [familyVariants]);

  const isMacBook = family?.category === 'MacBook';

  const [chipFilter, setChipFilter] = useState<string | null>(null);

  const chipGroups = useMemo(() => {
    if (!isMacBook) return [];
    const s = new Set<string>();
    for (const v of deduped) {
      const raw = String(v.options.chip || '').trim();
      if (raw) s.add(raw.split(' ')[0]);
    }
    return [...s].sort();
  }, [deduped, isMacBook]);

  const filtered = useMemo(() => {
    if (!isMacBook || !chipFilter) return deduped;
    return deduped.filter((v) => {
      const raw = String(v.options.chip || '').trim();
      return raw.split(' ')[0] === chipFilter;
    });
  }, [deduped, isMacBook, chipFilter]);

  if (loading) return <ProductGridSkeleton />;
  if (failed) return <CatalogFailed />;
  if (!family) return <NotFound />;
  if (redirect) return <DetailSkeleton />;

  const sorted = [...filtered].sort((a, b) => {
    if (a.in_stock !== b.in_stock) return a.in_stock ? -1 : 1;
    return a.price - b.price;
  });

  return (
    <div className="page">
      <div className="catalog-header">
        {!nativeBack && (
          <button className="catalog-back" onClick={() => navigate(`/catalog/${slug}`)}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
        )}
        <h1 className="page-title" style={{ marginBottom: 0 }}>{family.title}</h1>
      </div>

      {isMacBook && chipGroups.length > 1 && (
        <div className="catalog-filters" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '8px 0' }}>
          <button className={`cat-chip${!chipFilter ? ' cat-chip--active' : ''}`} onClick={() => { if (chipFilter !== null) haptic('select'); setChipFilter(null); }}>Все чипы</button>
          {chipGroups.map((c) => (
            <button key={c} className={`cat-chip${chipFilter === c ? ' cat-chip--active' : ''}`} onClick={() => { if (chipFilter !== c) haptic('select'); setChipFilter(c); }}>{c}</button>
          ))}
        </div>
      )}

      <p className="catalog-family-stats">{plural(sorted.length, ['вариант', 'варианта', 'вариантов'])}</p>

      <div className="product-grid">
        {sorted.map((v) => (
          <ProductCard key={v.id} family={family} variants={[v]} skuVariant={v} />
        ))}
      </div>

      {sorted.length === 0 && (
        <ManagerHint title="Этой модели сейчас нет на витрине" text="Напишите менеджеру — он проверит наличие и подберёт вариант." />
      )}
    </div>
  );
}

