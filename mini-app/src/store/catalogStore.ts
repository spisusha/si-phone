import { create } from 'zustand';
import type { ProductFamily, Variant, SortOption } from '../domain/types';
import { fetchFamilies, fetchVariants } from '../api/catalogRepo';

interface CatalogState {
  families: ProductFamily[];
  variants: Variant[];
  loading: boolean;
  loaded: boolean;
  /** Каталог не загрузился (нет связи) — экраны честно говорят об этом, а не «товар не найден». */
  failed: boolean;
  sort: SortOption;
  setSort: (s: SortOption) => void;
  load: () => Promise<void>;
  retry: () => Promise<void>;
}

let inflight: Promise<void> | null = null;

export const useCatalogStore = create<CatalogState>()((set, get) => ({
  families: [],
  variants: [],
  // true с самого начала: пока каталог не пришёл, экраны показывают загрузку,
  // а не мигают «Модель не найдена» / «Товары не найдены».
  loading: true,
  loaded: false,
  failed: false,
  sort: 'popularity',

  setSort: (sort) => set({ sort }),

  load: () => {
    if (get().loaded) return Promise.resolve();
    if (!inflight) {
      inflight = Promise.all([fetchFamilies(), fetchVariants()])
        .then(([families, variants]) => set({ families, variants, loading: false, loaded: true, failed: false }))
        .catch((err) => {
          console.error('catalog load failed', err);
          set({ loading: false, failed: true });
        })
        .finally(() => { inflight = null; });
    }
    return inflight;
  },

  retry: () => {
    set({ loading: true, failed: false, loaded: false });
    return get().load();
  },
}));
