import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { ChevronDown, MoreHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Заголовок группы и её тело (docs/v2-ux-redesign.md, 4.6).
 * Полоса прогресса — нижняя граница заголовка, а не отдельный элемент.
 * Содержимое строится лениво при первом раскрытии (принцип lazyBody из v1):
 * иначе 105 строк «Сборов» рисуются впустую.
 *
 * Действия над самим разделом (переименовать, свернуть все, удалить) вызываются
 * двумя путями сразу: долгим тапом по заголовку — привычка мобильных списков —
 * и кнопкой «⋯» справа, потому что долгий тап не виден и мышью неудобен.
 */

/** Сколько держать заголовок, чтобы открылись действия раздела. */
const LONG_PRESS_MS = 500
/** На столько палец может съехать, пока это ещё удержание, а не прокрутка. */
const MOVE_TOLERANCE = 10

interface Props {
  title: ReactNode
  /** счётчик «12 / 18»; без него счётчик не рисуется */
  done?: number
  total?: number
  open: boolean
  onToggle: () => void
  /** бейдж справа от названия — например «личное» */
  badge?: ReactNode
  /** действия над разделом: долгий тап по заголовку и кнопка «⋯»; без него ни того, ни другого */
  onMenu?: () => void
  children: ReactNode
  className?: string
}

export function Group({ title, done, total, open, onToggle, badge, onMenu, children, className }: Props) {
  const seen = useRef(open)
  if (open) seen.current = true
  const [, force] = useState(0)
  const pct = total && total > 0 ? Math.round(((done ?? 0) / total) * 100) : 0

  /* Удержание заголовка. `fired` гасит клик, который браузер шлёт после долгого тапа,
     иначе раздел заодно свернулся бы. Прокрутка удержание отменяет. */
  const press = useRef<{ t: number | null; x: number; y: number; fired: boolean }>({
    t: null, x: 0, y: 0, fired: false,
  })
  const stopPress = () => {
    if (press.current.t !== null) window.clearTimeout(press.current.t)
    press.current.t = null
  }
  useEffect(() => stopPress, [])

  const down = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (!onMenu) return
    stopPress()
    press.current = {
      x: e.clientX,
      y: e.clientY,
      fired: false,
      t: window.setTimeout(() => {
        press.current.t = null
        press.current.fired = true
        onMenu()
      }, LONG_PRESS_MS),
    }
  }
  const move = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (press.current.t === null) return
    if (
      Math.abs(e.clientX - press.current.x) > MOVE_TOLERANCE ||
      Math.abs(e.clientY - press.current.y) > MOVE_TOLERANCE
    )
      stopPress()
  }
  const click = () => {
    stopPress()
    if (press.current.fired) {
      press.current.fired = false
      return
    }
    seen.current = true
    onToggle()
    force((n) => n + 1)
  }

  return (
    <section className={cn('overflow-hidden rounded-2xl border border-line bg-surface shadow-sm', className)}>
      <h3 className="relative flex items-stretch">
        <button
          type="button"
          onClick={click}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={stopPress}
          onPointerLeave={stopPress}
          onPointerCancel={stopPress}
          aria-expanded={open}
          className={cn(
            'flex min-h-14 flex-1 items-center gap-3 px-4 text-left transition-colors hover:bg-zebra/60',
            onMenu && 'pr-1 select-none',
          )}
        >
          <span className="min-w-0 flex-1 truncate text-[17px] font-[650] text-ink">{title}</span>
          {badge}
          {total != null && total > 0 && (
            <span className="tnum shrink-0 text-[15px] font-semibold text-muted">
              {done ?? 0} / {total}
            </span>
          )}
          <ChevronDown
            size={20}
            strokeWidth={1.5}
            aria-hidden
            className={cn('shrink-0 text-muted transition-transform', open && 'rotate-180')}
          />
        </button>
        {onMenu && (
          <button
            type="button"
            onClick={onMenu}
            aria-label="Действия раздела"
            className="my-auto mr-2 grid size-11 shrink-0 place-items-center rounded-xl text-muted transition-colors hover:bg-zebra hover:text-ink"
          >
            <MoreHorizontal size={20} strokeWidth={1.5} aria-hidden />
          </button>
        )}
        {total != null && total > 0 && (
          <span className="absolute inset-x-0 bottom-0 h-[3px] bg-line/70" aria-hidden>
            <span className="block h-full bg-accent transition-[width]" style={{ width: `${pct}%` }} />
          </span>
        )}
      </h3>
      {seen.current && <div className={open ? 'block' : 'hidden'}>{children}</div>}
    </section>
  )
}
