// Контакты магазина (те же, что в профиле и в боте).
export const MANAGER_TG = 'l_bobr_l'; // Артём — ему уходят все «Написать менеджеру»
export const MANAGER_URL = `https://t.me/${MANAGER_TG}`;

export interface ShopContact {
  name: string;
  /** в первую очередь — помечается звёздочкой */
  primary?: boolean;
  telegram: string;
  phone: { tel: string; label: string };
  /** ссылка на профиль в MAX (только https://max.ru/…) */
  max?: string;
}

export const CONTACTS: ShopContact[] = [
  {
    name: 'Артём',
    primary: true,
    telegram: 'l_bobr_l',
    phone: { tel: '+79164050444', label: '+7 916 405-04-44' },
    max: 'https://max.ru/u/f9LHodD0cOI5N3oL8IJOJJuK9uS7MlCBU247-9Sz14Kdywx8LMBXzYr3z20',
  },
  {
    name: 'Андрей',
    telegram: 'andr3i23',
    phone: { tel: '+79252010234', label: '+7 925 201-02-34' },
  },
];

// Заказы подтверждаем ежедневно с 10:00 до 17:00 по Москве; оформить можно в любое время.
export const WORK_HOURS = { from: 10, to: 17, label: 'с 10:00 до 17:00' };

/** Когда менеджер возьмёт заказ: null — сейчас рабочее время, иначе «сегодня с 10:00» / «завтра с 10:00». */
export function nextWorkStart(now = new Date()): string | null {
  const hour = (now.getUTCHours() + 3) % 24; // Москва — UTC+3 круглый год
  if (hour >= WORK_HOURS.from && hour < WORK_HOURS.to) return null;
  return `${hour < WORK_HOURS.from ? 'сегодня' : 'завтра'} с ${WORK_HOURS.from}:00`;
}

// Как называть категорию в тексте: «Сейчас Apple Watch нет на витрине»
export function categoryName(c: string): string {
  return c === 'Watch' ? 'Apple Watch' : c;
}
