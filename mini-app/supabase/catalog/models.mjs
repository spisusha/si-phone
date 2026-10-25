// Справочник моделей Apple для таблицы каталога Si Phone.
// Характеристики — по Apple (apple.com, Apple Support), новинки 2026 — проверены веб-поиском (см. SOURCES.md).
// Цены здесь — только «якоря» для оценки, когда рыночной цены нет: цена самой младшей конфигурации, ₽.

// Цвет: английское название Apple, русское, синонимы для будущего разбора прайсов
const C = (en, ru, ...syn) => ({ en, ru, syn });

const TITANIUM_16 = [C('Black Titanium', 'Чёрный титан', 'black'), C('White Titanium', 'Белый титан', 'white'), C('Natural Titanium', 'Натуральный титан', 'natural'), C('Desert Titanium', 'Пустынный титан', 'desert')];
const PRO_17 = [C('Cosmic Orange', 'Космический оранжевый', 'orange', 'оранж', 'космик'), C('Deep Blue', 'Тёмно-синий', 'blue', 'синий'), C('Silver', 'Серебристый', 'silver', 'белый')];
const PRO_18 = [C('Black', 'Чёрный', 'black'), C('Silver', 'Серебристый', 'silver'), C('Burgundy', 'Бордовый', 'burgundy', 'бордо'), C('Glacier', 'Ледниковый', 'glacier', 'clacier', 'ледник')];
const BASE_16 = [C('Black', 'Чёрный', 'black'), C('White', 'Белый', 'white'), C('Pink', 'Розовый', 'pink'), C('Teal', 'Бирюзовый', 'teal'), C('Ultramarine', 'Ультрамарин', 'ultramarine')];
const BASE_15 = [C('Black', 'Чёрный', 'black'), C('Blue', 'Голубой', 'blue'), C('Green', 'Зелёный', 'green'), C('Yellow', 'Жёлтый', 'yellow'), C('Pink', 'Розовый', 'pink')];
const BASE_14 = [C('Midnight', 'Тёмная ночь', 'midnight'), C('Starlight', 'Сияющая звезда', 'starlight'), C('Blue', 'Синий', 'blue'), C('Purple', 'Фиолетовый', 'purple'), C('Red', 'Красный', 'red', 'product red'), C('Yellow', 'Жёлтый', 'yellow')];

// iPhone. anchor — ₽ за младшую память с SIM+eSIM (или единственным вариантом SIM)
export const IPHONES = [
  // Складной, продажи с 23.10.2026. Только eSIM во всех странах (физической SIM нет). США: $1 999 / $2 199 / $2 599 / $3 199.
  // На рынке ещё нет — цена = цена США × ~96 ₽/$ (так сейчас продаётся 18 Pro Max eSIM).
  { model: 'iPhone Duo', year: 2026, design: 'iphone-duo', storages: [256, 512, 1024, 2048], sims: ['eSIM'], anchor: 194000,
    steps: { 256: 0, 512: 17000, 1024: 33000, 2048: 28000 }, note: 'новинка, на рынке ещё нет', syn: ['дуо', 'fold', 'фолд', 'складной'],
    colors: [C('Star White', 'Звёздный белый', 'white', 'белый'), C('Night Sky', 'Ночное небо', 'night sky', 'black', 'blue', 'тёмный')] },
  { model: 'iPhone 18 Pro Max', year: 2026, design: 'iphone-18-pro', storages: [256, 512, 1024, 2048], sims: ['eSIM', 'SIM+eSIM'], anchor: 133000, colors: PRO_18 },
  { model: 'iPhone 18 Pro', year: 2026, design: 'iphone-18-pro', storages: [256, 512, 1024, 2048], sims: ['eSIM', 'SIM+eSIM'], anchor: 113000, colors: PRO_18 },
  { model: 'iPhone 17 Pro Max', year: 2025, design: 'iphone-17-pro', storages: [256, 512, 1024, 2048], sims: ['eSIM', 'SIM+eSIM'], anchor: 105000, colors: PRO_17 },
  { model: 'iPhone 17 Pro', year: 2025, design: 'iphone-17-pro', storages: [256, 512, 1024], sims: ['eSIM', 'SIM+eSIM'], anchor: 96000, colors: PRO_17 },
  { model: 'iPhone Air', year: 2025, design: 'iphone-air', storages: [256, 512, 1024], sims: ['eSIM'], anchor: 72000,
    colors: [C('Space Black', 'Космический чёрный', 'black'), C('Cloud White', 'Облачно-белый', 'white'), C('Light Gold', 'Светло-золотой', 'gold'), C('Sky Blue', 'Небесно-голубой', 'blue')] },
  { model: 'iPhone 17', year: 2025, design: 'iphone-17', storages: [256, 512], sims: ['eSIM', 'SIM+eSIM'], anchor: 74500,
    colors: [C('Black', 'Чёрный', 'black'), C('White', 'Белый', 'white'), C('Mist Blue', 'Дымчато-голубой', 'blue', 'mist'), C('Sage', 'Шалфей', 'sage', 'green'), C('Lavender', 'Лавандовый', 'lavender', 'purple')] },
  { model: 'iPhone 17e', year: 2026, design: 'iphone-17e', storages: [256, 512], sims: ['eSIM', 'SIM+eSIM'], anchor: 58000,
    colors: [C('Black', 'Чёрный', 'black'), C('White', 'Белый', 'white'), C('Soft Pink', 'Нежно-розовый', 'pink')] },
  { model: 'iPhone 16 Pro Max', year: 2024, design: 'iphone-16-pro', storages: [256, 512, 1024], sims: ['SIM+eSIM'], anchor: 94500, colors: TITANIUM_16 },
  { model: 'iPhone 16 Pro', year: 2024, design: 'iphone-16-pro', storages: [128, 256, 512, 1024], sims: ['SIM+eSIM'], anchor: 84000, colors: TITANIUM_16,
    steps: { 128: 0, 256: 6000, 512: 11000, 1024: 6000 } }, // снят с продажи — на рынке дешевле 16 Pro Max той же памяти
  { model: 'iPhone 16 Plus', year: 2024, design: 'iphone-16', storages: [128, 256, 512], sims: ['SIM+eSIM'], anchor: 70000, colors: BASE_16 },
  { model: 'iPhone 16', year: 2024, design: 'iphone-16', storages: [128, 256, 512], sims: ['SIM+eSIM'], anchor: 62000, colors: BASE_16 },
  { model: 'iPhone 16e', year: 2025, design: 'iphone-16e', storages: [128, 256, 512], sims: ['SIM+eSIM'], anchor: 41000,
    colors: [C('Black', 'Чёрный', 'black'), C('White', 'Белый', 'white')] },
  { model: 'iPhone 15 Plus', year: 2023, design: 'iphone-15', storages: [128, 256, 512], sims: ['SIM+eSIM'], anchor: 61500, rare: true, colors: BASE_15 },
  { model: 'iPhone 15', year: 2023, design: 'iphone-15', storages: [128, 256, 512], sims: ['SIM+eSIM'], anchor: 53000, rare: true, colors: BASE_15 },
  { model: 'iPhone 14 Plus', year: 2022, design: 'iphone-14', storages: [128, 256, 512], sims: ['SIM+eSIM'], anchor: 50000, rare: true, colors: BASE_14 },
  { model: 'iPhone 14', year: 2022, design: 'iphone-14', storages: [128, 256, 512], sims: ['SIM+eSIM'], anchor: 44000, rare: true, colors: BASE_14 },
];

// Доплата за ступень памяти (₽), если рыночной цены нет: от младшей к следующей
export const STORAGE_STEP = { 128: 0, 256: 9000, 512: 18000, 1024: 18000, 2048: 25000 };
// eSIM-версия (американская) дешевле SIM+eSIM на рынке
export const ESIM_DISCOUNT = 6000;

// iPad. anchor — ₽ за младшую Wi-Fi; Cellular — +CELLULAR_EXTRA
const IPAD_AIR_COLORS = [C('Space Gray', 'Серый космос', 'space gray', 'sp gray', 'gray', 'black'), C('Blue', 'Голубой', 'blue'), C('Purple', 'Фиолетовый', 'purple'), C('Starlight', 'Сияющая звезда', 'starlight')];
const IPAD_PRO_COLORS = [C('Space Black', 'Чёрный космос', 'space black', 'sp black', 'black'), C('Silver', 'Серебристый', 'silver')];
export const IPADS = [
  { line: 'iPad Pro', size: 13, chip: 'M5', year: 2025, design: 'ipad-pro', storages: [256, 512, 1024, 2048], colors: IPAD_PRO_COLORS, anchor: 117000 },
  { line: 'iPad Pro', size: 11, chip: 'M5', year: 2025, design: 'ipad-pro', storages: [256, 512, 1024, 2048], colors: IPAD_PRO_COLORS, anchor: 94000 },
  { line: 'iPad Pro', size: 13, chip: 'M4', year: 2024, design: 'ipad-pro', storages: [256, 512, 1024, 2048], colors: IPAD_PRO_COLORS, anchor: 86000, rare: true },
  { line: 'iPad Pro', size: 11, chip: 'M4', year: 2024, design: 'ipad-pro', storages: [256, 512, 1024, 2048], colors: IPAD_PRO_COLORS, anchor: 70000, rare: true },
  { line: 'iPad Air', size: 13, chip: 'M4', year: 2026, design: 'ipad-air', storages: [128, 256, 512, 1024], colors: IPAD_AIR_COLORS, anchor: 78000 },
  { line: 'iPad Air', size: 11, chip: 'M4', year: 2026, design: 'ipad-air', storages: [128, 256, 512, 1024], colors: IPAD_AIR_COLORS, anchor: 60000 },
  { line: 'iPad Air', size: 13, chip: 'M3', year: 2025, design: 'ipad-air', storages: [128, 256, 512, 1024], colors: IPAD_AIR_COLORS, anchor: 70000, rare: true },
  { line: 'iPad Air', size: 11, chip: 'M3', year: 2025, design: 'ipad-air', storages: [128, 256, 512, 1024], colors: IPAD_AIR_COLORS, anchor: 54000, rare: true },
  { line: 'iPad mini', size: 8.3, chip: 'A17 Pro', year: 2024, design: 'ipad-mini', storages: [128, 256, 512], anchor: 45000,
    colors: [C('Space Gray', 'Серый космос', 'space gray', 'gray'), C('Blue', 'Голубой', 'blue'), C('Purple', 'Фиолетовый', 'purple'), C('Starlight', 'Сияющая звезда', 'starlight')] },
  { line: 'iPad', size: 11, chip: 'A16', year: 2025, design: 'ipad', storages: [128, 256, 512], anchor: 38000,
    colors: [C('Blue', 'Голубой', 'blue'), C('Pink', 'Розовый', 'pink'), C('Yellow', 'Жёлтый', 'yellow'), C('Silver', 'Серебристый', 'silver')] },
];
export const IPAD_STORAGE_STEP = { 128: 0, 256: 10000, 512: 18000, 1024: 25000, 2048: 35000 };
export const CELLULAR_EXTRA = 15000;

// MacBook: configs [RAM ГБ, SSD ГБ, ₽]. Каждая конфигурация — ещё и «РУС» (+RU_KEYBOARD_EXTRA).
const AIR_COLORS = [C('Midnight', 'Тёмная ночь', 'midnight'), C('Starlight', 'Сияющая звезда', 'starlight'), C('Silver', 'Серебристый', 'silver'), C('Sky Blue', 'Небесно-голубой', 'sky blue', 'blue')];
const AIR_OLD_COLORS = [C('Midnight', 'Тёмная ночь', 'midnight'), C('Starlight', 'Сияющая звезда', 'starlight'), C('Silver', 'Серебристый', 'silver'), C('Space Gray', 'Серый космос', 'space gray', 'gray')];
const PRO_COLORS = [C('Space Black', 'Чёрный космос', 'space black', 'sp black', 'black'), C('Silver', 'Серебристый', 'silver')];
export const MACS = [
  { line: 'MacBook Air', size: 15, chip: 'M5', year: 2026, design: 'macbook-air-15', colors: AIR_COLORS, configs: [[16, 512, 128000], [16, 1024, 150000], [24, 512, 147000], [24, 1024, 167000]] },
  { line: 'MacBook Air', size: 13, chip: 'M5', year: 2026, design: 'macbook-air-13', colors: AIR_COLORS, configs: [[16, 512, 106000], [16, 1024, 128000], [24, 512, 125500], [24, 1024, 145000]] },
  { line: 'MacBook Neo', size: 13, chip: 'A18 Pro', year: 2026, design: 'macbook-neo', configs: [[8, 256, 61500], [8, 512, 69500]],
    colors: [C('Silver', 'Серебристый', 'silver'), C('Blush', 'Розовый', 'blush', 'pink'), C('Citrus', 'Цитрус', 'citrus', 'yellow'), C('Indigo', 'Индиго', 'indigo', 'blue')] },
  { line: 'MacBook Air', size: 15, chip: 'M4', year: 2025, design: 'macbook-air-15', colors: AIR_COLORS, configs: [[16, 256, 106000], [16, 512, 118000], [24, 512, 133000]], rare: true },
  { line: 'MacBook Air', size: 13, chip: 'M4', year: 2025, design: 'macbook-air-13', colors: AIR_COLORS, configs: [[16, 256, 88000], [16, 512, 100000], [24, 512, 115000]], rare: true },
  { line: 'MacBook Air', size: 15, chip: 'M3', year: 2024, design: 'macbook-air-15', colors: AIR_OLD_COLORS, configs: [[8, 256, 95000], [16, 512, 115000]], rare: true },
  { line: 'MacBook Air', size: 13, chip: 'M3', year: 2024, design: 'macbook-air-13', colors: AIR_OLD_COLORS, configs: [[8, 256, 78000], [16, 256, 85000], [16, 512, 98000]], rare: true },
  { line: 'MacBook Air', size: 13, chip: 'M2', year: 2022, design: 'macbook-air-13', colors: AIR_OLD_COLORS, configs: [[8, 256, 70000], [16, 256, 78000]], rare: true },
  // M5 Pro / M5 Max (март 2026), стандартные конфигурации — по apple.com 24.10.2026: Max 14" 36/2TB, 16" 36/2TB и 48/2TB; Pro 14" 24/1TB и 24/2TB, 16" 24/1TB и 48/1TB.
  // Цены — пересчёт с США по соотношению рынка для Air M5 ($1 099 → 105 500 ₽).
  { line: 'MacBook Pro', size: 16, chip: 'M5 Max', year: 2026, design: 'macbook-pro-16', colors: PRO_COLORS, configs: [[36, 2048, 374000], [48, 2048, 412000]] },
  { line: 'MacBook Pro', size: 14, chip: 'M5 Max', year: 2026, design: 'macbook-pro-14', colors: PRO_COLORS, configs: [[36, 2048, 345000]] },
  { line: 'MacBook Pro', size: 16, chip: 'M5 Pro', year: 2026, design: 'macbook-pro-16', colors: PRO_COLORS, configs: [[24, 1024, 259000], [48, 1024, 298000]] },
  { line: 'MacBook Pro', size: 14, chip: 'M5 Pro', year: 2026, design: 'macbook-pro-14', colors: PRO_COLORS, configs: [[24, 1024, 211000], [24, 2048, 250000]] },
  // 14" M5 с марта 2026 — от 1TB ($1 699); версии 512GB больше нет
  { line: 'MacBook Pro', size: 14, chip: 'M5', year: 2025, design: 'macbook-pro-14', colors: PRO_COLORS, configs: [[16, 1024, 169000], [24, 1024, 186500], [32, 1024, 206000]] },
  { line: 'MacBook Pro', size: 16, chip: 'M4 Pro', year: 2024, design: 'macbook-pro-16', colors: PRO_COLORS, configs: [[24, 512, 193500], [48, 512, 235000]], rare: true },
  { line: 'MacBook Pro', size: 14, chip: 'M4 Pro', year: 2024, design: 'macbook-pro-14', colors: PRO_COLORS, configs: [[24, 512, 175000], [24, 1024, 195000]], rare: true },
  { line: 'MacBook Pro', size: 14, chip: 'M4', year: 2024, design: 'macbook-pro-14', colors: PRO_COLORS, configs: [[16, 512, 135000], [16, 1024, 155000], [24, 1024, 170000]], rare: true },
];
export const RU_KEYBOARD_EXTRA = 1500;

// Apple Watch: строка = серия × размер × корпус × ремешок. Размер ремешка (S/M, M/L) — при заказе.
// sizes: { мм: ₽ за базовый корпус }, extra — доплата за материал/браслет
const W = (material, en, ru, band, bandRu, extra = 0) => ({ material, en, ru, band, bandRu, extra });
export const WATCHES = [
  { series: 'Apple Watch Ultra 4', year: 2026, design: 'watch-ultra', sizes: { 49: 69000 }, cases: [
    W('Titanium', 'Natural', 'Натуральный', 'Sand Trail Loop', 'Trail Loop песочный'),
    W('Titanium', 'Natural', 'Натуральный', 'Desert Alpine Loop', 'Alpine Loop пустынный'),
    W('Titanium', 'Natural', 'Натуральный', 'Translucent Gray Ocean Band', 'Ocean Band полупрозрачный серый'),
    W('Titanium', 'Natural', 'Натуральный', 'Natural Titanium Milanese Loop', 'Титановый миланский браслет натуральный', 18000),
    W('Titanium', 'Black', 'Чёрный', 'Dark Umber Trail Loop', 'Trail Loop тёмная умбра'),
    W('Titanium', 'Black', 'Чёрный', 'Dark Olive Alpine Loop', 'Alpine Loop тёмная олива'),
    W('Titanium', 'Black', 'Чёрный', 'Translucent Black Ocean Band', 'Ocean Band полупрозрачный чёрный'),
    W('Titanium', 'Black', 'Чёрный', 'Burgundy Trail Loop', 'Trail Loop бордовый'),
    W('Titanium', 'Black', 'Чёрный', 'Black Titanium Milanese Loop', 'Титановый миланский браслет чёрный', 18000),
  ] },
  { series: 'Apple Watch Series 12', year: 2026, design: 'watch-series-12', sizes: { 42: 34500, 46: 39000 }, cases: [
    W('Aluminum', 'Black', 'Чёрный', 'Black Sport Band', 'Спортивный ремешок чёрный'),
    W('Aluminum', 'Space Gray', 'Серый космос', 'Navy Blue Sport Band', 'Спортивный ремешок тёмно-синий'),
    W('Aluminum', 'Dark Bronze', 'Тёмная бронза', 'Olive Sport Band', 'Спортивный ремешок оливковый'),
    W('Aluminum', 'Light Gold', 'Светло-золотой', 'Sand Sport Band', 'Спортивный ремешок песочный'),
    W('Titanium', 'Natural', 'Натуральный', 'Natural Milanese Loop', 'Миланский браслет натуральный', 30000),
    W('Titanium', 'Radiant Gold', 'Сияющее золото', 'Radiant Gold Milanese Loop', 'Миланский браслет золотой', 30000),
    W('Ceramic', 'Pearl White', 'Жемчужно-белый', 'Sand Sport Band', 'Спортивный ремешок песочный', 55000),
    W('Ceramic', 'Night Blue', 'Ночной синий', 'Navy Blue Sport Band', 'Спортивный ремешок тёмно-синий', 55000),
  ] },
  // SE 3 — модель 2025 года (Роман, 25.10.2026: год модели, а не партии); ремешки — комплекты партии 2026
  { series: 'Apple Watch SE 3', year: 2025, design: 'watch-se', sizes: { 40: 21500, 44: 24000 }, cases: [
    W('Aluminum', 'Midnight', 'Тёмная ночь', 'Navy Blue Sport Band', 'Спортивный ремешок тёмно-синий'),
    W('Aluminum', 'Starlight', 'Сияющая звезда', 'Sand Sport Band', 'Спортивный ремешок песочный'),
  ] },
  // Ultra 3 и Series 11 сняты с продажи; сочетания — заводские комплекты Apple 2025 (проверены по артикулам: Ultra 3 Natural+Anchor Blue MEWH4, Natural+Blue/Bright Blue Trail Loop MEWR4, Black+Black Ocean MF0J4, Black+Black/Charcoal Trail Loop MF1H4; S11 Silver+Purple Fog, Rose Gold+Light Blush — EveryMac)
  { series: 'Apple Watch Ultra 3', year: 2025, design: 'watch-ultra', sizes: { 49: 55000 }, rare: true, cases: [
    W('Titanium', 'Natural', 'Натуральный', 'Anchor Blue Ocean Band', 'Ocean Band синий', 500),
    W('Titanium', 'Natural', 'Натуральный', 'Blue Trail Loop', 'Trail Loop сине-голубой'),
    W('Titanium', 'Black', 'Чёрный', 'Black Ocean Band', 'Ocean Band чёрный'),
    W('Titanium', 'Black', 'Чёрный', 'Black Charcoal Trail Loop', 'Trail Loop чёрно-угольный'),
  ] },
  { series: 'Apple Watch Series 11', year: 2025, design: 'watch-series-11', sizes: { 42: 29000, 46: 30500 }, rare: true, cases: [
    W('Aluminum', 'Jet Black', 'Чёрный оникс', 'Black Sport Band', 'Спортивный ремешок чёрный'),
    W('Aluminum', 'Space Gray', 'Серый космос', 'Black Sport Band', 'Спортивный ремешок чёрный'),
    W('Aluminum', 'Silver', 'Серебристый', 'Purple Fog Sport Band', 'Спортивный ремешок дымчато-фиолетовый'),
    W('Aluminum', 'Rose Gold', 'Розовое золото', 'Light Blush Sport Band', 'Спортивный ремешок светло-розовый'),
  ] },
];

// AirPods
export const AIRPODS = [
  { name: 'AirPods 5', year: 2026, design: 'airpods-5', price: 11500 },
  { name: 'AirPods 5 Wireless Charging', year: 2026, design: 'airpods-5', price: 13500 },
  { name: 'AirPods Pro 3', year: 2025, design: 'airpods-pro-3', price: 17500 },
  { name: 'AirPods 4 ANC', year: 2024, design: 'airpods-4', price: 10500 },
  { name: 'AirPods 4', year: 2024, design: 'airpods-4', price: 9000 },
  { name: 'AirPods Max 2', year: 2026, design: 'airpods-max', price: 39500,
    colors: [C('Midnight', 'Тёмная ночь', 'midnight'), C('Starlight', 'Сияющая звезда', 'starlight'), C('Blue', 'Синий', 'blue'), C('Purple', 'Фиолетовый', 'purple'), C('Orange', 'Оранжевый', 'orange')] },
  // Сняты Apple с продажи (Pro 2 — 09.2025, Max первого поколения — 03.2026), но в России ещё встречаются (список продавца)
  { name: 'AirPods Pro 2 USB-C', year: 2023, design: 'airpods-pro-2', price: 14500, rare: true, estimate: true },
  { name: 'AirPods Max USB-C', year: 2024, design: 'airpods-max', price: 34000, rare: true, estimate: true,
    arts: { Midnight: 'MWW43', Starlight: 'MWW53', Blue: 'MWW63', Purple: 'MWW83' },
    colors: [C('Midnight', 'Тёмная ночь', 'midnight'), C('Starlight', 'Сияющая звезда', 'starlight'), C('Blue', 'Синий', 'blue'), C('Purple', 'Фиолетовый', 'purple'), C('Orange', 'Оранжевый', 'orange')] },
];
