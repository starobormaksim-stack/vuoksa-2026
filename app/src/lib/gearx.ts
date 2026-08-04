/**
 * Логика раздела «Сборы» — чистые функции без DOM.
 *
 * Пять состояний (docs/v2-ux-redesign.md, 4.5) — те же, что в v1 (ST_NAME/ST_ICON):
 *   0 не взято · 1 в процессе · 2 упаковано · 3 в машине
 * «Не могу взять» в круг не входит: это отдельная отметка gear.q[personId].
 * В готовность идут только «упаковано» и «в машине».
 */

import type { Gear, Person, QtyAsk, State } from './types.ts'
import { NBSP } from '../format.ts'

/** Названия состояний по индексу. */
export const ST_NAME = ['не взято', 'в процессе', 'упаковано', 'в машине'] as const

/** Состояние из круга: 0…3. */
export type StatusValue = 0 | 1 | 2 | 3

/** Следующее по кругу: 0 → 1 → 2 → 3 → 0. */
export function nextStatus(v: number): StatusValue {
  return (((v || 0) + 1) % 4) as StatusValue
}

/** Состояние засчитывается в готовность. */
export function isReady(v: number): boolean {
  return v === 2 || v === 3
}

/** Статус позиции у человека. */
export function statusOf(g: Gear, personId: string): StatusValue {
  return ((g.s && g.s[personId]) || 0) as StatusValue
}

/**
 * Отметка «не могу взять» / просьба изменить количество.
 * В документах v1 значение было просто строкой-причиной — читаем оба формата.
 */
export function askOf(g: Gear, personId: string): QtyAsk | null {
  const raw = g.q ? g.q[personId] : undefined
  if (!raw) return null
  if (typeof raw === 'string') return { kind: 'cant', why: raw }
  return raw
}

/** «Не могу взять» — отметка отказа (а не просьба про количество). */
export function cantOf(g: Gear, personId: string): QtyAsk | null {
  const a = askOf(g, personId)
  return a && a.kind === 'cant' ? a : null
}

/** Просьба изменить количество. */
export function qtyAskOf(g: Gear, personId: string): QtyAsk | null {
  const a = askOf(g, personId)
  return a && a.kind === 'qty' ? a : null
}

/**
 * Переключить состояние по кругу 0 → 1 → 2 → 3 → 0.
 * Отметка «не могу взять» в круг не входит (4.5), поэтому тап по кружку её снимает:
 * иначе поверх круга навсегда остаётся треугольник и человек не может двинуться дальше.
 * Возвращает снятую отметку — вызывающий покажет тост с «Отменить».
 */
export function cycleStatus(g: Gear, personId: string): QtyAsk | null {
  const cant = cantOf(g, personId)
  if (cant && g.q) delete g.q[personId]
  g.s = g.s || {}
  g.s[personId] = nextStatus(statusOf(g, personId))
  return cant
}

/** «2 шт.» — число и единица склеены неразрывным пробелом. */
export function qtyLabel(n: number): string {
  return `${n}${NBSP}шт.`
}

/** Кто везёт позицию: люди с ненулевым количеством, в порядке S.people. */
export function holders(g: Gear, people: Person[]): Person[] {
  return people.filter((p) => (g.o?.[p.id] || 0) > 0)
}

/** Всего штук по позиции (сумма по всем людям). */
export function totalQty(g: Gear): number {
  return Object.values(g.o || {}).reduce((s, n) => s + (n || 0), 0)
}

/** Готовность одного человека: сколько его позиций доведено до «упаковано»/«в машине». */
export function readyOf(S: State, personId: string): { done: number; total: number; pct: number } {
  let done = 0
  let total = 0
  for (const g of S.gear) {
    if ((g.o?.[personId] || 0) <= 0) continue
    total++
    if (isReady(statusOf(g, personId))) done++
  }
  return { done, total, pct: total > 0 ? Math.round((done / total) * 100) : 0 }
}

/** Готовность всего экипажа: доля готовых пар «человек × вещь» по всем людям. */
export function readyAll(S: State): { done: number; total: number; pct: number } {
  let done = 0
  let total = 0
  for (const p of S.people) {
    const r = readyOf(S, p.id)
    done += r.done
    total += r.total
  }
  return { done, total, pct: total > 0 ? Math.round((done / total) * 100) : 0 }
}

/** Готовность одной группы для одного режима (человек или «все»). */
export function readyOfGroup(
  S: State,
  secId: string,
  personId: string | null,
): { done: number; total: number } {
  let done = 0
  let total = 0
  for (const g of S.gear) {
    if (g.sec !== secId) continue
    if (personId) {
      if ((g.o?.[personId] || 0) <= 0) continue
      total++
      if (isReady(statusOf(g, personId))) done++
    } else {
      total++
      const hs = Object.keys(g.o || {}).filter((id) => (g.o[id] || 0) > 0)
      if (hs.length > 0 && hs.every((id) => isReady(statusOf(g, id)))) done++
    }
  }
  return { done, total }
}

/**
 * Вторая строка в режиме «Мой список» — одна фраза по приоритету
 * (docs/v2-ux-redesign.md, 8.3).
 */
export function myLine(g: Gear, personId: string, people: Person[]): string {
  const cant = cantOf(g, personId)
  if (cant) return cant.why ? `не могу взять: ${cant.why}` : 'не могу взять'
  const ask = qtyAskOf(g, personId)
  if (ask) return `просишь поставить ${ask.want} ${MDASH} ждёшь ответа`
  const st = ST_NAME[statusOf(g, personId)]
  const assigner = g.oby?.[personId] || g.as || ''
  if (assigner && assigner !== personId) {
    const who = people.find((p) => p.id === assigner)
    if (who) return `${st} · поручил ${who.name}`
  }
  return st
}

const MDASH = '—'

/** Сегмент полосы экипажа в режиме «Все». */
export interface CrewSegment {
  id: string
  name: string
  qty: number
  status: StatusValue
  cant: boolean
}

/** Полоса экипажа: сегмент на каждого, кто везёт позицию. */
export function crewSegments(g: Gear, people: Person[]): CrewSegment[] {
  return holders(g, people).map((p) => ({
    id: p.id,
    name: p.name,
    qty: g.o[p.id] || 0,
    status: statusOf(g, p.id),
    cant: !!cantOf(g, p.id),
  }))
}

/** Русские числительные «двое из четверых». */
const COLLECTIVE = ['никто', 'один', 'двое', 'трое', 'четверо', 'пятеро', 'шестеро', 'семеро']
function collective(n: number): string {
  return COLLECTIVE[n] ?? String(n)
}
/* Родительный падеж отдельной таблицей: «четверо» на -о, «двое» на -е,
   одним правилом замены их не свести — получалось «из четверо». */
const COLLECTIVE_GEN = [
  'никого', 'одного', 'двоих', 'троих', 'четверых', 'пятерых', 'шестерых', 'семерых',
]
function ofCollective(n: number): string {
  return COLLECTIVE_GEN[n] ?? String(n)
}

/**
 * Подзаголовок карточки позиции: «везут четверо, всего 8 шт.».
 * Одного называем по имени — «везёт Костя»: числительное «один» здесь звучит казённо.
 */
export function holdersLine(g: Gear, people: Person[]): string {
  const hs = holders(g, people)
  if (hs.length === 0) return 'пока никто не везёт'
  const head = hs.length === 1 ? `везёт ${hs[0].name}` : `везут ${collective(hs.length)}`
  return `${head}, всего ${qtyLabel(totalQty(g))}`
}

/**
 * Фраза под полосой экипажа: «Собрали двое из четверых · у Миши не взято».
 * Первая проблема называется поимённо, остальные — нет (иначе получается каша).
 */
export function crewLine(segs: CrewSegment[]): string {
  if (segs.length === 0) return 'пока никто не везёт'
  const done = segs.filter((s) => isReady(s.status)).length
  const head = crewHead(done, segs.length)
  const cant = segs.find((s) => s.cant)
  if (cant) return `${head} · ${cant.name} не может взять`
  const idle = segs.find((s) => s.status === 0)
  if (idle) return `${head} · у ${nameGen(idle.name)} не взято`
  const work = segs.find((s) => s.status === 1)
  if (work) return `${head} · ${work.name} собирает`
  return head
}

/** Начало фразы: «Пока не собрал никто» · «Собрал один из четверых» · «Собрали все четверо». */
function crewHead(done: number, total: number): string {
  if (done === 0) return 'Пока не собрал никто'
  if (done === total) return total === 1 ? 'Собрано' : `Собрали все ${collective(total)}`
  if (done === 1) return `Собрал один из ${ofCollective(total)}`
  return `Собрали ${collective(done)} из ${ofCollective(total)}`
}

/** Родительный падеж имени для фразы «у Миши»: Миша → Миши, Макс → Макса. */
export function nameGen(name: string): string {
  if (/[ая]$/i.test(name)) return name.replace(/[ая]$/i, 'и')
  return name + 'а'
}

/** Винительный падеж имени для «Попросить Костю». */
export function nameAcc(name: string): string {
  if (/я$/i.test(name)) return name.replace(/я$/i, 'ю')
  if (/а$/i.test(name)) return name.replace(/а$/i, 'у')
  return name + 'а'
}

/** Подпись для aria: «Макс упаковал, Костя упаковал, Миша не взял». */
export function crewAria(segs: CrewSegment[]): string {
  return segs.map((s) => `${s.name}: ${s.cant ? 'не может взять' : ST_NAME[s.status]}`).join(', ')
}
