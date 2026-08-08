import type { State } from './types'

/**
 * Свои названия разделов (`S.secTitles`).
 *
 * Заказчик переименовал разделы ещё в первой версии — например, «Команда» у него
 * называется по-своему. Вторая версия эти названия ХРАНИЛА (слияние их бережёт,
 * они пережили все происшествия 04.08.2026), но на экран не выводила ни разу:
 * заголовки брались из зашитого списка `sections.ts`. Человек переименовал раздел,
 * а сервис молча показывал своё — прямое нарушение правила «как вижу, так и редактирую».
 *
 * Форм записи две, и понимать надо обе:
 *   · первая версия писала объект `{ h, sub }` — так лежит в боевых данных;
 *   · тип в `types.ts` исторически объявлен как `Record<string, string>`.
 * Поэтому читаем обе, а пишем ту, что уже в документе.
 *
 * Ключи тоже из первой версии и не совпадают с нынешними именами разделов:
 * «Дорога» там называлась `log` (логистика). Список — в `KEY_OF`.
 */

/** Ключ хранения для нынешнего идентификатора раздела. */
const KEY_OF: Record<string, string> = {
  trip: 'trip',
  crew: 'crew',
  gear: 'gear',
  buy: 'buy',
  road: 'log',
  /* Раздела «Проживание» в первой версии не было, поэтому ключ совпадает
     с идентификатором: чужого имени, которое можно затереть, здесь нет. */
  stay: 'stay',
  menu: 'menu',
}

interface TitlePair {
  h?: string
  sub?: string
}

function pairOf(S: State, secId: string): TitlePair | null {
  const bag = S.secTitles as unknown as Record<string, unknown> | undefined
  if (!bag) return null
  const raw = bag[KEY_OF[secId] ?? secId]
  if (typeof raw === 'string') return { h: raw }
  if (raw && typeof raw === 'object') return raw as TitlePair
  return null
}

/** Название раздела: своё, если задано, иначе заводское. */
export function titleOf(S: State, secId: string, fallback: string): string {
  return pairOf(S, secId)?.h?.trim() || fallback
}

/**
 * Подпись под названием. Пустая строка в документе — осознанный выбор человека
 * («подпись не нужна»), поэтому она перебивает заводскую, а отсутствие ключа — нет.
 */
export function hintOf(S: State, secId: string, fallback?: string): string | undefined {
  const p = pairOf(S, secId)
  if (!p || p.sub === undefined) return fallback
  return p.sub.trim() || undefined
}

/** Записать своё название и подпись, сохранив форму, которая уже в документе. */
export function setSectionTitle(S: State, secId: string, h: string, sub: string): void {
  const key = KEY_OF[secId] ?? secId
  const bag = (S.secTitles ?? {}) as unknown as Record<string, unknown>
  bag[key] = { h, sub }
  S.secTitles = bag as unknown as State['secTitles']
}
