/**
 * Расчётное ядро v2 (Pine-to-Pine) — чистые функции без DOM.
 * Формулы: docs/v2-architecture.md, раздел 2.2.
 *
 * Контрольные цифры на seed-v2.json:
 *   км 330 · топливо 6 385,35 · аренда 15 000 · транспорт 21 385,35
 *   закупка 26 005 · итого 47 390,35 · с каждого 11 847,59 · АИ-92 → 2 канистры
 */

import type { Buy, CanRow, Doc, Rent, State, Transport } from './types.ts'

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

/**
 * Пробег ОДНОЙ единицы техники, км.
 *
 * ─── Откуда взялось ───
 * Заказчик 06.08.2026: «Цифру написать проще человеку у каждого автомобиля,
 * у каждого автотранспорта или же просто транспорта, допустим лодки. У всех
 * будут свои переменные» и, отвечая про общую строку пробега: «Каждая строка
 * показывает свой пробег и свою сумму итоговую по деньгам. Все!».
 *
 * До этой правки бензин ВСЕЙ техники считался от одного числа на поездку,
 * и в боевом документе это было видно: 141 км, посчитанные по точкам двух
 * машин и лодки вперемешку, шли в расход обеим машинам сразу.
 *
 * ─── Формула ───
 * Та же тройка, что у поездки, только личная:
 *   (kmAuto | km) × kBack + kmLocal
 * `kBack` остаётся ОБЩИМ множителем «сколько концов пути» — заказчик прямо
 * отказался ставить точки на обратную дорогу: «чтобы точки не выставлять,
 * можно вручную цифру изменить». Второй нитки на карте не рисуется.
 *
 * ⛔ Пока у техники нет своего `kmSrc`, возвращается прежний общий `routeKm(S)`.
 * На этом держатся контрольные суммы: 330 км на сиде и ни одного сдвига
 * в документах, заведённых до правки.
 */
export function kmOf(t: Transport, S: State): number {
  if (t.kmSrc !== 'auto' && t.kmSrc !== 'manual') return routeKm(S)
  const base = t.kmSrc === 'auto' ? (t.kmAuto ?? 0) : (t.km ?? 0)
  return base * kBackOf(t, S) + (t.kmLocal ?? 0)
}

/**
 * Едет ли хоть кто-то на ОБЩЕМ пробеге поездки (`trip.dist`).
 *
 * ─── Зачем ───
 * Заказчик 08.08.2026 про «Дорогу»: «убрать дубли — расстояние
 * Дворцовая–Приозерск, коэффициент туда-обратно отдельной строкой, местные
 * разъезды не по транспорту. У ветки уже есть свои kBack, kmLocal, kmSrc».
 * И правда: как только у КАЖДОЙ единицы техники появился свой пробег, три
 * общих числа перестают на что-либо влиять — но продолжают стоять в расчёте
 * и предлагать себя править. Человек правит их и не понимает, почему деньги
 * не двигаются.
 *
 * ⛔ Из документа `trip.dist` при этом никуда не девается (постулат 4):
 * стоит завести технику без своего пробега — и числа снова показаны и правимы.
 * Техники нет вовсе — тоже показаны: с них начинается новая поездка.
 */
export function commonKmUsed(S: State): boolean {
  if (S.transport.length === 0) return true
  return S.transport.some((t) => t.kmSrc !== 'auto' && t.kmSrc !== 'manual')
}

/**
 * Множитель «туда и обратно» у одной ветки.
 *
 * Заказчик 06.08.2026 (Г-4): «Можно тут же сразу же отметить в случае если
 * маршрут тем же сам возвращается, либо не отмечать» — галочка стоит у КАЖДОЙ
 * ветки на карте. Своего числа у ветки нет — работает общий `trip.dist.kBack`,
 * ровно как до правки, и потому ни одна прежняя поездка в деньгах не сдвинулась.
 */
export function kBackOf(t: Transport, S: State): number {
  return typeof t.kBack === 'number' && t.kBack > 0 ? t.kBack : S.trip.dist.kBack
}

/** Литры на единицу техники по её единице расхода. */
export function litres(t: Transport, S: State): number {
  switch (t.rateU) {
    case 'lh':
      return t.hours * t.rate
    case 'fix':
      return t.litres
    default: // 'l100km'
      return (kmOf(t, S) * t.rate) / 100
  }
}

/** Цена топлива по id из справочника fuelPrices (нет строки — 0). */
export function fuelPriceOf(S: State, fuelId: string): number {
  const f = S.fuelPrices.find((x) => x.i === fuelId)
  return f ? f.price : 0
}

/**
 * Цена литра для этой единицы техники, ₽.
 *
 * Заказчик 09.08.2026: «каждая машина может заправиться на разной заправке,
 * а соответственно цена может быть разная. По умолчанию сейчас можно указать
 * одинаковую». Своя цена перебивает цену вида; пусто или ноль — цена вида,
 * то есть ровно сегодняшнее поведение (контрольные суммы не двигаются).
 *
 * ⛔ Отдельной строки в `S.fuelPrices` на каждую технику заводить нельзя:
 * `S.canRows` привязаны к `fuel`, а `cans()` группирует по `f.i` — контрольная
 * цифра «2 канистры» разъехалась бы.
 */
export function fuelPriceFor(t: Transport, S: State): number {
  return t.fuelPr && t.fuelPr > 0 ? t.fuelPr : fuelPriceOf(S, t.fuel)
}

/** Стоимость топлива одной единицы техники, ₽. */
export function fuelCost(t: Transport, S: State): number {
  return litres(t, S) * fuelPriceFor(t, S)
}

/** Литров в одной канистре: своё число документа, иначе двадцатка. */
export function canVolOf(S: State): number {
  return S.doc?.canVol > 0 ? S.doc.canVol : 20
}

/** Литров топлива в канистрах этой строки: канистр × объём канистры. */
export function canLitres(r: CanRow, S: State): number {
  return (r.cans && r.cans > 0 ? r.cans : 0) * canVolOf(S)
}

/**
 * Цена литра у строки канистр: своя, иначе цена вида топлива.
 * Та же развязка, что у техники (`fuelPriceFor`): пусто — общая цена вида.
 */
export function canPriceOf(r: CanRow, S: State): number {
  return r.price && r.price > 0 ? r.price : fuelPriceOf(S, r.fuel)
}

/**
 * Стоимость топлива в канистрах одной строки, ₽.
 *
 * ⛔ Это топливо СВЕРХ расчётного расхода техники. То, что техника с отметкой
 * «везём с собой» жжёт по расчёту, уже посчитано в её строке (`fuelCost`),
 * и второй раз в деньги не идёт — иначе один и тот же бензин стоил бы дважды.
 */
export function canRowSum(r: CanRow, S: State): number {
  return canLitres(r, S) * canPriceOf(r, S)
}

/** Топливо в канистрах всего, ₽. На сиде 0: канистр никто не вписал. */
export function canTotal(S: State): number {
  return S.canRows.reduce((sum, r) => sum + canRowSum(r, S), 0)
}

/**
 * Топливо всего, ₽. На сиде 6 385,35.
 *
 * Считается топливо техники плюс то, что берут в канистрах сверх расчёта
 * (`canTotal`). На сиде и в любом документе, где канистры не вписаны,
 * второе слагаемое равно нулю — контрольные цифры не двигаются.
 */
export function fuelTotal(S: State): number {
  return S.transport.reduce((sum, t) => sum + fuelCost(t, S), 0) + canTotal(S)
}

/** Цена единицы аренды: по факту, если он вписан, иначе прикидка (как у покупки). */
export function rentPrice(r: Rent): number {
  return r.priceF && r.priceF > 0 ? r.priceF : r.price
}

/** Сумма строки аренды: цена × qty × count. */
export function rentSum(r: Rent): number {
  return rentPrice(r) * r.qty * r.count
}

/** Аренда всего, ₽. На сиде 15 000. */
export function rentTotal(S: State): number {
  return S.rent.reduce((sum, r) => sum + rentSum(r), 0)
}

/** Транспорт = топливо + аренда. На сиде 21 385,35. */
export function transportTotal(S: State): number {
  return fuelTotal(S) + rentTotal(S)
}

/**
 * id личных разделов закупки (buySections[].personal === true).
 *
 * Открыт наружу ради взаиморасчётов (`settle.ts`): личное — алкоголь, сигареты —
 * в общий делёж не входит, и признак этого обязан быть ОДИН на весь сервис.
 * Второй такой же признак рано или поздно разошёлся бы с бюджетом.
 */
export function personalSecIds(S: State): Set<string> {
  return new Set(S.buySections.filter((s) => s.personal).map((s) => s.i))
}

/** Цена позиции закупки: q × (prf > 0 ? prf : pr). */
export function buyItemSum(b: Buy): number {
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
  const vol = canVolOf(S)
  const out: CanInfo[] = []
  for (const f of [...S.fuelPrices].sort((a, b) => a.ord - b.ord)) {
    const carryL = S.transport
      .filter((t) => t.fuel === f.i && t.carry)
      .reduce((sum, t) => sum + litres(t, S), 0)
    if (carryL > 0) {
      out.push({ fuel: f.i, name: f.n, litres: carryL, cans: Math.ceil(carryL / vol) })
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
