-- Админка: новые модели, новые позиции и фото (Роман, 25.10.2026 — «сделай новые позиции и фото в админке»).
-- Как и раньше: менять только через эти функции (их вызывает сервер с service_role после проверки админа), всё в историю.

-- Хранилище фото: только картинки и не больше 3 МБ (наши фото после обработки ~50–200 КБ)
update storage.buckets
   set allowed_mime_types = array['image/webp', 'image/png', 'image/jpeg'], file_size_limit = 3145728
 where id = 'products';

-- ---------- новая модель ----------
-- p_after: id модели, после которой поставить (в списке выше — новее); null — в начало категории
create or replace function public.admin_add_model(p_id text, p_category text, p_title text, p_after text, p_who text)
returns text
language plpgsql security definer
set search_path = public
as $$
declare
  s int;
begin
  if p_id !~ '^[a-z0-9-]{2,60}$' then raise exception 'неверный код модели'; end if;
  if p_category not in ('iPhone', 'iPad', 'MacBook', 'Watch', 'AirPods') then raise exception 'неверная категория'; end if;
  if length(trim(p_title)) < 2 or length(p_title) > 60 then raise exception 'название модели — от 2 до 60 символов'; end if;
  if exists (select 1 from public.catalog_models where id = p_id or lower(title) = lower(trim(p_title))) then
    raise exception 'такая модель уже есть';
  end if;
  if p_after is null then
    select coalesce(max(sort), 10000) + 1 into s from public.catalog_models where category = p_category;
  else
    select sort into s from public.catalog_models where id = p_after and category = p_category;
    if s is null then raise exception 'нет модели %', p_after; end if;
    update public.catalog_models set sort = sort - 1 where sort < s;   -- освобождаем место сразу под p_after
    s := s - 1;
  end if;
  insert into public.catalog_models (id, category, title, sort) values (p_id, p_category, trim(p_title), s);
  insert into public.settings_history (who, what) values (p_who, format('новая модель %s (%s)', trim(p_title), p_category));
  return p_id;
end;
$$;

-- ---------- новая позиция ----------
-- p: {model_id, name, year, storage, color, color_ru, color_hex, sim, size, chip, ram_ssd, band, keyboard,
--     status, visible, photo_key, photo_url, synonyms, apple_parts, purchase}
create or replace function public.admin_add_item(p jsonb, p_who text)
returns int
language plpgsql security definer
set search_path = public
as $$
declare
  k numeric := public.shop_rate();
  new_id int;
  t text;
  purchase int := (p->>'purchase')::int;
begin
  if k is null then raise exception 'нет курса ЦБ'; end if;
  if not exists (select 1 from public.catalog_models where id = p->>'model_id') then raise exception 'нет модели'; end if;
  if length(coalesce(p->>'name', '')) < 3 or length(p->>'name') > 120 then raise exception 'неверное название'; end if;
  if purchase is null or purchase < 1000 or purchase > 5000000 then raise exception 'закупка — от 1 000 до 5 000 000 ₽'; end if;
  if coalesce(p->>'status', 'в наличии') not in ('в наличии', 'уточнить') then raise exception 'неверное наличие'; end if;
  foreach t in array array['storage', 'color', 'color_ru', 'sim', 'size', 'chip', 'ram_ssd', 'band', 'keyboard', 'photo_key'] loop
    if length(coalesce(p->>t, '')) > 80 then raise exception 'слишком длинное поле %', t; end if;
  end loop;
  if coalesce(p->>'color_hex', '') !~ '^(#[0-9A-Fa-f]{6})?$' then raise exception 'неверный цвет'; end if;
  if coalesce(p->>'photo_key', '') !~ '^([a-z0-9-]{3,80})?$' then raise exception 'неверный ключ фото'; end if;
  if exists (select 1 from public.catalog_items where name = p->>'name') then raise exception 'позиция «%» уже есть', p->>'name'; end if;

  lock table public.catalog_items in share row exclusive mode;   -- ID 1…N без повторов
  select coalesce(max(id), 0) + 1 into new_id from public.catalog_items;

  insert into public.catalog_items (id, model_id, name, year, storage, color, color_ru, color_hex, sim, size, chip, ram_ssd,
    band, keyboard, status, visible, photo_key, photo_url, synonyms, apple_parts, confirmed_at)
  values (new_id, p->>'model_id', p->>'name', nullif(p->>'year', '')::int, nullif(p->>'storage', ''), nullif(p->>'color', ''),
    nullif(p->>'color_ru', ''), nullif(p->>'color_hex', ''), nullif(p->>'sim', ''), nullif(p->>'size', ''), nullif(p->>'chip', ''),
    nullif(p->>'ram_ssd', ''), nullif(p->>'band', ''), coalesce(p->>'keyboard', ''), coalesce(p->>'status', 'в наличии'),
    coalesce((p->>'visible')::boolean, true), nullif(p->>'photo_key', ''), nullif(p->>'photo_url', ''),
    left(nullif(p->>'synonyms', ''), 1000), left(nullif(p->>'apple_parts', ''), 200), now());
  insert into public.catalog_costs (item_id, purchase_price, purchase_rate, purchase_date, source)
    values (new_id, purchase, k, current_date, 'новая позиция');
  insert into public.price_history (item_id, new_purchase, new_status, new_visible, source, who)
    values (new_id, purchase, coalesce(p->>'status', 'в наличии'), coalesce((p->>'visible')::boolean, true), 'новая позиция', p_who);
  perform public.recalc_catalog_prices();
  return new_id;
end;
$$;

-- ---------- фото для позиций: до 5 на «модель + цвет» (Роман: «чтобы там 3–4 фотографии было… до 5») ----------
-- photo_url — главное (на карточках и плашках), extra_photos — остальные, листаются в карточке товара
alter table public.catalog_items add column if not exists extra_photos text[] not null default '{}';

create or replace function public.admin_set_photos(p_item_ids int[], p_key text, p_urls text[], p_who text)
returns int
language plpgsql security definer
set search_path = public
as $$
declare
  n int;
  cnt int := coalesce(array_length(p_urls, 1), 0);
begin
  if p_key !~ '^[a-z0-9-]{3,80}$' then raise exception 'неверный ключ фото'; end if;
  if array_length(p_item_ids, 1) is null or array_length(p_item_ids, 1) > 200 then raise exception 'неверный список позиций'; end if;
  if cnt > 5 then raise exception 'не больше 5 фото'; end if;
  update public.catalog_items
     set photo_key = case when cnt > 0 then p_key end,
         photo_url = case when cnt > 0 then p_urls[1] end,
         extra_photos = case when cnt > 1 then p_urls[2:cnt] else '{}' end,
         updated_at = now()
   where id = any (p_item_ids);
  get diagnostics n = row_count;
  insert into public.settings_history (who, what) values (p_who, format('фото %s: %s шт. для %s позиций', p_key, cnt, n));
  return n;
end;
$$;

revoke execute on function public.admin_add_model(text, text, text, text, text), public.admin_add_item(jsonb, text),
  public.admin_set_photos(int[], text, text[], text) from public, anon, authenticated;
grant execute on function public.admin_add_model(text, text, text, text, text), public.admin_add_item(jsonb, text),
  public.admin_set_photos(int[], text, text[], text) to service_role;
