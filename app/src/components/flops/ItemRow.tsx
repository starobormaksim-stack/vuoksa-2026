import { useRef, useState, type ReactNode } from 'react'
import { Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Строка списка (docs/v2-ux-redesign.md, 4.1) — общая для «Сборов», «Закупки»,
 * «Дороги», «Меню» и «Вопросов».
 *
 * Внутри строки НЕТ ни одного поля ввода. Максимум два действия: тап по строке
 * открывает карточку позиции, тап по левому слоту — быстрая смена статуса.
 * Свайп влево больше 70 px удаляет (механика swipeDel из v1).
 */
interface Props {
  /** слот 44×44 слева: кружок статуса, чекбокс или иконка вида */
  lead?: ReactNode
  title: ReactNode
  /** вторая строка — одна фраза 13 px */
  line2?: ReactNode
  /** третий уровень — только если есть что сказать */
  line3?: ReactNode
  /** число справа: сумма, количество или литры */
  right?: ReactNode
  onOpen?: () => void
  /** позиция сделана: название зачёркнуто, строка приглушена */
  done?: boolean
  /** тревога: левая полоса и подсветка */
  alarm?: boolean
  /** зебра: чётные строки другой поверхностью */
  zebra?: boolean
  /** свайп влево — удалить; нет обработчика — свайпа нет */
  onDelete?: () => void
  /** якорь для перехода из поиска */
  dataHit?: string
}

export function ItemRow({
  lead, title, line2, line3, right, onOpen, done, alarm, zebra, onDelete, dataHit,
}: Props) {
  const [dx, setDx] = useState(0)
  const drag = useRef<{ x: number; y: number; on: boolean } | null>(null)

  const onDown = (e: React.PointerEvent) => {
    if (!onDelete || e.pointerType === 'mouse') return
    drag.current = { x: e.clientX, y: e.clientY, on: false }
  }
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    const mx = e.clientX - d.x
    const my = e.clientY - d.y
    if (!d.on) {
      if (Math.abs(my) > 12) {
        drag.current = null
        return
      }
      if (mx < -12) d.on = true
      else return
    }
    setDx(Math.max(-120, Math.min(0, mx)))
  }
  const onUp = () => {
    if (drag.current?.on && dx < -70) onDelete?.()
    drag.current = null
    setDx(0)
  }

  return (
    <div
      className={cn(
        'relative overflow-hidden',
        zebra ? 'bg-zebra' : 'bg-surface',
        alarm && 'bg-accent-soft',
      )}
      role="listitem"
      data-hit={dataHit}
    >
      {onDelete && dx < -8 && (
        <span className="absolute inset-y-0 right-4 grid place-items-center text-accent-text" aria-hidden>
          <Trash2 size={22} strokeWidth={1.5} />
        </span>
      )}
      {alarm && <span className="absolute inset-y-0 left-0 w-1 bg-accent-text" aria-hidden />}

      <div
        className="relative flex items-center gap-3 px-4"
        /* Пока палец ведёт строку — никакой анимации, иначе она отстаёт от руки.
           Возврат на место — те же 200 мс, что и у остального движения в проекте;
           правило prefers-reduced-motion в index.css гасит и эту длительность. */
        style={{
          transform: dx ? `translateX(${dx}px)` : undefined,
          transition: dx ? undefined : 'transform 200ms cubic-bezier(0.2, 0.8, 0.2, 1)',
        }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        {lead ? <div className="shrink-0">{lead}</div> : null}

        <button
          type="button"
          onClick={onOpen}
          disabled={!onOpen}
          className={cn(
            /* 64 px на телефоне — минимум строки списка, ниже опускаться нельзя.
               На десктопе, где курсор точнее пальца, хватает 56. */
            'flex min-h-16 min-w-0 flex-1 items-center gap-3 py-2 text-left lg:min-h-14',
            /* Сделанное приглушается до 70 %, а не до 55: на 55 % зачёркнутое
               название давало 3,6 : 1 к фону в светлой теме и 4,0 : 1 в тёмной —
               ниже нормы 4,5 : 1. На 70 % это 5,6 : 1 и 5,3 : 1. */
            done && 'opacity-70',
            !onOpen && 'cursor-default',
          )}
        >
          <span className="min-w-0 flex-1">
            <span
              className={cn(
                'block text-body font-semibold text-ink text-pretty',
                done && 'line-through',
              )}
            >
              {title}
            </span>
            {line2 ? (
              <span className="mt-0.5 block text-note text-muted">{line2}</span>
            ) : null}
            {line3 ? <span className="mt-1 block">{line3}</span> : null}
          </span>

          {right != null ? (
            <span className="tnum shrink-0 text-body font-bold text-ink">{right}</span>
          ) : null}
        </button>
      </div>
    </div>
  )
}
