import type { ReactNode } from 'react'
import type { State } from '@/lib/types'
import { calcAll, fuelCost, fuelPriceOf, litres, money, rentSum, routeKm } from '@/lib/calc'
import { fmtNum, NBSP } from '@/format'
import { cn } from '@/lib/utils'
import {
  DASH, fuelName, hoursLabel, kmLabel, litresLabel, litresTotal, rentPer, rentQtyLabel,
} from './roadx'

/**
 * Карточка «Расчёт» — тот самый лист «Логистика» из таблицы заказчика.
 *
 * Столбцы те же и в том же порядке: статья · км или часы · литры · цена · итого ·
 * комментарий. Строки — техника и аренда, внизу «ИТОГО ТРАНСПОРТ, ЛОДКА, ПАРКОВКА»
 * и «На каждого».
 *
 * Считает не эта карточка, а lib/calc.ts: здесь только показ. Ни одной своей
 * арифметики, кроме деления итога на число людей, — иначе контрольные цифры
 * (330 км · 21 385 ₽ · 47 390 ₽ · 11 848 ₽) начнут расходиться между экранами.
 *
 * На телефоне таблица разворачивается в строки-карточки: те же шесть фактов,
 * в том же порядке, каждый со своей подписью. Горизонтальной прокрутки у страницы
 * при 390 px нет — колонки складываются, а не уезжают вбок.
 *
 * Тап по строке открывает карточку техники или аренды: правит по-прежнему шторка.
 */

interface Props {
  S: State
  onOpenTransport: (id: string) => void
  onOpenRent: (id: string) => void
}

/** Одна строка расчёта — шесть фактов, как в столбцах таблицы. */
interface Row {
  key: string
  /** id позиции — по нему поиск по листу подводит к строке (data-hit) */
  id: string
  /** Статья */
  title: string
  /** км или часы */
  amount: string
  /** литры */
  vol: string
  /** цена */
  price: string
  /** итого */
  sum: string
  /** комментарий */
  note: string
  onOpen: () => void
}

/** Раскладка колонок на большом экране — она же задаёт ширины шапке и строкам. */
const COLS =
  'lg:grid-cols-[minmax(0,1.6fr)_6rem_5.5rem_8rem_7rem_minmax(0,1.4fr)] lg:items-baseline lg:gap-3'

export function RoadCalc({ S, onOpenTransport, onOpenRent }: Props) {
  const c = calcAll(S)
  const km = routeKm(S)

  const transport = [...S.transport].sort((a, b) => a.ord - b.ord)
  const rent = [...S.rent].sort((a, b) => a.ord - b.ord)

  const rows: Row[] = [
    ...transport.map((t): Row => {
      const nt = t.nt ?? {}
      return {
        key: 'tr:' + t.i,
        id: t.i,
        title: t.calcT || `Бензин ${fuelName(S, t.fuel)} ${DASH} ${t.n}`,
        amount:
          t.rateU === 'lh' ? hoursLabel(t.hours) : t.rateU === 'fix' ? DASH : kmLabel(km),
        vol: litresLabel(litres(t, S)),
        price: `${fmtNum(fuelPriceOf(S, t.fuel), 1)}${NBSP}₽/л`,
        sum: money(fuelCost(t, S), S.doc),
        note: t.c || nt.rate?.c || nt.hours?.c || nt.litres?.c || '',
        onOpen: () => onOpenTransport(t.i),
      }
    }),
    ...rent.map((r): Row => {
      const nt = r.nt ?? {}
      const count = r.count > 1 ? ` · ${fmtNum(r.count, 0)}${NBSP}шт.` : ''
      return {
        key: 'rn:' + r.i,
        id: r.i,
        title: r.calcT || r.n,
        amount: rentQtyLabel(r) + count,
        vol: DASH,
        price: `${money(r.price, S.doc)} ${rentPer(r)}`,
        sum: money(rentSum(r), S.doc),
        note: r.c || nt.price?.c || r.warn || '',
        onOpen: () => onOpenRent(r.i),
      }
    }),
  ]

  const people = S.people.length
  const perHead = people > 0 ? c.transport / people : 0

  return (
    <section className="overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">
      <div className="border-b border-line px-4 py-3">
        <h3 className="text-[17px] font-[650] text-ink">Расчёт</h3>
        <p className="tnum mt-0.5 text-[13px] text-muted">
          Пробег {kmLabel(km)} · всего {litresLabel(litresTotal(S))} топлива
        </p>
      </div>

      {/* Шапка столбцов — только там, где столбцы и правда есть. */}
      <div
        className={cn(
          'hidden px-4 py-2 text-[12px] font-semibold text-muted lg:grid',
          COLS,
          'border-b border-line/70 bg-zebra/40',
        )}
        aria-hidden
      >
        <span>Статья</span>
        <span className="text-right">км / часы</span>
        <span className="text-right">литры</span>
        <span className="text-right">цена</span>
        <span className="text-right">итого</span>
        <span>комментарий</span>
      </div>

      <div>
        {rows.length === 0 ? (
          <p className="px-4 py-4 text-[15px] leading-snug text-muted">
            Считать пока нечего: ни техники, ни аренды не заведено.
          </p>
        ) : (
          rows.map((r, idx) => (
            <button
              key={r.key}
              type="button"
              data-hit={r.id}
              onClick={r.onOpen}
              className={cn(
                'grid w-full grid-cols-2 gap-x-3 gap-y-1 px-4 py-3 text-left transition-colors hover:bg-zebra/60',
                COLS,
                idx % 2 === 1 && 'bg-zebra/30',
              )}
            >
              <span className="col-span-2 text-[15px] leading-snug font-semibold text-pretty text-ink lg:col-span-1">
                {r.title}
              </span>
              <Cell label="км / часы">{r.amount}</Cell>
              <Cell label="литры">{r.vol}</Cell>
              <Cell label="цена">{r.price}</Cell>
              <Cell label="итого" strong>
                {r.sum}
              </Cell>
              {r.note ? (
                <span className="col-span-2 text-[13px] leading-snug text-muted lg:col-span-1">
                  {r.note}
                </span>
              ) : (
                <span className="hidden lg:block" aria-hidden />
              )}
            </button>
          ))
        )}
      </div>

      <div className="border-t border-line px-4 py-3">
        <div className="flex items-end gap-3">
          <h4 className="min-w-0 flex-1 text-[13px] leading-tight font-bold text-muted">
            ИТОГО ТРАНСПОРТ, ЛОДКА, ПАРКОВКА
          </h4>
          <span className="tnum shrink-0 text-[28px] leading-none font-bold text-ink">
            {money(c.transport, S.doc)}
          </span>
        </div>
        <p className="tnum mt-1 text-[13px] text-muted">
          Бензин {money(c.fuel, S.doc)} · аренда {money(c.rent, S.doc)}
        </p>
      </div>

      <div className="flex items-center gap-3 border-t border-line bg-accent-soft px-4 py-3">
        <span className="min-w-0 flex-1 text-[15px] font-[650] text-ink">На каждого</span>
        <span className="tnum shrink-0 text-[20px] font-bold text-ink">
          {people > 0 ? money(perHead, S.doc) : DASH}
        </span>
      </div>

      {/* Здесь только дорога. Общий бюджет считается в «Поездке», и человек должен
          видеть, что это разные числа, а не одно и то же. */}
      <p className="tnum px-4 py-3 text-[13px] leading-snug text-muted">
        Это только дорога и аренда. Весь бюджет поездки — {money(c.total, S.doc)}, с каждого{' '}
        {money(c.perPerson, S.doc)}.
      </p>
    </section>
  )
}

/** Одна клетка таблицы: на телефоне с подписью, на большом экране — просто число. */
function Cell({
  label,
  strong,
  children,
}: {
  label: string
  strong?: boolean
  children: ReactNode
}) {
  return (
    <span className="flex items-baseline gap-1.5 lg:justify-end lg:gap-0">
      <span className="shrink-0 text-[12px] text-muted lg:hidden">{label}</span>
      <span
        className={cn(
          'tnum min-w-0 text-[14px] leading-snug text-ink',
          strong ? 'font-bold' : 'font-medium',
        )}
      >
        {children}
      </span>
    </span>
  )
}
