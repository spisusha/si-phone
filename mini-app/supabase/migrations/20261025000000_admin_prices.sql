-- Админка цен (этап B3, 25.10.2026): ручная правка, загрузка прайсов, наценки и курс — с историей «кто и когда».
-- Всё меняется только через функции ниже (их вызывает сервер с ключом service_role после проверки админа).

-- ---------- история ----------
create table public.price_history (
  id bigserial primary key,
  item_id int not null references public.catalog_items (id) on delete cascade,
  old_purchase int,
  new_purchase int,
  old_status text,
  new_status text,
  old_visible boolean,
  new_visible boolean,
  source text not null,          -- «вручную», «прайс 25.10 (12 строк)», «бот»
  who text not null,             -- «Роман (@...)» или «вход по паролю»
  at timestamptz not null default now()
);
create index price_history_at_idx on public.price_history (at desc);
create index price_history_item_idx on public.price_history (item_id, at desc);

create table public.price_imports (
  id bigserial primary key,
  at timestamptz not null default now(),
  who text not null,
  source text not null,          -- «текст», «Excel: прайс.xlsx», «бот»
  lines int not null,
  matched int not null,
  applied int not null
);

create table public.settings_history (
  id bigserial primary key,
  at timestamptz not null default now(),
  who text not null,
  what text not null             -- «наценка iPhone 5 → 6 %», «надбавка к курсу 4 → 3 %»
);

alter table public.price_history enable row level security;
alter table public.price_imports enable row level security;
alter table public.settings_history enable row level security;
revoke all on public.price_history, public.price_imports, public.settings_history from anon, authenticated;
revoke all on sequence public.price_history_id_seq, public.price_imports_id_seq, public.settings_history_id_seq from anon, authenticated;

-- ---------- новая закупка у позиций (прайс или ручная правка) ----------
-- p_items: [{"id": 75, "price": 113000}, …]. Закупка запоминается с курсом магазина на сегодня,
-- позиция становится «в наличии» и «подтверждённой» (2 дня выше в списке), цены пересчитываются.
create or replace function public.admin_apply_prices(p_items jsonb, p_source text, p_who text)
returns int
language plpgsql security definer
set search_path = public
as $$
declare
  k numeric := public.shop_rate();
  r record;
  n int := 0;
begin
  if k is null then raise exception 'нет курса ЦБ'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 2000 then raise exception 'неверный список'; end if;
  for r in
    select (e->>'id')::int as id, (e->>'price')::int as price
      from jsonb_array_elements(p_items) e
  loop
    if r.price is null or r.price < 1000 or r.price > 5000000 then raise exception 'неверная цена у позиции %', r.id; end if;
    insert into public.price_history (item_id, old_purchase, new_purchase, old_status, new_status, source, who)
      select i.id, c.purchase_price, r.price, i.status, 'в наличии', p_source, p_who
        from public.catalog_items i left join public.catalog_costs c on c.item_id = i.id
       where i.id = r.id;
    if not found then raise exception 'нет позиции %', r.id; end if;
    insert into public.catalog_costs (item_id, purchase_price, purchase_rate, purchase_date, source)
      values (r.id, r.price, k, current_date, p_source)
      on conflict (item_id) do update set purchase_price = excluded.purchase_price, purchase_rate = excluded.purchase_rate,
        purchase_date = excluded.purchase_date, source = excluded.source, updated_at = now();
    update public.catalog_items set status = 'в наличии', confirmed_at = now(), updated_at = now() where id = r.id;
    n := n + 1;
  end loop;
  perform public.recalc_catalog_prices();
  return n;
end;
$$;

-- ---------- наличие и видимость позиции ----------
create or replace function public.admin_set_item(p_id int, p_status text, p_visible boolean, p_who text)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if p_status not in ('в наличии', 'уточнить') then raise exception 'неверное наличие'; end if;
  insert into public.price_history (item_id, old_status, new_status, old_visible, new_visible, source, who)
    select id, status, p_status, visible, p_visible, 'вручную', p_who from public.catalog_items where id = p_id;
  if not found then raise exception 'нет позиции %', p_id; end if;
  update public.catalog_items set status = p_status, visible = p_visible, updated_at = now() where id = p_id;
end;
$$;

-- ---------- наценки и надбавка к курсу ----------
-- p_markups: {"iPhone": 5, "iPad": 6, …}
create or replace function public.admin_set_pricing(p_fx_margin numeric, p_markups jsonb, p_who text)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  old_margin numeric;
  r record;
begin
  if p_fx_margin is null or p_fx_margin < 0 or p_fx_margin > 20 then raise exception 'надбавка к курсу — от 0 до 20 %%'; end if;
  select fx_margin_pct into old_margin from public.pricing_settings where id = 1;
  if old_margin is distinct from p_fx_margin then
    update public.pricing_settings set fx_margin_pct = p_fx_margin, updated_at = now() where id = 1;
    insert into public.settings_history (who, what) values (p_who, format('надбавка к курсу ЦБ %s → %s %%', old_margin, p_fx_margin));
  end if;
  for r in select key as cat, value::text::numeric as pct from jsonb_each(p_markups) loop
    if r.pct < 0 or r.pct > 50 then raise exception 'наценка — от 0 до 50 %%'; end if;
    insert into public.settings_history (who, what)
      select p_who, format('наценка %s %s → %s %%', m.category, m.percent, r.pct)
        from public.markup_rules m where m.category = r.cat and m.percent is distinct from r.pct;
    update public.markup_rules set percent = r.pct where category = r.cat;
  end loop;
  perform public.recalc_catalog_prices();
end;
$$;

revoke execute on function public.admin_apply_prices(jsonb, text, text), public.admin_set_item(int, text, boolean, text),
  public.admin_set_pricing(numeric, jsonb, text) from public, anon, authenticated;
grant execute on function public.admin_apply_prices(jsonb, text, text), public.admin_set_item(int, text, boolean, text),
  public.admin_set_pricing(numeric, jsonb, text) to service_role;
