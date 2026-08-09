/**
 * ВЗАИМОРАСЧЁТЫ — кто кому сколько должен.
 *
 * ─── Откуда взялось (заказчик, 05.08.2026) ───
 * Дословно: «Если человек ведёт транспорт и оплачивает бензин, он оплатит его
 * вначале… Общая сумма затрат на бензин обоих делится поровну между всеми,
 * и у тех, кто оплатил, часть суммы вычитается. Оплатили 3000, каждый по полторы —
 * остальные должны им ровно столько, сколько не хватает». И отдельно: «то, что
 * покупается индивидуально — например алкоголь, сигареты, — никогда не делится
 * на всех, оплачивается самостоятельно каждым».
 *
 * Это отменяет прежнюю догадку «весь бюджет делится на всех поровну». Настоящая
 * модель — БАЛАНС: у каждой траты есть тот, кто за неё заплатил, и круг тех,
 * между кем она делится.
 *
 *   доля(человек)     = Σ по тратам, где он делит:      сумма / сколько делящих
 *   уплачено(человек) = Σ по тратам, где платил он:     его часть суммы
 *   баланс(человек)   = уплачено − доля
 *
 * Баланс больше нуля — человеку должны, меньше — должен он.
 *
 * ─── Четыре режима траты, все читаются из уже существующих полей ───
 *   1. общая          — платят все поровну, делится на всех. Умолчание, то есть
 *                       ровно сегодняшнее поведение: баланс каждого 0.
 *   2. личная         — раздел закупки с `personal:true`. В общий бюджет такие
 *                       позиции и сегодня не входят (`calc.ts:buySum`), в зачёт
 *                       не идут тоже: человек платит сам за себя.
 *   3. куплена одним, делится на всех — у позиции закупки заполнено `o`
 *                       («кто сколько покупает»), у техники — `payer` или `owner`,
 *                       у аренды — `payer`. Ради этого случая всё и затевалось.
 *   4. делится на выбранный круг — заполнено `sp` (список id людей).
 *
 * ─── Чего эта функция НЕ делает ───
 * `perPerson()` в `calc.ts` не трогается ни строкой: на ней висит контрольная
 * цифра 11 848 ₽, её читают `trip/MoneyTiles.tsx` и `lib/export.ts`. «С каждого» —
 * это по-прежнему общий бюджет, делённый на людей. Баланс стоит рядом и отвечает
 * на другой вопрос: не «сколько стоит поездка на человека», а «кто кому доплачивает».
 *
 * ─── Инварианты, которые сверяет машина ───
 * `scripts/check-sums.mjs`, строки 7–9:
 *   Σ уплачено === Σ доля === grandTotal(S)   — деньги не появились и не исчезли;
 *   Σ баланс === 0                            — зачёт сходится.
 * Они держатся тем, что КАЖДАЯ трата целиком раскладывается и по плательщикам,
 * и по делящим: пустой плательщик означает «скинулись поровну», а не «никто
 * не платил», иначе первая же сумма без хозяина сломала бы первый инвариант.
 */

import type { Buy, CanRow, Rent, State, Transport } from './types.ts'
import { buyItemSum, canRowSum, fuelCost, personalSecIds, rentSum } from './calc.ts'

/** Строка зачёта по одному человеку. */
export interface Balance {
  id: string
  name: string
  /** сколько он выложил из своего кармана */
  paid: number
  /** сколько на него приходится по справедливости */
  share: number
  /** уплачено − доля: больше нуля — ему должны, меньше — должен он */
  balance: number
}

/** Один перевод «кто кому сколько», чтобы свести баланс к нулю. */
export interface Move {
  from: string
  fromName: string
  to: string
  toName: string
  sum: number
}

/** Итог взаиморасчётов. */
export interface Settle {
  rows: Balance[]
  moves: Move[]
  /** Σ уплачено — обязано совпасть с общим бюджетом */
  paid: number
  /** Σ доля — обязано совпасть с общим бюджетом */
  share: number
  /** Σ баланс — обязано быть нулём */
  drift: number
  /** личные покупки: в зачёт не идут, но человеку их видеть надо */
  personal: Record<string, number>
}

/**
 * Одна трата глазами зачёта.
 *
 * `payers` — веса, а не рубли: так одна и та же раскладка годится и для «купил
 * один целиком», и для «двое взяли по половине» (`Buy.o` хранит количества,
 * а не суммы). Пустые веса означают «скинулись поровну».
 */
interface Spend {
  sum: number
  payers: Record<string, number>
  sharers: string[]
  /**
   * Какая доля суммы вообще кем-то оплачена вперёд, от 0 до 1. Меньше единицы
   * бывает у закупки: отмечена одна штука из трёх — значит человек выложил
   * треть, а остальное скинули поровну. Непокрытый остаток всегда раскладывается
   * между делящими, иначе Σ уплачено перестало бы сходиться с бюджетом.
   */
  cover: number
}

/** Люди, на которых вообще можно что-то делить. */
function everyone(S: State): string[] {
  return S.people.map((p) => p.id)
}

/**
 * Круг делящих: `sp`, очищенный от тех, кого в команде уже нет. Пусто или
 * никого не осталось — делим на всех. Иначе выбывший человек уносил бы с собой
 * часть суммы и первый инвариант разошёлся бы (постулат «ничего не теряем»).
 */
function sharersOf(sp: string[] | undefined, all: string[]): string[] {
  if (!sp || sp.length === 0) return all
  const live = sp.filter((id) => all.includes(id))
  return live.length > 0 ? live : all
}

/** Веса плательщиков из явного поля: один человек — весь вес на нём. */
function payerWeight(payer: string | undefined, all: string[]): Record<string, number> {
  if (payer && all.includes(payer)) return { [payer]: 1 }
  return {}
}

/**
 * Веса плательщиков позиции закупки — в ЕДИНИЦАХ товара, а не в долях.
 *
 * `Buy.o` — «кто сколько покупает» (id человека → количество). Это и есть
 * плательщики: человек, отмеченный в позиции, идёт и платит за неё. Поле
 * уже правится в матрице «Закупки» — новых органов под плательщика не нужно.
 * Явный `payer` перебивает `o`.
 *
 * ⚠️ Старое одиночное `who` читается как одна единица — ровно так же, как это
 * делает сама таблица «Закупки» (`buy/buylocal.tsx`, `buyerQty`). Иначе человек
 * видел бы себя отмеченным покупателем на экране, а в зачёте позиция шла бы
 * как «скинулись поровну», и деньги ему не возвращались бы. Два ответа на один
 * вопрос в двух разделах — это дефект, а не разные точки зрения.
 *
 * ⚠️ Возвращаются ЕДИНИЦЫ, а не веса: если у позиции `q = 3`, а отмечена
 * одна штука, человек заплатил треть, а не всё. Остаток раскладывается
 * «скинулись поровну» в `shares()`.
 */
function buyPayers(b: Buy, all: string[]): Record<string, number> {
  const direct = payerWeight(b.payer, all)
  if (Object.keys(direct).length > 0) return direct
  const out: Record<string, number> = {}
  const o = b.o ?? {}
  const ids = Object.keys(o)
  if (ids.length === 0) {
    if (b.who && all.includes(b.who)) out[b.who] = 1
    return out
  }
  for (const id of ids) {
    const w = Number(o[id]) || 0
    if (w > 0 && all.includes(id)) out[id] = w
  }
  return out
}

/**
 * Какая часть позиции закупки оплачена вперёд.
 *
 * Явный плательщик — вся. Отметки `o` считаются в штуках против `q`: отмечена
 * одна из трёх — оплачена треть. Больше единицы не бывает: если отметили штук
 * больше, чем в позиции, лишнее не превращается в чужой долг.
 * Старое одиночное `who` без `o` — одна штука, как и в таблице «Закупки».
 */
function buyCover(b: Buy): number {
  if (b.payer) return 1
  const o = b.o ?? {}
  const ids = Object.keys(o)
  const q = b.q > 0 ? b.q : 1
  if (ids.length === 0) return b.who ? Math.min(1, 1 / q) : 0
  const taken = ids.reduce((s, id) => s + (Number(o[id]) || 0), 0)
  return Math.min(1, Math.max(0, taken / q))
}

/** Разложить документ на траты, входящие в общий бюджет. */
function spends(S: State): Spend[] {
  const all = everyone(S)
  const out: Spend[] = []

  /* Топливо: платит владелец техники, если не сказано иначе. Это ровно тот
     случай из слов заказчика — «оплачивают, как правило, владельцы автомобиля». */
  for (const t of S.transport as Transport[]) {
    const sum = fuelCost(t, S)
    if (sum === 0) continue
    /* ⚠️ `??`, а не `||`. Пустая строка — это осознанный выбор человека
       «скинулись поровну», и подменять её владельцем нельзя; отсутствие ключа
       вовсе — это документ, который про плательщиков ещё не знает, там платит
       владелец. Через `||` оба случая слиплись бы в один. */
    const payers = payerWeight(t.payer ?? t.owner, all)
    out.push({
      sum,
      payers,
      sharers: sharersOf(t.sp, all),
      cover: Object.keys(payers).length > 0 ? 1 : 0,
    })
  }

  /* Топливо в канистрах: то, что берут сверх расчёта, — тоже деньги, и они
     обязаны разложиться по людям. Иначе первый инвариант (Σ уплачено = итого)
     разошёлся бы на первой же вписанной канистре. Плательщик пуст — «скинулись
     поровну», ровно как у аренды. */
  for (const r of S.canRows as CanRow[]) {
    const sum = canRowSum(r, S)
    if (sum === 0) continue
    const payers = payerWeight(r.payer, all)
    out.push({
      sum,
      payers,
      sharers: sharersOf(r.sp, all),
      cover: Object.keys(payers).length > 0 ? 1 : 0,
    })
  }

  /* Аренда: у кого-то одного ушли деньги вперёд — например залог за лодку. */
  for (const r of S.rent as Rent[]) {
    const sum = rentSum(r)
    if (sum === 0) continue
    const payers = payerWeight(r.payer, all)
    out.push({
      sum,
      payers,
      sharers: sharersOf(r.sp, all),
      cover: Object.keys(payers).length > 0 ? 1 : 0,
    })
  }

  /* Закупка: только «купить» и только неличные разделы — ровно то, что
     входит в общий бюджет по `calc.ts`. Личное считается отдельно ниже. */
  const personal = personalSecIds(S)
  for (const b of S.buy as Buy[]) {
    if (b.st !== 'buy' || personal.has(b.sec)) continue
    const sum = buyItemSum(b)
    if (sum === 0) continue
    out.push({ sum, payers: buyPayers(b, all), sharers: sharersOf(b.sp, all), cover: buyCover(b) })
  }

  return out
}

/**
 * Разложить ОДНУ трату по людям — ровно теми же правилами, что и весь зачёт.
 *
 * ⛔ Арифметика живёт здесь в единственном экземпляре: `shares()` зовёт эту же
 * функцию в цикле. Иначе строка списка и раздел взаиморасчётов однажды сказали
 * бы про одну покупку разное — а два ответа на один вопрос это дефект (У-58).
 */
function applySpend(
  sp: Spend,
  paidBy: Record<string, number>,
  shareBy: Record<string, number>,
): void {
  if (sp.sharers.length === 0) return

  /* Доля: сумма поровну между делящими. */
  const part = sp.sum / sp.sharers.length
  for (const id of sp.sharers) shareBy[id] = (shareBy[id] ?? 0) + part

  /* Уплачено. Покрытая часть идёт по весам плательщиков, непокрытая —
     поровну между делящими: каждый выложил ровно свою долю и остался при
     нулях, то есть ведёт себя как сегодня. Так Σ уплачено всегда равно
     сумме траты целиком, и первый инвариант не может разойтись. */
  const keys = Object.keys(sp.payers)
  const cover = keys.length === 0 ? 0 : Math.min(1, Math.max(0, sp.cover))
  if (cover < 1) {
    const rest = (sp.sum * (1 - cover)) / sp.sharers.length
    for (const id of sp.sharers) paidBy[id] = (paidBy[id] ?? 0) + rest
  }
  if (cover > 0) {
    const total = keys.reduce((s, k) => s + sp.payers[k], 0)
    for (const k of keys) paidBy[k] = (paidBy[k] ?? 0) + (sp.sum * cover * sp.payers[k]) / total
  }
}

/** Одна доля одного человека — то, что печатается в строке списка. */
export interface SplitPart {
  id: string
  name: string
  /** целые рубли: человек их складывает глазами, копейки тут только мешают */
  sum: number
}

/** Как одна трата ложится на людей: кто выложил и по сколько с каждого. */
export interface SpendSplit {
  sum: number
  /** кто заплатил вперёд и сколько; пусто — скинулись поровну */
  paid: SplitPart[]
  /** по сколько приходится на каждого делящего */
  share: SplitPart[]
  /** делится на всю команду, а не на выбранный круг */
  everyone: boolean
}

/** Собрать раскладку одной траты в целых рублях. */
function splitOf(sp: Spend, S: State, all: string[]): SpendSplit {
  const paidBy: Record<string, number> = {}
  const shareBy: Record<string, number> = {}
  applySpend(sp, paidBy, shareBy)

  const name = (id: string) => S.people.find((p) => p.id === id)?.name ?? id
  /* Целые рубли раздаются «наибольшим остатком» — теми же весами, что и в зачёте,
     иначе три доли по 333,33 ₽ показались бы суммой 999 ₽ при сумме траты 1 000. */
  const whole = (bag: Record<string, number>): SplitPart[] => {
    const vals = Object.keys(bag).map((id) => ({ id, v: bag[id] }))
    const round = spread(vals, Math.round(vals.reduce((s, x) => s + x.v, 0)))
    return vals.map((x) => ({ id: x.id, name: name(x.id), sum: round[x.id] ?? 0 }))
  }

  /* Плательщики показываются, только когда кто-то действительно выложил вперёд:
     «скинулись поровну» — это не «заплатили все», а «никто не выложил за других». */
  const anyPayer = Object.keys(sp.payers).length > 0 && sp.cover > 0
  return {
    sum: sp.sum,
    paid: anyPayer ? whole(paidBy).filter((x) => x.sum !== 0) : [],
    share: whole(shareBy),
    everyone: sp.sharers.length === all.length,
  }
}

/**
 * Раскладка одной позиции закупки — для показа прямо в её строке.
 *
 * Заказчик 08.08.2026: «если разворачивается список — кто покупает; если делится,
 * по сколько частей между участниками». До этого доли считались только в разделе
 * взаиморасчётов, то есть в другом месте, чем сама покупка.
 */
export function buySplit(b: Buy, S: State): SpendSplit {
  const all = everyone(S)
  return splitOf(
    { sum: buyItemSum(b), payers: buyPayers(b, all), sharers: sharersOf(b.sp, all), cover: buyCover(b) },
    S,
    all,
  )
}

/**
 * Раскладка одной траты «Дороги» — топлива, аренды, стоянки.
 *
 * Дословно там же: «то же самое касается бензина». Плательщик у этих трат задан
 * явным полем, а не отметками покупателей, поэтому веса считаются `payerWeight`.
 */
export function spendSplit(
  sum: number,
  payer: string | undefined,
  sp: string[] | undefined,
  S: State,
): SpendSplit {
  const all = everyone(S)
  const payers = payerWeight(payer, all)
  return splitOf(
    { sum, payers, sharers: sharersOf(sp, all), cover: Object.keys(payers).length > 0 ? 1 : 0 },
    S,
    all,
  )
}

/** Личные покупки по людям: в зачёт не идут, но человек обязан их видеть. */
function personalByPerson(S: State): Record<string, number> {
  const all = everyone(S)
  const personal = personalSecIds(S)
  const out: Record<string, number> = {}
  for (const b of S.buy as Buy[]) {
    if (b.st !== 'buy' || !personal.has(b.sec)) continue
    const sum = buyItemSum(b)
    if (sum === 0) continue
    const w = buyPayers(b, all)
    const keys = Object.keys(w)
    if (keys.length === 0) continue
    const total = keys.reduce((s, k) => s + w[k], 0)
    /* Личное не делится ни на кого: сколько записано за человеком, столько
       он и потратил на себя — покрытие тут ни при чём. */
    for (const k of keys) out[k] = (out[k] ?? 0) + (sum * w[k]) / total
  }
  return out
}

/**
 * Свести баланс переводами: самый должный платит самому кредитуемому, пока
 * оба не обнулятся. Переводов выходит не больше, чем людей минус один, —
 * это меньше, чем «каждый каждому», и именно так люди считаются в жизни.
 */
function movesOf(rows: Balance[]): Move[] {
  const debt = rows.filter((r) => r.balance < -0.5).map((r) => ({ ...r }))
  const cred = rows.filter((r) => r.balance > 0.5).map((r) => ({ ...r }))
  debt.sort((a, b) => a.balance - b.balance)
  cred.sort((a, b) => b.balance - a.balance)

  const out: Move[] = []
  let i = 0
  let j = 0
  while (i < debt.length && j < cred.length) {
    const need = -debt[i].balance
    const has = cred[j].balance
    const sum = Math.min(need, has)
    if (sum > 0.5) {
      out.push({
        from: debt[i].id,
        fromName: debt[i].name,
        to: cred[j].id,
        toName: cred[j].name,
        sum,
      })
    }
    debt[i].balance += sum
    cred[j].balance -= sum
    if (-debt[i].balance <= 0.5) i++
    if (cred[j].balance <= 0.5) j++
  }
  return out
}

/**
 * Взаиморасчёты целиком.
 *
 * Пустая команда — считать не на кого: возвращается пустой зачёт, а не деление
 * на ноль. Инварианты при этом тоже сходятся (0 === 0).
 */
export function shares(S: State): Settle {
  const paidBy: Record<string, number> = {}
  const shareBy: Record<string, number> = {}

  for (const sp of spends(S)) applySpend(sp, paidBy, shareBy)

  const rows: Balance[] = S.people.map((p) => {
    const paid = paidBy[p.id] ?? 0
    const share = shareBy[p.id] ?? 0
    return { id: p.id, name: p.name, paid, share, balance: paid - share }
  })

  const paid = rows.reduce((s, r) => s + r.paid, 0)
  const share = rows.reduce((s, r) => s + r.share, 0)

  return {
    rows,
    moves: movesOf(rows),
    paid,
    share,
    drift: rows.reduce((s, r) => s + r.balance, 0),
    personal: personalByPerson(S),
  }
}

/**
 * Раздать целые рубли по долям так, чтобы их сумма совпала с заданной.
 *
 * «Наибольший остаток»: округляем вниз, недостающие рубли отдаём тем, у кого
 * дробная часть больше. Так поправка достаётся тому, кого она и так почти
 * касалась, а не случайной строке.
 */
function spread(vals: { id: string; v: number }[], target: number): Record<string, number> {
  const out: Record<string, number> = {}
  if (vals.length === 0) return out
  const parts = vals.map((x) => ({ id: x.id, base: Math.floor(x.v), frac: x.v - Math.floor(x.v) }))
  let left = target - parts.reduce((s, x) => s + x.base, 0)
  const order = [...parts].sort((a, b) => b.frac - a.frac)
  const bonus = new Set<string>()
  /* Раздавать может понадобиться и в минус — когда округление вниз перебрало. */
  const step = left >= 0 ? 1 : -1
  for (const x of (step > 0 ? order : order.reverse())) {
    if (left === 0) break
    bonus.add(x.id)
    left -= step
  }
  for (const x of parts) out[x.id] = x.base + (bonus.has(x.id) ? step : 0)
  return out
}

/** Тот же зачёт, но целыми рублями — ровно так, как он попадает на экран. */
export interface WholeSettle {
  rows: (Balance & { id: string })[]
  paid: Record<string, number>
  share: Record<string, number>
  balance: Record<string, number>
  moves: Move[]
}

/**
 * ⛔ Зачёт ЦЕЛЫМИ РУБЛЯМИ — то, что человек видит и складывает глазами.
 *
 * Почему это отдельная функция, а не `Math.round` по месту показа: округление
 * каждой величины по отдельности рвёт связи между ними. На сиде выходило так:
 * «Выложил 10 251 ₽, доля 11 848 ₽» — разность 1 597, а в столбце «Итог»
 * стояло −1 596. И Женя по списку переводов отдавал 888 + 709 = 1 597 ₽ при
 * своём итоге −1 596. Три противоречия на одном экране, все — от копеек.
 *
 * Поэтому округление делается ОДИН раз и согласованно:
 *   уплачено и доля раздаются «наибольшим остатком» на один и тот же итог,
 *   баланс считается уже ИЗ НИХ (значит их разность сходится по определению
 *   и Σ баланса — ноль), а переводы строятся из целых балансов.
 * После этого любая арифметика, которую заказчик проделает на бумаге, сойдётся.
 */
export function wholeSettle(r: Settle): WholeSettle {
  const target = Math.round(r.paid)
  const paid = spread(r.rows.map((x) => ({ id: x.id, v: x.paid })), target)
  const share = spread(r.rows.map((x) => ({ id: x.id, v: x.share })), Math.round(r.share))
  const balance: Record<string, number> = {}
  for (const x of r.rows) balance[x.id] = (paid[x.id] ?? 0) - (share[x.id] ?? 0)
  const rows = r.rows.map((x) => ({ ...x, paid: paid[x.id] ?? 0, share: share[x.id] ?? 0, balance: balance[x.id] ?? 0 }))
  return { rows, paid, share, balance, moves: movesOf(rows) }
}
