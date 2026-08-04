import {
  useCallback, useEffect, useRef,
  type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent,
  type RefObject, type UIEvent as ReactUIEvent,
} from 'react'
import { Plus } from 'lucide-react'
import type { Gear, Person } from '@/lib/types'
import type { Perms } from '@/lib/perm'
import { cantOf, qtyLabel, ST_NAME, statusOf, totalQty } from '@/lib/gearx'
import { StatusDial } from '@/components/flops'
import { GearAvatar } from './GearAvatar'
import { cn } from '@/lib/utils'

/**
 * Матрица «вещь × люди» — единственный вид «Сборов» на всех ширинах
 * (эталон заказчика — лист «Снаряжение» его таблицы: строка вещи, колонка на каждого).
 *
 * Сделана CSS-гридом с ARIA-ролями, а не `<table>`: так проще липкая колонка
 * и адаптив (решение из 5.2, «не ставим table»).
 * На узком экране лист листается вбок внутри блока, а колонка с названием вещи
 * закреплена слева — строка не теряется, как в «Сводке» его же таблицы.
 */

/** Сколько держать ячейку, чтобы открылась правка количества. */
const LONG_PRESS_MS = 500
/** На столько палец может съехать, пока это ещё удержание, а не прокрутка. */
const MOVE_TOLERANCE = 10

/**
 * Общая горизонтальная прокрутка блоков раздела: в таблице лист один,
 * поэтому пролистав вбок один блок, человек ждёт того же и от соседних.
 */
export interface MatrixScroll {
  /** видимые сейчас области прокрутки — по одной на блок */
  nodes: Set<HTMLElement>
  x: number
  busy: boolean
}

interface Props {
  /** позиции одного раздела в порядке ord */
  rows: Gear[]
  people: Person[]
  perms: Perms
  /** название раздела — для подписи таблицы скринридеру */
  label: string
  sync: RefObject<MatrixScroll>
  onOpen: (g: Gear) => void
  onCycle: (g: Gear, personId: string) => void
  /** пустая ячейка: назначить 1 шт. */
  onAssign: (g: Gear, personId: string) => void
  onDenied: (g: Gear, personId: string) => void
  /** долгое нажатие или правая кнопка по ячейке — количество */
  onQty: (g: Gear, personId: string) => void
}

export function GearMatrix({
  rows, people, perms, label, sync, onOpen, onCycle, onAssign, onDenied, onQty,
}: Props) {
  const cols = {
    gridTemplateColumns: `minmax(var(--ncol),1fr) repeat(${people.length}, var(--pcol)) var(--tcol)`,
  }

  /* Прокрутку соседних блоков ставим напрямую в DOM: перерисовывать матрицу
     на каждый кадр прокрутки незачем. `busy` гасит эхо-события от соседей. */
  const attach = useCallback(
    (el: HTMLDivElement | null) => {
      if (!el) return
      const s = sync.current
      s.nodes.add(el)
      if (s.x) el.scrollLeft = s.x
      return () => {
        s.nodes.delete(el)
      }
    },
    [sync],
  )
  const onScroll = (e: ReactUIEvent<HTMLDivElement>) => {
    const s = sync.current
    if (s.busy) return
    const el = e.currentTarget
    s.x = el.scrollLeft
    s.busy = true
    for (const n of s.nodes) if (n !== el) n.scrollLeft = s.x
    requestAnimationFrame(() => {
      s.busy = false
    })
  }

  return (
    <div
      ref={attach}
      onScroll={onScroll}
      className="overflow-x-auto [--ncol:9.5rem] [--pcol:3.5rem] [--tcol:3.5rem] lg:[--ncol:16rem] lg:[--pcol:8.25rem] lg:[--tcol:4.5rem]"
    >
      <div
        role="grid"
        aria-label={`Кто что везёт: ${label}`}
        className="min-w-full"
        style={{
          minWidth: `calc(var(--ncol) + ${people.length} * var(--pcol) + var(--tcol))`,
        }}
      >
        <div role="row" style={cols} className="grid items-stretch border-b border-line">
          <span
            role="columnheader"
            className="sticky left-0 z-20 flex items-center border-r border-line bg-surface px-4 py-2 text-[13px] font-semibold text-muted"
          >
            Вещь
          </span>
          {people.map((p) => (
            <span
              key={p.id}
              role="columnheader"
              /* колонка читателя слегка подсвечена: свою человек ищет первой */
              className={cn(
                'flex items-center justify-center gap-2 px-1 py-2',
                p.id === perms.me && 'bg-accent-soft',
              )}
            >
              <GearAvatar p={p} size={24} />
              <span className="hidden truncate text-[15px] font-semibold text-ink lg:inline">
                {p.name}
              </span>
            </span>
          ))}
          <span
            role="columnheader"
            className="flex items-center justify-center px-1 py-2 text-[13px] font-semibold text-muted"
          >
            Всего
          </span>
        </div>

        {rows.map((g, idx) => {
          const alarm = people.some((p) => cantOf(g, p.id))
          const bg = alarm ? 'bg-accent-soft' : idx % 2 === 1 ? 'bg-zebra' : 'bg-surface'
          return (
            <div
              key={g.i}
              role="row"
              data-hit={g.i}
              style={cols}
              className={cn('grid border-b border-line/60 last:border-b-0', bg)}
            >
              <span role="gridcell" className={cn('sticky left-0 z-10 min-w-0 border-r border-line', bg)}>
                <button
                  type="button"
                  onClick={() => onOpen(g)}
                  className="relative flex h-14 w-full flex-col justify-center px-4 text-left transition-colors hover:bg-zebra/60"
                >
                  {alarm && (
                    <span className="absolute inset-y-0 left-0 w-[3px] bg-accent-text" aria-hidden />
                  )}
                  <span className="truncate text-[15px] font-semibold text-ink">{g.n}</span>
                  {g.c ? <span className="truncate text-[12px] text-muted">{g.c}</span> : null}
                </button>
              </span>
              {people.map((p) => (
                <Cell
                  key={p.id}
                  g={g}
                  p={p}
                  canMark={perms.canMark(p.id)}
                  onCycle={() => onCycle(g, p.id)}
                  onAssign={() => onAssign(g, p.id)}
                  onDenied={() => onDenied(g, p.id)}
                  onQty={() => onQty(g, p.id)}
                />
              ))}
              <span
                role="gridcell"
                className="tnum grid h-14 place-items-center text-[15px] font-semibold text-ink"
              >
                {totalQty(g)}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/**
 * Долгое нажатие по ячейке. На телефоне правой кнопки нет, а количество
 * править надо — держим полсекунды и попадаем в ту же правку.
 */
function useLongPress(onLong: () => void) {
  const press = useRef<{ t: number | null; x: number; y: number; fired: boolean }>({
    t: null, x: 0, y: 0, fired: false,
  })
  const stop = useCallback(() => {
    if (press.current.t !== null) window.clearTimeout(press.current.t)
    press.current.t = null
  }, [])
  useEffect(() => stop, [stop])

  const down = (e: ReactPointerEvent<HTMLElement>) => {
    stop()
    press.current = {
      x: e.clientX,
      y: e.clientY,
      fired: false,
      t: window.setTimeout(() => {
        press.current.t = null
        press.current.fired = true
        onLong()
      }, LONG_PRESS_MS),
    }
  }
  const move = (e: ReactPointerEvent<HTMLElement>) => {
    if (press.current.t === null) return
    if (
      Math.abs(e.clientX - press.current.x) > MOVE_TOLERANCE ||
      Math.abs(e.clientY - press.current.y) > MOVE_TOLERANCE
    )
      stop()
  }
  /** true — клик надо погасить: он пришёл следом за сработавшим удержанием */
  const consumed = () => {
    stop()
    if (!press.current.fired) return false
    press.current.fired = false
    return true
  }
  return { down, move, stop, consumed }
}

/** Ячейка человека: количество и кружок статуса. Пустая — точка-плюс. */
function Cell({
  g, p, canMark, onCycle, onAssign, onDenied, onQty,
}: {
  g: Gear
  p: Person
  canMark: boolean
  onCycle: () => void
  onAssign: () => void
  onDenied: () => void
  onQty: () => void
}) {
  const qty = g.o?.[p.id] || 0
  const cant = cantOf(g, p.id)
  const lp = useLongPress(onQty)

  const hold = {
    onPointerDown: lp.down,
    onPointerMove: lp.move,
    onPointerUp: lp.stop,
    onPointerLeave: lp.stop,
    onPointerCancel: lp.stop,
    onContextMenu: (e: ReactMouseEvent) => {
      e.preventDefault()
      onQty()
    },
  }

  if (qty <= 0) {
    return (
      <span role="gridcell">
        <button
          type="button"
          aria-label={`${g.n}: ${p.name} не везёт. Назначить ${qtyLabel(1)}`}
          onClick={() => {
            if (lp.consumed()) return
            onAssign()
          }}
          {...hold}
          className="grid h-14 w-full touch-manipulation place-items-center text-muted transition-colors select-none hover:bg-accent-soft"
        >
          <span
            className="grid size-6 place-items-center rounded-full border border-dashed border-line-strong"
            aria-hidden
          >
            <Plus size={14} strokeWidth={2} />
          </span>
        </button>
      </span>
    )
  }

  return (
    <span role="gridcell">
      <button
        type="button"
        aria-label={`${g.n}, ${p.name}: ${qtyLabel(qty)}, ${cant ? 'не может взять' : ST_NAME[statusOf(g, p.id)]}. Изменить`}
        onClick={() => {
          if (lp.consumed()) return
          if (canMark) onCycle()
          else onDenied()
        }}
        {...hold}
        className="flex h-14 w-full touch-manipulation flex-col items-center justify-center gap-0 transition-colors select-none hover:bg-zebra/60 lg:flex-row lg:gap-2"
      >
        <StatusDial value={statusOf(g, p.id)} cant={!!cant} who={p.name} size={32} />
        <span className="tnum text-[12px] font-semibold text-ink lg:text-[15px]">{qty}</span>
      </button>
    </span>
  )
}
