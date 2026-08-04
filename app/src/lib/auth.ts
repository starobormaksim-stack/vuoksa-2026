/**
 * Вход владельца через Supabase Auth — ссылкой на почту (magic link).
 *
 * ─── Зачем это вообще ───
 * Сейчас разграничение прав «джентльменское»: anon-ключ лежит в коде, а голый адрес
 * без `?u=` даёт права владельца (см. `perm.ts`, `myPerm`). 04.08.2026 это стоило
 * боевых данных — их четырежды затёрла чужая вкладка. Лечение — запись только через
 * серверную функцию trip_write, которая сверяет либо личный ключ из ссылки, либо
 * почту вошедшего. Здесь — клиентская половина: вход, хранение сеанса и подстановка
 * токена в запросы. Серверная половина — в `docs/rls-apply-c.sql` (владелец
 * выполняет её сам в панели Supabase, см. `docs/owner-signup-steps.md`).
 *
 * ─── Почему без библиотеки supabase-js ───
 * Ровно по той же причине, что и весь остальной обмен с Supabase (см. `supabase.ts`):
 * приложение общается с сервером обычным fetch, сборка остаётся без лишних зависимостей,
 * а офлайн-копия собирается из того же исходника.
 *
 * ─── Что даёт вход почтой ───
 * Личные ссылки `?u=…&k=…` работают как работали — вход ничего у них не отнимает.
 * Но с 04.08.2026 сеанс ещё и НАЗЫВАЕТ человека: почта сеанса сверяется с колонкой
 * `owner_email` строки поездки (`fetchTripOwner()` ниже), и если она совпала, за
 * документом стоит владелец — независимо от того, чья ссылка осталась в адресе.
 * Сводит это воедино `store.ts`, там же расписан порядок определения личности.
 * До этой правки сеанс на личность не влиял вовсе, и владелец, открывший страницу
 * по ссылке Кости, оставался Костей — с правами участника и без объяснений.
 */

import { SB, sbFetch, setAuthToken, TRIP_ID } from './supabase.ts'

/** Где лежит сеанс. Ключ внутренний, на экране его не видно. */
const KEY = 'flops.session'

/** Сеанс Supabase — ровно то, что нужно для запросов и продления. */
export interface Session {
  access_token: string
  refresh_token: string
  /** когда истекает, мс эпохи */
  expires_at: number
  email: string
  uid: string
}

interface TokenReply {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  user?: { id?: string; email?: string }
  error_description?: string
  msg?: string
}

let session: Session | null = null
const listeners = new Set<(s: Session | null) => void>()

function emit(): void {
  listeners.forEach((f) => f(session))
}

/** Подписаться на вход и выход. Возвращает отписку. */
export function onAuthChange(f: (s: Session | null) => void): () => void {
  listeners.add(f)
  return () => listeners.delete(f)
}

function save(s: Session | null): void {
  session = s
  try {
    if (s) localStorage.setItem(KEY, JSON.stringify(s))
    else localStorage.removeItem(KEY)
  } catch {
    /* приватный режим — сеанс проживёт до перезагрузки */
  }
  /* С этого момента запросы к базе идут от имени вошедшего, а не от anon-ключа. */
  setAuthToken(s ? s.access_token : null)
  emit()
}

function load(): Session | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const s = JSON.parse(raw) as Session
    return s && s.access_token && s.refresh_token ? s : null
  } catch {
    return null
  }
}

/** Кто вошёл. null — никто. */
export function currentSession(): Session | null {
  return session
}

function authFetch(path: string, body: unknown, token?: string): Promise<Response> {
  const h: Record<string, string> = {
    apikey: SB.key,
    'Content-Type': 'application/json',
    Authorization: 'Bearer ' + (token || SB.key),
  }
  return fetch(SB.url + '/auth/v1/' + path, {
    method: 'POST',
    headers: h,
    body: JSON.stringify(body),
  })
}

/** Куда Supabase вернёт человека после нажатия на ссылку в письме. */
export function redirectTarget(): string {
  const base = typeof import.meta.env?.BASE_URL === 'string' ? import.meta.env.BASE_URL : '/'
  return location.origin + (base.startsWith('/') ? base : '/')
}

/**
 * Послать ссылку для входа на почту.
 *
 * `create_user: true` — вход и регистрация теперь одно письмо: первый вход с нового
 * адреса сам заводит учётную запись, отдельной регистрации нет. Права это не раздаёт:
 * на сервере (docs/rls-apply-c.sql) владельцем строки становится ровно первый
 * вошедший, остальным вошедшим запись в чужой документ не даётся.
 *
 * Адрес возврата передаётся query-параметром `redirect_to` — именно так его ждёт
 * GoTrue REST. Поле `options.email_redirect_to` в теле — форма supabase-js,
 * голый сервер её молча игнорирует.
 */
export async function sendMagicLink(email: string): Promise<{ ok: boolean; error?: string }> {
  const mail = email.trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) {
    return { ok: false, error: 'Не похоже на адрес почты' }
  }
  try {
    const r = await authFetch('otp?redirect_to=' + encodeURIComponent(redirectTarget()), {
      email: mail,
      create_user: true,
    })
    if (r.ok) return { ok: true }
    const j = (await r.json().catch(() => ({}))) as TokenReply
    /* Частая беда: у Supabase по умолчанию свой почтовый сервис с жёстким
       ограничением (несколько писем в час). Об этом честнее сказать словами. */
    if (r.status === 429) return { ok: false, error: 'Слишком часто. Попробуйте через несколько минут' }
    if (r.status === 400 || r.status === 422) {
      /* Так GoTrue отказывает, когда адрес новый, а в панели выключен
         «Enable Sign Ups» — заводить людей серверу запрещено. */
      return {
        ok: false,
        error:
          'Регистрация по почте пока не включена. Владелец должен один раз включить её в Supabase (см. шаги настройки)',
      }
    }
    return { ok: false, error: j.error_description || j.msg || 'Сервер не принял запрос' }
  } catch {
    return { ok: false, error: 'Нет связи с сервером' }
  }
}

function sessionFrom(j: TokenReply, fallbackEmail = ''): Session | null {
  if (!j.access_token || !j.refresh_token) return null
  return {
    access_token: j.access_token,
    refresh_token: j.refresh_token,
    expires_at: Date.now() + (j.expires_in || 3600) * 1000,
    email: j.user?.email || fallbackEmail,
    uid: j.user?.id || '',
  }
}

/**
 * Забрать сеанс из адреса после перехода по ссылке из письма.
 *
 * Письмо может привести в двух видах, и оба надо понимать:
 *  - implicit: токены в решётке (`#access_token=…`) — их берём как есть;
 *  - PKCE: в запросе `?token_hash=…&type=magiclink` — одноразовый код, который
 *    ещё надо обменять на токены через `/auth/v1/verify`.
 * И решётку, и код сразу стираем из адреса: ни то ни другое не должно попасть
 * ни в историю браузера, ни в чужие руки через пересланную ссылку.
 */
export async function adoptSessionFromUrl(): Promise<boolean> {
  if (await adoptImplicit()) return true
  return adoptPkce()
}

/** Implicit-форма: токены приезжают прямо в решётке адреса. */
async function adoptImplicit(): Promise<boolean> {
  const hash = location.hash || ''
  if (!hash || hash.indexOf('access_token=') === -1) return false
  const p = new URLSearchParams(hash.slice(1))
  const access = p.get('access_token') || ''
  const refresh = p.get('refresh_token') || ''
  history.replaceState(null, '', location.pathname + location.search)
  if (!access || !refresh) return false

  /* За личностью идём отдельно: в решётке приезжают только токены. */
  let email = ''
  let uid = ''
  try {
    const r = await fetch(SB.url + '/auth/v1/user', {
      headers: { apikey: SB.key, Authorization: 'Bearer ' + access },
    })
    if (r.ok) {
      const u = (await r.json()) as { id?: string; email?: string }
      email = u.email || ''
      uid = u.id || ''
    }
  } catch {
    /* личность не узнали — сеанс всё равно рабочий */
  }
  const expires = Number(p.get('expires_in') || 3600)
  save({ access_token: access, refresh_token: refresh, expires_at: Date.now() + expires * 1000, email, uid })
  return true
}

/**
 * PKCE-форма: в адресе одноразовый код, токены выдаёт сервер в обмен на него.
 *
 * Контракт GoTrue: POST /auth/v1/verify с телом `{ token_hash, type }` возвращает
 * готовый сеанс (access_token, refresh_token, expires_in, user) — ровно этим путём
 * ходит verifyOtp из supabase-js. Код одноразовый: если обмен не удался, повторять
 * его бессмысленно — человек просто запросит новое письмо.
 */
async function adoptPkce(): Promise<boolean> {
  const q = new URLSearchParams(location.search)
  const tokenHash = q.get('token_hash') || ''
  const type = q.get('type') || ''
  if (!tokenHash || (type !== 'magiclink' && type !== 'email' && type !== 'signup')) return false

  /* Код стираем из адреса до похода на сервер: даже неудачный обмен
     не повод оставлять его в истории браузера. */
  q.delete('token_hash')
  q.delete('type')
  const rest = q.toString()
  history.replaceState(null, '', location.pathname + (rest ? '?' + rest : '') + location.hash)

  try {
    const r = await authFetch('verify', { token_hash: tokenHash, type })
    if (!r.ok) return false
    const next = sessionFrom((await r.json()) as TokenReply)
    if (!next) return false
    save(next)
    return true
  } catch {
    return false
  }
}

/** Продлить сеанс, если он вот-вот истечёт. Возвращает, есть ли живой сеанс. */
export async function ensureFreshSession(): Promise<boolean> {
  if (!session) return false
  /* Минута запаса: запрос, начатый с почти истёкшим токеном, до сервера не доедет. */
  if (session.expires_at - Date.now() > 60_000) return true
  try {
    const r = await authFetch('token?grant_type=refresh_token', {
      refresh_token: session.refresh_token,
    })
    if (!r.ok) {
      save(null)
      return false
    }
    const next = sessionFrom((await r.json()) as TokenReply, session.email)
    if (!next) {
      save(null)
      return false
    }
    save(next)
    return true
  } catch {
    /* нет связи — старый токен ещё может сработать, сеанс не рвём */
    return true
  }
}

/** Выйти. Сервер о токене забывает, браузер тоже. */
export async function signOut(): Promise<void> {
  const s = session
  save(null)
  if (!s) return
  try {
    await authFetch('logout', {}, s.access_token)
  } catch {
    /* не дозвонились — локально уже вышли, этого достаточно */
  }
}

/* ─────────── за кем закреплён лист ─────────── */

/** Ответ на вопрос «чья это поездка». */
export interface TripOwner {
  /** удалось ли выяснить; false — судить о владельце нельзя */
  ok: boolean
  /** почта владельца строки в нижнем регистре; '' — строка ещё ничья */
  email: string
  /** почему не выяснили: '' — выяснили */
  reason: '' | 'нет-связи' | 'нет-колонки'
}

/**
 * Прочитать `owner_email` строки поездки.
 *
 * Колонку заводит `docs/rls-apply-c.sql`, читать её разрешено всем (политика
 * «читать может любой»). Пока SQL не применён, PostgREST отвечает 400 на
 * незнакомую колонку — это не поломка, а «настройка ещё не сделана», и человеку
 * надо сказать именно это, а не «нет связи».
 *
 * Запрос идёт мимо `fetchTrip()` из `sync.ts` сознательно: тот тянет документ
 * целиком (под мегабайт), а здесь нужна одна короткая строка. Ничего не пишем.
 */
export async function fetchTripOwner(): Promise<TripOwner> {
  try {
    const r = await sbFetch('trips?id=eq.' + TRIP_ID + '&select=owner_email')
    if (r.status === 400 || r.status === 404) return { ok: false, email: '', reason: 'нет-колонки' }
    if (!r.ok) return { ok: false, email: '', reason: 'нет-связи' }
    const rows = (await r.json()) as { owner_email?: string | null }[]
    /* Пустой массив — строки поездки ещё нет вовсе. Владельца у неё тоже нет,
       и это законный ответ: первый вошедший почтой её и создаст. */
    const mail = rows && rows.length ? rows[0].owner_email || '' : ''
    return { ok: true, email: mail.trim().toLowerCase(), reason: '' }
  } catch {
    return { ok: false, email: '', reason: 'нет-связи' }
  }
}

/**
 * Поднять сеанс при запуске приложения. Зовётся один раз из store.ts.
 * Возвращает того, кто вошёл (или null).
 */
export async function initAuth(): Promise<Session | null> {
  if (typeof window === 'undefined') return null
  session = load()
  setAuthToken(session ? session.access_token : null)
  await adoptSessionFromUrl()
  await ensureFreshSession()
  emit()
  return session
}
