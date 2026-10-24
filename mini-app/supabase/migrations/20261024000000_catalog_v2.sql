-- Каталог v2 (этап B1, 24.10.2026).
-- Модели и товары из нашей таблицы (ID 1…N). Закупочные цены лежат в закрытой таблице, курс ЦБ подтягивается каждый день сам.
-- Цена для покупателя = округлить до 500 ₽ ( закупка × курс сегодня ÷ курс в день закупки × (1 + наценка категории) ),
-- где курс = доллар ЦБ × (1 + надбавка 4 %).
-- Старые product_families / variants здесь не трогаем: их уберём отдельно, когда витрина перейдёт на новое.

create extension if not exists http with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

-- ---------- модели (карточки) ----------
create table public.catalog_models (
  id text primary key,                          -- например «iphone-17-pro»
  category text not null check (category in ('iPhone', 'iPad', 'MacBook', 'Watch', 'AirPods')),
  title text not null,                          -- «iPhone 17 Pro»
  sort int not null default 0,                  -- больше — выше (новее)
  created_at timestamptz not null default now()
);

-- ---------- товары ----------
create table public.catalog_items (
  id int primary key,                           -- ID из таблицы каталога, не переиспользуется
  model_id text not null references public.catalog_models (id) on update cascade,
  name text not null unique,                    -- «iPhone 17 Pro Max 256GB Cosmic Orange eSIM»
  year int,
  storage text,                                 -- «256GB», «1TB»
  color text,                                   -- английское название Apple
  color_ru text,
  color_hex text,
  sim text,                                     -- eSIM / SIM+eSIM / Wi-Fi / Wi-Fi+Cellular
  size text,
  chip text,
  ram_ssd text,
  band text,                                    -- Watch: корпус / ремешок
  keyboard text,                                -- MacBook: пусто или «РУС»
  price int not null default 0 check (price >= 0),  -- цена для покупателя (считает recalc_catalog_prices)
  status text not null default 'в наличии' check (status in ('в наличии', 'уточнить')),
  visible boolean not null default true,
  photo_key text,
  photo_url text,
  synonyms text,
  apple_parts text,
  confirmed_at timestamptz,                     -- когда цену подтвердил Артём (такие позиции 2 дня наверху)
  updated_at timestamptz not null default now()
);
create index catalog_items_model_idx on public.catalog_items (model_id);

-- ---------- закупка (ЗАКРЫТО: только сервер и админка) ----------
create table public.catalog_costs (
  item_id int primary key references public.catalog_items (id) on delete cascade,
  purchase_price int not null check (purchase_price > 0),
  purchase_rate numeric(10, 4) not null check (purchase_rate > 0),  -- курс магазина в день закупки
  purchase_date date not null,
  source text,                                  -- откуда цена: поставщик, магазин, оценка
  updated_at timestamptz not null default now()
);

-- ---------- курс ЦБ ----------
create table public.fx_rates (
  rate_date date primary key,
  usd_cbr numeric(10, 4) not null check (usd_cbr > 0),
  fetched_at timestamptz not null default now()
);

-- ---------- настройки цен (ЗАКРЫТО) ----------
create table public.pricing_settings (
  id int primary key default 1 check (id = 1),
  fx_margin_pct numeric(5, 2) not null default 4 check (fx_margin_pct >= 0 and fx_margin_pct < 50),
  updated_at timestamptz not null default now()
);
insert into public.pricing_settings default values;

create table public.markup_rules (
  category text primary key check (category in ('iPhone', 'iPad', 'MacBook', 'Watch', 'AirPods')),
  percent numeric(5, 2) not null check (percent >= 0 and percent < 100)
);
-- Наценка (Роман, 24.10.2026: «где-то 5–7 %, зависит от категории»): на дорогое ниже, на недорогое выше
insert into public.markup_rules (category, percent) values
  ('iPhone', 5), ('MacBook', 5), ('iPad', 6), ('Watch', 7), ('AirPods', 7);

-- ---------- доступ (RLS) ----------
alter table public.catalog_models enable row level security;
alter table public.catalog_items enable row level security;
alter table public.catalog_costs enable row level security;
alter table public.fx_rates enable row level security;
alter table public.pricing_settings enable row level security;
alter table public.markup_rules enable row level security;

create policy "catalog models: public read" on public.catalog_models for select to anon, authenticated using (true);
create policy "catalog items: public read visible" on public.catalog_items for select to anon, authenticated using (visible);
create policy "fx rates: public read" on public.fx_rates for select to anon, authenticated using (true);
-- У catalog_costs, pricing_settings и markup_rules политик нет: публичный ключ не видит ни закупку, ни наценки
revoke all on public.catalog_costs, public.pricing_settings, public.markup_rules from anon, authenticated;
revoke insert, update, delete, truncate on public.catalog_models, public.catalog_items, public.fx_rates from anon, authenticated;

-- ---------- курс магазина и пересчёт цен ----------
create or replace function public.shop_rate()
returns numeric
language sql stable security definer
set search_path = public
as $$
  select (select usd_cbr from public.fx_rates order by rate_date desc limit 1)
       * (1 + (select fx_margin_pct from public.pricing_settings where id = 1) / 100);
$$;

create or replace function public.recalc_catalog_prices()
returns int
language plpgsql security definer
set search_path = public
as $$
declare
  k numeric := public.shop_rate();
  n int;
begin
  if k is null then
    raise exception 'нет курса ЦБ — цены не пересчитаны';
  end if;
  update public.catalog_items i
     set price = x.new_price, updated_at = now()
    from (
      select c.item_id,
             (round(c.purchase_price * k / c.purchase_rate * (1 + coalesce(m.percent, 0) / 100) / 500) * 500)::int as new_price
        from public.catalog_costs c
        join public.catalog_items it on it.id = c.item_id
        join public.catalog_models md on md.id = it.model_id
        left join public.markup_rules m on m.category = md.category
    ) x
   where x.item_id = i.id and i.price is distinct from x.new_price;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Курс доллара ЦБ берём из официального XML cbr.ru. Запасной источник — зеркало cbr-xml-daily.ru (если cbr.ru не отвечает серверу).
-- Защита: курс вне 10…1000 или скачок больше 20 % за раз не записываем, цены не трогаем.
create or replace function public.fetch_cbr_usd()
returns numeric
language plpgsql security definer
set search_path = public, extensions
as $$
declare
  body text;
  v numeric;
  d date;
  prev numeric;
begin
  begin
    select content into body from extensions.http_get('https://www.cbr.ru/scripts/XML_daily.asp');
    d := to_date(substring(body from 'ValCurs Date="([0-9.]+)"'), 'DD.MM.YYYY');
    v := replace(substring(body from 'R01235.*?<Value>([0-9]+,[0-9]+)</Value>'), ',', '.')::numeric;
  exception when others then
    v := null;
  end;
  if v is null then
    select content into body from extensions.http_get('https://www.cbr-xml-daily.ru/daily_json.js');
    d := substring(body from '"Date": *"([0-9]{4}-[0-9]{2}-[0-9]{2})')::date;
    v := substring(body from '"USD": *\{[^}]*?"Value": *([0-9.]+)')::numeric;
  end if;
  if v is null or v < 10 or v > 1000 then
    raise exception 'курс ЦБ не распознан';
  end if;
  d := coalesce(d, current_date);
  select usd_cbr into prev from public.fx_rates order by rate_date desc limit 1;
  if prev is not null and abs(v / prev - 1) > 0.2 then
    raise exception 'курс ЦБ изменился больше чем на 20 %% (было %, стало %) — нужна проверка человеком', prev, v;
  end if;
  insert into public.fx_rates (rate_date, usd_cbr) values (d, v)
  on conflict (rate_date) do update set usd_cbr = excluded.usd_cbr, fetched_at = now();
  perform public.recalc_catalog_prices();
  return v;
end;
$$;

-- Функции вызывает только сервер (расписание, админка), из браузера — нельзя
revoke execute on function public.shop_rate(), public.recalc_catalog_prices(), public.fetch_cbr_usd() from public, anon, authenticated;
grant execute on function public.shop_rate(), public.recalc_catalog_prices(), public.fetch_cbr_usd() to service_role;

-- Каждый день в 9:00 и 16:00 по Москве (ЦБ публикует курс днём)
select cron.schedule('si-phone-fx-daily', '0 6,13 * * *', $$select public.fetch_cbr_usd()$$);
