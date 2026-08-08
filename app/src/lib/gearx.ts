/**
 * Логика раздела «Сборы» — чистые функции без DOM.
 *
 * Пять состояний (docs/v2-ux-redesign.md, 4.5) — те же, что в v1 (ST_NAME/ST_ICON):
 *   0 не взято · 1 в процессе · 2 упаковано · 3 в машине
 * ⚠️ Числа — форма ХРАНЕНИЯ и менять их нельзя. Порядок, в котором их
 * перебирает тап, задан отдельно (`RING`) и с хранением не совпадает.
 * «Не могу взять» хранится отдельно — в gear.q[personId], — но по кругу ячейки
 * идёт наравне с остальными (см. MarkValue ниже): другого места, где её поставить,
 * в таблице нет, а шторки заказчик отменил 04.08.2026.
 * В готовность идут только «упаковано» и «в машине».
 */

import type { Gear, Person, QtyAsk, State } from './types.ts'
import { orderedPeople } from './people.ts'
import { NBSP, plural } from '../format.ts'

/** Названия состояний по индексу. */
export const ST_NAME = ['не взято', 'в процессе', 'упаковано', 'в машине'] as const

/** Состояние из круга: 0…3. */
export type StatusValue = 0 | 1 | 2 | 3

/**
 * Порядок обхода круга — НЕ порядок хранения.
 *
 * Заказчик 08.08.2026: «по умолчанию всегда при нажатии на тот или иной пункт
 * в вещах должен показываться в первую очередь „упакован“, а потом идёт
 * „в процессе“, „в машине“. Последним будет „не могу взять“. То есть их нужно
 * поменять местами: „упаковано“ и „в процессе“».
 *
 * Резон понятен из жизни: тапают по вещи, когда её ПОЛОЖИЛИ, а не когда начали
 * искать. Стоял порядок 0 → 1 → 2 → 3, и чтобы отметить сложенную вещь, надо
 * было нажать дважды, проехав через «в процессе».
 *
 * ⛔ Числа при этом остались на своих местах: 1 — это по-прежнему «в процессе»,
 * 2 — «упаковано». Меняется только маршрут обхода. Иначе у всех, кто уже
 * что-то отметил, значения в `gear.s` сменили бы смысл разом — а это боевые
 * данные четверых людей (постулат 4).
 */
const RING: readonly StatusValue[] = [0, 2, 1, 3]

/** Следующее по кругу: не взято → упаковано → в процессе → в машине → не взято. */
export function nextStatus(v: number): StatusValue {
  const at = RING.indexOf((v || 0) as StatusValue)
  return RING[(at + 1) % RING.length] ?? 0
}

/** Последнее состояние круга — за ним идёт «не могу взять». */
const RING_LAST = RING[RING.length - 1]

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
 * Переключить состояние по кругу 0 → 1 → 2 → 3 → 0 без отказа.
 * Такой круг нужен там, где отметке «не могу взять» взяться неоткуда и негде
 * показать причину, — например в списке «что осталось» на обложке. Отказ при
 * этом снимается: иначе поверх круга навсегда остаётся треугольник и человек
 * не может двинуться дальше. Возвращает снятую отметку — вызывающий покажет
 * тост с «Отменить».
 *
 * В самой таблице «Сборов» круг другой, с отказом: см. cycleMark.
 */
export function cycleStatus(g: Gear, personId: string): QtyAsk | null {
  const cant = cantOf(g, personId)
  if (cant && g.q) delete g.q[personId]
  g.s = g.s || {}
  g.s[personId] = nextStatus(statusOf(g, personId))
  return cant
}

/* ─── Отметка в ячейке: круг состояний и «не могу взять» ──────────────────── */

/**
 * Что стоит в ячейке человека: одно из четырёх состояний круга или отказ.
 * Отказ хранится в другом поле (`q`), но для человека это такая же отметка,
 * как остальные, и ставится там же — кружком в ячейке.
 */
export type MarkValue = StatusValue | 'cant'

/** Название отметки словами — теми же, что в легенде. */
export function markName(v: MarkValue): string {
  return v === 'cant' ? 'не могу взять' : ST_NAME[v]
}

/** Отметка человека по позиции. Отказ старше состояния: он перекрывает круг. */
export function markOf(g: Gear, personId: string): MarkValue {
  return cantOf(g, personId) ? 'cant' : statusOf(g, personId)
}

/**
 * Следующая по кругу: не взято → упаковано → в процессе → в машине →
 * не могу взять → не взято (порядок задан `RING`, см. `nextStatus`).
 */
export function nextMark(v: MarkValue): MarkValue {
  if (v === 'cant') return 0
  return v === RING_LAST ? 'cant' : nextStatus(v)
}

/**
 * Поставить отметку. Причина отказа, если она была записана, сохраняется:
 * человек мог снять отметку случайно, а объяснение — его слова, не наши.
 * Просьбу изменить количество (`q` вида 'qty') не трогаем — это не отказ.
 */
export function setMark(g: Gear, personId: string, v: MarkValue): void {
  const cant = cantOf(g, personId)
  if (v === 'cant') {
    g.q = g.q || {}
    g.q[personId] = { kind: 'cant', why: cant?.why ?? '', ua: Date.now() }
    return
  }
  if (cant && g.q) delete g.q[personId]
  g.s = g.s || {}
  g.s[personId] = v
}

/** Перевести ячейку на следующую отметку по кругу и вернуть новую. */
export function cycleMark(g: Gear, personId: string): MarkValue {
  const next = nextMark(markOf(g, personId))
  setMark(g, personId, next)
  return next
}

/** Записать причину отказа, не трогая саму отметку. */
export function setCantWhy(g: Gear, personId: string, why: string): void {
  if (!cantOf(g, personId)) return
  g.q = g.q || {}
  g.q[personId] = { kind: 'cant', why, ua: Date.now() }
}

/* ─── Единица измерения позиции ───────────────────────────────────────────── */

/**
 * Единица измерения вещи: «пара», «шт.», «компл.». Справочник — `S.units[]`,
 * но вписать свою тоже можно: в таблице заказчика единица — просто слово.
 *
 * ⚠️ Поле `u` в `lib/types.ts` пока не объявлено (файл вне этой правки), поэтому
 * читаем и пишем его расширением типа. Данные при этом целы: слияние отдаёт
 * незнакомые поля позиции целиком, а форма хранения не меняется.
 */
export type GearUnit = Gear & { u?: string }

/** Единица позиции; не записана — считаем штуками, как в таблице заказчика. */
export function unitOf(g: Gear): string {
  return ((g as GearUnit).u || '').trim() || 'шт.'
}

/** Записать единицу. Пустая строка возвращает позицию к штукам. */
export function setUnitOf(g: Gear, u: string): void {
  ;(g as GearUnit).u = u.trim()
}

/** «2 шт.», «2 пары» — число и единица склеены неразрывным пробелом. */
export function qtyLabel(n: number, unit = 'шт.'): string {
  return `${n}${NBSP}${unit}`
}

/** Кто везёт позицию: люди с ненулевым количеством, в порядке S.people. */
export function holders(g: Gear, people: Person[]): Person[] {
  return people.filter((p) => (g.o?.[p.id] || 0) > 0)
}

/**
 * Всего штук по позиции — сумма по людям, которые СЕЙЧАС в поездке.
 *
 * ⛔ Список людей обязателен. Заказчик 06.08.2026: «сверху написано „сапоги
 * резиновые, 4 штуки“… открываешь внутрь: три человека, три штуки». Так и было:
 * Женю убрали из поездки, а его единицы остались в 31 позиции — сумма считала
 * их, а раскрытая подробность рисует строки только по нынешним людям. Число
 * на полоске обязано совпадать с тем, что под ней (У-104).
 *
 * ⛔ Чужие числа из документа НЕ удаляются (постулат 4): вернётся человек —
 * вернётся и его единица. Мы их только не складываем.
 */
export function totalQty(g: Gear, people: Person[]): number {
  return people.reduce((s, p) => s + (g.o?.[p.id] || 0), 0)
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

/**
 * Строка собрана целиком: у всех, кто её везёт, состояние готово.
 * Позиция, которую не везёт никто, собранной не считается — её ещё некому нести.
 */
export function rowReady(g: Gear): boolean {
  const hs = Object.keys(g.o || {}).filter((id) => (g.o[id] || 0) > 0)
  return hs.length > 0 && hs.every((id) => isReady(statusOf(g, id)))
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
      if (rowReady(g)) done++
    }
  }
  return { done, total }
}

/* ─── Разбор готовности: что именно осталось и у кого ─────────────────────── */

/**
 * Сборы одного человека, разложенные по корзинам.
 * Проценты те же, что у readyOf: done — это ровно «упаковано» и «в машине».
 */
export interface ReadyBreakdown {
  /** упаковано или в машине */
  done: Gear[]
  /** в процессе */
  inWork: Gear[]
  /** не взято */
  todo: Gear[]
  /** отмечено «не могу взять» */
  cant: Gear[]
  /** всего позиций у человека — вместе с теми, что он взять не может */
  total: number
  pct: number
}

/**
 * Разбор сборов человека: что готово, что в работе, что не начато, от чего он отказался.
 * Позиция считается его, если он везёт хотя бы штуку (g.o[personId] > 0).
 *
 * «Не могу взять» вынимает позицию из «осталось» и «собирает», но не из total:
 * отказ — это не выполненная работа, и процент от него не растёт.
 * Единственное исключение — позиция, уже доведённая до «упаковано»/«в машине»:
 * она остаётся в «Готово», иначе разбор показал бы процент ниже, чем полоса
 * и кольцо, которые считает readyOf. Отметка отказа поверх упакованной вещи —
 * след прошлого, а не текущее положение дел.
 */
export function breakdownOf(S: State, personId: string): ReadyBreakdown {
  const b: ReadyBreakdown = { done: [], inWork: [], todo: [], cant: [], total: 0, pct: 0 }
  for (const g of S.gear) {
    if ((g.o?.[personId] || 0) <= 0) continue
    b.total++
    const st = statusOf(g, personId)
    if (isReady(st)) b.done.push(g)
    else if (cantOf(g, personId)) b.cant.push(g)
    else if (st === 1) b.inWork.push(g)
    else b.todo.push(g)
  }
  b.pct = b.total > 0 ? Math.round((b.done.length / b.total) * 100) : 0
  return b
}

/** Разбор одного человека внутри разбора команды. */
export interface CrewReadyRow {
  person: Person
  b: ReadyBreakdown
}

/** Сборы всей команды: разбор по каждому плюс общие цифры. */
export interface CrewBreakdown {
  /** по людям, в порядке S.people */
  people: CrewReadyRow[]
  /** несобранных позиций всего: не взято + в процессе + не могу взять */
  left: number
  /** у скольких человек ещё есть несобранное */
  leftPeople: number
  total: number
  pct: number
}

/** Разбор по всей команде — та же арифметика, что у readyAll, плюс списки. */
export function breakdownAll(S: State): CrewBreakdown {
  const people: CrewReadyRow[] = S.people.map((person) => ({
    person,
    b: breakdownOf(S, person.id),
  }))
  let done = 0
  let total = 0
  let left = 0
  let leftPeople = 0
  for (const r of people) {
    done += r.b.done.length
    total += r.b.total
    const n = r.b.total - r.b.done.length
    left += n
    if (n > 0) leftPeople++
  }
  return { people, left, leftPeople, total, pct: total > 0 ? Math.round((done / total) * 100) : 0 }
}

/**
 * Порядок людей в разборе готовности: читатель первым (он пришёл по своей ссылке),
 * дальше — по возрастанию процента, чтобы тот, кто тормозит сборы, оказался наверху.
 * Сам документ S.people не переставляется.
 */
export function rankedPeople(S: State): Person[] {
  const list = orderedPeople(S.people, S.me)
  const meFirst = S.me && list[0]?.id === S.me ? 1 : 0
  const rest = list.slice(meFirst)
  const pct = new Map(rest.map((p) => [p.id, readyOf(S, p.id).pct]))
  const sorted = [...rest].sort((a, b) => (pct.get(a.id) ?? 0) - (pct.get(b.id) ?? 0))
  return [...list.slice(0, meFirst), ...sorted]
}

/** Всё несобранное человека одним списком: сначала не начатое, потом в работе, потом отказы. */
export function missingOf(b: ReadyBreakdown): Gear[] {
  return [...b.todo, ...b.inWork, ...b.cant]
}

/**
 * Строка человека в «Кто уже собрался»: «не собрано 5: палатка, спальник, тент и ещё 2».
 * Заказчик просил не проценты, а сами названия — первые `max`, остальные счётом.
 */
export function missingLineOf(b: ReadyBreakdown, max = 3): string {
  if (b.total === 0) return 'ничего не поручено'
  const rest = missingOf(b)
  if (rest.length === 0) return 'всё собрано'
  const head = rest.slice(0, max).map((g) => g.n).join(', ')
  const more = rest.length - Math.min(max, rest.length)
  return `не собрано ${rest.length}: ${head}${more > 0 ? ` и${NBSP}ещё ${more}` : ''}`
}

/** Фраза под кольцом: «Осталось 12 позиций у троих». */
export function restLineAll(c: CrewBreakdown): string {
  if (c.total === 0) return 'В сборах пока нет ни одной позиции'
  if (c.left === 0) return 'Собрано всё — ничего не осталось'
  const items =
    c.left === 1
      ? 'Осталась 1 позиция'
      : `Осталось ${c.left} ${plural(c.left, 'позиция', 'позиции', 'позиций')}`
  if (c.leftPeople === 1) {
    const one = c.people.find((r) => r.b.total - r.b.done.length > 0)
    if (one) return `${items} у ${nameGen(one.person.name)}`
  }
  const who =
    c.leftPeople <= 7
      ? ofCollective(c.leftPeople)
      : `${c.leftPeople} ${plural(c.leftPeople, 'человека', 'человек', 'человек')}`
  return `${items} у ${who}`
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
  return `${head}, всего ${qtyLabel(totalQty(g, people), unitOf(g))}`
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
