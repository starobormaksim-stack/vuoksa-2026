/**
 * Логика раздела «Дорога» — чистые функции без DOM.
 *
 * Вся арифметика живёт в lib/calc.ts и здесь только вызывается (routeKm, litres,
 * fuelCost, cans). В этом файле — слова, которыми расчёт рассказывается человеку
 * (docs/v2-ux-redesign.md, 10.4): «330 км · 10,5 л на 100 км · 34,7 л» — три факта
 * через разделитель, без единого знака операции.
 */

import {
  Backpack, Bike, Car, Flame, Package, Plane, Sailboat, SquareParking, TentTree,
  type LucideIcon,
} from 'lucide-react'
import type {
  CanRow, Kind, LegMode, Rent, RouteLabel, RoutePoint, State, Transport,
} from '@/lib/types'
import { litres, money, routeKm } from '@/lib/calc'
import { fmtNum, NBSP, plural, startOfDay } from '@/format'

const MDASH = '—'

/* ─────────── техника ─────────── */

/** kinds[].icon → иконка Lucide. Значка нет в таблице — рисуем машину. */
const KIND_ICONS: Record<string, LucideIcon> = {
  car: Car,
  sailboat: Sailboat,
  flame: Flame,
  bike: Bike,
  plane: Plane,
}

/** Вид техники из справочника (нет в справочнике — null, тогда живёт kindT). */
export function kindOf(t: Transport, S: State): Kind | null {
  return S.kinds.find((k) => k.i === t.kind) ?? null
}

export function kindIcon(t: Transport, S: State): LucideIcon {
  const k = kindOf(t, S)
  return (k && KIND_ICONS[k.icon]) || Car
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

/** Первая строка техники: «Honda Accord · Костя». */
export function transportTitle(t: Transport, S: State): string {
  const owner = personName(S, t.owner)
  return owner ? `${t.n} · ${owner}` : t.n
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

/**
 * Вторая строка техники — три факта через «·», без знаков операций:
 *   «330 км · 10,5 л на 100 км · 34,7 л»
 *   «10 часов · 2,5 л в час · 25 л»
 *   «5 л заливаем разом»
 */
export function transportLine(t: Transport, S: State): string {
  const l = litresLabel(litres(t, S))
  if (t.rateU === 'lh') {
    return `${hoursLabel(t.hours)} · ${fmtNum(t.rate, 1)}${NBSP}л в час · ${l}`
  }
  if (t.rateU === 'fix') return `${litresLabel(t.litres)} заливаем разом`
  return `${kmLabel(routeKm(S))} · ${fmtNum(t.rate, 1)}${NBSP}л на 100${NBSP}км · ${l}`
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

/** Иконка категории аренды. */
const RENT_ICONS: Record<string, LucideIcon> = {
  transport: Sailboat,
  place: TentTree,
  parking: SquareParking,
  gear: Backpack,
  other: Package,
}

export function rentIcon(r: Rent, S: State): LucideIcon {
  const cat = S.rentCats.find((c) => c.i === r.cat)
  return (cat && RENT_ICONS[cat.i]) || Package
}

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

/** «2 000 ₽ в сутки, 5 суток, 2 штуки» — вторая строка аренды. */
export function rentLine(r: Rent, S: State): string {
  const parts = [`${money(r.price, S.doc)} ${rentPer(r)}`, rentQtyLabel(r)]
  if (r.count > 1) {
    parts.push(`${fmtNum(r.count, 0)}${NBSP}${plural(r.count, 'штука', 'штуки', 'штук')}`)
  }
  return parts.join(', ')
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

/** Третья строка точки маршрута: метка · расстояние · координаты. */
export function pointLine(p: RoutePoint): string {
  const parts: string[] = []
  const lab = labelName(p)
  if (lab) parts.push(lab)
  if (p.mode && p.mode !== 'road') parts.push(legName(p.mode))
  if (p.leg > 0) parts.push(kmLabel(p.leg))
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
