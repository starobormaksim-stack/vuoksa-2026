import { Plus } from 'lucide-react'
import type { Gear, GearSection, Person } from '@/lib/types'
import type { Perms } from '@/lib/perm'
import { cantOf, qtyLabel, ST_NAME, statusOf, totalQty } from '@/lib/gearx'
import { StatusDial } from '@/components/flops'
import { GearAvatar } from './GearAvatar'
import { cn } from '@/lib/utils'

/**
 * Матрица «кто что везёт» — десктопная раскладка режима «Все»
 * (docs/v2-ux-redesign.md, 8.4 и правило 10: мобайл не сжатый десктоп).
 *
 * На широком экране мельчить незачем, поэтому вместо списка с полосой экипажа —
 * настоящая таблица. Сделана CSS-гридом с ARIA-ролями, а не `<table>`: так проще
 * липкая шапка и адаптив (решение из 5.2, «не ставим table»).
 * Рендерится только при ширине ≥ 1024 — это проверяет вызывающий раздел.
 */
interface Props {
  people: Person[]
  perms: Perms
  sections: GearSection[]
  /** позиции раздела в порядке ord */
  rowsOf: (secId: string) => Gear[]
  onOpen: (g: Gear) => void
  onCycle: (g: Gear, personId: string) => void
  /** пустая ячейка: назначить 1 шт. */
  onAssign: (g: Gear, personId: string) => void
  onDenied: (g: Gear, personId: string) => void
  /** правая кнопка по ячейке — количество */
  onQty: (g: Gear, personId: string) => void
}

export function GearMatrix({
  people, perms, sections, rowsOf, onOpen, onCycle, onAssign, onDenied, onQty,
}: Props) {
  /* колонки: 1fr | 72 | 4 × 132 */
  const cols = {
    gridTemplateColumns: `minmax(0,1fr) 72px repeat(${people.length}, 132px)`,
  }

  /* overflow-clip, а не overflow-hidden: hidden делает контейнер областью прокрутки,
     и липкая шапка «прилипает» к нему — уезжает на 64 px вниз от своего места */
  return (
    <div
      role="grid"
      aria-label="Кто что везёт"
      className="overflow-clip rounded-2xl border border-line bg-surface shadow-sm"
    >
      <div
        role="row"
        style={cols}
        className="sticky top-16 z-10 grid items-center border-b border-line bg-surface"
      >
        <span role="columnheader" className="px-4 py-3 text-[13px] font-semibold text-muted">
          Вещь
        </span>
        <span role="columnheader" className="px-2 py-3 text-center text-[13px] font-semibold text-muted">
          Всего
        </span>
        {people.map((p) => (
          <span
            key={p.id}
            role="columnheader"
            className="flex items-center justify-center gap-2 px-2 py-3"
          >
            <GearAvatar p={p} size={24} />
            <span className="truncate text-[15px] font-semibold text-ink">{p.name}</span>
          </span>
        ))}
      </div>

      {sections.map((sec) => {
        const rows = rowsOf(sec.i)
        return (
          <div key={sec.i} role="rowgroup">
            <div role="row" style={cols} className="grid">
              <span
                role="gridcell"
                aria-colspan={people.length + 2}
                style={{ gridColumn: '1 / -1' }}
                className="border-y border-line bg-zebra px-4 py-2 text-[15px] font-[650] text-ink"
              >
                {sec.t}
              </span>
            </div>

            {rows.length === 0 ? (
              <div role="row" style={cols} className="grid">
                <span
                  role="gridcell"
                  aria-colspan={people.length + 2}
                  style={{ gridColumn: '1 / -1' }}
                  className="px-4 py-3 text-[13px] text-muted"
                >
                  Ни одной вещи не заведено
                </span>
              </div>
            ) : (
              rows.map((g, idx) => {
                const alarm = people.some((p) => cantOf(g, p.id))
                return (
                  <div
                    key={g.i}
                    role="row"
                    data-hit={g.i}
                    style={cols}
                    className={cn(
                      'relative grid border-b border-line/60 last:border-b-0',
                      idx % 2 === 1 ? 'bg-zebra' : 'bg-surface',
                      alarm && 'bg-accent-soft',
                    )}
                  >
                    {alarm && (
                      <span className="absolute inset-y-0 left-0 w-[3px] bg-accent-text" aria-hidden />
                    )}
                    <span role="gridcell" className="min-w-0">
                      <button
                        type="button"
                        onClick={() => onOpen(g)}
                        className="flex h-14 w-full flex-col justify-center px-4 text-left transition-colors hover:bg-zebra/60"
                      >
                        <span className="truncate text-[15px] font-semibold text-ink">{g.n}</span>
                        {g.c ? (
                          <span className="truncate text-[12px] text-muted">{g.c}</span>
                        ) : null}
                      </button>
                    </span>
                    <span
                      role="gridcell"
                      className="tnum grid h-14 place-items-center text-[15px] font-semibold text-ink"
                    >
                      {totalQty(g)}
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
                  </div>
                )
              })
            )}
          </div>
        )
      })}
    </div>
  )
}

/** Ячейка 132 × 56: количество и кружок статуса. Пустая — точка-плюс. */
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

  if (qty <= 0) {
    return (
      <span role="gridcell">
        <button
          type="button"
          aria-label={`${g.n}: ${p.name} не везёт. Назначить ${qtyLabel(1)}`}
          onClick={onAssign}
          className="grid h-14 w-full place-items-center text-muted transition-colors hover:bg-accent-soft"
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
        onClick={canMark ? onCycle : onDenied}
        onContextMenu={(e) => {
          e.preventDefault()
          onQty()
        }}
        className="flex h-14 w-full items-center justify-center gap-2 transition-colors hover:bg-zebra/60"
      >
        <span className="tnum text-[15px] font-semibold text-ink">{qty}</span>
        <StatusDial value={statusOf(g, p.id)} cant={!!cant} who={p.name} size={32} />
      </button>
    </span>
  )
}
