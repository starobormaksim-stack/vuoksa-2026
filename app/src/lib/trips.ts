/**
 * ═══════════════ Поездок много ═══════════════
 *
 * Заказчик 04.08.2026: «Я хочу, чтобы была возможность иметь список поездок. Одна из
 * поездок называется Вуокса-2026. У меня этих поездок будет дофига, и каждый раз я буду
 * создавать новую базу либо дублировать старую. То есть где-то должен быть список поездок».
 *
 * Здесь всё, что касается поездки как целого: список, создание, дублирование,
 * переименование, удаление и переход между ними. Сам документ поездки живёт в `store.ts`,
 * связь с сервером — в `lib/supabase.ts`, и трогать их правила этот файл не имеет права.
 *
 * ─── Как устроен идентификатор ───
 * `TRIP_ID` в `lib/supabase.ts` больше не константа, а значение: адрес `?trip=<id>`,
 * иначе запомненная браузером поездка (новый ключ `flops.trip`), иначе `vuoksa2026`.
 * На локальной машине к имени всегда дописывается «-test» — песочница остаётся
 * песочницей при любом id.
 *
 * ─── Чего этот файл не делает ───
 * Ничего не пишет в открытую поездку: её ведёт `store.ts` через `Sync`. Все действия
 * ниже адресные — они называют строку явным доводом.
 *
 * ─── Что должна уметь база ───
 * Заводится поездка функцией `trip_write` (она есть с docs/rls-apply-b.sql), а удаляется
 * прямым DELETE, который разрешён политикой из docs/rls-apply-d.sql. Пока этот файл
 * в базе не выполнен, удаление отвечает отказом — и человек читает об этом словами,
 * а не смотрит на молчащую кнопку.
 */

import type { Person, State } from './types.ts'
import { clone } from './merge.ts'
import seedJson from '../data/seed-base.json'
import { readKey } from './perm.ts'
import {
  currentTripId,
  defaultTripId,
  insertTrip,
  isDefaultTrip,
  KeyRejected,
  loadTrip,
  rememberTrip,
  RpcMissing,
  rpcTripList,
  rpcTripWrite,
  sbFetch,
  sbJson,
  tripRowId,
} from './supabase.ts'

/**
 * Ключ, с которым этот браузер ходит за чужими листами («Мои поездки»).
 * Подтверждать его здесь не с чем — документа чужой поездки у нас нет; сверит
 * его сервер (`trip_read` в docs/rls-apply-e.sql).
 */
function savedKey(): string {
  /* Тот же порядок, что и у листа: ключ из адреса важнее запомненного. Брать только
     запомненный нельзя — человек, пришедший по свежей ссылке в чистом браузере,
     остался бы без списка своих поездок. */
  return readKey(null)
}

/**
 * ⛔ Заводской сид — ТОЛЬКО строение листа и справочники.
 *
 * Ни одного человека, ни одной вещи, ни одной покупки, ни одной точки маршрута.
 * Причина куплена дорого (урок У-65): всё, что импортирует приложение, уезжает
 * в публичный файл сайта `assets/index-*.js`. Пока сюда был подключён полный
 * `seed-v2.json`, посторонний читал имена, 105 сборов, 53 закупки, маршрут,
 * технику и — главное — ЛИЧНЫЕ КЛЮЧИ всех четверых, не сделав ни одного запроса
 * к базе. Никакой замок на стороне базы этого не закрывает: ключ от замка висел
 * рядом на гвозде.
 *
 * Правило на будущее: в `app/src/data/seed-base.json` кладётся только то, что
 * не жалко отдать любому прохожему, — виды транспорта, единицы, разделы сборов
 * и закупки, валюта, умолчания расчёта. Данные поездки приезжают ТОЛЬКО
 * с сервера, по личному ключу.
 *
 * Полный образец поездки жив и никуда не делся — `app/fixtures/seed-sample.json`.
 * Он лежит ВНЕ `app/src/`, поэтому сборка его не видит физически, а не по
 * договорённости. Его читает с диска `app/scripts/check-sums.mjs`: контрольные
 * цифры 330 км · 21 385 / 26 005 / 47 390 / 11 848 ₽ · 2 канистры считаются
 * по нему. ⚠️ Появился новый справочник или вид транспорта — дописать в ОБА
 * файла: приложение живёт базовым, проверки — образцом.
 */
const SEED = seedJson as unknown as State

/* ─────────── ключи в браузере ───────────
   ⚠️ `flops.doc`, `flops.theme` и `flops.auth` НЕ переименовываем: это стёрло бы
   людям документ, тему и личность. Для поездок, кроме той, что была всегда,
   заводятся НОВЫЕ ключи с именем поездки на конце. */

/**
 * Где лежит документ этой поездки. У поездки по умолчанию ключ прежний.
 *
 * ⛔ Внутри офлайн-копии ключ берётся из самого файла (`__PINE_KEY__`, его
 * вшивает `lib/offline.ts`). Причина: в копии адрес `file:`, в нём нет ни
 * `?trip=`, ни памяти браузера сайта, — и по обычным правилам копия ЛЮБОЙ
 * поездки считала бы себя первой. Тогда копия второй поездки показывала бы
 * документ первой как свой (урок У-62).
 *
 * ⚠️ Лечится только ПАРОЙ: и чтение (загрузчик `BOOT` в `offline.ts`), и запись
 * (`store.ts` через эту функцию) идут по одному имени. Поменять что-то одно —
 * значит получить копию, которая не находит собственных правок и молча
 * откатывается на вшитый снимок; это пробовали 05.08.2026 и откатили.
 * Старая копия без `__PINE_KEY__` ведёт себя ровно как прежде.
 */
export function docKey(): string {
  const w = typeof window === 'undefined' ? null : (window as { __PINE_KEY__?: string })
  const вшитый = w && typeof w.__PINE_KEY__ === 'string' ? w.__PINE_KEY__ : ''
  if (вшитый) return вшитый
  return isDefaultTrip() ? 'flops.doc' : 'flops.doc.' + currentTripId()
}

/** Какие поездки этот браузер уже открывал. */
const SEEN_KEY = 'flops.trips'

function seenTrips(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(SEEN_KEY) || '[]') as unknown
    return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

function rememberSeen(id: string): void {
  const list = seenTrips()
  if (list.includes(id)) return
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify([...list, id].slice(-40)))
  } catch {
    /* приватный режим — список проживёт до перезагрузки */
  }
}

function forgetTripLocally(id: string): void {
  try {
    localStorage.removeItem('flops.doc.' + id)
    localStorage.setItem(SEEN_KEY, JSON.stringify(seenTrips().filter((x) => x !== id)))
  } catch {
    /* приватный режим — забывать нечего */
  }
}

/* ─────────── заводской шаблон ─────────── */

/**
 * Что берётся из заводского сида в НОВУЮ поездку: справочники и настройки документа.
 * Списки самой поездки (вещи, закупка, маршрут, техника, меню) — чужие, они не едут.
 * Разделы сборов и закупки едут: это не чужие данные, а строение листа.
 */
function template(): State {
  const s = clone(SEED)
  const dist = { ...s.trip.dist, src: 'manual' as const, auto: 0, manual: 0, local: 0 }
  return {
    ...s,
    updatedAt: '',
    me: '',
    author: '',
    del: {},
    trip: {
      ...s.trip,
      title: 'Новая поездка',
      sub: '',
      dates: '',
      datesAuto: true,
      places: [],
      route: '',
      note: '',
      hero: '',
      dist,
    },
    people: [],
    gear: [],
    buy: [],
    route: [],
    ideas: [],
    menu: [],
    transport: [],
    rent: [],
    canRows: [],
    weather: {},
  }
}

/**
 * Сид, из которого добирается недостающее в ОТКРЫТУЮ поездку (`store.ts`).
 *
 * Справочники доезжают в любую поездку — по ним живут расчёты. Данных поездки
 * в сиде нет ни у кого: Вуокса приезжает с сервера по личному ключу.
 * `template()` вдобавок гасит название и настройки расчёта — новая поездка
 * не должна начинаться с чужих чисел.
 */
export function seedFor(): State {
  return isDefaultTrip() ? SEED : template()
}

/* ─────────── имена и ключи ─────────── */

const RU_LAT: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i',
  й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't',
  у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '',
  э: 'e', ю: 'yu', я: 'ya',
}

/** Латиницей — для адреса поездки и для личной ссылки человека. */
export function translit(text: string): string {
  return (text || '')
    .toLowerCase()
    .split('')
    .map((c) => (RU_LAT[c] !== undefined ? RU_LAT[c] : c))
    .join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** Случайные восемь знаков — такие же ключи, как у людей в сиде. */
function rnd(len = 8): string {
  const abc = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let out = ''
  const buf = new Uint32Array(len)
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(buf)
  for (let i = 0; i < len; i++) {
    const n = buf[i] || Math.floor(Math.random() * 4294967296)
    out += abc[n % abc.length]
  }
  return out
}

/** Читаемое имя строки из названия поездки: «Вуокса · 2027» → `vuoksa-2027`. */
export function tripIdFrom(title: string): string {
  const base = translit(title).slice(0, 28).replace(/^-+|-+$/g, '')
  const head = /^[a-z0-9]/.test(base) ? base : 'poezdka'
  return (head + '-' + rnd(4)).slice(0, 40)
}

/* ─────────── переход между поездками ─────────── */

/** Кто открывает поездку: имя в адресе и личный ключ. */
export interface TripCred {
  u: string
  k: string
}

/**
 * Адрес поездки. Читаемый и пересылаемый: `?trip=<id>`.
 *
 * ⛔ Личная ссылка ПРЕЖНЕЙ поездки к новой отношения не имеет — `u` и `k` из
 * адреса убираются, иначе человек открыл бы новую поездку под чужим именем.
 * Но и без ключа вовсе уходить нельзя: после `docs/rls-apply-e.sql` лист
 * читается только по ключу кого-то из своей команды, и создатель новой поездки
 * остался бы за дверью собственного листа. Поэтому тот, кто ключ знает
 * (`createTrip`, `duplicateTrip`), передаёт его сюда явно.
 */
export function tripHref(id: string, cred?: TripCred): string {
  const q = new URLSearchParams(typeof location === 'undefined' ? '' : location.search)
  q.delete('u')
  q.delete('k')
  if (cred && cred.k) {
    q.set('u', cred.u)
    q.set('k', cred.k)
  }
  q.set('trip', id.replace(/-test$/, ''))
  const path = typeof location === 'undefined' ? '/' : location.pathname
  return path + '?' + q.toString()
}

/**
 * Открыть другую поездку. Полная перезагрузка страницы, и это не лень: вместе
 * с поездкой обязаны перечитаться документ, права, присутствие и канал изменений.
 */
export function openTrip(id: string, cred?: TripCred): void {
  rememberTrip(id)
  rememberSeen(tripRowId(id))
  location.assign(tripHref(id, cred))
}

/**
 * Открыть «Мои поездки» адресом `?trips=1`.
 * Нужно тем местам, что живут вне `App.tsx` и своего состояния не имеют, —
 * например меню «⋯» в шапке.
 */
export function openTripsList(): void {
  const q = new URLSearchParams(location.search)
  q.set('trips', '1')
  location.assign(location.pathname + '?' + q.toString())
}

/**
 * Убрать `?trips=1` из адреса, не перезагружая страницу.
 *
 * Нужно при возврате к поездке: без этого человек нажимает «К поездке», видит
 * поездку — а после обновления страницы снова оказывается в списке, потому что
 * метка так и осталась в адресе. Личная ссылка (`u`, `k`, `trip`) не трогается.
 */
export function closeTripsList(): void {
  if (typeof location === 'undefined' || typeof history === 'undefined') return
  const q = new URLSearchParams(location.search)
  if (!q.has('trips')) return
  q.delete('trips')
  const s = q.toString()
  history.replaceState(null, '', location.pathname + (s ? '?' + s : '') + location.hash)
}

/* ─────────── список поездок ─────────── */

/** Строка списка «Мои поездки». */
export interface TripCard {
  id: string
  title: string
  /** метка последней правки, ISO */
  updatedAt: string
  /** имя того, кто правил последним */
  author: string
  /** почта владельца строки; '' — строка ещё ничья */
  ownerEmail: string
  /** закреплена за моей почтой — только такие можно убирать */
  mine: boolean
  /** сейчас открыта */
  current: boolean
}

/** Ответ на вопрос «какие у меня есть поездки». */
export interface TripsIndex {
  ok: boolean
  /** что сказать человеку словами, если список неполон или не пришёл */
  why: string
  items: TripCard[]
}

interface IndexRow {
  id: string
  updated_at?: string
  author?: string | null
  owner_email?: string | null
  title?: string | null
}

/**
 * Забрать список поездок.
 *
 * Документ целиком не тянем: он весит под мегабайт, а на экране нужны только имя
 * и метка. Название берём прямо из jsonb — `data->trip->>title`.
 *
 * Показываем не всё подряд, хотя читать таблицу разрешено любому: свои (почта
 * совпала с `owner_email`), открытую сейчас и те, что этот браузер уже открывал.
 * Чужие поездки человека не касаются.
 */
export async function listTrips(email: string): Promise<TripsIndex> {
  const mail = (email || '').trim().toLowerCase()
  const here = currentTripId()
  const seen = new Set([here, ...seenTrips()])
  let why = ''
  let rows: IndexRow[] = []

  /* Сначала через функцию: после `docs/rls-apply-e.sql` таблица не читается вовсе,
     а поездки отдаёт `trip_list` — и только те, в чьей команде есть человек с этим
     ключом. Пока функции в базе нет, работает прежний прямой запрос. */
  let rpcGone = false
  try {
    rows = await rpcTripList(savedKey())
  } catch (e) {
    if (e instanceof KeyRejected) {
      return {
        ok: false,
        why:
          'Поездки закрыты от посторонних, и ключа у этого браузера нет. Откройте свою ' +
          'личную ссылку — ту, что прислал владелец, — и список появится.',
        items: [],
      }
    }
    if (!(e instanceof RpcMissing)) {
      return { ok: false, why: 'Нет связи с сервером — список поездок не пришёл.', items: [] }
    }
    rpcGone = true
  }

  if (rpcGone) {
    try {
      rows = await sbJson<IndexRow[]>(
        'trips?select=id,updated_at,author,owner_email,title:data->trip->>title&order=updated_at.desc',
      )
    } catch {
      /* Колонки владельца может ещё не быть — тогда PostgREST отвечает отказом на весь
         запрос. Пробуем самое простое: имена строк сервер отдаёт всегда, а список
         показать надо в любом случае (молчаливых отказов не бывает). */
      try {
        rows = await sbJson<IndexRow[]>('trips?select=id,updated_at,author&order=updated_at.desc')
        why =
          'База пока не знает, за кем закреплена поездка, — не хватает одной настройки. ' +
          'Поэтому вместо названий видны имена строк, а убирать поездки нельзя. ' +
          'Что сделать — в файле docs/trips-steps.md.'
      } catch {
        return { ok: false, why: 'Нет связи с сервером — список поездок не пришёл.', items: [] }
      }
    }
  }

  const items = rows
    .map((r): TripCard => {
      const own = (r.owner_email || '').trim().toLowerCase()
      return {
        id: r.id,
        title: (r.title || '').trim() || r.id,
        updatedAt: r.updated_at || '',
        author: r.author || '',
        ownerEmail: own,
        mine: !!mail && own === mail,
        current: r.id === here,
      }
    })
    .filter((t) => t.mine || seen.has(t.id))

  return { ok: true, why, items }
}

/* ─────────── заведение, дублирование, переименование, удаление ─────────── */

/** Чем кончилось действие над поездкой. */
export interface TripResult {
  ok: boolean
  /** id получившейся поездки ('' — не получилось) */
  id: string
  /** что показать человеку словами; при удаче — короткое подтверждение */
  why: string
  /**
   * Чем открывать заведённую поездку: имя и личный ключ её владельца.
   * Без него создатель попадёт в собственный новый лист без ключа, а лист
   * закрыт от неопознанных — и это выглядело бы как «поездка не завелась».
   */
  cred?: TripCred
}

/**
 * Не давать двум поездкам одно имя строки.
 *
 * ⚠️ Это ТОЛЬКО быстрая проба, а не защита. После `docs/rls-apply-e.sql` прямой
 * SELECT закрыт, и PostgREST отвечает `200 []` — то есть «имя свободно» всегда,
 * даже если строка есть (родня У-67: пустой ответ и отказ — разные вещи).
 * Настоящая защита стоит ниже, в `putNew`: `trip_write` с `p_seen = null`
 * по существующей строке возвращает НОЛЬ строк и ничего не делает (У-77),
 * и человек читает об этом словами, а не «поездка заведена».
 */
async function taken(id: string): Promise<boolean> {
  try {
    const rows = await sbJson<{ id: string }[]>('trips?id=eq.' + tripRowId(id) + '&select=id')
    return rows.length > 0
  } catch {
    /* не дозвонились — считаем, что имя свободно: запись всё равно проверит */
    return false
  }
}

/** Записать НОВУЮ строку поездки. Общая часть создания и дублирования. */
async function putNew(id: string, doc: State, author: string): Promise<TripResult> {
  const row = tripRowId(id)
  const stamp = new Date().toISOString()
  const chief = doc.people.find((p) => p.perm === 'chief')
  const key = chief ? chief.key || '' : ''
  /* Открываем новую поездку СВОИМ ключом, если он в ней есть (копия везёт людей
     прежней поездки вместе с ключами), и только иначе — ключом владельца.
     Иначе тот, кто дублировал поездку не будучи владельцем, вошёл бы в копию
     под чужим именем: назвался ≠ опознан. */
  const mine = doc.people.find((p) => !!p.key && p.key === savedKey())
  const who = mine ?? chief
  const cred: TripCred | undefined =
    who && who.key ? { u: who.slug || who.id, k: who.key } : undefined
  const body = { ...doc, updatedAt: stamp, author }
  try {
    const out = await rpcTripWrite(null, body, stamp, author, key, row)
    /* ⛔ Ноль строк — запись НЕ состоялась. `trip_write` с `p_seen = null`
       по существующей строке отвечает 200 и не делает ничего (У-77): без этой
       проверки человек читал бы «поездка заведена», а её нет. Молчаливых
       отказов не бывает (постулат 5). */
    if (!out.length) {
      return {
        ok: false,
        id: '',
        why: 'Поездка с таким именем строки уже есть. Назовите её иначе и повторите.',
      }
    }
    rememberSeen(row)
    return { ok: true, id, why: '', cred }
  } catch (e) {
    if (e instanceof RpcMissing) {
      /* Переходный период: функции в базе ещё нет, значит и защита не включена —
         пишем прямо, как писали всегда. */
      try {
        await insertTrip(body, stamp, author, row)
        rememberSeen(row)
        return { ok: true, id, why: '', cred }
      } catch {
        return { ok: false, id: '', why: 'Сервер не принял новую поездку. Попробуйте ещё раз.' }
      }
    }
    if (e instanceof KeyRejected) {
      return {
        ok: false,
        id: '',
        why:
          'База не разрешила завести поездку: она не признала вас владельцем. ' +
          'Войдите по почте и повторите.',
      }
    }
    return { ok: false, id: '', why: 'Нет связи с сервером — поездка не завелась.' }
  }
}

/**
 * Завести новую поездку из заводского шаблона.
 *
 * В новой поездке ровно ОДИН участник — тот, кто её завёл, и он же владелец
 * (заказчик: «нужен хотя бы какой-то шаблон, чтобы я смог понимать, что добавлен
 * один участник. Сейчас это владелец. Пишите своё имя»). Имя можно не вписывать
 * сразу: его спросит первый шаг сразу после открытия.
 */
export async function createTrip(title: string, ownerName = ''): Promise<TripResult> {
  const name = (title || '').trim() || 'Новая поездка'
  let id = tripIdFrom(name)
  if (await taken(id)) id = tripIdFrom(name)

  const doc = template()
  doc.trip.title = name
  const owner: Person = {
    id: 'own',
    name: (ownerName || '').trim(),
    ini: firstLetter(ownerName),
    color: '#BC6C25',
    car: '',
    role: '',
    photo: '',
    perm: 'chief',
    slug: translit(ownerName) || 'own',
    key: rnd(),
    ua: Date.now(),
    desc: '',
  }
  doc.people = [owner]
  doc.me = owner.id
  return putNew(id, doc, owner.name || 'владелец')
}

/**
 * Дублировать поездку.
 *
 * Что переезжает: люди с их правами и личными ссылками, все списки, цены,
 * количества, техника, маршрут, меню и настройки документа.
 * Что НЕ переезжает: отметки о готовности — «собрано», «куплено», «пройдено»,
 * «приготовлено» — и РАСПРЕДЕЛЕНИЕ между людьми: кто что везёт и кто что
 * покупает. Решение заказчика 05.08.2026 на прямой вопрос: «сбрасывать».
 * Новая поездка собирается заново, и чужие галочки в ней означали бы неправду.
 * Это же написано словами на экране.
 */
export async function duplicateTrip(
  srcId: string,
  title: string,
  author: string,
): Promise<TripResult> {
  let rows
  try {
    rows = await loadTrip(savedKey(), tripRowId(srcId))
  } catch (e) {
    if (e instanceof KeyRejected) {
      return {
        ok: false,
        id: '',
        why: 'Прежняя поездка закрыта от посторонних, и ваш ключ она не признала. Откройте свою личную ссылку на ту поездку и повторите.',
      }
    }
    return { ok: false, id: '', why: 'Нет связи с сервером — прежнюю поездку прочитать не вышло.' }
  }
  if (!rows.length) {
    return { ok: false, id: '', why: 'Прежней поездки на сервере уже нет — дублировать нечего.' }
  }

  const name = (title || '').trim() || 'Копия поездки'
  let id = tripIdFrom(name)
  if (await taken(id)) id = tripIdFrom(name)

  const doc = clone(rows[0].data as State)
  doc.trip = { ...doc.trip, title: name }
  doc.me = ''
  const now = Date.now()
  ;(doc.gear || []).forEach((g) => {
    g.s = {}
    /* Кто сколько везёт и кто это назначил — распределение прошлой поездки. */
    g.o = {}
    g.oby = {}
    g.ua = now
  })
  ;(doc.buy || []).forEach((b) => {
    b.b = false
    /* Кто покупает: и отметки по людям, и прежнее одиночное поле. */
    b.o = {}
    b.who = ''
    b.ua = now
  })
  ;(doc.route || []).forEach((r) => {
    r.done = false
    /* Кто едет этой точкой — распределение прошлой поездки. */
    r.o = {}
    r.ua = now
  })
  ;(doc.menu || []).forEach((d) => {
    d.done = false
    ;(d.dishes || []).forEach((dish) => {
      dish.done = false
    })
    d.ua = now
  })
  ;(doc.ideas || []).forEach((x) => {
    x.done = false
    x.ua = now
  })
  return putNew(id, doc, author)
}

/**
 * Переименовать поездку, которая сейчас не открыта.
 *
 * Открытую переименовывать здесь незачем: её название правится прямо на обложке
 * поездки, как и всё остальное на экране.
 */
export async function renameTrip(id: string, title: string, author: string): Promise<TripResult> {
  const name = (title || '').trim()
  if (!name) return { ok: false, id, why: 'Название не может остаться пустым.' }
  const row = tripRowId(id)
  let rows
  try {
    rows = await loadTrip(savedKey(), row)
  } catch (e) {
    if (e instanceof KeyRejected) {
      return {
        ok: false,
        id,
        why: 'Эта поездка закрыта от посторонних, и ваш ключ она не признала. Название не сохранилось.',
      }
    }
    return { ok: false, id, why: 'Нет связи с сервером — название не сохранилось.' }
  }
  if (!rows.length) return { ok: false, id, why: 'Этой поездки на сервере больше нет.' }

  const doc = clone(rows[0].data as State)
  doc.trip = { ...doc.trip, title: name }
  const stamp = new Date().toISOString()
  try {
    const out = await rpcTripWrite(rows[0].updated_at, { ...doc, updatedAt: stamp }, stamp, author, '', row)
    if (!out.length) {
      return { ok: false, id, why: 'Поездку в этот момент правил кто-то ещё. Попробуйте ещё раз.' }
    }
    return { ok: true, id, why: '' }
  } catch (e) {
    if (e instanceof KeyRejected) {
      return {
        ok: false,
        id,
        why: 'База не признала вас владельцем этой поездки — название не сохранилось.',
      }
    }
    return { ok: false, id, why: 'Нет связи с сервером — название не сохранилось.' }
  }
}

/**
 * Убрать поездку насовсем.
 *
 * Прямое удаление разрешает политика из docs/rls-apply-d.sql: строку убирает
 * только тот, чья почта записана в `owner_email`. Пока этот файл в базе
 * не выполнен, сервер молча ничего не удаляет — поэтому просим вернуть удалённые
 * строки и, если их нет, объясняем это словами.
 */
export async function deleteTrip(id: string): Promise<TripResult> {
  const row = tripRowId(id)
  if (row === defaultTripId()) {
    return {
      ok: false,
      id,
      why:
        'Эту поездку убрать нельзя: она открывается по короткому адресу, и на неё ' +
        'ссылаются все розданные ссылки. Если она и правда не нужна — скажите об этом, ' +
        'её убирают вручную в кабинете базы.',
    }
  }
  let r: Response
  try {
    r = await sbFetch('trips?id=eq.' + row, { method: 'DELETE', rep: true })
  } catch {
    return { ok: false, id, why: 'Нет связи с сервером — поездка осталась на месте.' }
  }
  if (!r.ok) {
    return {
      ok: false,
      id,
      why:
        'База не разрешила убрать поездку. Убирать может только тот, за чьей почтой она ' +
        'закреплена, и только после настройки базы — шаги в файле docs/trips-steps.md.',
    }
  }
  let gone: unknown[] = []
  try {
    gone = (await r.json()) as unknown[]
  } catch {
    /* тела нет — значит и удалять было нечего */
  }
  if (!gone.length) {
    return {
      ok: false,
      id,
      why:
        'Поездка осталась на месте: база пока не разрешает её убирать. Владельцу нужно один ' +
        'раз выполнить настройку — шаги в файле docs/trips-steps.md.',
    }
  }
  forgetTripLocally(row)
  return { ok: true, id, why: '' }
}

/** Первая буква имени заглавной — то, что показывается вместо фотографии. */
export function firstLetter(name: string): string {
  const s = (name || '').trim()
  return s ? s[0].toUpperCase() : ''
}

/* ─────────── первый шаг новичка ─────────── */

/**
 * Кого сервис обязан спросить об имени прежде всего остального.
 *
 * Заказчик после живой проверки регистрации: «я даже не вписал, кто я… нужен хотя бы
 * какой-то шаблон, чтобы я смог понимать, что добавлен один участник. Сейчас это
 * владелец. Пишите своё имя».
 *
 * Отвечаем «никого», если:
 *   · человек не входил по почте — тогда он пришёл по чужой личной ссылке
 *     и владельцем не является, первого шага он не видит вовсе;
 *   · владельца в поездке не видно;
 *   · имя уже вписано — спрашивать второй раз незачем.
 */
export function firstStepPerson(S: State, mine: Person | null, signedIn: boolean): Person | null {
  if (!signedIn) return null
  /* Если личность ещё не сошлась (лист новый, владельца по почте база подтвердить
     не успела), но человек в поездке ровно один — это и есть он. */
  const who = mine || (S.people.length === 1 ? S.people[0] : null)
  if (!who || who.perm !== 'chief') return null
  return (who.name || '').trim() ? null : who
}
