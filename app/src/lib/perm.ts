/**
 * Права по личной ссылке — перенос из боевой версии (src/online.js + src/app.template.html)
 * без изменения модели. Правило v2 про количество — docs/v2-architecture.md, раздел 2.5.
 *
 * Ссылка вида `?u=<slug>&k=<ключ>`. Человек ищется в `S.people[]` по `slug` (а также по `id`
 * и по имени — как в v1), ключ сверяется с `people[].key`. Владелец меняет человеку права —
 * меняется и ключ, старая ссылка сразу перестаёт давать полномочия.
 *
 * Подтверждённый ключ запоминается в браузере, чтобы человек мог заходить и по короткому адресу.
 * Разграничение остаётся «джентльменским»: anon-ключ Supabase лежит в коде, настоящее
 * разграничение потребует Supabase Auth и RLS.
 */

import type { Buy, Gear, Person, State } from './types.ts'

/** Уровень прав. */
export type Perm = 'chief' | 'editor' | 'member'

/** Подтверждённая личность: id человека и ключ, с которым он пришёл. */
export interface Auth {
  id: string
  key: string
}

/** Ключ в localStorage для запомненной личности. */
const AUTH_KEY = 'flops.auth'

/** Русское название уровня. */
export function permName(perm: Perm): string {
  return perm === 'chief' ? 'владелец' : perm === 'editor' ? 'редактор' : 'участник'
}

/** Что именно может каждый уровень — для подсказок в интерфейсе (текст из v1). */
export function permRights(perm: Perm): string[] {
  if (perm === 'chief')
    return [
      'Всё в документе: позиции, деньги, маршрут, меню, команда и права',
      'Скачивает офлайн-копию и возвращает её в онлайн',
      'Видит и раздаёт ссылки команды',
    ]
  if (perm === 'editor')
    return [
      'Позиции, цены, количества, логистика, маршрут и меню',
      'Отмечает за любого участника, кроме владельца',
      'Меняет права и состав команды, кроме владельца',
      'Файл не скачивает — это делает владелец',
    ]
  return [
    'Свой список: отметки, количества, «не могу взять»',
    'Добавляет позиции себе и ставит задачи другим',
    'Меняет своё описание и свою фотографию',
    'За других не отмечает, общие параметры не трогает',
  ]
}

/* ─────────── чтение личности из адреса и из браузера ─────────── */

/** Что пришло в адресе: `?u=<slug>&k=<ключ>`. */
export interface UrlUser {
  who: string
  key: string
}

/**
 * Разобрать адрес. Понимает два вида:
 *
 *   1. `?u=<slug>&k=<ключ>` — прежний, разосланный людям. РАБОТАЕТ КАК РАБОТАЛ.
 *   2. `/<поездка>/<имя>`   — красивый путь для собственного домена
 *      (pine-to-pine.com/vuoksa2026/maks). Ключа в пути нет: он берётся
 *      из `?k=`, если он там есть, а иначе — из запомненного в браузере.
 *      Поэтому первый заход человек делает по полной ссылке с ключом,
 *      а дальше ему хватает короткого адреса.
 *
 * Старый вид проверяется первым: у людей уже разосланы ссылки, и подменять
 * личность путём, когда в запросе явно написано `?u=`, нельзя.
 */
export function readUrlUser(searchStr?: string, pathStr?: string): UrlUser | null {
  const s = searchStr ?? (typeof location === 'undefined' ? '' : location.search || '')
  const mk = s.match(/[?&]k=([^&]*)/)
  const key = mk ? decodeURIComponent(mk[1]).trim() : ''

  const m = s.match(/[?&]u=([^&]*)/)
  if (m) {
    const who = decodeURIComponent(m[1]).replace(/\+/g, ' ').trim().toLowerCase()
    return { who, key }
  }

  const who = whoFromPath(pathStr)
  if (who) return { who, key }
  return null
}

/**
 * Имя человека из пути. Приложение может жить в подкаталоге (на GitHub Pages это
 * `/vuoksa-2026/`), поэтому базовый кусок отрезаем — иначе им же и представимся.
 * Берём последний осмысленный кусок: `/vuoksa2026/maks` → `maks`.
 * Не нашли такого человека — checkAuth() просто никого не выберет, вреда нет.
 */
function whoFromPath(pathStr?: string): string {
  const raw = pathStr ?? (typeof location === 'undefined' ? '' : location.pathname || '')
  if (!raw) return ''
  let p = raw
  const base = typeof import.meta.env?.BASE_URL === 'string' ? import.meta.env.BASE_URL : '/'
  if (base && base !== '/' && p.startsWith(base)) p = p.slice(base.length)
  const parts = p
    .split('/')
    .map((x) => decodeURIComponent(x).trim())
    .filter((x) => x && !/\.(html?|js|css)$/i.test(x))
  if (parts.length === 0) return ''
  return parts[parts.length - 1].toLowerCase()
}

/** Найти человека по тому, что стоит в `?u=`: slug, id или имя (регистр не важен). */
export function findPerson(people: Person[], who: string): Person | null {
  const w = (who || '').trim().toLowerCase()
  if (!w) return null
  let found: Person | null = null
  people.forEach((p) => {
    if (
      p.id === w ||
      (p.slug || '').toLowerCase() === w ||
      (p.name || '').toLowerCase() === w
    )
      found = p
  })
  return found
}

/** Запомненная личность из браузера. */
export function authLoad(): Auth | null {
  try {
    return JSON.parse(localStorage.getItem(AUTH_KEY) || 'null') as Auth | null
  } catch {
    return null
  }
}

/** Запомнить (или забыть, если передан null) личность. */
export function authSave(a: Auth | null): void {
  try {
    if (a) localStorage.setItem(AUTH_KEY, JSON.stringify(a))
    else localStorage.removeItem(AUTH_KEY)
  } catch {
    /* приватный режим — обойдёмся памятью */
  }
}

/** Результат сверки ключа. */
export interface AuthCheck {
  /** подтверждённая личность (ключ сошёлся) или null */
  auth: Auth | null
  /** кого выбрать в документе — даже если ключ не сошёлся */
  me: string
  /** ключ был, человек найден, но ключ не подошёл: ссылка устарела */
  stale: boolean
}

/**
 * Свести адрес, запомненное и список людей в одну картину.
 * Порядок как в v1: адрес важнее запомненного; если ключ подошёл — запоминаем.
 */
export function checkAuth(people: Person[], searchStr?: string): AuthCheck {
  const url = readUrlUser(searchStr)
  let me = ''
  let cand: Auth | null = null
  let stale = false

  if (url) {
    const p = findPerson(people, url.who)
    if (p) {
      me = p.id
      if (url.key) cand = { id: p.id, key: url.key }
    }
  }
  if (!cand) cand = authLoad()
  if (!cand) return { auth: null, me, stale }

  let p: Person | null = null
  people.forEach((x) => {
    if (x.id === cand!.id) p = x
  })
  const found = p as Person | null
  if (found && found.key === cand.key) {
    if (!me) me = found.id
    authSave(cand)
    return { auth: cand, me, stale: false }
  }
  /* человек есть, а ключ не тот — права изменились, ссылка погасла */
  if (found) stale = true
  return { auth: null, me, stale }
}

/**
 * Ключ, с которым идти на сервер ЗА ЛИСТОМ.
 *
 * Для записи годится только подтверждённый ключ: `checkAuth()` сверил его с карточкой
 * человека в документе. Для чтения так нельзя — сверять не с чем: документа ещё нет,
 * а у поездки, которую этот браузер видит впервые, в сиде нет и людей. Поэтому в дело
 * идёт сырой ключ из адреса или запомненный в браузере: сверит его всё равно сервер
 * (`trip_read` в docs/rls-apply-e.sql), а подделать чужой ключ подстановкой нельзя.
 *
 * Порядок: подтверждённый → из адреса `?k=` → запомненный. Красивая ссылка
 * `/vuoksa2026/Maks` ключа не несёт вовсе (урок У-37) — её случай закрывает третий шаг.
 */
export function readKey(auth: Auth | null): string {
  if (auth && auth.key) return auth.key
  const url = readUrlUser()
  if (url && url.key) return url.key
  const saved = authLoad()
  return saved && saved.key ? saved.key : ''
}

/** Собрать личную ссылку для человека. */
export function linkFor(p: Person, base?: string): string {
  const b =
    base ??
    (typeof location === 'undefined'
      ? ''
      : location.href.split('?')[0].split('#')[0])
  /* Поездок стало много (04.08.2026), и личная ссылка обязана нести не только
     человека, но и поездку: без `?trip=…` она приведёт в поездку по умолчанию
     или в ту, что запомнил браузер получателя, — то есть не туда. У поездки
     по умолчанию адрес прежний, старые ссылки продолжают работать как работали. */
  const m = typeof location === 'undefined' ? null : location.search.match(/[?&]trip=([^&]*)/)
  const trip = m ? m[1] : ''
  return (
    b +
    '?' +
    (trip ? 'trip=' + trip + '&' : '') +
    'u=' + encodeURIComponent(p.slug || p.id) +
    '&k=' + encodeURIComponent(p.key || '')
  )
}

/* ─────────── кто что может ───────────
   Владелец — всё. Редактор — всё, кроме того, что касается владельца: его карточку, его права
   и его отметки не трогает, файл не скачивает. Участник ведёт свой список: свои отметки, свои
   позиции, своё описание и фотографию, — а другим может ставить задачи, но не отмечать за них. */

/** Позиция, у которой есть автор/исполнитель — общий вид для предикатов. */
export interface OwnedItem {
  by?: string
  as?: string
  who?: string
  o?: Record<string, number>
  oby?: Record<string, string>
  qby?: string
}

/** Набор предикатов, привязанный к конкретному документу и подтверждённой личности. */
export interface Perms {
  /** id выбранного человека ('' — никто не выбран) */
  me: string
  /** карточка выбранного человека */
  mePerson: Person | null
  /** уровень выбранного человека */
  perm: Perm
  /** ключ из ссылки сошёлся */
  authed: boolean
  /** ссылка устарела: человек найден, ключ не тот */
  stale: boolean

  permOf(p: Person | null | undefined): Perm
  myPerm(): Perm
  isChief(): boolean
  isEditor(): boolean
  isMine(item: OwnedItem): boolean
  canEditItem(item: OwnedItem): boolean
  canDel(item: OwnedItem): boolean
  canMark(who: string): boolean
  canEditPerson(p: Person): boolean
  canSetPerm(p: Person): boolean
  canSaveFile(): boolean
  /** кто назначил количество (раздел 2.5) */
  assignerOf(item: OwnedItem, personId?: string): string
  /** можно ли менять количество самому, без «попросить изменить» */
  canEditQty(item: OwnedItem, personId?: string): boolean
}

/**
 * Собрать предикаты. `auth` — результат checkAuth(); без него уровень любого человека
 * считается участником, как в онлайне v1.
 */
export function makePerms(S: State, auth: Auth | null, stale = false): Perms {
  const me = S.me || ''
  const people = S.people || []
  const person = (id: string): Person | null => {
    let out: Person | null = null
    people.forEach((p) => {
      if (p.id === id) out = p
    })
    return out
  }
  const mePerson = me ? person(me) : null

  /* Уровень даёт только подтверждённая ссылка: id и ключ должны совпасть с карточкой.
     Иначе — участник, как бы ни было записано в самом документе. */
  const permOf = (p: Person | null | undefined): Perm => {
    if (!p) return 'member'
    return auth && auth.id === p.id && auth.key === p.key ? p.perm : 'member'
  }
  /* Один в один из v1: если никто не выбран, документ считается «файлом на одного».
     В онлайне это значит, что голый адрес без ?u= даёт полные права — так было и в боевой версии. */
  const myPerm = (): Perm => (mePerson ? permOf(mePerson) : 'chief')
  const isChief = () => myPerm() === 'chief'
  const isEditor = () => {
    const m = myPerm()
    return m === 'chief' || m === 'editor'
  }

  const isMine = (item: OwnedItem): boolean => {
    if (!me) return false
    if (item.by && item.by === me) return true
    if (item.o && (item.o[me] || 0) > 0) return true
    if (item.who && item.who === me) return true
    return false
  }
  const canEditItem = (item: OwnedItem) => isEditor() || isMine(item)
  const canDel = (item: OwnedItem) => isEditor() || !!(item.by && item.by === me)

  /* отметить состояние за человека */
  const canMark = (who: string): boolean => {
    if (!me) return true /* никто не выбран — файл на одного */
    if (who === me || who === 'base') return true
    if (!isEditor()) return false
    const p = person(who)
    return isChief() || !p || p.perm !== 'chief'
  }
  /* трогать карточку участника: имя, описание, фотографию */
  const canEditPerson = (p: Person): boolean => {
    if (isChief()) return true
    if (p.id === me) return true
    return isEditor() && p.perm !== 'chief'
  }
  /* менять права и убирать из экипажа */
  const canSetPerm = (p: Person) => isChief() || (isEditor() && p.perm !== 'chief')
  /* офлайн-копию снимает и возвращает только владелец */
  const canSaveFile = () => isChief()

  /* ─── количество: правит тот, кто назначил (docs/v2-architecture.md, 2.5) ───
     gear: oby[personId] || as || by;  buy: qby || as || by. Пусто — позиция ничья (сид). */
  const assignerOf = (item: OwnedItem, personId?: string): string => {
    if (personId && item.oby) {
      const a = item.oby[personId]
      if (a) return a
    }
    if (item.qby) return item.qby
    return item.as || item.by || ''
  }
  const canEditQty = (item: OwnedItem, personId?: string): boolean => {
    if (isChief()) return true /* владелец не ограничивается */
    const a = assignerOf(item, personId)
    if (!a) return true /* ничей — позиция из сида */
    return a === me /* назначил я (в том числе сам себе) */
  }

  return {
    me,
    mePerson,
    perm: myPerm(),
    authed: !!auth,
    stale,
    permOf,
    myPerm,
    isChief,
    isEditor,
    isMine,
    canEditItem,
    canDel,
    canMark,
    canEditPerson,
    canSetPerm,
    canSaveFile,
    assignerOf,
    canEditQty,
  }
}

/** Кто поручил позицию: `as`, иначе автор `by`. */
export function taskAuthor(item: Gear | Buy): string {
  return item.as || item.by || ''
}
