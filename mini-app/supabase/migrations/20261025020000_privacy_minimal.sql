-- 152-ФЗ (решение Романа 25.10.2026): в базе (сервер вне РФ) не храним персональные данные.
-- Имя, ник, телефон и адрес покупателя уходят только менеджерам в Telegram.
-- В базе — обезличенный заказ: товары, сумма, способ получения и оплаты, время.
-- Для лимита частоты заказов — не Telegram ID, а его отпечаток (HMAC с секретом сервера),
-- который стирается через сутки. IP попыток входа в админку — тоже только отпечаток, удаляется через сутки.

-- 1. Заказы
alter table public.orders add column if not exists user_key text;

-- уже сохранённые заказы — убрать личные данные
update public.orders set payload = payload - 'tgUser' - 'phone' - 'address' - 'guestId';

drop function if exists public.create_order_limited(uuid, bigint, jsonb, numeric, int, int);
drop index if exists public.orders_tg_user_created_idx;
alter table public.orders drop column if exists tg_user_id;
create index if not exists orders_user_key_created_idx on public.orders (user_key, created_at desc) where user_key is not null;

-- страховка: личные поля в заказ не запишутся, даже если сервер по ошибке их передаст
alter table public.orders drop constraint if exists orders_no_personal_data;
alter table public.orders add constraint orders_no_personal_data
  check (not (payload ?| array['tgUser', 'phone', 'address', 'guestId', 'name', 'username']));
alter table public.orders drop constraint if exists orders_user_key_format;
alter table public.orders add constraint orders_user_key_format
  check (user_key is null or user_key ~ '^[0-9a-f]{64}$');

-- Проверка лимита и запись заказа — одной операцией под блокировкой по отпечатку покупателя.
create function public.create_order_limited(
  p_id uuid, p_user_key text, p_payload jsonb, p_total numeric,
  p_limit_10min int, p_limit_day int
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('order:' || p_user_key, 0));
  if (select count(*) from public.orders
      where user_key = p_user_key and created_at > now() - interval '10 minutes') >= p_limit_10min
     or (select count(*) from public.orders
      where user_key = p_user_key and created_at > now() - interval '1 day') >= p_limit_day then
    return false; -- лимит исчерпан
  end if;
  insert into public.orders (id, payload, user_key, total) values (p_id, p_payload, p_user_key, p_total);
  return true;
end $$;

revoke all on function public.create_order_limited(uuid, text, jsonb, numeric, int, int) from public, anon, authenticated;
grant execute on function public.create_order_limited(uuid, text, jsonb, numeric, int, int) to service_role;

-- 2. Попытки входа в админку: вместо IP — отпечаток
delete from public.admin_login_attempts;
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'admin_login_attempts' and column_name = 'ip') then
    alter table public.admin_login_attempts rename column ip to ip_key;
  end if;
end $$;
alter table public.admin_login_attempts drop constraint if exists admin_login_attempts_ip_key_format;
alter table public.admin_login_attempts add constraint admin_login_attempts_ip_key_format
  check (ip_key ~ '^[0-9a-f]{64}$');

drop function if exists public.admin_login_begin(text, int, int, int);
create function public.admin_login_begin(
  p_ip_key text, p_window_min int, p_max_fails int, p_max_global int
)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  since timestamptz := now() - make_interval(mins => p_window_min);
  attempt_id bigint;
begin
  perform pg_advisory_xact_lock(hashtextextended('admin_login:global', 0));
  if (select count(*) from public.admin_login_attempts
      where ip_key = p_ip_key and ok = false and created_at > since) >= p_max_fails
     or (p_max_global is not null and (select count(*) from public.admin_login_attempts
      where ok = false and created_at > since) >= p_max_global) then
    return null; -- лимит исчерпан
  end if;
  insert into public.admin_login_attempts (ip_key, ok) values (p_ip_key, false) returning id into attempt_id;
  return attempt_id;
end $$;

revoke all on function public.admin_login_begin(text, int, int, int) from public, anon, authenticated;
grant execute on function public.admin_login_begin(text, int, int, int) to service_role;

-- 3. Уборка раз в час: отпечатки покупателей старше суток стираются (заказ остаётся обезличенным),
--    попытки входа старше суток удаляются.
create or replace function public.privacy_cleanup()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.orders set user_key = null where user_key is not null and created_at < now() - interval '1 day';
  delete from public.admin_login_attempts where created_at < now() - interval '1 day';
$$;

revoke all on function public.privacy_cleanup() from public, anon, authenticated;
grant execute on function public.privacy_cleanup() to service_role;

select cron.schedule('si-phone-privacy-cleanup', '17 * * * *', $$select public.privacy_cleanup()$$);
