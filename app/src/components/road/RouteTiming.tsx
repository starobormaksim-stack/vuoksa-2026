import { useEffect, useRef } from 'react'
import { Check, MapPin, MapPinPlus, Route, Settings2, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import type { RoutePoint } from '@/lib/types'
import { AddRow, EmptyState, InlineText, RowAction, RowActions } from '@/components/flops'
import { askMap, type MapMode } from '@/lib/mapfocus'
import { remove, touch, update } from '@/store'
import { scrollToSection } from '@/sections'
import { cn } from '@/lib/utils'
import { coordLabel, pointMeta } from './roadx'

/**
 * Попросить карту и подвести к ней страницу.
 *
 * Своя обёртка нужна из-за переезда: askMap(…, true) прокручивает к «Поездке»,
 * а маршрут теперь живёт в «Дороге». Прокрутку берём на себя, самой просьбе
 * говорим scroll:false — иначе страница улетела бы к обложке поездки.
 */
function askHere(pointId: string, mode: MapMode): void {
  scrollToSection('road')
  askMap(pointId, mode, false)
}

/**
 * Тайминг поездки — вертикальная лента точек: кружок «этап пройден», время,
 * название, описание и адрес.
 *
 * ⚠️ Правится всё прямо в строке (заказчик 04.08.2026: «это прямо вот здесь,
 * в этой таблице уже должно быть»). Карточка точки осталась только ради того,
 * что выбирается из списка, — метка этапа, чем добираемся, расстояние по дороге.
 *
 * Лента и карта — одна вещь, а не две, и связь у них двусторонняя через
 * lib/mapfocus.ts: строка адреса наводит карту, а тап по метке на карте
 * подсвечивает здесь нужную точку (activeId).
 *
 * Участнику лента показывается целиком, но без единой кнопки правки: их просто
 * нет в разметке (постулат 5). Строка «показать на карте» остаётся: смотреть
 * можно всем, это не правка.
 */
interface Props {
  points: RoutePoint[]
  canEdit: boolean
  /** отметить этап пройденным */
  onToggle: (id: string) => void
  /** открыть карточку точки: метка, чем добираемся, расстояние */
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

  const patch = (id: string, f: (p: RoutePoint) => void) =>
    update((s) => {
      const p = s.route.find((x) => x.i === id)
      if (p) {
        f(p)
        touch(p)
      }
    })

  const drop = (p: RoutePoint) => {
    remove('route', p.i)
    toast(`«${p.n || 'Точка'}» убрана`)
  }

  if (points.length === 0) {
    return (
      <EmptyState
        icon={Route}
        title="Маршрута пока нет"
        text="Точка маршрута — место, где мы окажемся по пути: сбор, выезд, закупка, лагерь"
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
          const meta = pointMeta(p)
          return (
            <li key={p.i} className="relative" data-point={p.i} aria-current={active || undefined}>
              {/* Нитка между кружками: рисуется под точкой, кроме последней. */}
              {!last && (
                <span aria-hidden className="absolute top-10 bottom-0 left-[34px] w-px bg-line" />
              )}

              <div
                className={cn(
                  'group flex items-start gap-2 rounded-xl px-3 transition-colors',
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

                <div className="min-w-0 flex-1 py-2">
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5 w-16 shrink-0">
                      <InlineText
                        value={p.time}
                        onSave={(v) =>
                          patch(p.i, (x) => {
                            x.time = v
                          })
                        }
                        can={canEdit}
                        label="Время"
                        placeholder="··:··"
                        className="tnum text-note font-bold text-accent-text"
                      />
                    </span>
                    <span className="min-w-0 flex-1">
                      <InlineText
                        value={p.n}
                        onSave={(v) =>
                          patch(p.i, (x) => {
                            x.n = v
                          })
                        }
                        can={canEdit}
                        required
                        label="Название точки"
                        placeholder="Например, Приозерск: закупка"
                        className={cn(
                          'text-body leading-snug font-semibold text-ink',
                          p.done && 'line-through',
                        )}
                      />
                      {canEdit || p.c ? (
                        <InlineText
                          value={p.c}
                          onSave={(v) =>
                            patch(p.i, (x) => {
                              x.c = v
                            })
                          }
                          can={canEdit}
                          multiline
                          label="Описание точки"
                          placeholder="Что здесь важно не забыть"
                          className="text-note leading-snug text-muted"
                        />
                      ) : null}
                    </span>
                    <RowActions>
                      {canEdit ? (
                        <RowAction
                          icon={Settings2}
                          label={`${p.n}: метка, чем добираемся, расстояние`}
                          onClick={() => onOpen(p.i)}
                        />
                      ) : null}
                      {canEdit ? (
                        <RowAction
                          icon={Trash2}
                          tone="danger"
                          label={`Убрать точку «${p.n}»`}
                          onClick={() => drop(p)}
                        />
                      ) : null}
                    </RowActions>
                  </div>

                  {meta ? (
                    <p className="tnum mt-1 text-micro leading-snug font-medium text-muted">{meta}</p>
                  ) : null}

                  <PlaceRow
                    point={p}
                    canEdit={canEdit}
                    onAddr={(v) =>
                      patch(p.i, (x) => {
                        x.addr = v
                      })
                    }
                  />
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
      {done && <Check size={18} strokeWidth={1.75} />}
    </span>
  )
}

/**
 * Строка места: адрес правится словами прямо здесь, а кнопка справа наводит
 * на точку карту. Координат нет и правка разрешена — вместо кнопки предложение
 * поставить точку на карте.
 */
function PlaceRow({
  point, canEdit, onAddr,
}: {
  point: RoutePoint
  canEdit: boolean
  onAddr: (v: string) => void
}) {
  const coord = coordLabel(point)
  if (!canEdit && !point.addr && !coord) return null

  return (
    <div className="mt-1 flex items-center gap-2">
      <MapPin size={16} strokeWidth={1.75} aria-hidden className="shrink-0 text-accent-text" />
      <span className="min-w-0 flex-1">
        <InlineText
          value={point.addr}
          onSave={onAddr}
          can={canEdit}
          label="Адрес"
          placeholder={coord || 'Улица, дом или ориентир'}
          className="tnum text-note text-muted"
        />
      </span>
      {coord ? (
        <button
          type="button"
          onClick={() => askHere(point.i, 'show')}
          aria-label={`${point.n}: показать на карте`}
          className="min-h-11 shrink-0 rounded-md px-2 text-note font-semibold text-accent-text transition-colors hover:bg-zebra"
        >
          на карте
        </button>
      ) : canEdit ? (
        <button
          type="button"
          onClick={() => askHere(point.i, 'place')}
          className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-md px-2 text-note font-semibold text-accent-text transition-colors hover:bg-zebra"
        >
          <MapPinPlus size={16} strokeWidth={1.75} aria-hidden />
          поставить на карте
        </button>
      ) : null}
    </div>
  )
}
