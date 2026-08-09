/**
 * Связь с Supabase — тот же проект и тот же публичный ключ, что в боевой версии (src/online.js).
 *
 * Клиентскую библиотеку сознательно не подключаем: всё общение — обычный fetch к REST API
 * и один WebSocket к Realtime. Так сборка остаётся без лишних зависимостей, а офлайн-версия
 * собирается из того же исходника.
 *
 * Документ поездки — одна строка таблицы `trips`:
 *   id text primary key, data jsonb, updated_at timestamptz, author text, owner_email text
 * Поездок много: какая открыта — решает `?trip=<id>` в адресе, а без него запомненная
 * в браузере или `vuoksa2026`. `?sandbox=1` и любой запуск с локальной машины дописывают
 * к имени «-test»: проверять можно что угодно, не трогая боевые данные.
 */

/**
 * Где живёт лист.
 *
 * ⛔ 09.08.2026 переехали с Supabase на свой сервер (папка `server/`, выложен
 * на Vercel). Причина: у бесплатного Supabase кончился лимит исходящего трафика,
 * и лист перестал открываться у ВСЕХ — любой запрос отвечал `402` (урок У-171).
 * Кодом такую квоту не вернуть, а лист нужен рабочим каждый день.
 *
 * Точки входа новый сервер повторяет ОДИН В ОДИН — те же `rpc/trip_read`,
 * `rpc/trip_write`, `rpc/trip_owner`, `rpc/trip_list` и `trip_pings`, те же тела
 * запросов и ответов. Поэтому здесь меняется адрес, а не модель данных и не
 * формат документа (постулат 4): весь остальной код `lib/` не тронут.
 *
 * `key` остался прежним и уходит заголовком `apikey`: новый сервер его не
 * спрашивает, права он проверяет по личному ключу человека внутри документа.
 * Убирать не стали — это публичный ключ, он и так лежал в коде сайта, а лишняя
 * правка здесь ничего не улучшает.
 */
export const SB = {
  url: 'https://pine-to-pine-api.vercel.app',
  key:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9hZ29uZmRubGdxa29vc3ZnYWx5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU3NTc4NTMsImV4cCI6MjEwMTMzMzg1M30.hpQyHLXKsmGVSTS-pFG66rtM_uF-8kXmj8ituNCvbww',
  /**
   * Есть ли у сервера сокет живых событий.
   *
   * ⛔ У своего сервера его нет: Vercel — это отдельные вызовы функции, держать
   * открытое соединение там нечем. Приложение это переживает — свежесть ловится
   * меткой `trip_pings`, — но полоска «кто сейчас в листе» (`PresenceStack`)
   * при этом пуста: показывать некому. Названо вслух, а не спрятано (постулат 5).
   */
  realtime: false,
}

/** Адресная строка; вынесено отдельной функцией — так проще звать из тестов. */
function search(): string {
  return typeof location === 'undefined' ? '' : location.search || ''
}

/**
 * true — открыта песочница.
 *
 * Два случая. Первый — явный `?sandbox=1`. Второй — любой запуск с локальной машины:
 * 4 августа 2026 боевую строку пять раз затирали вкладки, открытые на `localhost`
 * по «голому» адресу без `?u=`, — такой адрес даёт права владельца и пишет в боевой
 * документ. Проверять на своей машине боевые данные незачем никогда, поэтому
 * localhost теперь песочница безусловно, забыть про `?sandbox=1` больше нельзя.
 */
export function isSandbox(): boolean {
  if (/[?&]sandbox=1/.test(search())) return true
  const host = typeof location === 'undefined' ? '' : location.hostname || ''
  return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]'
}

/* ─────────── какая поездка сейчас открыта ───────────
   Раньше здесь стояла одна зашитая строка. С 04.08.2026 поездок много (заказчик:
   «у меня этих поездок будет дофига»), поэтому id — значение, а не константа.

   Откуда он берётся, по убыванию важности:
     1. адрес: `?trip=<id>` — читаемый и пересылаемый;
     2. запомненная в браузере поездка (новый ключ `flops.trip`; `flops.doc`,
        `flops.theme` и `flops.auth` не трогаем — переименование стёрло бы людям
        тему и личность);
     3. `vuoksa2026` — тот же лист, что открывался всегда.

   Песочница остаётся песочницей при любом id: на localhost к имени всегда
   дописывается «-test», и попасть с своей машины в боевую строку нельзя
   (04.08.2026 её так затирали пять раз). */

/** Поездка, которая открывается, когда в адресе ничего не указано. */
const DEFAULT_TRIP = 'vuoksa2026'

/** Где браузер помнит выбранную поездку. Ключ НОВЫЙ — старые ключи не трогаем. */
const TRIP_KEY = 'flops.trip'

/** Допустимое имя строки: латиница, цифры и дефис. Всё прочее — чужое. */
const TRIP_RE = /^[a-z0-9][a-z0-9-]{1,39}$/

/** Дописать «-test», если работаем с локальной машины. */
function sandboxed(id: string): string {
  return isSandbox() && !id.endsWith('-test') ? id + '-test' : id
}

function tripFromSearch(): string {
  const m = search().match(/[?&]trip=([^&]*)/)
  return m ? decodeURIComponent(m[1]).trim().toLowerCase() : ''
}

function tripRemembered(): string {
  try {
    return (localStorage.getItem(TRIP_KEY) || '').trim().toLowerCase()
  } catch {
    return ''
  }
}

function resolveTrip(): string {
  const q = tripFromSearch()
  if (TRIP_RE.test(q)) return q
  const r = tripRemembered()
  if (TRIP_RE.test(r)) return r
  return DEFAULT_TRIP
}

/**
 * id строки в таблице `trips`.
 *
 * ⚠️ Это `let`, а не `const`, и на то есть причина: модули, импортировавшие имя
 * (`lib/sync.ts`, `lib/auth.ts`), видят живую связь и всегда читают текущее
 * значение. Так смена поездки не требует их переписывать.
 */
export let TRIP_ID: string = sandboxed(resolveTrip())

/** Какая поездка открыта сейчас. */
export function currentTripId(): string {
  return TRIP_ID
}

/** Поездка по умолчанию (с поправкой на песочницу) — та, что открывалась всегда. */
export function defaultTripId(): string {
  return sandboxed(DEFAULT_TRIP)
}

/** Открыта ли поездка по умолчанию. От этого зависит ключ документа в браузере. */
export function isDefaultTrip(): boolean {
  return TRIP_ID === defaultTripId()
}

/**
 * Имя строки для поездки с таким именем.
 *
 * ⚠️ Через эту функцию обязано проходить ЛЮБОЕ обращение к чужой поездке
 * (список, дублирование, удаление): на локальной машине она дописывает «-test»,
 * и боевые строки с рабочего компьютера остаются недосягаемы. 04.08.2026 боевую
 * строку затирали пять раз именно потому, что такой заслонки не было.
 */
export function tripRowId(id: string): string {
  return sandboxed(id)
}

/** Запомнить поездку в браузере, чтобы короткий адрес открывал её же. */
export function rememberTrip(id: string): void {
  if (!TRIP_RE.test(id)) return
  try {
    localStorage.setItem(TRIP_KEY, id.replace(/-test$/, ''))
  } catch {
    /* приватный режим — поездка проживёт до перезагрузки */
  }
}

/**
 * Сменить открытую поездку без перезагрузки. Нужно проверкам; в самом приложении
 * поездка меняется переходом по адресу `?trip=…`, чтобы вместе с ней перечитались
 * документ, права и присутствие.
 */
export function setTripId(id: string): void {
  if (!TRIP_RE.test(id)) return
  TRIP_ID = sandboxed(id)
}

/* Адрес важнее памяти, но и память надо держать в согласии с адресом: иначе
   человек, перешедший по ссылке на другую поездку, при следующем коротком
   заходе снова оказался бы в прежней. */
rememberTrip(resolveTrip())

/** Строка документа, как её отдаёт PostgREST. */
export interface TripRow {
  data: unknown
  updated_at: string
  author?: string
}

interface FetchOpts {
  method?: string
  body?: unknown
  /** просить вернуть записанные строки (Prefer: return=representation) */
  rep?: boolean
  headers?: Record<string, string>
  signal?: AbortSignal
}

/**
 * Токен вошедшего владельца (Supabase Auth). Пока никто не вошёл — null, и запросы
 * идут от anon-ключа, как раньше. Значение ставит `lib/auth.ts`; связь односторонняя,
 * чтобы не заводить круговой импорт между модулями.
 *
 * Когда на таблице `trips` включат RLS по `auth.uid()`, право записи будет именно
 * у этого токена, а не у anon-ключа (см. docs/rls-migration.sql).
 */
let authToken: string | null = null

/** Поставить или снять токен вошедшего. Зовётся только из lib/auth.ts. */
export function setAuthToken(token: string | null): void {
  authToken = token
}

/** Запрос к REST API Supabase. Путь — без ведущего слэша: `trips?id=eq.…`. */
export function sbFetch(path: string, opts: FetchOpts = {}): Promise<Response> {
  const h: Record<string, string> = { ...(opts.headers || {}) }
  h['apikey'] = SB.key
  h['Authorization'] = 'Bearer ' + (authToken || SB.key)
  h['Content-Type'] = 'application/json'
  if (opts.rep) h['Prefer'] = 'return=representation'
  return fetch(SB.url + '/rest/v1/' + path, {
    method: opts.method || 'GET',
    headers: h,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    signal: opts.signal,
  })
}

/** То же, но сразу разбирает JSON и роняет промис на не-200. */
export async function sbJson<T>(path: string, opts: FetchOpts = {}): Promise<T> {
  const r = await sbFetch(path, opts)
  if (!r.ok) {
    const quota = quotaOrNull(r.status)
    if (quota) throw quota
    throw new Error('HTTP ' + r.status)
  }
  return (await r.json()) as T
}

/** Адрес сокета Realtime (протокол Phoenix). */
export function realtimeUrl(): string {
  return (
    SB.url.replace(/^http/, 'ws') +
    '/realtime/v1/websocket?apikey=' +
    encodeURIComponent(SB.key) +
    '&vsn=1.0.0'
  )
}

/**
 * Прочитать документ поездки ПРЯМЫМ запросом. Пустой массив — строки ещё нет.
 * Без второго довода читается открытая поездка; с ним — любая другая
 * (так «Мои поездки» дублируют чужой лист, не открывая его).
 *
 * ⚠️ Прямой путь. После применения `docs/rls-apply-e.sql` он закрыт для всех —
 * остаётся только на время, пока функции `trip_read` в базе нет. Звать его
 * напрямую больше неоткуда: все читают через `loadTrip()` ниже.
 */
export function fetchTrip(trip: string = TRIP_ID): Promise<TripRow[]> {
  return sbJson<TripRow[]>('trips?id=eq.' + trip + '&select=data,updated_at,author')
}

/** Создать строку документа (или перезаписать, если её кто-то успел создать). */
export function insertTrip(
  data: unknown,
  stamp: string,
  author: string,
  trip: string = TRIP_ID,
): Promise<TripRow[]> {
  return sbJson<TripRow[]>('trips', {
    method: 'POST',
    body: [{ id: trip, data, updated_at: stamp, author }],
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
  })
}

/**
 * Ключ не подошёл: функция базы отказала в записи. Отдельный класс нужен, чтобы
 * показать человеку понятное «откройте свою личную ссылку», а не общее «не ушло».
 */
export class KeyRejected extends Error {}

/**
 * Функции `trip_write` в базе ещё нет. Бывает в переходный период: код уже выложен,
 * а SQL из `docs/rls-apply-b.sql` ещё не применён. Тогда работаем как раньше, прямой
 * записью — она в этот момент ещё разрешена, потому что RLS тоже не включён.
 */
export class RpcMissing extends Error {}

/**
 * Проект Supabase приостановлен: исчерпан бесплатный лимит исходящего трафика
 * либо упёрлись в потолок расходов. Сервер отвечает 402 на ЛЮБОЙ запрос — и на
 * чтение, и на запись, и на список поездок.
 *
 * Отдельный класс нужен, потому что человеку об этом надо сказать иначе, чем
 * про обрыв связи: связь как раз есть, кнопка «повторить» не поможет, а правки
 * при этом целы и лежат в браузере. 09.08.2026 заказчик увидел «нет связи
 * с сервером» и прочитал это как поломку листа (урок У-171).
 */
export class QuotaExceeded extends Error {}

/** Ответ 402 значит одно и то же на всех путях — узнаём его в одном месте. */
function quotaOrNull(status: number): QuotaExceeded | null {
  return status === 402 ? new QuotaExceeded('лимит проекта исчерпан') : null
}

/**
 * Запись через функцию базы `trip_write` — единственный путь, когда включён RLS
 * (см. docs/rls-apply-b.sql). Функция сама сверяет личный ключ человека со списком
 * людей в документе НА СЕРВЕРЕ, поэтому подделать своего человека нельзя.
 *
 * `seenAt` — метка, которую мы видели: условная запись, как и раньше. `null` значит
 * «строки на сервере ещё нет», и функция её создаёт.
 *
 * Просим вернуть только `updated_at`: документ весит под мегабайт, и гонять его
 * обратно на каждой записи незачем (прежний PATCH это делал).
 */
export async function rpcTripWrite(
  seenAt: string | null,
  data: unknown,
  stamp: string,
  author: string,
  key: string,
  trip: string = TRIP_ID,
): Promise<TripRow[]> {
  const r = await sbFetch('rpc/trip_write?select=updated_at', {
    method: 'POST',
    body: {
      p_trip: trip,
      p_key: key,
      p_data: data,
      p_seen: seenAt,
      p_stamp: stamp,
      p_author: author,
    },
  })
  /* PostgREST отвечает 404 с кодом PGRST202, когда такой функции в схеме нет */
  if (r.status === 404) throw new RpcMissing('функции trip_write в базе нет')
  if (!r.ok) {
    let text = ''
    try {
      text = await r.text()
    } catch {
      /* тела нет — обойдёмся кодом ответа */
    }
    if (text.includes('ключ не подходит')) throw new KeyRejected('ключ не подходит')
    throw new Error('HTTP ' + r.status)
  }
  return (await r.json()) as TripRow[]
}

/**
 * Чтение через функцию базы `trip_read` — единственный путь, когда закрыт прямой
 * SELECT (см. docs/rls-apply-e.sql). Функция сверяет личный ключ человека со списком
 * людей в документе НА СЕРВЕРЕ — ровно так же, как это делает `trip_write`.
 *
 * Требование заказчика 05.08.2026: «чтобы не было доступа у человека, который зашёл
 * на pine-to-pine.com… чтобы в публичном доступе не была информация». Одной заглушки
 * на экране мало: anon-ключ лежит в коде сайта, то есть публичен по своей природе,
 * и до этой правки `GET /rest/v1/trips` отдавал весь документ кому угодно.
 */
export function rpcTripRead(key: string, trip: string = TRIP_ID): Promise<TripRow[]> {
  return rpcRows<TripRow>('trip_read', { p_id: trip, p_key: key })
}

/**
 * Почта владельца строки — той же функцией и по тому же ключу. Пока прямой SELECT
 * был открыт, `lib/auth.ts` читал колонку `owner_email` запросом; после
 * `docs/rls-apply-e.sql` колонка недоступна, а решать по ней надо.
 */
export function rpcTripOwner(
  key: string,
  trip: string = TRIP_ID,
): Promise<{ owner_email: string | null }[]> {
  return rpcRows<{ owner_email: string | null }>('trip_owner', { p_id: trip, p_key: key })
}

/** Строка списка «Мои поездки», как её отдаёт функция `trip_list`. */
export interface TripListRow {
  id: string
  updated_at: string
  author?: string | null
  owner_email?: string | null
  title?: string | null
}

/** Поездки, в команде которых есть человек с этим ключом. Чужих не отдаёт. */
export function rpcTripList(key: string): Promise<TripListRow[]> {
  return rpcRows<TripListRow>('trip_list', { p_key: key })
}

/**
 * Общая часть читающих функций базы: разбор ответа и два особых случая —
 * функции ещё нет (переходный период) и ключ не подошёл (человек не из поездки).
 */
async function rpcRows<T>(name: string, body: unknown): Promise<T[]> {
  const r = await sbFetch('rpc/' + name, { method: 'POST', body })
  /* PostgREST отвечает 404 с кодом PGRST202, когда такой функции в схеме нет */
  if (r.status === 404) throw new RpcMissing('функции ' + name + ' в базе нет')
  const quota = quotaOrNull(r.status)
  if (quota) throw quota
  if (!r.ok) {
    let text = ''
    try {
      text = await r.text()
    } catch {
      /* тела нет — обойдёмся кодом ответа */
    }
    if (text.includes('ключ не подходит')) throw new KeyRejected('ключ не подходит')
    throw new Error('HTTP ' + r.status)
  }
  const rows = (await r.json()) as T[]
  return Array.isArray(rows) ? rows : []
}

/**
 * Функции `trip_read` в базе ещё нет — выяснили один раз и больше не стучимся.
 * Переходный период: код выложен, а SQL из `docs/rls-apply-e.sql` ещё не применён.
 * Ровно так же ведёт себя запись (`Sync.rpcGone` в lib/sync.ts).
 */
let readRpcGone = false

/**
 * Прочитать документ поездки: через функцию, а пока её в базе нет — прямым запросом.
 * Единственный вход для всех, кто читает лист, — и синхронизация, и «Мои поездки».
 *
 * `key` — личный ключ человека. Пустой ключ функция не принимает, и это правильно:
 * посторонний не должен получить документ (`KeyRejected`).
 */
export async function loadTrip(key: string, trip: string = TRIP_ID): Promise<TripRow[]> {
  if (!readRpcGone) {
    try {
      return await rpcTripRead(key, trip)
    } catch (e) {
      if (!(e instanceof RpcMissing)) throw e
      readRpcGone = true
    }
  }
  const rows = await fetchTrip(trip)
  if (rows.length) return rows

  /* ⛔ Пустой ответ прямого чтения значит ДВЕ РАЗНЫЕ вещи, и цена ошибки — боевой
     документ. Либо строки правда нет (новая поездка), либо SELECT закрыли, пока
     эта вкладка была открыта, и сервер вежливо отдал `[]` вместо отказа. По первому
     прочтению приложение создаёт строку заново из своей копии (`Sync.pull`), то есть
     затирает лист всей команды — это У-07 в новой одежде.
     Поэтому переспрашиваем функцию: она либо отдаст документ, либо честно откажет
     по ключу, либо снова скажет, что её нет. Стоит это одного запроса и только там,
     где ответ и так оказался пустым. */
  readRpcGone = false
  try {
    return await rpcTripRead(key, trip)
  } catch (e) {
    if (!(e instanceof RpcMissing)) throw e
    readRpcGone = true
  }
  return rows
}

/**
 * Условная запись: пишем, только если на сервере всё ещё та метка, которую мы видели.
 * Пустой ответ — кто-то записал раньше нас, цикл надо повторить.
 *
 * Прямой путь. После включения RLS он закрыт для всех — остаётся только на время,
 * пока функция `trip_write` в базе не заведена.
 */
export function patchTrip(
  seenAt: string,
  data: unknown,
  stamp: string,
  author: string,
  trip: string = TRIP_ID,
): Promise<TripRow[]> {
  return sbJson<TripRow[]>(
    'trips?id=eq.' + trip + '&updated_at=eq.' + encodeURIComponent(seenAt),
    { method: 'PATCH', rep: true, body: { data, updated_at: stamp, author } },
  )
}

/**
 * Метка последней правки из таблицы-сигнала — БЕЗ документа.
 *
 * ⛔ Ради чего заведено. Документ поездки весит около мегабайта, и почти весь этот
 * вес — картинки: обложка 602 КБ и лица команды 429 КБ (замер по снимку
 * `backups/prod-2026-08-09-p31-start.json`). Опрос сервера тянул документ ЦЕЛИКОМ
 * каждую минуту при живом сокете и каждые 8 секунд без него — то есть 65 МБ в час
 * с одной открытой вкладки, 486 МБ в час без сокета. Бесплатные 5 ГБ исходящего
 * трафика Supabase выбираются за несколько суток, после чего проект отвечает 402
 * на всё подряд и лист не открывается ни у кого (урок У-171).
 *
 * Здесь читается одна строка с одной колонкой — десятки байт вместо мегабайта.
 * Документ забирается, только если метка изменилась.
 *
 * Три исхода, и путать их нельзя:
 * · метка — спросили, правки были;
 * · `''` — спросили, а сигнала по этой поездке ещё нет (никто не писал);
 * · `null` — спросить НЕ вышло: таблицы нет, доступ закрыт или сеть молчит.
 *   Тогда зовущий обязан вести себя как раньше — сходить за документом, —
 *   иначе чужая правка не приедет никогда.
 */
export async function loadStamp(trip: string = TRIP_ID): Promise<string | null> {
  const r = await sbFetch(
    'trip_pings?trip_id=eq.' + encodeURIComponent(trip) + '&select=updated_at&limit=1',
  )
  const quota = quotaOrNull(r.status)
  if (quota) throw quota
  if (!r.ok) return null
  try {
    const rows = (await r.json()) as { updated_at?: string }[]
    if (!Array.isArray(rows)) return null
    return rows.length ? rows[0].updated_at || '' : ''
  } catch {
    return null
  }
}

/**
 * Крошечный сигнал «документ изменился» в таблицу `trip_pings`.
 * По нему остальные забирают свежую версию — сам документ по сети в событии не гоняем.
 */
export async function pingTrip(author: string, trip: string = TRIP_ID): Promise<string> {
  const stamp = new Date().toISOString()
  const out = await sbJson<{ updated_at: string }[]>('trip_pings', {
    method: 'POST',
    body: [{ trip_id: trip, updated_at: stamp, author }],
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
  })
  return out && out[0] ? out[0].updated_at : stamp
}
