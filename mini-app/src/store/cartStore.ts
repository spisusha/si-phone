import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { lineKey, type CartItem } from '../domain/types';

// Корзина. Строка — «позиция + размер ремешка» (lineKey): одни часы с S/M и с M/L — две строки.

interface CartState {
  items: CartItem[];
  add: (item: Omit<CartItem, 'qty'>) => void;
  remove: (key: string) => void;
  setQty: (key: string, qty: number) => void;
  clear: () => void;
  total: () => number;
  count: () => number;
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],

      add: (item) =>
        set((s) => {
          const key = lineKey(item);
          const existing = s.items.find((i) => lineKey(i) === key);
          if (existing) {
            return { items: s.items.map((i) => (lineKey(i) === key ? { ...i, qty: i.qty + 1 } : i)) };
          }
          return { items: [...s.items, { ...item, qty: 1 }] };
        }),

      remove: (key) =>
        set((s) => ({ items: s.items.filter((i) => lineKey(i) !== key) })),

      setQty: (key, qty) =>
        set((s) => {
          if (qty <= 0) return { items: s.items.filter((i) => lineKey(i) !== key) };
          return { items: s.items.map((i) => (lineKey(i) === key ? { ...i, qty } : i)) };
        }),

      clear: () => set({ items: [] }),

      total: () => get().items.reduce((sum, i) => sum + i.priceSnapshot * i.qty, 0),

      count: () => get().items.reduce((sum, i) => sum + i.qty, 0),
    }),
    { name: 'apple-cart' }
  )
);
