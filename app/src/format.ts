/** Русская типографика: «ёлочки», длинное тире, неразрывные и узкие пробелы. */

export const NBSP = ' '
export const NNBSP = ' '
export const NDASH = '–'
export const MDASH = '—'

/** Родительный падеж месяцев для дат («10–14 августа»). */
const MONTHS_GEN = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
]

/** Русская плюрализация: plural(5, 'день', 'дня', 'дней') → 'дней'. */
export function plural(n: number, one: string, few: string, many: string): string {
  const abs = Math.abs(n) % 100
  const d = abs % 10
  if (abs > 10 && abs < 20) return many
  if (d > 1 && d < 5) return few
  if (d === 1) return one
  return many
}

/** «14 августа 2026». */
export function fmtDate(d: Date): string {
  return `${d.getDate()}${NBSP}${MONTHS_GEN[d.getMonth()]}${NBSP}${d.getFullYear()}`
}

/**
 * Диапазон дат по-русски:
 *  тот же месяц   → «10–14 августа 2026»
 *  разные месяцы  → «28 июля — 2 августа 2026»
 *  разные годы    → «30 декабря 2026 — 2 января 2027»
 */
export function fmtRange(a: Date, b: Date): string {
  if (a.getFullYear() !== b.getFullYear()) return `${fmtDate(a)}${NBSP}${MDASH} ${fmtDate(b)}`
  if (a.getMonth() !== b.getMonth()) {
    return `${a.getDate()}${NBSP}${MONTHS_GEN[a.getMonth()]}${NBSP}${MDASH} ${fmtDate(b)}`
  }
  if (a.getDate() === b.getDate()) return fmtDate(a)
  return `${a.getDate()}${NDASH}${b.getDate()}${NBSP}${MONTHS_GEN[a.getMonth()]}${NBSP}${a.getFullYear()}`
}

/** Начало суток локального времени. */
export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

/** Целых суток от «сегодня» до даты (может быть отрицательным). */
export function daysUntil(iso: string): number {
  const target = startOfDay(new Date(iso)).getTime()
  const today = startOfDay(new Date()).getTime()
  return Math.round((target - today) / 86_400_000)
}

/**
 * Строка обратного отсчёта из trip.start/trip.end:
 * «До выезда 6 дней» · «Выезд сегодня» · «Поездка идёт» · «Поездка завершена».
 */
export function countdown(startIso: string, endIso: string): string {
  const days = daysUntil(startIso)
  if (days > 0) return `До${NBSP}выезда ${days}${NBSP}${plural(days, 'день', 'дня', 'дней')}`
  if (days === 0) return 'Выезд сегодня'
  const endDays = daysUntil(endIso)
  if (endDays >= 0) return 'Поездка идёт'
  return 'Поездка завершена'
}

/** «2026-08-10T07:30:00» + новая дата → тот же час-минута, новая дата. */
export function withDate(oldIso: string, date: Date, fallbackTime: string): string {
  const time = oldIso.match(/T(\d{2}:\d{2}(?::\d{2})?)/)?.[1] ?? fallbackTime
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}T${time}`
}
