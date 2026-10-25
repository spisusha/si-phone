import { useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useCatalogStore } from '../store/catalogStore';
import type { Category, ProductFamily, Variant } from '../domain/types';
import ColorCard from '../components/ColorCard';
import { ListSkeleton } from '../components/Skeleton';
import ManagerHint from '../components/ManagerHint';
import { categoryName } from '../domain/shop';
import { CATEGORY_SLUG, buildColorCards, groupTabs, modelPlace, type Tab } from '../domain/catalogTree';
import { hasNativeBackButton } from '../telegram/telegramWebApp';
import './CatalogScreen.css';
import { CatalogFailed, NotFound } from '../components/EmptyState';

// Каталог по шагам, как в магазине (Роман, 25.10.2026): плоские плашки на каждом уровне.
//   /catalog/iphone                  — плашки поколений: iPhone 18, iPhone 17, … (новые сверху)
//   /catalog/iphone/iPhone 17        — плашки линеек: iPhone 17 Pro Max, iPhone 17 Pro, …
//   /catalog/iphone/iPhone 17/17 Pro — карточки всех цветов iPhone 17 Pro
//   Часы: серия (Ultra / Series / SE) → модель (Ultra 4, Ultra 3…) → карточки
// Если на уровне выбирать не из чего (одно поколение или одна линейка) — сразу следующий уровень.

const seg = (id: string) => encodeURIComponent(id || 'all');
const unseg = (s: string | undefined) => (s === undefined ? undefined : s === 'all' ? '' : decodeURIComponent(s));

function genTitle(cat: Category, gen: string): string {
  switch (cat) {
    case 'iPhone': return gen;
    case 'MacBook': return gen === 'Neo' ? 'MacBook Neo' : `MacBook ${gen}`;
    case 'iPad': return `iPad ${gen}`;
    case 'Watch': return `Apple Watch ${gen}`;
    case 'AirPods': return 'AirPods';
  }
}

function lineTitle(cat: Category, gen: string, line: string): string {
  switch (cat) {
    case 'iPhone': return `iPhone ${line}`;
    case 'MacBook': return line === 'MacBook Neo' ? line : `${line} ${gen}`;
    case 'iPad': return `${line} ${gen}`;
    case 'Watch': return `Apple Watch ${line}`;
    case 'AirPods': return line;
  }
}

interface RowData { key: string; title: string; image: string; images: string[]; hexes: string[]; minPrice: number; inStock: boolean; ask: boolean; to: string }

const rgb = (hex: string) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const dist = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/**
 * Чтобы плашки не были одинаковыми (у 16 Pro Max, 16 Pro, 16… все чёрные — Роман, 25.10.2026):
 * каждой даём фото того цвета, который сильнее всего отличается от уже показанных выше
 * (после чёрного — светлый, потом цветной); одно и то же фото дважды не ставим, пока есть другие.
 */
function varyImages(rows: RowData[]): RowData[] {
  const usedImages = new Set<string>();
  const usedColors: number[][] = [];
  return rows.map((r) => {
    let best = r.image;
    let bestScore = -1;
    r.images.forEach((img, i) => {
      if (usedImages.has(img)) return;
      const c = rgb(r.hexes[i]);
      const score = !c || usedColors.length === 0 ? 0 : Math.min(...usedColors.map((u) => dist(u, c)));
      if (score > bestScore) { best = img; bestScore = score; }
    });
    usedImages.add(best);
    const c = rgb(r.hexes[r.images.indexOf(best)] ?? '');
    if (c) usedColors.push(c);
    return { ...r, image: best };
  });
}

function rowFor(tab: Tab, title: string, to: string, variants: Variant[]): RowData {
  const ids = new Set(tab.families.map((f) => f.id));
  const vs = variants.filter((v) => ids.has(v.family_id));
  const avail = vs.filter((v) => v.in_stock);
  const prices = (avail.length ? avail : vs).map((v) => v.price).filter((p) => p > 0);
  // Фото всех цветов плашки: сначала в наличии, в порядке таблицы — из них потом выберем «непохожее» на соседей
  const looks = new Map<string, string>(); // фото → цвет корпуса (hex)
  for (const v of [...avail, ...vs]) if (v.images[0] && !looks.has(v.images[0])) looks.set(v.images[0], String(v.options.colorHex ?? ''));
  const images = [...looks.keys()];
  const cover: ProductFamily = tab.families[0];
  return {
    key: to,
    title,
    image: images[0] ?? cover.images[0] ?? '',
    images,
    hexes: images.map((i) => looks.get(i) ?? ''),
    minPrice: prices.length ? Math.min(...prices) : 0,
    inStock: avail.length > 0,
    ask: !avail.length && vs.some((v) => v.status === 'уточнить'),
    to,
  };
}

export default function CategoryModelsScreen() {
  // В Telegram «Назад» — системная кнопка в шапке; своя стрелка — только в браузере.
  const nativeBack = hasNativeBackButton();
  const { category: slug, gen: genSeg, line: lineSeg } = useParams<{ category: string; gen?: string; line?: string }>();
  const navigate = useNavigate();
  const { families, variants, loading, failed, load } = useCatalogStore();

  useEffect(() => { load(); }, [load]);

  const category = CATEGORY_SLUG[slug || ''];
  const base = `/catalog/${slug}`;

  const view = useMemo(() => {
    if (!category) return null;
    const models = families.filter((f) => f.category === category);
    const gens = groupTabs(models, (f) => modelPlace(f).gen);

    // Уровень 1 — поколения (если их больше одного)
    let gen = unseg(genSeg);
    if (gen === undefined) {
      if (gens.length > 1) {
        return {
          title: category,
          back: '/catalog',
          rows: varyImages(gens.map((g) => rowFor(g, genTitle(category, g.id), `${base}/${seg(g.id)}`, variants))),
        };
      }
      gen = gens[0]?.id ?? '';
    }
    const genTab = gens.find((g) => g.id === gen);
    if (!genTab) return { notFound: true as const };

    // Уровень 2 — линейки внутри поколения (если их больше одной)
    const lines = groupTabs(genTab.families, (f) => modelPlace(f).line);
    const genBase = `${base}/${seg(gen)}`;
    let line = unseg(lineSeg);
    if (line === undefined) {
      if (lines.length > 1) {
        return {
          title: gens.length > 1 ? genTitle(category, gen) : category,
          back: gens.length > 1 ? base : '/catalog',
          rows: varyImages(lines.map((l) => rowFor(l, lineTitle(category, gen!, l.id), `${genBase}/${seg(l.id)}`, variants))),
        };
      }
      line = lines[0]?.id ?? '';
    }
    const lineTab = lines.find((l) => l.id === line);
    if (!lineTab) return { notFound: true as const };

    // Уровень 3 — карточки всех цветов линейки
    return {
      title: lineTitle(category, gen, line),
      back: lines.length > 1 ? genBase : gens.length > 1 ? base : '/catalog',
      cards: buildColorCards(lineTab.families, variants),
    };
  }, [category, families, variants, genSeg, lineSeg, base]);

  if (loading) return <ListSkeleton rows={6} />;
  if (failed) return <CatalogFailed />;
  if (!category || !view || 'notFound' in view) return <NotFound />;

  return (
    <div className="page">
      <div className="catalog-header">
        {!nativeBack && (
          <button className="catalog-back" onClick={() => navigate(view.back)} aria-label="Назад">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
        )}
        <h1 className="page-title" style={{ marginBottom: 0 }}>{view.title}</h1>
      </div>

      {view.rows && (
        <div className="catalog-models">
          {view.rows.map((r) => <LevelRow key={r.key} row={r} onClick={() => navigate(r.to)} />)}
        </div>
      )}

      {view.cards && (
        <div className="product-grid catalog-grid">
          {view.cards.map((c) => <ColorCard key={c.key} card={c} />)}
        </div>
      )}

      {families.every((f) => f.category !== category) && (
        <ManagerHint title={`Сейчас ${categoryName(category)} нет на витрине`} text="Напишите менеджеру — он проверит, что есть на складе." />
      )}
    </div>
  );
}

function LevelRow({ row, onClick }: { row: RowData; onClick: () => void }) {
  const price = row.minPrice > 0 ? `от ${row.minPrice.toLocaleString('ru-RU')} ₽` : 'Цена по запросу';
  return (
    <button className={`catalog-model-btn${!row.inStock && !row.ask ? ' catalog-model-btn--out' : ''}`} onClick={onClick}>
      <span className="catalog-model-thumb">
        <img src={row.image || '/placeholder.svg'} alt="" loading="lazy" />
      </span>
      <div className="catalog-model-info">
        <span className="catalog-model-title">{row.title}</span>
        <span className="catalog-model-sub">
          {row.ask ? <span className="catalog-model-ask">Цену и наличие уточняйте</span>
            : !row.inStock ? <span className="catalog-model-out">Нет в наличии</span>
            : price}
        </span>
      </div>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-muted)" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
    </button>
  );
}
