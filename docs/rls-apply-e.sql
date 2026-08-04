-- ═══════════════════════════════════════════════════════════════════════════
--  Pine-to-Pine · ЗАКРЫТЬ ЧТЕНИЕ ЛИСТА ОТ ПОСТОРОННИХ
--
--  Требование заказчика 05.08.2026, дословно: «чтобы не было доступа
--  у человека, который зашёл на pine-to-pine.com… чтобы в публичном доступе
--  не была информация».
--
--  ⛔⛔ НЕ ВЫПОЛНЯТЬ, ПОКА НЕ ВЫЛОЖЕН КОД, УМЕЮЩИЙ ЧИТАТЬ ЧЕРЕЗ `trip_read`.
--  Сейчас приложение читает лист прямым `GET /rest/v1/trips`. Стоит закрыть
--  SELECT — и сайт погаснет у ВСЕЙ команды, включая владельца. Порядок строгий:
--     1. правка кода (`lib/supabase.ts` — чтение через RPC, откат на прямое при 404);
--     2. выкладка и проверка, что лист открывается по всем пяти личным ссылкам;
--     3. только потом этот файл.
--  Ровно этот порядок соблюдался у `trip_write` (путь Б, 04.08.2026), и он же
--  спас от простоя: функция сначала появилась, код научился, потом закрыли дверь.
--
--  ─── Почему клиентской заглушки НЕ ДОСТАТОЧНО ───
--  Проверено запросом 05.08.2026: `GET /rest/v1/trips?id=eq.vuoksa2026&select=data`
--  с публичным ключом отдаёт весь документ — имена, фотографии, деньги, маршрут.
--  Ключ (`SB.key` в `app/src/lib/supabase.ts`) лежит в коде сайта, то есть он
--  публичен по своей природе. Спрятать лист на экране, оставив дверь открытой, —
--  это ложное чувство защиты, а оно хуже честно открытой двери.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- ─── 1. Чтение таблицы напрямую закрывается всем ───────────────────────────
-- Снимаем все политики SELECT, какие есть: файл, который сносил политику только
-- по своему имени, однажды уже оставил дыру открытой (04.08.2026, 12:20).
do $$
declare p record;
begin
  for p in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'trips' and cmd in ('SELECT', 'ALL')
  loop
    execute format('drop policy %I on public.trips', p.policyname);
  end loop;
end $$;

alter table public.trips enable row level security;

-- ─── 2. Чтение — только по личному ключу, и решает это СЕРВЕР ──────────────
-- Ключ сверяется со списком людей внутри самого документа — так же, как это
-- делает `trip_write`. Модель прав не меняется ни на строку: кто мог читать,
-- тот и читает; посторонний не получает ничего.
create or replace function public.trip_read(p_id text, p_key text)
returns table (id text, data jsonb, updated_at timestamptz, author text)
language plpgsql
security definer
set search_path = public
as $$
declare
  doc jsonb;
begin
  if p_key is null or length(trim(p_key)) = 0 then
    raise exception 'ключ не подходит' using errcode = '42501';
  end if;

  select t.data into doc from public.trips t where t.id = p_id;
  if doc is null then
    return;                     -- поездки нет: пустой ответ, а не подсказка
  end if;

  -- Ключ обязан совпасть с ключом кого-то из людей документа.
  if not exists (
    select 1
    from jsonb_array_elements(coalesce(doc -> 'people', '[]'::jsonb)) AS p
    where p ->> 'key' = p_key
  ) then
    raise exception 'ключ не подходит' using errcode = '42501';
  end if;

  return query
    select t.id, t.data, t.updated_at, t.author
    from public.trips t
    where t.id = p_id;
end $$;

revoke all on function public.trip_read(text, text) from public;
grant execute on function public.trip_read(text, text) to anon, authenticated;

commit;

-- ═══════════════════════════════════════════════════════════════════════════
--  ПОСЛЕ ВЫПОЛНЕНИЯ ПРОВЕРИТЬ (обе проверки обязательны):
--
--  1. Посторонний ничего не получает:
--     curl -s "<url>/rest/v1/trips?id=eq.vuoksa2026&select=data" \
--          -H "apikey: <anon>" -H "Authorization: Bearer <anon>"
--     → ожидается пустой массив [] , а НЕ документ.
--
--  2. Команда читает по своему ключу:
--     curl -s -X POST "<url>/rest/v1/rpc/trip_read" \
--          -H "apikey: <anon>" -H "Authorization: Bearer <anon>" \
--          -H "Content-Type: application/json" \
--          -d '{"p_id":"vuoksa2026","p_key":"zdzua343"}'
--     → ожидается документ. С чужим ключом → «ключ не подходит».
--
--  ⚠️ Красивые ссылки `/vuoksa2026/Maks` ключа не несут (урок У-37): он берётся
--  из `?k=` или из запомненного в браузере. После закрытия чтения человек,
--  открывший такую ссылку на чужом телефоне, не увидит ЛИСТА ВОВСЕ — значит
--  на этот случай обязано быть объяснение словами и поле «вставьте свою ссылку».
--  Молчаливого пустого экрана быть не должно (постулат 5).
-- ═══════════════════════════════════════════════════════════════════════════
