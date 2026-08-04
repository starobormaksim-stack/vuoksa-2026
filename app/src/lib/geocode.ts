/**
 * Обратное геокодирование: координаты → адрес и предполагаемое название точки.
 *
 * Через Google, если выдан ключ (lib/gmaps.ts), иначе — через бесплатный Nominatim
 * OpenStreetMap. Второй путь нужен не «на всякий случай»: пока ключа Google нет,
 * это единственный работающий, и подстановка названия должна работать уже сейчас.
 *
 * Ответ — только ПРЕДЛОЖЕНИЕ. Название подставляется в поле, а человек его правит:
 * геокодер часто называет место по ближайшей улице, а нам нужно «Приозерск: закупка».
 */

import { hasGoogleKey, reverseGeocode } from './gmaps.ts'

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

/** Ответ Nominatim в том объёме, который нам нужен. */
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
