import type { LucideIcon } from 'lucide-react'
import { Btn } from './Btn'

/**
 * Пустое состояние (docs/v2-ux-redesign.md, 13.1):
 * иконка 28 px в круге 64, заголовок, одна фраза, одна кнопка.
 */
interface Props {
  icon: LucideIcon
  title: string
  text: string
  action?: { label: string; onClick: () => void }
}

export function EmptyState({ icon: Icon, title, text, action }: Props) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
      <span className="grid size-16 place-items-center rounded-full bg-zebra text-muted">
        <Icon size={28} strokeWidth={1.5} aria-hidden />
      </span>
      <div>
        <div className="text-base font-[650] text-ink">{title}</div>
        <p className="mx-auto mt-1 max-w-64 text-sm text-muted text-balance">{text}</p>
      </div>
      {action && (
        <Btn tone="secondary" onClick={action.onClick}>
          {action.label}
        </Btn>
      )}
    </div>
  )
}
