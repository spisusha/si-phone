import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCatalogStore } from '../store/catalogStore';
import { ALL_CATEGORIES, type Category } from '../domain/types';
import { ListSkeleton } from '../components/Skeleton';
import { CategoryIcon } from '../components/icons';
import { plural } from '../domain/plural';
import ManagerHint from '../components/ManagerHint';
import './CatalogScreen.css';
import { CatalogFailed } from '../components/EmptyState';

const CAT_SLUG: Record<Category, string> = {
  iPhone: 'iphone',
  iPad: 'ipad',
  MacBook: 'macbook',
  Watch: 'watch',
  AirPods: 'airpods',
};

export default function CatalogScreen() {
  const { families, loading, failed, load } = useCatalogStore();
  const navigate = useNavigate();

  useEffect(() => { load(); }, [load]);

  if (loading) return <ListSkeleton rows={5} />;
  if (failed) return <CatalogFailed />;

  return (
    <div className="page">
      <h1 className="page-title">Каталог</h1>
      <div className="catalog-categories">
        {ALL_CATEGORIES.map((cat) => (
          <button
            key={cat}
            className="catalog-cat-btn"
            onClick={() => navigate(`/catalog/${CAT_SLUG[cat]}`)}
          >
            <span className="catalog-cat-icon"><CategoryIcon category={cat} size={22} /></span>
            <span className="catalog-cat-label">{cat}</span>
            <span className="catalog-cat-count">
              {plural(families.filter((f) => f.category === cat).length, ['модель', 'модели', 'моделей'])}
            </span>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-muted)" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        ))}
      </div>
      <ManagerHint />
    </div>
  );
}
