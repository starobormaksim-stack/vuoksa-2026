/**
 * Логика раздела «Закупка» — чистые функции без DOM.
 *
 * Главное здесь — buyLine(): вторая строка позиции, которой заменяются и «формула»
 * `[2] [шт.] × [900] [—]`, и подписи «план»/«факт» под полями
 * (docs/v2-ux-redesign.md, раздел 9.2). Слово «план» из интерфейса исчезает:
 * цена по умолчанию и есть план, а фактическая помечается словом «по факту».
 */

import type { Buy, BuyStatus, Person, State } from './types.ts'
import { money } from './calc.ts'
import { fmtNum, NBSP } from '../format.ts'

/** Цена, по которой позиция считается: факт важнее плана. */
export function priceOf(p: Buy): number {
  return p.prf > 0 ? p.prf : p.pr
}

/** Сумма позиции: количество × действующая цена. */
export function sumOf(p: Buy): number {
  return p.q * priceOf(p)
}

/** Позиция идёт в общий счёт. */
export function counted(p: Buy): boolean {
  return p.st === 'buy'
}

/** Единица позиции: из справочника по uid, иначе текстовое поле u. */
export function unitOf(p: Buy, S: State): string {
  const u = S.units.find((x) => x.i === p.uid)
  return u ? u.t : p.u || 'шт.'
}

/** Русское название статуса для строки-кнопки в карточке. */
export function statusName(st: BuyStatus, people: Person[]): string {
  if (st === 'buy') return 'Купить'
  if (st === 'ask') return 'Под вопросом'
  if (st === 'skip') return 'Не берём'
  const id = st.slice(4)
  const p = people.find((x) => x.id === id)
  return p ? `Есть у ${nameGen(p.name)}` : 'Уже есть'
}

/** Родительный падеж имени: Костя → Кости, Макс → Макса. */
function nameGen(name: string): string {
  if (/[ая]$/i.test(name)) return name.replace(/[ая]$/i, 'и')
  return name + 'а'
}

/** Прошедшее время «купил/купила» — по умолчанию мужской род (весь экипаж мужской). */
function bought(): string {
  return 'купил'
}

/** Полный список статусов для radio-group с объяснением последствия. */
export interface StatusOption {
  id: BuyStatus
  title: string
  hint: string
}

export function statusOptions(p: Buy, S: State): StatusOption[] {
  const out: StatusOption[] = [
    { id: 'buy', title: 'Купить', hint: `войдёт в общую сумму ${MDASH} ${money(sumOf(p), S.doc)}` },
  ]
  for (const person of S.people) {
    out.push({
      id: `has_${person.id}` as BuyStatus,
      title: `Есть у ${nameGen(person.name)}`,
      hint: 'не покупаем, в сумму не идёт',
    })
  }
  out.push({ id: 'ask', title: 'Под вопросом', hint: 'решим позже, в сумму не идёт' })
  out.push({ id: 'skip', title: 'Не берём', hint: 'останется в списке, но серым' })
  return out
}

const MDASH = '—'

/**
 * Вторая строка позиции. Шаблон:
 *   <кол-во> <единица> по <цена> ₽[ по факту (было <план>)][ · <статус или кто покупает>]
 * Ни знака ×, ни слов «план»/«факт» под полями.
 */
export function buyLine(p: Buy, S: State): string {
  const unit = unitOf(p, S)
  const parts: string[] = []

  if (p.pr <= 0 && p.prf <= 0) {
    parts.push(`${fmtNum(p.q)}${NBSP}${unit} · цена не вписана`)
  } else if (p.prf > 0) {
    let s = `${fmtNum(p.q)}${NBSP}${unit} по ${money(p.prf, S.doc)} по факту`
    if (p.pr > 0 && p.pr !== p.prf) s += ` (было ${fmtNum(p.pr)})`
    parts.push(s)
  } else {
    parts.push(`${fmtNum(p.q)}${NBSP}${unit} по ${money(p.pr, S.doc)}`)
  }

  if (p.st === 'ask') parts.push('под вопросом, в сумму не идёт')
  else if (p.st === 'skip') parts.push('не берём')
  else if (p.st !== 'buy') {
    const who = S.people.find((x) => x.id === p.st.slice(4))
    parts.push(who ? `есть у ${nameGen(who.name)}, в сумму не идёт` : 'уже есть, в сумму не идёт')
  }

  if (p.who) {
    const w = S.people.find((x) => x.id === p.who)
    const name = w ? w.name : p.who
    parts.push(p.b ? `${bought()} ${name}` : `покупает ${name}`)
  }

  return parts.join(' · ')
}

/** Сумма справа: «—», если цены нет вовсе. */
export function sumLabel(p: Buy, S: State): string {
  if (p.pr <= 0 && p.prf <= 0) return MDASH
  return money(sumOf(p), S.doc)
}

/* ─────────── разбор «Как это считается» ─────────── */

/** Строка разбора: подытог раздела либо строка «не вошло». */
export interface BreakRow {
  key: string
  title: string
  sum: number
  count?: number
}

export interface BuyBreak {
  /** подытоги общих (неличных) разделов */
  sections: BreakRow[]
  /** сколько бы стоило то, что в сумму не вошло */
  excluded: BreakRow[]
  /** личные разделы — в делёж не входят */
  personal: BreakRow[]
  /** сумма по общим разделам (== buyTotal) */
  total: number
  /** факт вписан хотя бы у одной позиции */
  anyFact: boolean
}

/** Полный разбор закупки для карточки «Как это считается» (раздел 9.4). */
export function buyBreak(S: State): BuyBreak {
  const personalIds = new Set(S.buySections.filter((s) => s.personal).map((s) => s.i))
  const sections: BreakRow[] = []
  const personal: BreakRow[] = []
  let total = 0
  let anyFact = false

  for (const sec of [...S.buySections].sort((a, b) => a.ord - b.ord)) {
    const rows = S.buy.filter((p) => p.sec === sec.i && counted(p))
    const sum = rows.reduce((s, p) => s + sumOf(p), 0)
    const row: BreakRow = { key: sec.i, title: sec.t, sum, count: rows.length }
    if (personalIds.has(sec.i)) personal.push(row)
    else {
      sections.push(row)
      total += sum
    }
  }
  for (const p of S.buy) if (p.prf > 0) anyFact = true

  /* «Не вошло в сумму»: сколько бы это стоило по действующей цене */
  const groups: Record<string, BreakRow> = {}
  for (const p of S.buy) {
    if (counted(p) || personalIds.has(p.sec)) continue
    const key = p.st === 'ask' ? 'ask' : p.st === 'skip' ? 'skip' : 'has'
    const title =
      key === 'ask' ? 'под вопросом' : key === 'skip' ? 'не берём' : 'есть дома у кого-то'
    if (!groups[key]) groups[key] = { key, title, sum: 0, count: 0 }
    groups[key].sum += sumOf(p)
    groups[key].count = (groups[key].count || 0) + 1
  }
  const excluded = ['has', 'ask', 'skip'].map((k) => groups[k]).filter(Boolean)

  return { sections, excluded, personal, total, anyFact }
}

/** Русская плюрализация для «4 позиции». */
export function plurItems(n: number): string {
  const abs = Math.abs(n) % 100
  const d = abs % 10
  if (abs > 10 && abs < 20) return 'позиций'
  if (d > 1 && d < 5) return 'позиции'
  if (d === 1) return 'позиция'
  return 'позиций'
}
