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

/* Заливка главной кнопки говорит сама за себя — тень под ней была украшением
   и рядом с плоскими карточками читалась как чужая деталь. */
const TONE: Record<BtnTone, string> = {
  /* Под курсором заливка становится плотнее (--accent-fill-hover), а не прозрачнее.
     Прежнее `hover:opacity-90` высветляло кнопку, и наведение читалось как отказ. */
  primary: 'bg-accent-fill text-on-accent hover:bg-accent-fill-hover border-transparent',
  secondary: 'bg-zebra text-ink border-transparent hover:bg-line',
  ghost: 'bg-transparent text-muted hover:bg-zebra hover:text-ink border-transparent',
  danger: 'bg-transparent text-accent-text border border-accent-text hover:bg-accent-soft',
}

/* Высоты 36 · 44 · 52 и радиусы 8 · 12 · 12 — из общей шкалы проекта.
   У маленькой кнопки видимая высота 36 px, а зона нажатия добирается невидимым
   слоем до 44 px: меньше пальцем не попасть (постулат 7). */
const SIZE: Record<BtnSize, string> = {
  sm: 'h-9 px-3 text-note gap-2 rounded-md relative before:absolute before:-inset-y-1 before:inset-x-0 before:content-[""]',
  md: 'h-11 px-4 text-body gap-2 rounded-lg',
  lg: 'h-13 px-5 text-body gap-2 rounded-lg',
}

interface Props extends Omit<ComponentProps<typeof Button>, 'variant' | 'size'> {
  tone?: BtnTone
  scale?: BtnSize
}

export function Btn({ tone = 'primary', scale = 'md', className, ...rest }: Props) {
  return (
    <Button
      variant="ghost"
      /* Перечисляем свойства поимённо: transition-all анимировал заодно размеры
         и положение, и кнопка «плыла» при любом пересчёте разметки. */
      className={cn(
        'font-semibold transition-[color,background-color,border-color,opacity]',
        TONE[tone],
        SIZE[scale],
        className,
      )}
      {...rest}
    />
  )
}
