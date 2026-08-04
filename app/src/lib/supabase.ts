/**
 * Связь с Supabase — тот же проект и тот же публичный ключ, что в боевой версии (src/online.js).
 *
 * Клиентскую библиотеку сознательно не подключаем: всё общение — обычный fetch к REST API
 * и один WebSocket к Realtime. Так сборка остаётся без лишних зависимостей, а офлайн-версия
 * собирается из того же исходника.
 *
 * Документ поездки — одна строка таблицы `trips`:
 *   id text primary key, data jsonb, updated_at timestamptz, author text
 * Обычный адрес открывает строку `vuoksa2026`; `?sandbox=1` — отдельную копию `vuoksa2026-test`,
 * в которой можно проверять что угодно, не трогая боевые данные.
 */

/** Проект и публичный (anon) ключ. Разграничение прав «джентльменское» — см. README. */
export const SB = {
  url: 'https://oagonfdnlgqkoosvgaly.supabase.co',
  key:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9hZ29uZmRubGdxa29vc3ZnYWx5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU3NTc4NTMsImV4cCI6MjEwMTMzMzg1M30.hpQyHLXKsmGVSTS-pFG66rtM_uF-8kXmj8ituNCvbww',
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

/** id строки в таблице `trips`. */
export const TRIP_ID: string = isSandbox() ? 'vuoksa2026-test' : 'vuoksa2026'

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
  if (!r.ok) throw new Error('HTTP ' + r.status)
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

/** Прочитать документ поездки. Пустой массив — строки ещё нет. */
export function fetchTrip(): Promise<TripRow[]> {
  return sbJson<TripRow[]>('trips?id=eq.' + TRIP_ID + '&select=data,updated_at,author')
}

/** Создать строку документа (или перезаписать, если её кто-то успел создать). */
export function insertTrip(data: unknown, stamp: string, author: string): Promise<TripRow[]> {
  return sbJson<TripRow[]>('trips', {
    method: 'POST',
    body: [{ id: TRIP_ID, data, updated_at: stamp, author }],
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
): Promise<TripRow[]> {
  const r = await sbFetch('rpc/trip_write?select=updated_at', {
    method: 'POST',
    body: {
      p_trip: TRIP_ID,
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
): Promise<TripRow[]> {
  return sbJson<TripRow[]>(
    'trips?id=eq.' + TRIP_ID + '&updated_at=eq.' + encodeURIComponent(seenAt),
    { method: 'PATCH', rep: true, body: { data, updated_at: stamp, author } },
  )
}

/**
 * Крошечный сигнал «документ изменился» в таблицу `trip_pings`.
 * По нему остальные забирают свежую версию — сам документ по сети в событии не гоняем.
 */
export async function pingTrip(author: string): Promise<string> {
  const stamp = new Date().toISOString()
  const out = await sbJson<{ updated_at: string }[]>('trip_pings', {
    method: 'POST',
    body: [{ trip_id: TRIP_ID, updated_at: stamp, author }],
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
  })
  return out && out[0] ? out[0].updated_at : stamp
}
