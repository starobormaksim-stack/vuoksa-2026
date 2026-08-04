-- ═══════════════════════════════════════════════════════════════════════════
--  Pine-to-Pine · ЗАЩИТА БОЕВОГО ЛИСТА, ПУТЬ В — вход почтой по личности
--
--  Надстройка над путём Б (docs/rls-apply-b.sql) от 04.08.2026. Всё поведение
--  пути Б сохранено: прямая запись в таблицу закрыта всем, правки идут только
--  через функцию trip_write со сверкой личного ключа из ссылки (?k=…), политики
--  сносятся целиком, песочницы %-test можно удалять.
--
--  ЧТО МЕНЯЕТСЯ. В пути Б право записи «вошёл по почте» давалось по РОЛИ
--  (auth.role() = 'authenticated'). Пока владельца заводили в панели вручную,
--  это было терпимо. Но приложение открывает свободную регистрацию (вход и
--  регистрация — одно письмо), и с ролью любой зарегистрировавшийся получил бы
--  полную запись в боевой документ. Поэтому теперь сверяется ЛИЧНОСТЬ:
--   · у строки появляется колонка owner_email — почта её владельца;
--   · первый вошедший почтой, кто записал строку, становится её владельцем;
--   · дальше запись почтой принимается только с той же почты.
--  Личный ключ из ссылки работает как раньше — команда без почты не страдает.
--
--  ⚠️ ПОРЯДОК ВАЖЕН: этот файл выполняется ДО включения «Enable Sign Ups»
--  в панели Supabase. Пошаговая инструкция — docs/owner-signup-steps.md.
--
--  Применение: SQL Editor → New query → вставить файл ЦЕЛИКОМ → Run.
--  Файл идемпотентен: повторный запуск ничего не ломает.
--
--  Снимок перед применением:
--    curl "https://oagonfdnlgqkoosvgaly.supabase.co/rest/v1/trips?id=eq.vuoksa2026\
--          &select=data,updated_at,author" -H "apikey: <anon>" -H "Authorization: Bearer <anon>"
--
--  Откат — в самом конце файла.
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
--  0. Колонка владельца. Пустая (null) — строка ещё никому не присвоена.
-- ───────────────────────────────────────────────────────────────────────────

alter table public.trips add column if not exists owner_email text;

-- ───────────────────────────────────────────────────────────────────────────
--  1. Функция записи. security definer — работает мимо RLS, поэтому проверка
--     ключа и почты внутри обязательна и является единственной защитой.
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
  почта text;             -- почта вошедшего из его токена; '' — вошёл без почты или не входил
  владелец text;          -- owner_email строки; '' — строка ещё ничья
  почта_подошла boolean;
begin
  /* Почту берём из проверенного токена (auth.jwt()), а не из присланных данных:
     подделать её нельзя. По РОЛИ 'authenticated' ничего не даём — при свободной
     регистрации роль есть у любого, кто получил письмо. Только личность. */
  почта := lower(coalesce(auth.jwt() ->> 'email', ''));

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

    if not ключ_подошёл and почта = '' then
      raise exception 'ключ не подходит';
    end if;

    /* Кто создал строку с почтой в кармане — тот сразу и её владелец. */
    return query
      insert into public.trips (id, data, updated_at, author, owner_email)
      values (p_trip, p_data, coalesce(p_stamp, now()), p_author, nullif(почта, ''))
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

  /* Почта подходит в двух случаях: строка ещё ничья (первый вошедший становится
     владельцем) или почта совпала с уже записанным владельцем. Чужая почта,
     даже честно зарегистрированная, записи НЕ даёт. */
  select coalesce(t.owner_email, '') into владелец from public.trips t where t.id = p_trip;
  почта_подошла := почта <> '' and (владелец = '' or владелец = почта);

  if not ключ_подошёл and not почта_подошла then
    raise exception 'ключ не подходит';
  end if;

  /* Заодно присваиваем строку: если владельца ещё нет, а пишущий вошёл почтой —
     его почта записывается в owner_email. Уже записанного владельца не трогаем. */
  return query
    update public.trips
       set data = p_data,
           updated_at = coalesce(p_stamp, now()),
           author = p_author,
           owner_email = coalesce(nullif(владелец, ''), nullif(почта, ''))
     where id = p_trip
       and updated_at = p_seen   -- кто-то записал раньше нас → 0 строк, клиент повторит
  returning *;
end;
$$;

revoke all on function public.trip_write(text, text, jsonb, timestamptz, timestamptz, text) from public;
grant execute on function public.trip_write(text, text, jsonb, timestamptz, timestamptz, text) to anon, authenticated;

-- ───────────────────────────────────────────────────────────────────────────
--  2. RLS: читать может любой, писать напрямую — НИКТО.
--     Политик на insert/update нет вовсе, и это не забывчивость:
--     единственный путь записи — функция выше.
--
--  ⚠️ Снести ВСЕ прежние политики обязательно. 04.08.2026 первое применение
--  пути Б защиту не дало: RLS включился, функция заработала, а прямая
--  запись осталась открытой — на таблице висела старая разрешающая политика
--  (такие Supabase заводит сам, когда RLS включают кнопкой в интерфейсе).
--  Одна такая политика сводит всю защиту на нет, поэтому список чистится
--  целиком, а не по именам.
-- ───────────────────────────────────────────────────────────────────────────

alter table public.trips enable row level security;

do $$
declare прежняя record;
begin
  for прежняя in
    select policyname from pg_policies where schemaname = 'public' and tablename = 'trips'
  loop
    execute format('drop policy %I on public.trips', прежняя.policyname);
  end loop;
end $$;

create policy "читать может любой"
  on public.trips for select
  using (true);

/* Строку песочницы надо уметь убирать после проверок, иначе она копится.
   Боевую строку это не затрагивает: условие ловит только имена на «-test». */
create policy "песочницу можно убирать"
  on public.trips for delete
  using (id like '%-test');

-- ───────────────────────────────────────────────────────────────────────────
--  3. Проверка. Должно быть: «защита включена» = true; ровно две политики —
--     SELECT и DELETE (ни одной на INSERT или UPDATE); колонка owner_email
--     на месте (третий запрос вернёт одну строку).
-- ───────────────────────────────────────────────────────────────────────────

select relrowsecurity as "защита включена" from pg_class where relname = 'trips';
select policyname as "политика", cmd as "на что" from pg_policies where tablename = 'trips';
select column_name as "колонка владельца есть"
  from information_schema.columns
 where table_schema = 'public' and table_name = 'trips' and column_name = 'owner_email';

-- ───────────────────────────────────────────────────────────────────────────
--  ЧЕГО ЭТОТ ФАЙЛ НЕ ДЕЛАЕТ
--
--  · Таблица-сигнал public.trip_pings остаётся открытой. В ней нет данных
--    поездки — только «документ изменился, сходите за ним», id поездки, метка
--    и имя. Закрывать её не нужно: испортить ею ничего нельзя, а закрытие
--    сломало бы уведомления о чужих правках.
--  · Настройки панели (Enable Sign Ups, Magic Link, Redirect URLs, SMTP)
--    SQL-ом не делаются — они по шагам в docs/owner-signup-steps.md.
--    Включать регистрацию можно ТОЛЬКО ПОСЛЕ этого файла.
-- ───────────────────────────────────────────────────────────────────────────

-- ───────────────────────────────────────────────────────────────────────────
--  ОТКАТ: вернуть путь Б (по роли, БЕЗ защиты от чужой регистрации)
--  — выполнить docs/rls-apply-b.sql целиком. Колонка owner_email никому
--  не мешает, удалять её не нужно. Полный откат к «до защиты»:
--
-- drop policy if exists "читать может любой" on public.trips;
-- drop policy if exists "песочницу можно убирать" on public.trips;
-- alter table public.trips disable row level security;
-- drop function if exists public.trip_write(text, text, jsonb, timestamptz, timestamptz, text);
-- ═══════════════════════════════════════════════════════════════════════════
