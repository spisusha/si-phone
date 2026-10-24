-- Курс ЦБ: строже защита (замечание проверки безопасности, 24.10.2026).
-- Запасной источник cbr-xml-daily.ru — сторонний сайт; подменённый курс не должен заметно сдвинуть цены.
-- Скачок больше 5 % от прошлого курса — не записываем, цены не трогаем (нужен человек). У курса пишем источник.

alter table public.fx_rates add column if not exists source text;
update public.fx_rates set source = 'cbr.ru или зеркало (до записи источника)' where source is null;

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
  src text := 'cbr.ru';
begin
  begin
    select content into body from extensions.http_get('https://www.cbr.ru/scripts/XML_daily.asp');
    d := to_date(substring(body from 'ValCurs Date="([0-9.]+)"'), 'DD.MM.YYYY');
    v := replace(substring(body from 'R01235.*?<Value>([0-9]+,[0-9]+)</Value>'), ',', '.')::numeric;
  exception when others then
    raise notice 'cbr.ru недоступен: %', sqlerrm;
    v := null;
  end;
  if v is null then
    src := 'cbr-xml-daily.ru (запасной)';
    select content into body from extensions.http_get('https://www.cbr-xml-daily.ru/daily_json.js');
    d := substring(body from '"Date": *"([0-9]{4}-[0-9]{2}-[0-9]{2})')::date;
    v := substring(body from '"USD": *\{[^}]*?"Value": *([0-9.]+)')::numeric;
  end if;
  if v is null or v < 10 or v > 1000 then
    raise exception 'курс ЦБ не распознан (%)', src;
  end if;
  d := coalesce(d, current_date);
  select usd_cbr into prev from public.fx_rates order by rate_date desc limit 1;
  if prev is not null and abs(v / prev - 1) > 0.05 then
    raise exception 'курс изменился больше чем на 5 %% (было %, стало %, источник %) — нужна проверка человеком', prev, v, src;
  end if;
  insert into public.fx_rates (rate_date, usd_cbr, source) values (d, v, src)
  on conflict (rate_date) do update set usd_cbr = excluded.usd_cbr, source = excluded.source, fetched_at = now();
  perform public.recalc_catalog_prices();
  return v;
end;
$$;

revoke execute on function public.fetch_cbr_usd() from public, anon, authenticated;
grant execute on function public.fetch_cbr_usd() to service_role;
