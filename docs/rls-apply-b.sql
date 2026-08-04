-- ═══════════════════════════════════════════════════════════════════════════
--  Pine-to-Pine · ЗАЩИТА БОЕВОГО ЛИСТА, ПУТЬ Б — готово к применению
--
--  Решение заказчика от 04.08.2026: путь Б из docs/rls-migration.sql.
--  Прямая запись в таблицу закрывается ВСЕМ. Правки идут через функцию
--  trip_write, которая сверяет личный ключ человека из ссылки (?k=…) со списком
--  людей в документе НА СЕРВЕРЕ. Модель прав остаётся ровно той же, а дыра
--  «голый адрес = владелец» закрывается: без ключа записи не будет вовсе,
--  сколько бы старых вкладок ни было открыто.
--
--  ⚠️ ПОРЯДОК ВАЖЕН:
--   1. Сначала выложить приложение (оно уже умеет писать через trip_write
--      и, пока функции нет, откатывается на прямую запись — то есть работает
--      и до, и после применения этого файла).
--   2. Снять снимок строки vuoksa2026 (см. restore/ или команду ниже).
--   3. Выполнить ЭТОТ файл целиком в панели Supabase: SQL Editor → New query →
--      вставить → Run.
--   4. Проверить, что лист читается и что правка по личной ссылке сохраняется.
--
--  Снимок:
--    curl "https://oagonfdnlgqkoosvgaly.supabase.co/rest/v1/trips?id=eq.vuoksa2026\
--          &select=data,updated_at,author" -H "apikey: <anon>" -H "Authorization: Bearer <anon>"
--
--  Откат — в самом конце файла.
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
--  1. Функция записи. security definer — работает мимо RLS, поэтому проверка
--     ключа внутри обязательна и является единственной защитой.
-- ───────────────────────────────────────────────────────────────────────────

create or replace function public.trip_write(
  p_trip   text,          -- id строки: vuoksa2026 или vuoksa2026-test (песочница)
  p_key    text,          -- личный ключ человека из ссылки
  p_data   jsonb,         -- документ целиком
  p_seen   timestamptz,   -- метка, которую клиент видел (условная запись); null — строки нет
  p_stamp  timestamptz,   -- метка, которую ставим
  p_author text           -- имя того, кто правит (колонка author)
) returns setof public.trips
language plpgsql
security definer
set search_path = public
as $$
declare
  есть_строка boolean;
  ключ_подошёл boolean;
  вошёл_по_почте boolean;
begin
  /* Владелец, вошедший через Supabase Auth (письмо со ссылкой), пишет и без
     личного ключа: он и так полноправный. Все прочие — только по ключу. */
  вошёл_по_почте := coalesce(auth.role(), '') = 'authenticated';

  select exists (select 1 from public.trips t where t.id = p_trip) into есть_строка;

  if not есть_строка then
    /* Строки ещё нет — это создание документа (в том числе песочницы
       vuoksa2026-test). Сверять ключ не с чем, поэтому берём людей из
       присланного документа: кто создаёт лист, тот и задаёт команду. */
    select exists (
      select 1
      from jsonb_array_elements(coalesce(p_data -> 'people', '[]'::jsonb)) as person
      where person ->> 'key' = p_key
        and coalesce(p_key, '') <> ''
    ) into ключ_подошёл;

    if not ключ_подошёл and not вошёл_по_почте then
      raise exception 'ключ не подходит';
    end if;

    return query
      insert into public.trips (id, data, updated_at, author)
      values (p_trip, p_data, coalesce(p_stamp, now()), p_author)
      returning *;
    return;
  end if;

  /* Ключ должен совпасть с ключом кого-то из людей ТЕКУЩЕГО документа на сервере,
     а не того, что прислал клиент: иначе достаточно прислать своего человека. */
  select exists (
    select 1
    from public.trips t,
         jsonb_array_elements(coalesce(t.data -> 'people', '[]'::jsonb)) as person
    where t.id = p_trip
      and person ->> 'key' = p_key
      and coalesce(p_key, '') <> ''
  ) into ключ_подошёл;

  if not ключ_подошёл and not вошёл_по_почте then
    raise exception 'ключ не подходит';
  end if;

  return query
    update public.trips
       set data = p_data,
           updated_at = coalesce(p_stamp, now()),
           author = p_author
     where id = p_trip
       and updated_at = p_seen   -- кто-то записал раньше нас → 0 строк, клиент повторит
  returning *;
end;
$$;

revoke all on function public.trip_write(text, text, jsonb, timestamptz, timestamptz, text) from public;
grant execute on function public.trip_write(text, text, jsonb, timestamptz, timestamptz, text) to anon, authenticated;

-- ───────────────────────────────────────────────────────────────────────────
--  2. RLS: читать может любой, писать напрямую — НИКТО.
--     Политик на insert/update/delete нет вовсе, и это не забывчивость:
--     единственный путь записи — функция выше.
-- ───────────────────────────────────────────────────────────────────────────

alter table public.trips enable row level security;

drop policy if exists "читать может любой" on public.trips;
create policy "читать может любой"
  on public.trips for select
  using (true);

-- ───────────────────────────────────────────────────────────────────────────
--  3. Проверка: должна вернуть одну строку с politikой select и ни одной
--     политики на запись.
-- ───────────────────────────────────────────────────────────────────────────

-- select policyname, cmd from pg_policies where tablename = 'trips';

-- ───────────────────────────────────────────────────────────────────────────
--  ЧЕГО ЭТОТ ФАЙЛ НЕ ДЕЛАЕТ
--
--  Таблица-сигнал public.trip_pings остаётся открытой. В ней нет данных
--  поездки — только «документ изменился, сходите за ним», id поездки, метка
--  и имя. Закрывать её не нужно: испортить ею ничего нельзя, а закрытие
--  сломало бы уведомления о чужих правках.
-- ───────────────────────────────────────────────────────────────────────────

-- ───────────────────────────────────────────────────────────────────────────
--  ОТКАТ: вернуть как было
-- ───────────────────────────────────────────────────────────────────────────

-- drop policy if exists "читать может любой" on public.trips;
-- alter table public.trips disable row level security;
-- drop function if exists public.trip_write(text, text, jsonb, timestamptz, timestamptz, text);

-- ───────────────────────────────────────────────────────────────────────────
--  ЧТО ЕЩЁ НАДО СДЕЛАТЬ РУКАМИ В ПАНЕЛИ SUPABASE ДЛЯ ВХОДА ПОЧТОЙ
--  (к защите листа отношения не имеет — нужно для экрана «Вход владельца»)
--
--  1. Authentication → Providers → Email: включить «Magic Link».
--  2. Authentication → URL Configuration → Redirect URLs: добавить
--       https://pine-to-pine.com/*
--       https://www.pine-to-pine.com/*
--       http://localhost:5199/*
--     Без этого письмо приходит, а переход по ссылке никуда не ведёт.
--  3. Authentication → Users: завести владельца вручную (его почта).
--     В приложении стоит create_user: false — сам собой никто не заведётся.
--  4. Почта по умолчанию у Supabase жёстко ограничена (несколько писем в час).
--     Для живой работы нужен свой SMTP: Project Settings → Auth → SMTP Settings.
-- ═══════════════════════════════════════════════════════════════════════════
