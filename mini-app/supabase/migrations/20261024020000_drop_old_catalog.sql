-- Уборка старого каталога (решение Романа 24.10.2026: «удаляй всё по списку»).
-- Витрина и заказы с этапа B1 работают на catalog_models / catalog_items.
-- Резервная копия (JSON таблиц, 8 заказов, 19 фото) — на компьютере Романа:
--   Desktop\si-phone-backup\2026-10-24-old-catalog (в git не кладём: в заказах данные покупателей).

drop table if exists public.variants;
drop table if exists public.product_families;

-- 8 пробных заказов 04–05.03.2026 (магазин тогда ещё не работал). Таблица orders остаётся.
delete from public.orders where created_at < '2026-03-06';
