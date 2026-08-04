import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * Живая фраза вместо формулы (docs/v2-ux-redesign.md, 4.4).
 * Там, где v1 показывала форму с параметрами, v2 показывает предложение по-русски,
 * в котором числа — кнопки с фирменным пунктирным подчёркиванием. Ни одного знака
 * ×, ÷ или = на экране.
 */

/** Число внутри фразы: правится тапом. Недоступно по правам — обычный текст. */
export function EditNum({
  children,
  onClick,
  label,
}: {
  children: ReactNode
  onClick?: () => void
  label?: string
}) {
  if (!onClick) return <span className="font-semibold text-ink">{children}</span>
  // Видимая высота прежняя (32), цель касания 44 — её даёт невидимый слой ::after.
  // Так строки абзаца не разъезжаются: слой лежит поверх и в поток не входит.
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="editable tnum relative inline-flex min-h-8 items-center px-1 align-baseline font-semibold text-ink after:absolute after:inset-x-0 after:-inset-y-1.5 after:content-['']"
    >
      {children}
    </button>
  )
}

/** Итог фразы: считается сам, поэтому не кнопка и без пунктира. */
export function ResultNum({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn('tnum text-head font-bold text-ink', className)}>{children}</span>
}

/** Карточка с живой фразой: заголовок, кнопка «Изменить», текст. */
export function SentenceCard({
  title,
  sum,
  onEdit,
  children,
  note,
}: {
  title: string
  sum?: ReactNode
  /** дублирующая кнопка 44 px — цели касания у чисел внутри фразы меньше 44 */
  onEdit?: () => void
  children: ReactNode
  note?: string
}) {
  return (
    /* Карточка держится на одной линии — тень отсюда убрана вслед за Group. */
    <section className="rounded-2xl border border-line bg-surface p-4">
      <div className="flex min-h-11 items-center gap-3">
        <h3 className="min-w-0 flex-1 text-body font-[650] text-ink">{title}</h3>
        {sum != null && <span className="tnum text-body font-bold text-ink">{sum}</span>}
        {onEdit && (
          <button
            type="button"
            onClick={onEdit}
            className="-mr-3 h-11 shrink-0 rounded-md px-3 text-body font-semibold text-accent-text transition-colors hover:bg-zebra"
          >
            Изменить
          </button>
        )}
      </div>
      <div className="mt-2 text-body leading-relaxed text-ink text-pretty">{children}</div>
      {note ? <p className="mt-2 text-note text-muted">{note}</p> : null}
    </section>
  )
}
