import type { PersonTone } from '@/lib/people'
import { cn } from '@/lib/utils'

/**
 * Личная метка участника (см. lib/people.ts): янтарь разной насыщенности и разной формы.
 * Новых цветов не вводит — только оттенки янтаря, разбавленные фоном страницы.
 * Насыщенность даётся прозрачностью отдельного слоя, а не color-mix: встроенный
 * браузер Телеграма на старых телефонах color-mix понимает не везде.
 */
export function PersonMark({
  tone,
  size = 12,
  className,
}: {
  tone: PersonTone
  size?: number
  className?: string
}) {
  const shape =
    tone.shape === 'square'
      ? 'rounded-[30%]'
      : tone.shape === 'diamond'
        ? 'rounded-[18%] rotate-45'
        : 'rounded-full'

  return (
    <span
      aria-hidden
      className={cn('relative inline-block shrink-0', className)}
      style={{ width: size, height: size }}
    >
      <span
        className={cn(
          'absolute inset-0',
          shape,
          tone.shape === 'ring' && 'border-2 border-current',
        )}
        style={{
          background: tone.shape === 'ring' ? 'transparent' : 'var(--accent-fill)',
          color: tone.shape === 'ring' ? 'var(--accent-fill)' : undefined,
          opacity: tone.alpha,
        }}
      />
    </span>
  )
}

/** Цвет полосы/сегмента этого человека — тот же янтарь, та же насыщенность. */
export function toneStyle(tone: PersonTone): { background: string; opacity: number } {
  return { background: 'var(--accent-fill)', opacity: tone.alpha }
}
