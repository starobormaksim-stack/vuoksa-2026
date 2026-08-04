/**
 * Логика раздела «Дорога» — чистые функции без DOM.
 *
 * Вся арифметика живёт в lib/calc.ts и здесь только вызывается (routeKm, litres,
 * fuelCost, cans). В этом файле — слова, которыми расчёт рассказывается человеку
 * (docs/v2-ux-redesign.md, 10.4): «330 км · 10,5 л на 100 км · 34,7 л» — три факта
 * через разделитель, без единого знака операции.
 */

import type { CanRow, Kind, LegMode, Rent, RouteLabel, RoutePoint, State, Transport } from '@/lib/types'
import { litres } from '@/lib/calc'
import { fmtNum, NBSP, plural, startOfDay } from '@/format'

const MDASH = '—'

/**
 * Сколько знаков после запятой показывать у этого числа.
 *
 * Целое показывается целым («2 ×», «150 км»), дробное — с одним знаком
 * («10,5 л/100 км»). Постоянная точность врала бы в обе стороны: «2,0 конца»
 * там, где стоит двойка, и «3 ×» там, где человек вписал 2,5.
 */
export function dg(v: number): 0 | 1 {
  return Number.isInteger(v) ? 0 : 1
}

/* ─────────── техника ─────────── */

/**
 * Виды, которые топлива не жгут: билет вместо бензина.
 *
 * ⛔ Своей единицы расхода («билет») у них НЕТ и заводить её нельзя: у `litres()`
 * в `calc.ts` стоит `default:` на литры от пробега, и незнакомая единица молча
 * посчитала бы бензин. При `rateU:'fix'` и нулевых литрах топливо равно нулю
 * по существующей формуле — править расчёт не пришлось вовсе.
 */
export const NO_FUEL = new Set(['rail', 'bus'])

/** Вид техники из справочника (нет в справочнике — null, тогда живёт kindT). */
export function kindOf(t: Transport, S: State): Kind | null {
  return S.kinds.find((k) => k.i === t.kind) ?? null
}

/** Название вида: из справочника, иначе «свой вариант» kindT. */
export function kindName(t: Transport, S: State): string {
  const k = kindOf(t, S)
  if (k) return k.t
  return t.kindT || 'Своя техника'
}

/** Имя человека по id ('' — никто). */
export function personName(S: State, id: string): string {
  return S.people.find((p) => p.id === id)?.name ?? ''
}

/** Название топлива по id из fuelPrices. */
export function fuelName(S: State, id: string): string {
  return S.fuelPrices.find((f) => f.i === id)?.n ?? 'топливо'
}

/** Подзаголовок карточки: «Автомобиль · Костя · АИ-95». */
export function transportSub(t: Transport, S: State): string {
  const parts = [kindName(t, S)]
  const owner = personName(S, t.owner)
  if (owner) parts.push(owner)
  parts.push(fuelName(S, t.fuel))
  return parts.join(' · ')
}

/** Слово «литр» при числе: 34,7 литра · 25 литров · 1 литр. */
export function litreWord(n: number): string {
  if (Math.abs(n - Math.round(n)) > 0.001) return 'литра'
  return plural(Math.round(n), 'литр', 'литра', 'литров')
}

/** «34,7 л» — число и единица неразрывно. */
export function litresLabel(n: number): string {
  return `${fmtNum(n, 1)}${NBSP}л`
}

/** «330 км». */
export function kmLabel(n: number): string {
  return `${fmtNum(n, 0)}${NBSP}км`
}

/**
 * Сколько концов пути — словами: «только туда» · «туда и обратно» · «3 конца пути».
 *
 * Заказчик 04.08.2026: «зачем-то в дороге дублируются, условно, 30 км туда-обратно,
 * бессмысленная история». Во фразе «Сколько едем» один и тот же факт стоял дважды:
 * вшитые в текст слова «туда и обратно» И тут же правимое число «2 конца». Хуже
 * того, при одном конце текст всё равно говорил «туда и обратно», то есть врал.
 * Теперь факт один, и он же — то, что правится. Расчёт (calc.routeKm) не тронут.
 */
export function kBackWord(n: number): string {
  /* Дробный коэффициент словами не назовёшь — показываем числом, как есть. */
  if (Math.abs(n - Math.round(n)) > 0.001) return `${fmtNum(n, 1)}${NBSP}конца пути`
  const k = Math.round(n)
  if (k === 1) return 'только туда'
  if (k === 2) return 'туда и обратно'
  return `${fmtNum(k, 0)}${NBSP}${plural(k, 'конец', 'конца', 'концов')} пути`
}

/** «10 часов». */
export function hoursLabel(n: number): string {
  return `${fmtNum(n, 1)}${NBSP}${plural(Math.round(n), 'час', 'часа', 'часов')}`
}

/** Как считаем расход — по-русски, для строки «Расход считаем». */
export const RATE_TITLES: Record<string, string> = {
  l100km: 'на 100 км',
  lh: 'в час',
  fix: 'заливаем разом',
}

/** Пояснение выбора расхода (что изменится в расчёте). */
export const RATE_HINTS: Record<string, string> = {
  l100km: 'литры считаются от пробега',
  lh: 'литры считаются от моточасов',
  fix: 'готовый объём, от пробега не зависит',
}

/** Куда идёт техника (Transport.leg и RoutePoint.mode — одно и то же поле смысла). */
export function legName(mode: LegMode | ''): string {
  if (mode === 'water') return 'по воде'
  if (mode === 'walk') return 'пешком'
  if (mode === 'road') return 'по дороге'
  return 'не указано'
}

/** Литров всего по всей технике (для подписи блока «Бензин»). */
export function litresTotal(S: State): number {
  return S.transport.reduce((sum, t) => sum + litres(t, S), 0)
}

/** Литров этого топлива, которые заливаем на АЗС (без канистр). */
export function refuelLitres(S: State, fuelId: string): number {
  return S.transport
    .filter((t) => t.fuel === fuelId && !t.carry)
    .reduce((sum, t) => sum + litres(t, S), 0)
}

/** Строка блока «Канистры» для этого топлива. */
export function canRowOf(S: State, fuelId: string): CanRow | null {
  return S.canRows.find((r) => r.fuel === fuelId) ?? null
}

/* ─────────── аренда ─────────── */

export function rentCatName(r: Rent, S: State): string {
  return S.rentCats.find((c) => c.i === r.cat)?.t ?? 'Другое'
}

/** «в сутки» / «за штуку» — как называется цена. */
export function rentPer(r: Rent): string {
  return r.unit === 'сут.' ? 'в сутки' : `за ${r.unit || 'штуку'}`
}

/** «5 суток» / «3 шт.» — сколько берём. */
export function rentQtyLabel(r: Rent): string {
  if (r.unit === 'сут.') {
    return `${fmtNum(r.qty, 0)}${NBSP}${plural(Math.round(r.qty), 'сутки', 'суток', 'суток')}`
  }
  return `${fmtNum(r.qty, 1)}${NBSP}${r.unit || 'шт.'}`
}

/** Длительность поездки в сутках по trip.start/trip.end (10–14 августа → 5). */
export function tripDays(S: State): number {
  const a = new Date(S.trip.start)
  const b = new Date(S.trip.end)
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 0
  const days = Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / 86_400_000) + 1
  return days > 0 ? days : 0
}

/* ─────────── маршрут ─────────── */

/** Русские названия меток точки. */
const LABELS: Record<string, string> = {
  start: 'старт',
  drive: 'в пути',
  fuel: 'заправка',
  shop: 'закупка',
  launch: 'спуск на воду',
  camp: 'лагерь',
  finish: 'финиш',
  other: 'другое',
}

export function labelName(p: RoutePoint): string {
  if (p.lab === 'other') return p.labT || 'другое'
  return LABELS[p.lab] ?? ''
}

/** Варианты метки для PickSheet. */
export const LABEL_OPTIONS: { id: RouteLabel; title: string }[] = [
  { id: '', title: 'без метки' },
  { id: 'start', title: 'старт' },
  { id: 'drive', title: 'в пути' },
  { id: 'fuel', title: 'заправка' },
  { id: 'shop', title: 'закупка' },
  { id: 'launch', title: 'спуск на воду' },
  { id: 'camp', title: 'лагерь' },
  { id: 'finish', title: 'финиш' },
  { id: 'other', title: 'другое' },
]

/** Координаты словами: «61,0400, 30,1400». Пусто — координат нет. */
export function coordLabel(p: { lat?: number; lon?: number }): string {
  if (typeof p.lat !== 'number' || typeof p.lon !== 'number') return ''
  return `${p.lat.toFixed(4).replace('.', ',')}, ${p.lon.toFixed(4).replace('.', ',')}`
}

/**
 * Третья строка точки в ленте «Тайминга»: метка · как добираемся · расстояние.
 * Без координат: они переехали в отдельную строку-кнопку «показать на карте».
 */
export function pointMeta(p: RoutePoint): string {
  const parts: string[] = []
  const lab = labelName(p)
  if (lab) parts.push(lab)
  if (p.mode && p.mode !== 'road') parts.push(legName(p.mode))
  if (p.leg > 0) parts.push(kmLabel(p.leg))
  return parts.join(' · ')
}

/**
 * Строка точки с координатами — ею подписывает метку карта.
 * Здесь координаты нужны: на карте адрес не виден, а метка должна назвать себя.
 */
export function pointLine(p: RoutePoint): string {
  const parts: string[] = []
  const meta = pointMeta(p)
  if (meta) parts.push(meta)
  const c = coordLabel(p)
  if (c) parts.push(c)
  return parts.join(' · ')
}

/** Точки с координатами — только они попадают на карту. */
export function mapPoints(S: State): RoutePoint[] {
  return S.route.filter((p) => typeof p.lat === 'number' && typeof p.lon === 'number')
}

/** Куда смотреть карте, когда ни у одной точки нет координат. */
export function mapCenter(S: State): { lat: number; lon: number } {
  const place = S.trip.places?.find((p) => p.main) ?? S.trip.places?.[0]
  if (place && typeof place.lat === 'number' && typeof place.lon === 'number') {
    return { lat: place.lat, lon: place.lon }
  }
  /* Вуокса — точка по умолчанию, если у поездки не проставлено ни одного места. */
  return { lat: 61.04, lon: 30.14 }
}

/** Прочерк там, где значения нет вовсе. */
export const DASH = MDASH
