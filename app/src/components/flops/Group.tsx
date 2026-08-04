import { useRef, useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Заголовок группы и её тело (docs/v2-ux-redesign.md, 4.6).
 * Полоса прогресса — нижняя граница заголовка, а не отдельный элемент.
 * Содержимое строится лениво при первом раскрытии (принцип lazyBody из v1):
 * иначе 105 строк «Сборов» рисуются впустую.
 */
interface Props {
  title: ReactNode
  /** счётчик «12 / 18»; без него счётчик не рисуется */
  done?: number
  total?: number
  open: boolean
  onToggle: () => void
  /** бейдж справа от названия — например «личное» */
  badge?: ReactNode
  children: ReactNode
  className?: string
}

export function Group({ title, done, total, open, onToggle, badge, children, className }: Props) {
  const seen = useRef(open)
  if (open) seen.current = true
  const [, force] = useState(0)
  const pct = total && total > 0 ? Math.round(((done ?? 0) / total) * 100) : 0

  return (
    <section className={cn('overflow-hidden rounded-2xl border border-line bg-surface shadow-sm', className)}>
      <h3>
        <button
          type="button"
          onClick={() => {
            seen.current = true
            onToggle()
            force((n) => n + 1)
          }}
          aria-expanded={open}
          className="relative flex min-h-14 w-full items-center gap-3 px-4 text-left transition-colors hover:bg-zebra/60"
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
          {total != null && total > 0 && (
            <span className="absolute inset-x-0 bottom-0 h-[3px] bg-line/70" aria-hidden>
              <span className="block h-full bg-accent transition-[width]" style={{ width: `${pct}%` }} />
            </span>
          )}
        </button>
      </h3>
      {seen.current && <div className={open ? 'block' : 'hidden'}>{children}</div>}
    </section>
  )
}
