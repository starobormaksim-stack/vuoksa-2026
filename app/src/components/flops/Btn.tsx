import type { ComponentProps } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * Кнопка Pine-to-Pine поверх shadcn Button.
 * Правило раздела 2.4 UX-проекта: заливка = продолжить, контур = отменить или удалить.
 * Размеры: sm 36 · md 44 (по умолчанию, минимальная цель касания) · lg 52.
 */
export type BtnTone = 'primary' | 'secondary' | 'ghost' | 'danger'
export type BtnSize = 'sm' | 'md' | 'lg'

const TONE: Record<BtnTone, string> = {
  primary: 'bg-accent-fill text-on-accent shadow-sm hover:opacity-90 border-transparent',
  secondary: 'bg-zebra text-ink border-transparent hover:bg-line/60',
  ghost: 'bg-transparent text-muted hover:bg-zebra hover:text-ink border-transparent',
  danger: 'bg-transparent text-accent-text border border-accent-text hover:bg-accent-soft',
}

const SIZE: Record<BtnSize, string> = {
  sm: 'h-9 px-3 text-sm gap-2 rounded-[10px]',
  md: 'h-11 px-4 text-[15px] gap-2 rounded-xl',
  lg: 'h-13 px-5 text-base gap-2 rounded-xl',
}

interface Props extends Omit<ComponentProps<typeof Button>, 'variant' | 'size'> {
  tone?: BtnTone
  scale?: BtnSize
}

export function Btn({ tone = 'primary', scale = 'md', className, ...rest }: Props) {
  return (
    <Button
      variant="ghost"
      className={cn('font-semibold transition-all', TONE[tone], SIZE[scale], className)}
      {...rest}
    />
  )
}
