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
 * Ответ — всегда только ПРЕДЛОЖЕНИЕ. Название подставляется в поле, а человек его
 * правит: геокодер часто называет место по ближайшей улице, а нам нужно
 * «Приозерск: закупка». Найденную по названию точку человек подтверждает руками —
 * молча двигать маршрут по догадке геокодера нельзя.
 */

import {
  forwardGeocode, forwardGeocodeAll, hasGoogleKey, reverseGeocode, type GeoHit,
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
  if (hasGoogleKey()) {
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
  if (hasGoogleKey()) {
    try {
      const hit = await forwardGeocode(query, near)
      return hit && distKm(hit, near) <= MAX_KM ? hit : null
    } catch {
      /* ключ отозвали, лимит, нет сети — пробуем бесплатный путь */
    }
  }
  const hit = (await nominatimSearchAll(query, near, 1))[0] ?? null
  return hit && distKm(hit, near) <= MAX_KM ? hit : null
}

/**
 * Поиск по строке из-под руки человека — для строки поиска над картой.
 * От `forwardPlace` отличается тем, что возвращает НЕСКОЛЬКО находок: человек
 * должен увидеть список и выбрать сам, а не получить молча наведённую карту.
 *
 * Пустой список — честное «не нашлось» (или «нашлось, но за тысячу километров
 * отсюда», что для поездки на Вуоксу одно и то же). Исключений не бросает:
 * строке поиска нечего делать с ошибкой, ей нужен ответ «нашлось / не нашлось».
 */
export async function searchPlaces(
  query: string,
  near: { lat: number; lon: number },
  limit = 5,
): Promise<PlaceFound[]> {
  const near_ = { lat: near.lat, lon: near.lon }
  if (hasGoogleKey()) {
    try {
      const list = await forwardGeocodeAll(query, near_, limit)
      return list.filter((h) => distKm(h, near_) <= MAX_KM)
    } catch {
      /* ключ отозвали, лимит, нет сети — пробуем бесплатный путь */
    }
  }
  const list = await nominatimSearchAll(query, near_, limit)
  return list.filter((h) => distKm(h, near_) <= MAX_KM)
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

/** Ответ поиска Nominatim в том объёме, который нам нужен. */
interface NominatimHit {
  lat?: string
  lon?: string
  display_name?: string
  /** насколько мелкий объект: 4 — страна, 16 — город, 26 — улица, 30 — дом */
  place_rank?: number
}

/** Прямой поиск в Nominatim, жёстко ограниченный окрестностями поездки. */
async function nominatimSearchAll(
  query: string,
  near: { lat: number; lon: number },
  limit: number,
): Promise<PlaceFound[]> {
  try {
    const box = [near.lon - 8, near.lat + 4, near.lon + 8, near.lat - 4].join(',')
    const url =
      `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=${limit}` +
      '&accept-language=ru' +
      `&bounded=1&viewbox=${encodeURIComponent(box)}&q=${encodeURIComponent(query)}`
    const r = await fetch(url, { headers: { Accept: 'application/json' } })
    if (!r.ok) return []
    const list = (await r.json()) as NominatimHit[]
    if (!Array.isArray(list)) return []
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
    return out
  } catch {
    return []
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
