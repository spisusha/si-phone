// Контакты магазина (те же, что в профиле).
export const MANAGER_TG = 'andr3i23';
export const MANAGER_URL = `https://t.me/${MANAGER_TG}`;

// Как называть категорию в тексте: «Сейчас Apple Watch нет на витрине»
export function categoryName(c: string): string {
  return c === 'Watch' ? 'Apple Watch' : c;
}
