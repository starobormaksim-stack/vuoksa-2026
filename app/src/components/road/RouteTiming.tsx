import { Check, Route } from 'lucide-react'
import type { RoutePoint } from '@/lib/types'
import { AddRow, EmptyState } from '@/components/flops'
import { cn } from '@/lib/utils'
import { pointLine } from './roadx'

/**
 * Тайминг поездки (docs/v2-ux-redesign.md, 10.6) — вертикальная лента точек:
 * кружок «этап пройден», время, название, заметка и третья строка с меткой,
 * расстоянием и координатами.
 *
 * Участнику лента показывается целиком, но без единой кнопки правки: ни кружка,
 * ни «добавить» — их просто нет в разметке (правило 12.2).
 */
interface Props {
  points: RoutePoint[]
  canEdit: boolean
  /** отметить этап пройденным */
  onToggle: (id: string) => void
  onOpen: (id: string) => void
  onAdd: () => void
}

export function RouteTiming({ points, canEdit, onToggle, onOpen, onAdd }: Props) {
  if (points.length === 0) {
    return (
      <EmptyState
        icon={Route}
        title="Маршрута пока нет"
        text="Добавьте первую точку — или поставьте её тапом по карте"
        action={canEdit ? { label: 'Добавить точку', onClick: onAdd } : undefined}
      />
    )
  }

  return (
    <div>
      <ol className="py-1">
        {points.map((p, idx) => {
          const line3 = pointLine(p)
          const last = idx === points.length - 1
          return (
            <li key={p.i} className="relative">
              {/* Нитка между кружками: рисуется под точкой, кроме последней. */}
              {!last && (
                <span aria-hidden className="absolute top-10 bottom-0 left-[34px] w-px bg-line" />
              )}

              <div className="flex items-start gap-3 px-3">
                {canEdit ? (
                  <button
                    type="button"
                    onClick={() => onToggle(p.i)}
                    aria-label={`${p.n}: ${p.done ? 'этап пройден' : 'этап впереди'}. Отметить`}
                    aria-pressed={p.done}
                    className="relative z-1 mt-2 grid size-11 shrink-0 place-items-center rounded-xl transition-colors hover:bg-zebra"
                  >
                    <Dot done={p.done} />
                  </button>
                ) : (
                  <span className="relative z-1 mt-2 grid size-11 shrink-0 place-items-center">
                    <Dot done={p.done} />
                  </span>
                )}

                <Body
                  point={p}
                  line3={line3}
                  onOpen={canEdit ? () => onOpen(p.i) : undefined}
                />
              </div>
            </li>
          )
        })}
      </ol>

      {canEdit && <AddRow label="Добавить точку" onClick={onAdd} />}
    </div>
  )
}

/** Кружок этапа: 32 px внутри цели касания 44 px (правило 8). */
function Dot({ done }: { done: boolean }) {
  return (
    <span
      className={cn(
        'grid size-8 place-items-center rounded-full border-2 bg-surface',
        done ? 'border-accent bg-accent text-on-accent' : 'border-line-strong',
      )}
      aria-hidden
    >
      {done && <Check size={17} strokeWidth={3} />}
    </span>
  )
}

/** Тело этапа. Без обработчика — обычный блок текста, а не кнопка. */
function Body({
  point,
  line3,
  onOpen,
}: {
  point: RoutePoint
  line3: string
  onOpen?: () => void
}) {
  const inner = (
    <>
      <span className="flex items-baseline gap-2">
        <span className="tnum shrink-0 text-[13px] font-bold text-accent-text">
          {point.time || '··:··'}
        </span>
        <span
          className={cn(
            'min-w-0 text-[16px] leading-snug font-semibold text-pretty text-ink',
            point.done && 'line-through',
          )}
        >
          {point.n}
        </span>
      </span>
      {point.c ? (
        <span className="mt-0.5 block text-[13px] leading-snug text-muted">{point.c}</span>
      ) : null}
      {line3 ? (
        <span className="tnum mt-1 block text-[12px] leading-snug font-medium text-muted">
          {line3}
        </span>
      ) : null}
    </>
  )

  if (!onOpen) return <div className="min-h-16 min-w-0 flex-1 py-3">{inner}</div>

  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        'min-h-16 min-w-0 flex-1 rounded-xl py-3 pr-2 text-left transition-colors hover:bg-zebra/60',
        point.done && 'opacity-60',
      )}
    >
      {inner}
    </button>
  )
}
