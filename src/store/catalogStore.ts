import { create } from 'zustand';
import type { ProductFamily, Variant, SortOption } from '../domain/types';
import { fetchFamilies, fetchVariants } from '../api/catalogRepo';

interface CatalogState {
  families: ProductFamily[];
  variants: Variant[];
  loading: boolean;
  loaded: boolean;
  sort: SortOption;
  setSort: (s: SortOption) => void;
  load: () => Promise<void>;
}

let inflight: Promise<void> | null = null;

export const useCatalogStore = create<CatalogState>()((set, get) => ({
  families: [],
  variants: [],
  // true с самого начала: пока каталог не пришёл, экраны показывают загрузку,
  // а не мигают «Модель не найдена» / «Товары не найдены».
  loading: true,
  loaded: false,
  sort: 'popularity',

  setSort: (sort) => set({ sort }),

  load: () => {
    if (get().loaded) return Promise.resolve();
    if (!inflight) {
      inflight = Promise.all([fetchFamilies(), fetchVariants()])
        .then(([families, variants]) => set({ families, variants, loading: false, loaded: true }))
        .catch((err) => {
          console.error('catalog load failed', err);
          set({ loading: false });
        })
        .finally(() => { inflight = null; });
    }
    return inflight;
  },
}));
