import { Car, Check, Clock, TriangleAlert } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import { ST_NAME, type StatusValue } from '@/lib/gearx'
import { cn } from '@/lib/utils'

/**
 * Кружок статуса (docs/v2-ux-redesign.md, 4.5). Пять состояний различаются
 * формой, заливкой и иконкой — не только цветом (WCAG 1.4.1):
 *   0 не взято   — пустое кольцо
 *   1 в процессе — кольцо, залитое наполовину снизу, часы
 *   2 упаковано  — сплошная заливка янтарём, галочка
 *   3 в машине   — сплошная заливка графитом, машина
 *   не могу взять — контур и штриховка, треугольник
 */
interface Props {
  value: StatusValue
  cant?: boolean
  /** нет обработчика — кружок нерисуемая кнопка, просто значок */
  onCycle?: () => void
  /** нажатие запрещено правами: кружок кликается, но объясняет отказ */
  onDenied?: () => void
  /** чей это статус — для подписи скринридеру */
  who?: string
  size?: 44 | 32
}

export function StatusDial({ value, cant, onCycle, onDenied, who, size = 44 }: Props) {
  const reduce = useReducedMotion()
  const dot = size === 44 ? 'size-8' : 'size-7'
  const icon = size === 44 ? 20 : 17

  const label = cant ? 'не могу взять' : ST_NAME[value]
  const aria = who ? `${who}: ${label}. Изменить` : `${label}. Изменить`

  const inner = cant ? (
    <span
      className={cn(
        dot,
        'hatch grid place-items-center rounded-full border-[1.5px] border-accent-text text-accent-text',
      )}
    >
      <TriangleAlert size={icon} strokeWidth={2} aria-hidden />
    </span>
  ) : value === 3 ? (
    <span className={cn(dot, 'grid place-items-center rounded-full bg-loaded text-surface')}>
      <Car size={icon} strokeWidth={2} aria-hidden />
    </span>
  ) : value === 2 ? (
    <span className={cn(dot, 'grid place-items-center rounded-full bg-accent text-on-accent')}>
      <Check size={icon + 2} strokeWidth={2.5} aria-hidden />
    </span>
  ) : value === 1 ? (
    <span
      className={cn(dot, 'relative grid place-items-center overflow-hidden rounded-full border-2 border-accent text-accent-text')}
    >
      <span className="absolute inset-x-0 bottom-0 h-1/2 bg-accent/35" aria-hidden />
      <Clock size={icon} strokeWidth={2} className="relative" aria-hidden />
    </span>
  ) : (
    <span className={cn(dot, 'rounded-full border-[1.5px] border-line-strong')} />
  )

  const body = (
    <motion.span
      key={cant ? 'cant' : value}
      /* Только масштаб, без прозрачности: если кадры не рисуются (фоновая вкладка,
         экономия батареи), незавершённая анимация не должна оставить значок бледным. */
      initial={reduce ? false : { scale: 0.86 }}
      animate={{ scale: 1 }}
      transition={{ duration: reduce ? 0 : 0.18, ease: [0.2, 0.8, 0.2, 1] }}
      className="grid place-items-center"
    >
      {inner}
    </motion.span>
  )

  if (!onCycle && !onDenied) {
    return (
      <span
        role="img"
        aria-label={who ? `${who}: ${label}` : label}
        className="grid shrink-0 place-items-center"
        style={{ width: size, height: size }}
      >
        {body}
      </span>
    )
  }

  return (
    <button
      type="button"
      aria-label={aria}
      onClick={(e) => {
        e.stopPropagation()
        if (onCycle) onCycle()
        else onDenied?.()
      }}
      className="grid shrink-0 place-items-center rounded-full transition-colors hover:bg-zebra"
      style={{ width: size, height: size }}
    >
      {body}
    </button>
  )
}
