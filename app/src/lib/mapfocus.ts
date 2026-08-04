/**
 * Связь ленты точек с картой — в обе стороны.
 *
 * Лента и карта стоят рядом в одном блоке «Поездки», но собираются из разных
 * компонентов, и знать друг о друге они не должны: карту зовут и из «Дороги» тоже.
 * Поэтому просьбы ходят через этот маленький посредник.
 *
 *   лента → карте  (askMap)      «наведись на эту точку» / «жди тапа для этой точки»;
 *   карта → ленте  (focusInList) «подсвети эту точку, по её метке только что тапнули».
 */

import { scrollToSection } from '../sections.ts'

/** Что просят у карты. */
export type MapMode =
  /** показать точку: карта наводится на её координаты */
  | 'show'
  /** поставить точку: следующий тап по карте задаёт координаты именно ей */
  | 'place'

export interface MapRequest {
  pointId: string
  mode: MapMode
  /** метка времени: по ней карта отличает новую просьбу от той же самой */
  at: number
}

type Listener = (r: MapRequest) => void
const listeners = new Set<Listener>()

/** Подписаться на просьбы. Возвращает отписку. */
export function onMapRequest(l: Listener): () => void {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

/**
 * Попросить карту показать точку (или дать поставить её).
 *
 * `scroll` — подводить ли к карте саму страницу. По умолчанию да: человек
 * нажал «на карте», значит хочет её увидеть, а на телефоне карта стоит над лентой
 * и может быть за краем экрана. Но когда лента просто отзывается на тап по строке,
 * рывок страницы из-под пальца только мешает — тогда scroll = false.
 */
export function askMap(pointId: string, mode: MapMode, scroll = true): void {
  if (scroll) scrollToSection('trip')
  const r: MapRequest = { pointId, mode, at: Date.now() }
  listeners.forEach((l) => l(r))
}

/* ─────────── обратный ход: карта → лента ─────────── */

/** Какую точку карта просит подсветить в ленте. */
export interface ListFocus {
  pointId: string
  /** метка времени: по одной и той же метке можно тапнуть дважды подряд */
  at: number
}

type ListListener = (f: ListFocus) => void
const listWatchers = new Set<ListListener>()

/** Подписаться на «подсвети точку в ленте». Возвращает отписку. */
export function onListFocus(l: ListListener): () => void {
  listWatchers.add(l)
  return () => {
    listWatchers.delete(l)
  }
}

/**
 * Тапнули по метке на карте — лента должна показать эту же точку.
 * Страницу не прокручиваем: лента стоит рядом с картой, и рывок экрана
 * из-под пальца здесь только мешал бы.
 */
export function focusInList(pointId: string): void {
  const f: ListFocus = { pointId, at: Date.now() }
  listWatchers.forEach((l) => l(f))
}
