/**
 * Геокодирование в обе стороны.
 *
 * Обратное (координаты → адрес) нужно, когда точку поставили пальцем по карте.
 * Прямое (название → координаты) нужно мастеру «Разметить маршрут»: у боевых точек
 * координат нет вовсе, и половину из них можно найти по названию.
 *
 * Через Google, если выдан ключ (lib/gmaps.ts), иначе — через бесплатный Nominatim
 * OpenStreetMap. Второй путь нужен не «на всякий случай»: пока ключа Google нет,
 * это единственный работающий, и подстановка названия должна работать уже сейчас.
 *
 * ⚠️ К Google ходим ТОЛЬКО через `google.maps.Geocoder` из уже загруженной
 * библиотеки карт (см. lib/gmaps.ts). Прямой запрос на
 * `maps.googleapis.com/maps/api/geocode/json` тем же ключом не работает и никогда
 * не заработает: ключ ограничен по HTTP-referrer, а REST такие ключи не принимает —
 * ответ приходит `REQUEST_DENIED`, «API keys with referer restrictions cannot be
 * used with this API». Живая проверка 04.08.2026. Классу Geocoder то же самое
 * ограничение не мешает: он ходит изнутри библиотеки, с разрешённого домена.
 *
 * Ответ — всегда только ПРЕДЛОЖЕНИЕ. Название подставляется в поле, а человек его
 * правит: геокодер часто называет место по ближайшей улице, а нам нужно
 * «Приозерск: закупка». Найденную по названию точку человек подтверждает руками —
 * молча двигать маршрут по догадке геокодера нельзя.
 */

import {
  forwardGeocode, forwardGeocodeAll, googleUsable, reverseGeocode, type GeoHit,
} from './gmaps.ts'

/* ─────────── обратное: координаты → адрес ─────────── */

/** Что вернуло геокодирование. */
export interface PlaceGuess {
  /** полный адрес — уходит в point.addr */
  addr: string
  /** короткое название — предлагается в point.n */
  name: string
}

/** Координаты → адрес и название. null — не получилось (нет сети, нет ответа). */
export async function reversePlace(lat: number, lon: number): Promise<PlaceGuess | null> {
  if (googleUsable()) {
    try {
      return await reverseGeocode(lat, lon)
    } catch {
      /* ключ отозвали, лимит, нет сети — пробуем бесплатный путь */
    }
  }
  return nominatim(lat, lon)
}

/* ─────────── прямое: название → координаты ─────────── */

/** Найденное по названию место. */
export type PlaceFound = GeoHit

/**
 * Чем кончился поиск. Пустой список и «спросить было некого» — РАЗНЫЕ вещи,
 * и путать их нельзя: без сети человек читал «Ничего не нашлось поблизости»,
 * хотя искать никто и не ходил. Молчаливых и подменных отказов не бывает
 * (постулат 5).
 */
export type SearchOutcome =
  | { ok: true; list: PlaceFound[] }
  /**
   * 'offline'  — сети нет вовсе: запрос никуда не ушёл;
   * 'noanswer' — сеть есть, а служба поиска ответила не по делу (лимит, 5xx).
   */
  | { ok: false; why: 'offline' | 'noanswer' }

/**
 * Браузер знает, что сети нет. Обратного он не гарантирует: `onLine === true`
 * бывает и при мёртвом канале, поэтому «нет сети» ставится только по `false`
 * либо по упавшему запросу.
 */
function netDown(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false
}

/**
 * Дальше этого от места поездки находка считается промахом геокодера.
 * Санкт-Петербург от Вуоксы — 130 км, так что запас пятикратный; а вот «КАД»
 * без ограничения находится в другом конце страны, и такую находку надо отбросить,
 * а не показывать заказчику как правду.
 */
const MAX_KM = 500

/** Расстояние между двумя точками по большому кругу, км. */
function distKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const rad = Math.PI / 180
  const dLat = (b.lat - a.lat) * rad
  const dLon = (b.lon - a.lon) * rad
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(s)))
}

/**
 * Название → координаты. `near` — куда смотрит поездка (roadx.mapCenter).
 * null — не нашлось или нашлось слишком далеко, чтобы этому верить.
 *
 * Порядок такой: Google, а если он не ответил вовсе (лимит, отозвали ключ, нет сети) —
 * Nominatim. Честное «не нашлось» от Google вторым кругом не переспрашиваем: у OSM
 * на бессмысленный запрос ответ будет не лучше, а ждать человеку лишнюю секунду.
 */
export async function forwardPlace(
  query: string,
  near: { lat: number; lon: number },
): Promise<PlaceFound | null> {
  if (googleUsable()) {
    try {
      const hit = await forwardGeocode(query, near)
      return hit && distKm(hit, near) <= MAX_KM ? hit : null
    } catch {
      /* ключ отозвали, лимит, нет сети — пробуем бесплатный путь */
    }
  }
  const r = await nominatimSearchAll(query, near, 1)
  const hit = (r.ok ? r.list[0] : null) ?? null
  return hit && distKm(hit, near) <= MAX_KM ? hit : null
}

/**
 * Поиск по строке из-под руки человека — для строки поиска над картой.
 * От `forwardPlace` отличается тем, что возвращает НЕСКОЛЬКО находок: человек
 * должен увидеть список и выбрать сам, а не получить молча наведённую карту.
 *
 * Пустой список — честное «не нашлось» (или «нашлось, но за тысячу километров
 * отсюда», что для поездки на Вуоксу одно и то же). Исключений не бросает:
 * строке поиска нечего делать с ошибкой, ей нужен ответ, который можно показать
 * человеческим языком, — поэтому отказ приезжает не пустотой, а причиной
 * (`SearchOutcome`).
 */
export async function searchPlaces(
  query: string,
  near: { lat: number; lon: number },
  limit = 5,
): Promise<SearchOutcome> {
  const near_ = { lat: near.lat, lon: near.lon }
  /* Сети нет — идти некуда: и Google, и Nominatim живут в сети. Раньше здесь
     выходил пустой список, и человек читал «ничего не нашлось» — неправда. */
  if (netDown()) return { ok: false, why: 'offline' }
  if (googleUsable()) {
    try {
      const list = await forwardGeocodeAll(query, near_, limit)
      return { ok: true, list: list.filter((h) => distKm(h, near_) <= MAX_KM) }
    } catch {
      /* ключ отозвали, лимит, нет сети — пробуем бесплатный путь */
    }
  }
  const r = await nominatimSearchAll(query, near_, limit)
  if (!r.ok) return r
  return { ok: true, list: r.list.filter((h) => distKm(h, near_) <= MAX_KM) }
}

/**
 * Короткое имя из полного адреса: «Приозерск, Ленинградская обл., Россия» → «Приозерск».
 * Нужно, чтобы у точки, поставленной из поиска, сразу было человеческое название,
 * а не строка на полторы строки.
 */
export function shortPlaceName(addr: string): string {
  const first = addr.split(',')[0]?.trim() ?? ''
  return first || addr.trim()
}

/**
 * Алфавит Open Location Code (Plus Code): цифры без 0 и 1, буквы без I, L, O, U —
 * их геокодер Google подставляет впереди адреса там, где у места нет улицы и дома
 * («XVWW+WF Горы»). Живому человеку код ничего не говорит — заказчик прочитал его
 * как обрывки мусора: «X5, WW, WF» (разбор 06.08.2026). Резать его надо ТОЛЬКО
 * при показе — см. `humanAddr` ниже, — а не в самом документе (постулат 4).
 */
const PLUS_CODE_ALPHABET = '23456789CFGHJMPQRVWX'
const PLUS_CODE = new RegExp(`^[${PLUS_CODE_ALPHABET}]{4,8}\\+[${PLUS_CODE_ALPHABET}]{2,3}(\\s+|$)`, 'i')

/** Один и тот же регион под разными геокодерами: Google пишет полностью, OSM — сокращает. */
const LO_REGION = /^ленинградская\s+(область|обл\.?)$/i

/**
 * Адрес для показа человеку: без Plus Code впереди, без «Россия» и почтового индекса,
 * область — всегда полным словом. `addr` в документе НЕ трогаем (постулат 4, «данные
 * не выбрасываем») — эта функция только решает, что из него показать на экране.
 *
 * humanAddr('XVWW+WF Горы, Ленинградская область, Россия') → 'Горы, Ленинградская область'
 * humanAddr('Приозерское ш., 10 км, Медовое, Ленинградская обл., Россия, 188660')
 *   → 'Приозерское ш., 10 км, Медовое, Ленинградская область'
 */
export function humanAddr(addr: string): string {
  const noCode = addr.trim().replace(PLUS_CODE, '').trim()
  /* Код без ничего после него — показывать нечего: пустая строка, а не сам код. */
  if (!noCode) return ''
  return noCode
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
    .filter((p) => !/^россия$/i.test(p))
    .filter((p) => !/^\d{5,6}$/.test(p))
    .map((p) => (LO_REGION.test(p) ? 'Ленинградская область' : p))
    .join(', ')
}

/** Ответ поиска Nominatim в том объёме, который нам нужен. */
interface NominatimHit {
  lat?: string
  lon?: string
  display_name?: string
  /** насколько мелкий объект: 4 — страна, 16 — город, 26 — улица, 30 — дом */
  place_rank?: number
}

/**
 * Прямой поиск в Nominatim, жёстко ограниченный окрестностями поездки.
 * Отдаёт причину отказа, а не пустоту: см. `SearchOutcome`.
 */
async function nominatimSearchAll(
  query: string,
  near: { lat: number; lon: number },
  limit: number,
): Promise<SearchOutcome> {
  try {
    const box = [near.lon - 8, near.lat + 4, near.lon + 8, near.lat - 4].join(',')
    const url =
      `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=${limit}` +
      '&accept-language=ru' +
      `&bounded=1&viewbox=${encodeURIComponent(box)}&q=${encodeURIComponent(query)}`
    const r = await fetch(url, { headers: { Accept: 'application/json' } })
    /* Ответ пришёл, но не тот: превышен лимит запросов, сервис лежит. Это не
       «не нашлось», и выдавать это за «не нашлось» — врать человеку. */
    if (!r.ok) return { ok: false, why: 'noanswer' }
    const list = (await r.json()) as NominatimHit[]
    if (!Array.isArray(list)) return { ok: false, why: 'noanswer' }
    const out: PlaceFound[] = []
    for (const j of list) {
      const lat = Number(j.lat)
      const lon = Number(j.lon)
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue
      out.push({
        lat,
        lon,
        addr: j.display_name || query,
        /* 14 — примерно уровень района: всё, что крупнее, для точки маршрута бесполезно. */
        precise: (j.place_rank ?? 0) >= 14,
      })
    }
    return { ok: true, list: out }
  } catch {
    /* `fetch` падает исключением только тогда, когда запрос не дошёл вовсе:
       сети нет, обрыв, имя не разрешилось. Считаем это отсутствием сети. */
    return { ok: false, why: 'offline' }
  }
}

/* ─────────── из названия точки — запрос к геокодеру ─────────── */

/**
 * Похоже на адрес или на место, а не на действие.
 * ⚠️ Слово «город» целиком сюда не годится: «Выезд из города» — это действие,
 * а не место, и по нему половина имени уезжала в геокодер первой.
 */
const ADDRESSY =
  /\d|,|\bул\b|\bпр\b|просп|шоссе|\bш\.|\bнаб\b|\bпер\b|\bд\.|\bг\.|област|городск|деревн|посёл|посел|остров|озер|база|станц/i

/** Похоже на дату («14 августа: сборы…») — геокодеру такое давать нельзя. */
const DATEY = /^\d{1,2}[.\s]*(январ|феврал|март|апрел|ма[йя]|июн|июл|август|сентябр|октябр|ноябр|декабр|\d)/i

/** Кавычки и стрелки геокодеру только мешают. */
function tidy(s: string): string {
  return s
    .replace(/[«»"'()→—–]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.])/g, '$1')
    .trim()
}

/**
 * Что имеет смысл спросить у геокодера про эту точку — от лучшего варианта к худшему.
 *
 * Названия точек написаны для человека, а не для карты, и делятся на два вида:
 *   «Сбор у Кости: Санкт-Петербург, Суздальский пр., 95» — адрес после двоеточия;
 *   «Приозерск: закупка продуктов и дозаправка»          — место ДО двоеточия.
 * Поэтому имя режется по двоеточию и спрашивается обеими половинами: сначала той,
 * которая больше похожа на адрес. Если геокодеру нечего сказать («Первый костёр
 * и обедо-ужин»), список окажется пустым или ответа не будет — так и надо,
 * такие точки ставятся пальцем по карте.
 */
export function placeQueries(name: string, addr = ''): string[] {
  const out: string[] = []
  const add = (s: string) => {
    const v = tidy(s)
    if (v.length >= 3 && !DATEY.test(v) && !out.includes(v)) out.push(v)
  }

  /* Адрес у точки уже есть — он и есть лучший запрос. */
  if (addr.trim()) add(addr)

  const whole = name.trim()
  const cut = whole.search(/[:—–]/)
  if (cut > 0) {
    const head = whole.slice(0, cut)
    const tail = whole.slice(cut + 1)
    if (ADDRESSY.test(tail) && !ADDRESSY.test(head)) {
      add(tail)
      add(head)
    } else {
      add(head)
      add(tail)
    }
  } else {
    add(whole)
  }
  return out
}

/** Ответ обратного Nominatim в том объёме, который нам нужен. */
interface NominatimAnswer {
  display_name?: string
  name?: string
  address?: Record<string, string>
}

/**
 * Nominatim OpenStreetMap. Запрос один на постановку точки — в лимиты сервиса
 * это укладывается с огромным запасом (их порог — один запрос в секунду).
 */
async function nominatim(lat: number, lon: number): Promise<PlaceGuess | null> {
  try {
    const url =
      'https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=16&accept-language=ru' +
      `&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`
    const r = await fetch(url, { headers: { Accept: 'application/json' } })
    if (!r.ok) return null
    const j = (await r.json()) as NominatimAnswer
    const addr = j.display_name || ''
    const a = j.address || {}
    const name =
      j.name ||
      [a.road, a.house_number].filter(Boolean).join(', ') ||
      a.hamlet ||
      a.village ||
      a.town ||
      a.city ||
      a.municipality ||
      a.county ||
      addr.split(',')[0] ||
      ''
    if (!addr && !name) return null
    return { addr, name }
  } catch {
    return null
  }
}
