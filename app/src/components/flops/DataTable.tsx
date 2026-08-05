import { useCallback, type ReactNode, type RefObject } from 'react'
import { cn } from '@/lib/utils'

/**
 * Каркас таблицы — общий для «Сборов», «Аптечки», «Закупки» и «Дороги».
 *
 * Эталон — собственная таблица заказчика (листы «Снаряжение» и «Закупка»):
 * строка на позицию, колонка на человека или на число, итог справа, названия
 * закреплены слева. Он же назначил и способ работы: «это прямо вот здесь,
 * в этой таблице уже должно быть» — то есть всё правится в самой ячейке
 * компонентами из Inline.tsx, а не в шторке.
 *
 * Сделана CSS-гридом с ARIA-ролями, а не `<table>`: так липкая первая колонка
 * и адаптив выходят без подпорок (решение перенесено из GearMatrix).
 *
 * Горизонтальная прокрутка живёт ВНУТРИ блока: у страницы её нет ни на одной
 * ширине (постулат 7).
 */

/**
 * Общая горизонтальная прокрутка нескольких таблиц одного раздела: в бумажной
 * таблице лист один, поэтому, пролистав вбок один блок, человек ждёт того же
 * и от соседних.
 */
export interface TableScroll {
  /** видимые сейчас области прокрутки — по одной на блок */
  nodes: Set<HTMLElement>
  x: number
  busy: boolean
}

export function newTableScroll(): TableScroll {
  return { nodes: new Set(), x: 0, busy: false }
}

interface TableProps {
  /** шаблон колонок грида, например `minmax(9.5rem,1fr) repeat(4, 3.5rem) 3.5rem` */
  cols: string
  /**
   * Наименьшая ширина сетки — сумма минимумов колонок, например `'49rem'`.
   *
   * Нужна там, где ДОЛЕВЫЕ колонки идут не одной штукой: при вычислении ширины
   * «по содержимому» доля (`1fr`) по правилам CSS раздувается до max-content
   * ячейки, и таблица уезжает за блок (замер: 1869 px при блоке 1215). Явное
   * число снимает вычисление по содержимому вовсе — ширина становится
   * определённой, и доли честно делят блок.
   */
  minW?: string
  /** подпись таблицы для скринридера */
  label: string
  /** сцепка прокрутки с соседними таблицами раздела; без неё таблица сама по себе */
  sync?: RefObject<TableScroll>
  children: ReactNode
  className?: string
}

export function DataTable({ cols, minW, label, sync, children, className }: TableProps) {
  /* Прокрутку соседей ставим напрямую в DOM: перерисовывать таблицу на каждый
     кадр прокрутки незачем. `busy` гасит эхо-события от соседей. */
  const attach = useCallback(
    (el: HTMLDivElement | null) => {
      if (!el || !sync) return
      const s = sync.current
      s.nodes.add(el)
      if (s.x) el.scrollLeft = s.x
      return () => {
        s.nodes.delete(el)
      }
    },
    [sync],
  )

  const onScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (!sync) return
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
    <div ref={attach} onScroll={onScroll} className={cn('overflow-x-auto', className)}>
      <div
        role="grid"
        aria-label={label}
        /**
         * Ширина сетки — `min-content`, но не меньше ширины блока. Оба слагаемых
         * обязательны и делают разное.
         *
         * `min-w-full` — чтобы на широком экране таблица занимала блок целиком
         * и долевые колонки (`minmax(9rem,1fr)`) поделили его между собой: без
         * этого справа оставалось пустое поле (замер 05.08.2026: сетка 936 при
         * блоке 1205, заказчик — «с правой стороны до хера пустого пространства»).
         * `w-min` — чтобы на узком экране сетка встала по сумме МИНИМУМОВ колонок,
         * то есть шире блока, и листалась вбок внутри него: без явной ширины она
         * сжимается до экрана, и при прокрутке зебра строк и липкая граница
         * обрываются на середине.
         *
         * ⛔ `w-max` сюда возвращать нельзя: `max-content` считает по самому
         * длинному содержимому ячейки, и с долевыми колонками таблица раздувалась
         * до 1869 px при блоке 1215 — прокрутка появлялась там, где всё помещалось.
         */
        className={minW ? 'w-full' : 'w-min min-w-full'}
        style={{ ['--cols' as string]: cols, minWidth: minW }}
      >
        {children}
      </div>
    </div>
  )
}

/** Шапка таблицы: те же колонки, что и у строк, снизу — волосяная линия. */
export function DataHead({ children }: { children: ReactNode }) {
  return (
    <div
      role="row"
      className="grid items-stretch border-b border-line bg-surface"
      style={{ gridTemplateColumns: 'var(--cols)' }}
    >
      {children}
    </div>
  )
}

interface RowProps {
  children: ReactNode
  /** чётная строка — другой поверхностью, как в таблице заказчика */
  zebra?: boolean
  /** тревога: левая полоса и подсветка (кто-то не может взять вещь) */
  alarm?: boolean
  /** только что добавленная строка — видно, куда вводить */
  fresh?: boolean
  /** якорь для перехода из поиска */
  dataHit?: string
}

export function DataRow({ children, zebra, alarm, fresh, dataHit }: RowProps) {
  return (
    <div
      role="row"
      data-hit={dataHit}
      style={{ gridTemplateColumns: 'var(--cols)' }}
      className={cn(
        /* `group` — чтобы действия строки проявлялись при наведении на неё целиком. */
        'group relative grid border-b border-line/60 last:border-b-0 transition-colors',
        alarm ? 'bg-accent-soft' : zebra ? 'bg-zebra' : 'bg-surface',
        fresh && 'ring-2 ring-accent ring-inset',
      )}
    >
      {alarm && <span className="absolute inset-y-0 left-0 z-20 w-[3px] bg-accent-text" aria-hidden />}
      {children}
    </div>
  )
}

interface CellProps {
  children?: ReactNode
  /** первая колонка: закреплена слева, чтобы строка не терялась при прокрутке вбок */
  sticky?: boolean
  /** фон липкой ячейки должен совпадать с фоном строки, иначе под ней просвечивает */
  bg?: 'surface' | 'zebra' | 'alarm'
  align?: 'left' | 'center' | 'right'
  /** шапка колонки, а не обычная ячейка */
  head?: boolean
  className?: string
}

export function DataCell({ children, sticky, bg = 'surface', align = 'center', head, className }: CellProps) {
  return (
    <span
      role={head ? 'columnheader' : 'gridcell'}
      className={cn(
        /* 56 px — минимальная высота строки таблицы; правка на месте может
           её увеличить, и это нормально: строка растёт, соседи не прыгают. */
        'flex min-h-14 min-w-0 flex-col justify-center px-2 py-1.5',
        align === 'left' && 'items-start text-left',
        align === 'center' && 'items-center text-center',
        align === 'right' && 'items-end text-right',
        sticky && 'sticky left-0 z-10 border-r border-line',
        sticky && (bg === 'alarm' ? 'bg-accent-soft' : bg === 'zebra' ? 'bg-zebra' : 'bg-surface'),
        head && 'text-note font-semibold text-muted',
        className,
      )}
    >
      {children}
    </span>
  )
}
