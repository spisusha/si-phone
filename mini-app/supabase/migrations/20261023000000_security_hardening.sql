-- Этап 1б (23.10.2026): закрываем запись для всех, кто знает публичный ключ.
-- Публичный ключ лежит в коде мини-аппа, поэтому защищают только RLS и права (GRANT).
-- Сервер (edge-функции с секретным ключом) RLS обходит и продолжает работать как раньше.

-- 1. Хранилище фото: бакет остаётся публичным на чтение по ссылке,
--    писать может только сервер (админка получает одноразовую ссылку от media-sign-upload).
drop policy if exists "products_allow_all" on storage.objects;
drop policy if exists "products_public_select" on storage.objects;
drop policy if exists "products_public_insert" on storage.objects;
drop policy if exists "products_public_update" on storage.objects;
drop policy if exists "products_public_delete" on storage.objects;

update storage.buckets
set public = true,
    file_size_limit = 10485760, -- 10 МБ
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/avif']
where id = 'products';

-- 2. Каталог: читать могут все, менять — только сервер.
alter table public.variants add column if not exists images jsonb default '[]'::jsonb; -- раньше делала admin-setup
alter table public.product_families enable row level security;
alter table public.variants enable row level security;

do $$
declare p record;
begin
  -- убрать любые политики на запись в каталог (если когда-то создавались вручную)
  for p in
    select policyname, tablename from pg_policies
    where schemaname = 'public'
      and tablename in ('product_families', 'variants')
      and cmd <> 'SELECT'
  loop
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
  end loop;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'product_families' and cmd = 'SELECT') then
    create policy "Каталог: семейства видны всем" on public.product_families for select to anon, authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'variants' and cmd = 'SELECT') then
    create policy "Каталог: варианты видны всем" on public.variants for select to anon, authenticated using (true);
  end if;
end $$;

revoke insert, update, delete, truncate on public.product_families, public.variants from anon, authenticated;

-- 3. Заказы: ни чтения, ни записи с публичным ключом. Создаёт только create-order.
do $$
declare p record;
begin
  for p in select policyname from pg_policies where schemaname = 'public' and tablename = 'orders'
  loop
    execute format('drop policy %I on public.orders', p.policyname);
  end loop;
end $$;

alter table public.orders enable row level security;
revoke all on public.orders from anon, authenticated;

alter table public.orders add column if not exists tg_user_id bigint;
alter table public.orders add column if not exists total numeric;
create index if not exists orders_tg_user_created_idx on public.orders (tg_user_id, created_at desc);

-- 4. Попытки входа в админку — для ограничения подбора пароля.
create table if not exists public.admin_login_attempts (
  id bigint generated always as identity primary key,
  ip text not null,
  ok boolean not null,
  created_at timestamptz not null default now()
);
alter table public.admin_login_attempts enable row level security;
revoke all on public.admin_login_attempts from anon, authenticated;
create index if not exists admin_login_attempts_created_idx on public.admin_login_attempts (created_at desc);
