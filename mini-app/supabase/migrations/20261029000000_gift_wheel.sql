-- Колесо подарков (Роман, 29.10.2026): раз в 30 дней на аккаунт Telegram, приз — к следующему заказу.
-- Всё решает сервер (функция wheel): телефон только крутит анимацию до сектора, который вернул сервер.
-- Персональных данных нет: вместо Telegram ID — отпечаток (HMAC, как у заказов), запись удаляется через 35 дней.

create table if not exists public.wheel_prizes (
  key text primary key,
  title text not null,             -- «Защитное стекло с оклейкой»
  short text not null,             -- подпись на колесе: «Стекло»
  weight int not null check (weight >= 0), -- вероятность (доли от суммы весов активных призов)
  sort int not null default 0,
  active boolean not null default true
);

insert into public.wheel_prizes (key, title, short, weight, sort) values
  ('glass',    'Защитное стекло с оклейкой',    'Стекло',       35, 1),
  ('delivery', 'Бесплатная доставка по Москве', 'Доставка 0 ₽', 30, 2),
  ('case',     'Чехол в подарок',               'Чехол',        20, 3),
  ('discount', 'Скидка 1 000 ₽ на заказ',       '−1 000 ₽',     10, 4),
  ('again',    'Крутите ещё раз',               'Ещё раз',       5, 5)
on conflict (key) do nothing;

create table if not exists public.wheel_spins (
  id bigint generated always as identity primary key,
  user_key text not null check (user_key ~ '^[0-9a-f]{64}$'),
  prize_key text not null references public.wheel_prizes (key),
  code text unique check (code is null or code ~ '^SI-[A-Z0-9]{4}$'),
  created_at timestamptz not null default now(),
  expires_at timestamptz,          -- для «ещё раз» — пусто
  used_at timestamptz,
  order_id uuid
);
create index if not exists wheel_spins_user_idx on public.wheel_spins (user_key, created_at desc);

alter table public.wheel_prizes enable row level security;
alter table public.wheel_spins enable row level security;
revoke all on public.wheel_prizes, public.wheel_spins from anon, authenticated;

-- Розыгрыш: проверка «раз в 30 дней» и запись — одной операцией под блокировкой по покупателю,
-- чтобы пачка одновременных нажатий не дала два приза. Приз выбирает функция wheel (по весам).
create or replace function public.wheel_spin(p_user_key text, p_prize_key text, p_code text, p_days int)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  s record;
begin
  perform pg_advisory_xact_lock(hashtextextended('wheel:' || p_user_key, 0));
  select * into s from public.wheel_spins
    where user_key = p_user_key and prize_key <> 'again' and created_at > now() - make_interval(days => p_days)
    order by created_at desc limit 1;
  if found then
    return jsonb_build_object('status', 'already', 'prize_key', s.prize_key, 'code', s.code,
      'expires_at', s.expires_at, 'used_at', s.used_at, 'created_at', s.created_at);
  end if;
  insert into public.wheel_spins (user_key, prize_key, code, expires_at)
    values (p_user_key, p_prize_key, case when p_prize_key = 'again' then null else p_code end,
            case when p_prize_key = 'again' then null else now() + make_interval(days => p_days) end)
    returning * into s;
  return jsonb_build_object('status', 'ok', 'prize_key', s.prize_key, 'code', s.code,
    'expires_at', s.expires_at, 'created_at', s.created_at);
end $$;

revoke all on function public.wheel_spin(text, text, text, int) from public, anon, authenticated;
grant execute on function public.wheel_spin(text, text, text, int) to service_role;

-- Уборка: записи колеса старше 35 дней удаляются (вместе с отпечатком покупателя)
create or replace function public.privacy_cleanup()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.orders set user_key = null where user_key is not null and created_at < now() - interval '1 day';
  delete from public.admin_login_attempts where created_at < now() - interval '1 day';
  delete from public.wheel_spins where created_at < now() - interval '35 days';
$$;

revoke all on function public.privacy_cleanup() from public, anon, authenticated;
grant execute on function public.privacy_cleanup() to service_role;
