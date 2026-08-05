/**
 * ═══════════════ Состояние документа Pine-to-Pine ═══════════════
 *
 * Один документ на всё приложение: живёт в модуле, компоненты подписываются хуком.
 * Здесь же собрано всё сетевое — загрузка с сервера, слияние, отправка, Realtime,
 * права по личной ссылке и присутствие.
 *
 * ─── Как этим пользоваться ───
 *
 *   const { S, update, perms, net, presence, isHere } = useTrip()
 *
 *   S          — документ (State). Только на чтение: не мутируй, зови update().
 *   update(f)  — правка. Функция получает КОПИЮ документа, её можно спокойно менять
 *                на месте либо вернуть новый объект:
 *                    update(s => { s.trip.title = 'Вуокса' })
 *                    update(s => ({ ...s, theme: 'dark' }))
 *                После правки сама проставляется метка документа `updatedAt`
 *                и планируется отправка на сервер (дебаунс 900 мс).
 *                Метку позиции `ua` ставь сам — либо зови touch(item) из этого файла:
 *                    update(s => { const g = s.gear.find(x => x.i === id)!; g.n = 'Котелок'; touch(g) })
 *   remove(k,i)— убрать позицию из коллекции k с меткой удаления (иначе слияние её вернёт).
 *   perms      — предикаты прав текущего человека (см. lib/perm.ts):
 *                perms.perm ('chief'|'editor'|'member'), perms.me, perms.mePerson,
 *                perms.isChief(), perms.isEditor(), perms.canEditItem(item),
 *                perms.canMark(personId), perms.canDel(item), perms.canEditPerson(p),
 *                perms.canSetPerm(p), perms.canSaveFile(), perms.canEditQty(item, personId),
 *                perms.assignerOf(item, personId), perms.stale (ссылка устарела).
 *   signIn     — вход по почте: { email, state, reason, note }. Права из него уже
 *                учтены в perms; сам объект нужен, чтобы объяснить человека словами
 *                (PermNotice). Порядок определения личности — у refreshAuth() ниже.
 *   net        — { state: 'ok'|'work'|'err'|'off', msg } для индикатора в шапке.
 *   presence   — [{ id, name }] тех, кто сейчас в документе.
 *   isHere(id) — человек сейчас здесь.
 *
 * Ещё есть readTrip() — то же самое без хука, для кода вне React и для проверок,
 * и reviveKey(k, i) — отмена удаления.
 *
 * Сеть поднимается сама при первом смонтированном компоненте (первый подписчик),
 * поэтому модуль безопасно импортировать в служебных страницах и тестах.
 *
 * Совместимость: useDoc() из первой версии store остаётся и работает как раньше —
 * возвращает [S, update].
 */

import { useCallback, useSyncExternalStore } from 'react'
import type { State } from './lib/types.ts'
import type { Auth, Perms } from './lib/perm.ts'
import { checkAuth, makePerms, readKey } from './lib/perm.ts'
import { clone, forget, mergeInto, mergeSeed, normalizeDoc } from './lib/merge.ts'
import { fetchTripOwner, initAuth, onAuthChange } from './lib/auth.ts'
import type { Session, TripOwner } from './lib/auth.ts'
import { Sync } from './lib/sync.ts'
import type { NetState, Presence } from './lib/sync.ts'
import { docKey, seedFor } from './lib/trips.ts'

/**
 * Ключ документа в браузере. У поездки, которая была всегда, он прежний —
 * `flops.doc`; у остальных к нему дописано имя поездки. Переименовывать старый
 * ключ нельзя: это стёрло бы людям их документ (см. lib/trips.ts).
 */
const KEY = docKey()

/**
 * Сид, из которого добирается недостающее. У Вуоксы это весь `seed-v2.json`,
 * у прочих поездок — только справочники: чужие вещи и маршрут в них не едут.
 * Считается один раз: он не меняется, пока открыта одна и та же поездка.
 */
const SEED: State = seedFor()

/* ─────────── документ в памяти ─────────── */

function loadInitial(): State {
  let base: State | null = null
  /* Офлайн-копия: владелец скачал файл, а мы вшили в него снимок документа
     (см. lib/offline.ts). Он важнее того, что лежит в этом браузере. */
  try {
    const embedded = (window as unknown as { __PINE_DOC__?: State }).__PINE_DOC__
    if (embedded && embedded.trip && Array.isArray(embedded.people)) {
      return normalizeDoc(mergeSeed(normalizeDoc(clone(embedded)), SEED))
    }
  } catch {
    /* окна нет (сборка/тесты) — идём дальше */
  }
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as State
      /* простейшая защита от чужого/старого формата в хранилище */
      if (parsed && parsed.trip && Array.isArray(parsed.people)) base = parsed
    }
  } catch {
    /* битый JSON или закрытое хранилище — берём сид */
  }
  if (!base) return normalizeDoc(clone(SEED))
  return normalizeDoc(mergeSeed(normalizeDoc(base), SEED))
}

let doc: State = loadInitial()
let auth: Auth | null = null
let stale = false
let net: { state: NetState; msg: string } = { state: 'off', msg: '' }
/**
 * Сервер не отдал лист по нашему ключу (`trip_read`, docs/rls-apply-e.sql).
 * Это не обрыв связи, а «вы не из этой поездки», и экран об этом другой.
 */
let denied = false
let presence: Presence[] = []
let perms: Perms = makePerms(doc, null, false)

/* ─────────── вход по почте ─────────── */

/**
 * Чем кончилась сверка сеанса с листом. Это не права, а объяснение для человека
 * (его печатает `components/PermNotice.tsx`):
 *
 *   none      — почтой никто не входил, всё как раньше;
 *   owner     — почта сеанса совпала с владельцем листа: полные права, молча;
 *   unclaimed — лист ещё ни за кем не закреплён, вошедший станет владельцем;
 *   foreign   — лист закреплён за другой почтой: полных прав не даём;
 *   nochief   — в команде нет ни одного владельца, некому передать права;
 *   unknown   — проверить не вышло (нет связи или колонки владельца в базе).
 */
export type SignInState = 'none' | 'owner' | 'unclaimed' | 'foreign' | 'nochief' | 'unknown'

/** Состояние входа по почте — для объяснений на экране. */
export interface SignIn {
  /** почта живого сеанса; '' — никто не входил */
  email: string
  state: SignInState
  /** почему не проверили (только при state === 'unknown') */
  reason: string
  /** сообщение о том, что только что произошло; гаснет само */
  note: string
}

/** Сколько живёт сообщение о событии (выход из сеанса). */
const NOTE_LIFE = 15000

let session: Session | null = null
let owner: TripOwner = { ok: false, email: '', reason: '' }
let note = ''
let noteT: ReturnType<typeof setTimeout> | null = null
/** Кого выбрал сеанс. Нужен, чтобы на выходе вернуть всё как было. */
let meBySession = ''
let signIn: SignIn = { email: '', state: 'none', reason: '', note: '' }

/**
 * Кто за документом. Порядок определения личности — ровно такой, и он важнее всего
 * остального в этом файле:
 *
 *   1. ЖИВОЙ СЕАНС ВЛАДЕЛЬЦА. Почта сеанса совпала с `owner_email` строки (или строка
 *      ещё ничья), и в документе есть человек с `perm: 'chief'`. Такой человек —
 *      владелец с полными правами БЕЗ `?k=`. Ссылка, оставшаяся в адресе, его не
 *      понижает и личность не подменяет: до 04.08.2026 было наоборот, и владелец,
 *      открывший страницу по ссылке Кости, работал за Костю с правами участника.
 *   2. ЛИЧНАЯ ССЫЛКА С КЛЮЧОМ: `?u=<кто>&k=<ключ>` или путь `/<поездка>/<имя>`.
 *      Работает как работала — этим живёт вся команда.
 *   3. ЗАПОМНЕННЫЙ В БРАУЗЕРЕ человек (`flops.auth`): им живут короткие адреса,
 *      открытые второй раз.
 *   4. НИЧЕГО — гость. Права считаются как в v1.
 *
 * Шаги 2–4 целиком внутри `checkAuth()` (lib/perm.ts) и не меняются.
 */
function refreshAuth(): void {
  const c = checkAuth(doc.people)
  let nextAuth = c.auth
  let nextStale = c.stale
  let me = c.me
  let state: SignInState = 'none'
  let reason = ''

  const mail = (session ? session.email : '').trim().toLowerCase()
  if (mail) {
    const chief = doc.people.find((p) => p.perm === 'chief') || null
    if (!owner.ok) {
      state = 'unknown'
      reason = owner.reason
    } else if (owner.email && owner.email !== mail) {
      state = 'foreign'
    } else if (!chief) {
      state = 'nochief'
    } else {
      /* Шаг 1: сеанс перекрывает адрес. Ключ владельца берётся из его же карточки —
         тем же ключом подписываются правки (sync.getKey), а сервер сверяет ещё и
         почту из токена (docs/rls-apply-c.sql), так что обойти это подстановкой
         в браузере нельзя. */
      state = owner.email ? 'owner' : 'unclaimed'
      me = chief.id
      meBySession = chief.id
      nextAuth = { id: chief.id, key: chief.key || '' }
      nextStale = false
    }
  }

  /* Сеанс погас — выбранную им личность забываем. Иначе вышедший владелец остался бы
     «Максом без ключа» даже там, где ссылки в адресе нет вовсе, и вместо прежних
     полномочий «файла на одного» получил бы права участника. */
  if (meBySession && me !== meBySession) {
    if (!me && doc.me === meBySession) doc.me = ''
    meBySession = ''
  }

  auth = nextAuth
  stale = nextStale
  if (me && doc.me !== me) doc.me = me
  perms = makePerms(doc, auth, stale)
  signIn = { email: mail, state, reason, note }
}
refreshAuth()

/** Показать сообщение о событии входа-выхода. Пустая строка — убрать. */
function setNote(text: string): void {
  note = text
  signIn = { ...signIn, note }
  if (noteT) clearTimeout(noteT)
  noteT = text ? setTimeout(() => setNote(''), NOTE_LIFE) : null
  emit()
}

/** Сеанс появился или пропал. */
function onSession(s: Session | null): void {
  const было = session ? session.email : ''
  session = s
  /* Владелец листа — вопрос к серверу, и на каждый вход его надо задавать заново. */
  owner = { ok: false, email: '', reason: '' }
  refreshAuth()
  emit()
  if (s) {
    void loadOwner()
    return
  }
  /* Молчаливых отказов не бывает: человек должен прочитать, что личность
     снова берётся из ссылки, и кем он стал. */
  if (было) {
    const кто = perms.mePerson ? perms.mePerson.name : ''
    setNote(
      кто
        ? `Вы вышли из сеанса ${было}. Личность снова берётся из ссылки — сейчас это ${кто}.`
        : `Вы вышли из сеанса ${было}. Личность снова берётся из ссылки в адресе.`,
    )
  }
}

/** Сходить за `owner_email` строки и пересчитать личность. */
async function loadOwner(): Promise<void> {
  const r = await fetchTripOwner(readKey(auth))
  /* Пока ходили, человек мог выйти — тогда ответ уже ни к чему. */
  if (!session) return
  owner = r
  refreshAuth()
  emit()
  /* Молчаливых отказов не бывает — но и молчаливых удач тоже: человек, который
     только что подтвердил почту, должен прочитать, кем он стал в этой поездке.
     Заказчик 04.08.2026: «я даже не вписал, кто я. То есть я не понимаю, как это
     будет работать». Про «unclaimed» и про отказы говорит PermNotice сам. */
  if (signIn.state === 'owner') {
    const кто = perms.mePerson
    setNote(
      кто && кто.name
        ? `Вы вошли как ${signIn.email}. В этой поездке вы — ${кто.name}, владелец.`
        : `Вы вошли как ${signIn.email}. Эта поездка ваша: вы её владелец.`,
    )
  }
}

/* ─────────── подписка (useSyncExternalStore) ─────────── */

type Listener = () => void
const listeners = new Set<Listener>()

/** Снимок для React: меняется только когда что-то действительно изменилось. */
interface Snapshot {
  S: State
  perms: Perms
  net: { state: NetState; msg: string }
  presence: Presence[]
  signIn: SignIn
  denied: boolean
}
let snapshot: Snapshot = { S: doc, perms, net, presence, signIn, denied }

/** Пересобрать снимок и разбудить подписчиков — только если что-то правда изменилось. */
function emit(): void {
  if (
    snapshot.S === doc &&
    snapshot.perms === perms &&
    snapshot.net === net &&
    snapshot.presence === presence &&
    snapshot.signIn === signIn &&
    snapshot.denied === denied
  )
    return
  snapshot = { S: doc, perms, net, presence, signIn, denied }
  listeners.forEach((l) => l())
}

/**
 * Сеть поднимается при первом подписчике, то есть когда на экране появился первый компонент.
 * Так модуль можно спокойно импортировать в тестах и служебных страницах, ничего никуда не отправляя.
 */
function subscribe(l: Listener): () => void {
  listeners.add(l)
  startSync()
  return () => {
    listeners.delete(l)
  }
}

/* ─────────── персист в браузере ─────────── */

let saveT: ReturnType<typeof setTimeout> | null = null
function persist(): void {
  if (saveT) clearTimeout(saveT)
  saveT = setTimeout(() => {
    saveT = null
    try {
      localStorage.setItem(KEY, JSON.stringify(doc))
    } catch {
      /* переполнение квоты или приватный режим — работаем только в памяти */
    }
  }, 300)
}

/* ─────────── правки ─────────── */

/** Рецепт правки: меняет копию документа на месте либо возвращает новый. */
export type Recipe = (s: State) => State | void
/** Старое имя того же типа — им пользуются компоненты первой версии. */
export type DocUpdater = (recipe: Recipe) => void

/** Поставить позиции метку времени — по ней слияние решает, чья правка свежее. */
export function touch(item: { ua?: number }): void {
  item.ua = Date.now()
}

/** Имя того, кто сейчас за документом (уходит в колонку author и в присутствие). */
function authorName(): string {
  const me = perms.mePerson
  return me ? me.name : ''
}

let sync: Sync | null = null

/** Правка документа: копия → рецепт → метка → персист → отправка. */
export function update(recipe: Recipe): void {
  const draft = clone(doc)
  const out = recipe(draft)
  doc = (out as State) || draft
  doc.updatedAt = new Date().toISOString()
  perms = makePerms(doc, auth, stale)
  persist()
  emit()
  sync?.schedulePush()
}

/** Убрать позицию из коллекции: с меткой удаления, иначе слияние её воскресит. */
export function remove(kind: string, i: string): void {
  update((s) => {
    const bag = s as unknown as Record<string, unknown>
    const list = bag[kind]
    if (Array.isArray(list)) {
      const idx = (list as { i: string }[]).findIndex((x) => x.i === i)
      if (idx >= 0) list.splice(idx, 1)
    }
    forget(s, kind, i)
  })
}

/** Отменить удаление (позиция вернётся ближайшим слиянием, если она есть у других). */
export function reviveKey(kind: string, i: string): void {
  update((s) => {
    if (s.del) delete s.del[kind + ':' + i]
  })
}

/* ─────────── сеть ─────────── */

/** Влить пришедшее с сервера. Возвращает число изменений. */
function applyRemote(data: unknown): number {
  if (!data) return 0
  let inc: State
  try {
    inc = normalizeDoc(mergeSeed(normalizeDoc(clone(data as State)), SEED))
  } catch {
    return 0
  }
  const next = clone(doc)
  const keepMe = next.me
  const r = mergeInto(next, inc)
  next.me = keepMe /* «кто я» — вещь местная, с сервера её не берём */
  if ((inc.updatedAt || '') > (next.updatedAt || '')) next.updatedAt = inc.updatedAt
  /* документ принимаем всегда: даже без видимых правок в нём могли приехать метки
     удалений и более свежая метка всего документа. А перерисовываем — только если есть что. */
  doc = next
  refreshAuth()
  if (r.total) {
    persist()
    emit()
  }
  return r.total
}

function setNet(state: NetState, msg?: string): void {
  const m = msg || ''
  if (net.state === state && net.msg === m) return
  net = { state, msg: m }
  emit()
}

function setDenied(v: boolean): void {
  if (denied === v) return
  denied = v
  emit()
}

function setPresence(list: Presence[]): void {
  const same =
    presence.length === list.length &&
    presence.every((p, k) => p.id === list[k].id && p.name === list[k].name)
  if (same) return
  presence = list
  emit()
}

/** Запустить синхронизацию. Зовётся один раз — при первом подписчике. */
function startSync(): void {
  if (sync || typeof window === 'undefined') return

  /* Поднять сеанс владельца (Supabase Auth) до первого запроса к базе: если человек
     вошёл, запросы пойдут от его имени, а не от общего ключа. Ничего не ждём —
     документ должен открыться в любом случае, а личность уточнится, когда придёт
     ответ про владельца листа.
     Подписка ставится ДО initAuth(): она же и получит первое событие. */
  onAuthChange(onSession)
  void initAuth()
  sync = new Sync({
    applyRemote,
    stampDoc: (stamp, author) => {
      doc = { ...doc, updatedAt: stamp, author }
      emit()
      return doc
    },
    getAuthor: authorName,
    /* Ключ отдаём только подтверждённый: checkAuth() сверил его с карточкой человека.
       Нет ключа — база правку не примет, и это правильно (docs/rls-apply-b.sql). */
    getKey: () => (auth ? auth.key : ''),
    /* За ЧТЕНИЕМ идём и с неподтверждённым ключом: подтверждать его нечем, пока
       документа нет (у поездки, открытой впервые, в сиде нет и людей). Сверит его
       сервер — `trip_read`. Подробности у readKey() в lib/perm.ts. */
    getReadKey: () => readKey(auth),
    onDenied: setDenied,
    getMe: () => {
      const me = perms.mePerson
      return me ? { id: me.id, name: me.name } : null
    },
    onNet: setNet,
    onPresence: setPresence,
  })
  sync.start()
}

/** Остановить синхронизацию (нужно разве что тестам). */
export function stopSync(): void {
  sync?.stop()
  sync = null
}

/* ─────────── хуки ─────────── */

/** Всё, что отдаёт useTrip(). */
export interface TripApi {
  S: State
  update: DocUpdater
  remove: (kind: string, i: string) => void
  perms: Perms
  net: { state: NetState; msg: string }
  presence: Presence[]
  /** чем кончилась сверка сеанса по почте с листом */
  signIn: SignIn
  /** сервер не отдал лист по нашему ключу — человек не из этой поездки */
  denied: boolean
  isHere: (id: string) => boolean
}

/** Текущее состояние без хука — для кода вне React и для проверок. */
export function readTrip(): Omit<TripApi, 'update' | 'remove' | 'isHere'> {
  return {
    S: snapshot.S,
    perms: snapshot.perms,
    net: snapshot.net,
    presence: snapshot.presence,
    signIn: snapshot.signIn,
    denied: snapshot.denied,
  }
}

/** Главный хук: документ, права, сеть, присутствие и правка. */
export function useTrip(): TripApi {
  const snap = useSyncExternalStore(subscribe, () => snapshot, () => snapshot)
  const isHere = useCallback(
    (id: string) => snap.presence.some((p) => p.id === id),
    [snap.presence],
  )
  return {
    S: snap.S,
    update,
    remove,
    perms: snap.perms,
    net: snap.net,
    presence: snap.presence,
    signIn: snap.signIn,
    denied: snap.denied,
    isHere,
  }
}

/** Старый вход из первой версии store: [документ, правка]. */
export function useDoc(): [State, DocUpdater] {
  const { S } = useTrip()
  return [S, update]
}
