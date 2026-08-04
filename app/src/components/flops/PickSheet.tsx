import type { ReactNode } from 'react'
import { Check } from 'lucide-react'
import { ResponsiveSheet } from './ResponsiveSheet'
import { cn } from '@/lib/utils'

/** Пункт выбора: название и, если нужно, объяснение последствия. */
export interface PickOption {
  id: string
  title: string
  hint?: string
  lead?: ReactNode
}

/**
 * Список выбора вместо нативного <select> (правило 1 и раздел 9.3 UX-проекта).
 * Пункты 56 px, с описанием под названием — человек видит последствие выбора
 * до того, как выберет.
 */
export function PickSheet({
  open,
  onOpenChange,
  title,
  subtitle,
  options,
  value,
  onPick,
  onBack,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  title: string
  subtitle?: string
  options: PickOption[]
  value: string
  onPick: (id: string) => void
  onBack?: () => void
}) {
  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={onOpenChange}
      onBack={onBack}
      title={title}
      subtitle={subtitle}
    >
      <ul role="radiogroup" aria-label={title}>
        {options.map((o) => {
          const on = o.id === value
          return (
            <li key={o.id}>
              <button
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => {
                  onPick(o.id)
                  onOpenChange(false)
                }}
                className={cn(
                  'flex min-h-14 w-full items-center gap-3 rounded-md px-2 text-left transition-colors hover:bg-zebra',
                  on && 'bg-accent-soft',
                )}
              >
                <span
                  className={cn(
                    'grid size-6 shrink-0 place-items-center rounded-full border-[1.5px]',
                    on ? 'border-accent bg-accent text-on-accent' : 'border-line-strong',
                  )}
                  aria-hidden
                >
                  {on && <Check size={16} strokeWidth={1.75} />}
                </span>
                {o.lead}
                <span className="min-w-0 flex-1 py-2">
                  <span className="block text-body font-semibold text-ink">{o.title}</span>
                  {o.hint ? (
                    <span className="mt-0.5 block text-note text-muted">{o.hint}</span>
                  ) : null}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </ResponsiveSheet>
  )
}
