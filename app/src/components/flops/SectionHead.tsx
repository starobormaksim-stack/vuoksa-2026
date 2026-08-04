import type { ReactNode } from 'react'
import { CircleHelp, Plus } from 'lucide-react'

/**
 * Заголовок раздела: название, кнопка «что означают значки» и главное действие.
 * Легенда значков живёт здесь, а не карточкой над списком (раздел 4.5 UX-проекта) —
 * это освобождает 120 px экрана.
 */
export function SectionHead({
  title,
  hint,
  onHelp,
  action,
  children,
}: {
  title: string
  hint?: string
  onHelp?: () => void
  action?: { label: string; onClick: () => void }
  children?: ReactNode
}) {
  return (
    <div className="mb-3">
      <div className="flex min-h-11 items-center gap-2">
        <h2 className="min-w-0 flex-1 text-2xl font-[700] text-ink">{title}</h2>
        {onHelp && (
          <button
            type="button"
            onClick={onHelp}
            aria-label="Что означают значки"
            className="grid size-11 shrink-0 place-items-center rounded-xl text-muted hover:bg-zebra hover:text-ink"
          >
            <CircleHelp size={21} strokeWidth={1.5} aria-hidden />
          </button>
        )}
        {action && (
          <button
            type="button"
            onClick={action.onClick}
            className="flex h-11 shrink-0 items-center gap-1.5 rounded-xl bg-accent-fill px-4 text-[15px] font-semibold text-on-accent shadow-sm hover:opacity-90"
          >
            <Plus size={18} strokeWidth={2} aria-hidden />
            {action.label}
          </button>
        )}
      </div>
      {hint ? <p className="mt-0.5 text-[13px] text-muted">{hint}</p> : null}
      {children}
    </div>
  )
}

/** Строка «+ Добавить …» в конце списка. */
export function AddRow({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-14 w-full items-center gap-2 px-4 text-left text-[15px] font-semibold text-accent-text transition-colors hover:bg-zebra"
    >
      <Plus size={18} strokeWidth={2} aria-hidden />
      {label}
    </button>
  )
}
