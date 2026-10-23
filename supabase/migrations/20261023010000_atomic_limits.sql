-- Замечания ревью security-guidance (23.10.2026): лимиты должны проверяться и записываться
-- одной операцией. Иначе пачка одновременных запросов проходит проверку раньше, чем
-- записалась первая попытка/первый заказ.
-- Функции вызываются только сервером (секретный ключ); публичному ключу выполнять их нельзя.

-- 1. Вход в админку: попытка записывается ДО проверки пароля (как неудачная),
--    под блокировкой по адресу. После верного пароля её отмечают успешной.
--    Два предела: по адресу (p_max_fails) и общий высокий потолок (p_max_global) —
--    против перебора сразу со множества адресов. Потолок высокий, чтобы нельзя было
--    за пару минут нарочно закрыть вход владельцу.
create or replace function public.admin_login_begin(
  p_ip text, p_window_min int, p_max_fails int, p_max_global int
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
  perform pg_advisory_xact_lock(hashtextextended('admin_login:' || p_ip, 0));
  if (select count(*) from public.admin_login_attempts
      where ip = p_ip and ok = false and created_at > since) >= p_max_fails
     or (select count(*) from public.admin_login_attempts
      where ok = false and created_at > since) >= p_max_global then
    return null; -- лимит исчерпан
  end if;
  insert into public.admin_login_attempts (ip, ok) values (p_ip, false) returning id into attempt_id;
  return attempt_id;
end $$;

revoke all on function public.admin_login_begin(text, int, int, int) from public, anon, authenticated;
grant execute on function public.admin_login_begin(text, int, int, int) to service_role;

-- 2. Заказ: проверка лимита и запись заказа — под блокировкой по Telegram-пользователю.
create or replace function public.create_order_limited(
  p_id uuid, p_tg_user_id bigint, p_payload jsonb, p_total numeric,
  p_limit_10min int, p_limit_day int
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('order:' || p_tg_user_id::text, 0));
  if (select count(*) from public.orders
      where tg_user_id = p_tg_user_id and created_at > now() - interval '10 minutes') >= p_limit_10min
     or (select count(*) from public.orders
      where tg_user_id = p_tg_user_id and created_at > now() - interval '1 day') >= p_limit_day then
    return false; -- лимит исчерпан
  end if;
  insert into public.orders (id, payload, tg_user_id, total) values (p_id, p_payload, p_tg_user_id, p_total);
  return true;
end $$;

revoke all on function public.create_order_limited(uuid, bigint, jsonb, numeric, int, int) from public, anon, authenticated;
grant execute on function public.create_order_limited(uuid, bigint, jsonb, numeric, int, int) to service_role;
