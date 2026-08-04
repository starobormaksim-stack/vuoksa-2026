/**
 * Расчётное ядро v2 (Pine-to-Pine) — чистые функции без DOM.
 * Формулы: docs/v2-architecture.md, раздел 2.2.
 *
 * Контрольные цифры на seed-v2.json:
 *   км 330 · топливо 6 385,35 · аренда 15 000 · транспорт 21 385,35
 *   закупка 26 005 · итого 47 390,35 · с каждого 11 847,59 · АИ-92 → 2 канистры
 */

import type { Buy, Doc, Rent, State, Transport } from './types.ts'

/** Строка сводки по канистрам для одного вида топлива. */
export interface CanInfo {
  /** id топлива из fuelPrices */
  fuel: string
  /** название топлива («АИ-92») */
  name: string
  /** литров везём с собой */
  litres: number
  /** канистр (по doc.canVol, с округлением вверх) */
  cans: number
}

/** Результат calcAll(S). */
export interface CalcResult {
  km: number
  fuel: number
  rent: number
  transport: number
  buy: number
  personal: number
  total: number
  perPerson: number
  cans: CanInfo[]
}

/** Пробег авто, км: (auto|manual) × kBack + local. На сиде 150×2+30 = 330. */
export function routeKm(S: State): number {
  const d = S.trip.dist
  return (d.src === 'auto' ? d.auto : d.manual) * d.kBack + d.local
}

/** Литры на единицу техники по её единице расхода. */
export function litres(t: Transport, S: State): number {
  switch (t.rateU) {
    case 'lh':
      return t.hours * t.rate
    case 'fix':
      return t.litres
    default: // 'l100km'
      return (routeKm(S) * t.rate) / 100
  }
}

/** Цена топлива по id из справочника fuelPrices (нет строки — 0). */
export function fuelPriceOf(S: State, fuelId: string): number {
  const f = S.fuelPrices.find((x) => x.i === fuelId)
  return f ? f.price : 0
}

/** Стоимость топлива одной единицы техники, ₽. */
export function fuelCost(t: Transport, S: State): number {
  return litres(t, S) * fuelPriceOf(S, t.fuel)
}

/** Топливо всего, ₽. На сиде 6 385,35. */
export function fuelTotal(S: State): number {
  return S.transport.reduce((sum, t) => sum + fuelCost(t, S), 0)
}

/** Сумма строки аренды: price × qty × count. */
export function rentSum(r: Rent): number {
  return r.price * r.qty * r.count
}

/** Аренда всего, ₽. На сиде 15 000. */
export function rentTotal(S: State): number {
  return S.rent.reduce((sum, r) => sum + rentSum(r), 0)
}

/** Транспорт = топливо + аренда. На сиде 21 385,35. */
export function transportTotal(S: State): number {
  return fuelTotal(S) + rentTotal(S)
}

/** id личных разделов закупки (buySections[].personal === true). */
function personalSecIds(S: State): Set<string> {
  return new Set(S.buySections.filter((s) => s.personal).map((s) => s.i))
}

/** Цена позиции закупки: q × (prf > 0 ? prf : pr). */
function buyItemSum(b: Buy): number {
  return b.q * (b.prf > 0 ? b.prf : b.pr)
}

/**
 * Сумма закупки по позициям со st === 'buy'.
 * personal:false — только неличные разделы (общий бюджет),
 * personal:true — только личные.
 */
function buySum(S: State, personal: boolean): number {
  const personalIds = personalSecIds(S)
  return S.buy
    .filter((b) => b.st === 'buy' && personalIds.has(b.sec) === personal)
    .reduce((sum, b) => sum + buyItemSum(b), 0)
}

/** Закупка (общая, неличные разделы), ₽. На сиде 26 005. */
export function buyTotal(S: State): number {
  return buySum(S, false)
}

/** Личное (разделы с personal:true), ₽. На сиде 0. */
export function personalTotal(S: State): number {
  return buySum(S, true)
}

/** Общий бюджет = транспорт + закупка. На сиде 47 390,35. */
export function grandTotal(S: State): number {
  return transportTotal(S) + buyTotal(S)
}

/** С каждого = общий бюджет / людей. На сиде 11 847,59. */
export function perPerson(S: State): number {
  const n = S.people.length
  return n > 0 ? grandTotal(S) / n : 0
}

/**
 * Канистры: по каждому топливу carryL = Σ litres техники с carry:true;
 * канистр = ceil(carryL / doc.canVol). Топлива без carry-литров опускаются.
 * На сиде: АИ-92 — 30 л → 2 канистры.
 */
export function cans(S: State): CanInfo[] {
  const canVol = S.doc?.canVol > 0 ? S.doc.canVol : 20
  const out: CanInfo[] = []
  for (const f of [...S.fuelPrices].sort((a, b) => a.ord - b.ord)) {
    const carryL = S.transport
      .filter((t) => t.fuel === f.i && t.carry)
      .reduce((sum, t) => sum + litres(t, S), 0)
    if (carryL > 0) {
      out.push({ fuel: f.i, name: f.n, litres: carryL, cans: Math.ceil(carryL / canVol) })
    }
  }
  return out
}

/**
 * Форматирование суммы: округление до рубля, разряды через узкий
 * неразрывный пробел, знак валюты из doc.cur (по умолчанию «₽» после
 * числа через неразрывный пробел). Пример: 47390.35 → «47 390 ₽».
 */
export function money(n: number, doc?: Doc): string {
  const r = Math.round(n)
  const digits = Math.abs(r)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  const num = (r < 0 ? '−' : '') + digits
  const sign = doc?.cur?.sign || '₽'
  const after = doc?.cur ? doc.cur.after : true
  return after ? `${num} ${sign}` : `${sign} ${num}`
}

/** Полный расчёт документа одним вызовом. */
export function calcAll(S: State): CalcResult {
  const fuel = fuelTotal(S)
  const rent = rentTotal(S)
  const transport = fuel + rent
  const buy = buyTotal(S)
  const total = transport + buy
  return {
    km: routeKm(S),
    fuel,
    rent,
    transport,
    buy,
    personal: personalTotal(S),
    total,
    perPerson: S.people.length > 0 ? total / S.people.length : 0,
    cans: cans(S),
  }
}
