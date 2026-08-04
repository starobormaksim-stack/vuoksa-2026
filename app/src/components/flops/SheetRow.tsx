import { useId, type ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Строка внутри карточки позиции: слева подпись, справа значение и шеврон.
 * Это КНОПКА, а не поле (правило 1 UX-проекта). Пустое значение пишется словами
 * («не вписана», «никто», «нет»), а не прочерком.
 */
interface Props {
  label: string
  value: ReactNode
  /** нет обработчика — строка просто показывает значение, без шеврона */
  onClick?: () => void
  /** пояснение под строкой (например, nt.<поле>.c из данных) */
  hint?: string
  /** значение не задано — рисуем приглушённо */
  empty?: boolean
  className?: string
}

export function SheetRow({ label, value, onClick, hint, empty, className }: Props) {
  /* Пояснение лежит под кнопкой, поэтому связываем их явно — иначе скринридер его не прочтёт. */
  const hintId = useId()
  const body = (
    <>
      <span className="shrink-0 text-body font-medium text-muted">{label}</span>
      <span className="flex min-w-0 flex-1 items-center justify-end gap-1 text-right">
        <span
          className={cn(
            'truncate text-body font-semibold',
            empty ? 'font-medium text-muted' : 'text-ink',
          )}
        >
          {value}
        </span>
        {onClick && <ChevronRight size={18} strokeWidth={1.5} className="shrink-0 text-muted" aria-hidden />}
      </span>
    </>
  )

  return (
    /* Одна разделительная линия на строку — и та только между строками.
       Ни рамки вокруг стопки, ни зебры: строку отделяет от соседки ровно
       один волосок, больше отделять её нечем. */
    <div className={cn('border-b border-line last:border-b-0', className)}>
      {onClick ? (
        <button
          type="button"
          onClick={onClick}
          aria-describedby={hint ? hintId : undefined}
          className="flex min-h-14 w-full items-center gap-3 rounded-md px-1 text-left transition-colors hover:bg-zebra"
        >
          {body}
        </button>
      ) : (
        <div className="flex min-h-14 w-full items-center gap-3 px-1">{body}</div>
      )}
      {hint ? (
        <p id={hintId} className="-mt-1 pb-3 pl-1 text-note text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  )
}
