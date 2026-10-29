import { useEffect, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useCatalogStore } from '../store/catalogStore';
import type { Category, SortOption } from '../domain/types';
import { ALL_CATEGORIES } from '../domain/types';
import ColorCard from '../components/ColorCard';
import CategoryFilter from '../components/CategoryFilter';
import SortBar from '../components/SortBar';
import { ProductGridSkeleton } from '../components/Skeleton';
import ManagerHint from '../components/ManagerHint';
import { categoryName } from '../domain/shop';
import { buildColorCards } from '../domain/catalogTree';
import './HomeScreen.css';
import { CatalogFailed } from '../components/EmptyState';
import FastScroll from '../components/FastScroll';

// Подсказка у язычка прокрутки: «iPhone 17 Pro Cosmic Orange»
const cardLabel = (el: Element) =>
  [el.querySelector('.product-card__title')?.textContent, el.querySelector('.product-card__desc')?.textContent]
    .filter(Boolean)
    .join(' ');

function catFromParam(val: string | null): Category | null {
  if (!val) return null;
  return ALL_CATEGORIES.find((c) => c.toLowerCase() === val.toLowerCase()) ?? null;
}

const STATE_RANK = { stock: 0, ask: 1, out: 2 } as const;

export default function HomeScreen() {
  const { families, variants, loading, failed, load, sort, setSort } = useCatalogStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const category = catFromParam(searchParams.get('cat'));

  const setCategory = useCallback((c: Category | null) => {
    setSearchParams(c ? { cat: c } : {}, { replace: true });
  }, [setSearchParams]);

  useEffect(() => { load(); }, [load]);

  // Вся техника подряд, карточка на каждый цвет (Роман, 24.10.2026): листаешь — видишь все цвета.
  const cards = useMemo(() => {
    const list = category ? families.filter((f) => f.category === category) : families;
    const ordered = [...list].sort((a, b) => b.popularity_score - a.popularity_score);
    const all = buildColorCards(ordered, variants);
    const price = (p: number, empty: number) => (p > 0 ? p : empty);
    switch (sort) {
      case 'price_asc':
        return [...all].sort((a, b) => price(a.minPrice, Infinity) - price(b.minPrice, Infinity));
      case 'price_desc':
        return [...all].sort((a, b) => price(b.minPrice, 0) - price(a.minPrice, 0));
      default:
        // «Популярные» и «Новинки»: сначала позиции со свежей ценой из прайса (2 дня), дальше порядок таблицы
        // каталога (новые модели выше), «уточнить» — в конце
        return [...all].sort((a, b) => Number(b.fresh) - Number(a.fresh) || STATE_RANK[a.state] - STATE_RANK[b.state]);
    }
  }, [families, variants, category, sort]);

  if (loading) return <ProductGridSkeleton />;
  if (failed) return <CatalogFailed />;

  return (
    <div className="page">
      <header className="home-header">
        <h1 className="page-title">Si Phone</h1>
        <p className="home-header__sub">Оригинальная техника Apple</p>
      </header>
      <CategoryFilter value={category} onChange={setCategory} />
      <SortBar value={sort} onChange={(v: SortOption) => setSort(v)} />
      <div className="product-grid">
        {cards.map((c) => <ColorCard key={c.key} card={c} />)}
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
      <FastScroll itemSelector=".product-grid .product-card" labelOf={cardLabel} />
    </div>
  );
}
