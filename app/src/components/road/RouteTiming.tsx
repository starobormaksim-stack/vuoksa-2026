import { useEffect, useRef } from 'react'
import { Check, MapPin, MapPinPlus, Route } from 'lucide-react'
import type { RoutePoint } from '@/lib/types'
import { AddRow, EmptyState } from '@/components/flops'
import { askMap } from '@/lib/mapfocus'
import { cn } from '@/lib/utils'
import { coordLabel, pointMeta } from './roadx'

/**
 * Тайминг поездки (docs/v2-ux-redesign.md, 10.6) — вертикальная лента точек:
 * кружок «этап пройден», время, название, заметка и третья строка с меткой и расстоянием.
 *
 * Лента стоит рядом с картой — это одна вещь, а не две (заказчик 04.08.2026:
 * «тайминг и маршрут вместе… оно должно быть рядом с картой»). Связь двусторонняя
 * и идёт через посредник lib/mapfocus.ts: тап по строке адреса наводит карту,
 * а тап по метке на карте подсвечивает здесь нужную точку (activeId).
 *
 * Участнику лента показывается целиком, но без единой кнопки правки: ни кружка,
 * ни «добавить» — их просто нет в разметке (правило 12.2). Строка «показать на карте»
 * при этом остаётся: смотреть можно всем, это не правка.
 */
interface Props {
  points: RoutePoint[]
  canEdit: boolean
  /** отметить этап пройденным */
  onToggle: (id: string) => void
  onOpen: (id: string) => void
  onAdd: () => void
  /** какую точку подсветить: по её метке только что тапнули на карте */
  activeId?: string | null
  /** метка времени просьбы: по одной метке можно тапнуть дважды подряд */
  activeAt?: number
}

export function RouteTiming({
  points, canEdit, onToggle, onOpen, onAdd, activeId, activeAt,
}: Props) {
  const box = useRef<HTMLDivElement | null>(null)

  /* Подсвеченная точка может оказаться за краем ленты — подводим её к глазам.
     block:'nearest' и behavior:'auto': лента прокручивается внутри себя, дёргать
     ради этого всю страницу нельзя, карта рядом должна остаться на месте. */
  useEffect(() => {
    if (!activeId) return
    const el = box.current?.querySelector<HTMLElement>(`[data-point="${CSS.escape(activeId)}"]`)
    el?.scrollIntoView({ block: 'nearest', behavior: 'auto' })
  }, [activeId, activeAt])

  if (points.length === 0) {
    return (
      <EmptyState
        icon={Route}
        title="Маршрута пока нет"
        text="Добавьте первую точку — или поставьте её тапом по карте наверху, в «Поездке»"
        action={canEdit ? { label: 'Добавить точку', onClick: onAdd } : undefined}
      />
    )
  }

  return (
    <div ref={box}>
      <ol className="py-1">
        {points.map((p, idx) => {
          const last = idx === points.length - 1
          const active = p.i === activeId
          return (
            <li key={p.i} className="relative" data-point={p.i} aria-current={active || undefined}>
              {/* Нитка между кружками: рисуется под точкой, кроме последней. */}
              {!last && (
                <span aria-hidden className="absolute top-10 bottom-0 left-[34px] w-px bg-line" />
              )}

              <div
                className={cn(
                  'flex items-start gap-3 rounded-xl px-3 transition-colors',
                  active && 'bg-accent-soft',
                )}
              >
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

                <div className="min-w-0 flex-1 pb-1">
                  <Body
                    point={p}
                    onOpen={
                      canEdit
                        ? () => {
                            /* Тап по точке в ленте заодно наводит карту рядом —
                               без прокрутки страницы: карта и так на виду. */
                            if (typeof p.lat === 'number') askMap(p.i, 'show', false)
                            onOpen(p.i)
                          }
                        : undefined
                    }
                  />
                  <PlaceRow point={p} canEdit={canEdit} />
                </div>
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

/**
 * Строка места: адрес (или координаты) — кнопка «показать на карте».
 * Координат нет и правка разрешена — предлагаем поставить точку.
 * Координат нет и правки нет — строки нет вовсе: показывать нечего.
 */
function PlaceRow({ point, canEdit }: { point: RoutePoint; canEdit: boolean }) {
  const coord = coordLabel(point)
  const shown = point.addr || coord

  if (!coord) {
    if (!canEdit) return null
    return (
      <button
        type="button"
        onClick={() => askMap(point.i, 'place')}
        className="mt-1 flex min-h-11 w-full items-center gap-2 rounded-xl pr-2 text-left text-[13px] font-semibold text-accent-text transition-colors hover:bg-zebra/60"
      >
        <MapPinPlus size={17} strokeWidth={1.75} aria-hidden className="shrink-0" />
        <span className="min-w-0 flex-1">Поставить на карте</span>
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={() => askMap(point.i, 'show')}
      aria-label={`${point.n}: показать на карте`}
      className="mt-1 flex min-h-11 w-full items-center gap-2 rounded-xl pr-2 text-left transition-colors hover:bg-zebra/60"
    >
      <MapPin size={17} strokeWidth={1.75} aria-hidden className="shrink-0 text-accent-text" />
      <span className="tnum min-w-0 flex-1 truncate text-[13px] font-medium text-muted">
        {shown}
      </span>
      <span className="shrink-0 text-[13px] font-semibold text-accent-text">на карте</span>
    </button>
  )
}

/** Тело этапа. Без обработчика — обычный блок текста, а не кнопка. */
function Body({ point, onOpen }: { point: RoutePoint; onOpen?: () => void }) {
  const meta = pointMeta(point)
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
      {meta ? (
        <span className="tnum mt-1 block text-[12px] leading-snug font-medium text-muted">
          {meta}
        </span>
      ) : null}
    </>
  )

  if (!onOpen) return <div className="min-h-16 w-full pt-3 pb-1">{inner}</div>

  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        'min-h-16 w-full rounded-xl pt-3 pr-2 pb-1 text-left transition-colors hover:bg-zebra/60',
        point.done && 'opacity-60',
      )}
    >
      {inner}
    </button>
  )
}
