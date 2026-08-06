import type { ReactNode } from 'react'
import { InlineText } from '@/components/flops'
import { cn } from '@/lib/utils'

/**
 * Ячейки «Расчёта дороги» — общие для матрицы (1280) и ленты (390).
 *
 * Вынесены из `RoadCalc.tsx` 06.08.2026, когда у расчёта появилась вторая форма.
 * Название строки, её описание и посчитанное число обязаны выглядеть одинаково
 * на обеих ширинах: это один и тот же документ, а не два продукта.
 */

/**
 * Липкая ячейка статьи: название, второе имя (как техника зовётся сама),
 * описание и предупреждение. Всё правится на месте — у того, у кого есть право.
 */
export function Title({
  title, onTitle, second, onSecond, text, onText, extra, onExtra, warn, can,
  required, autoEdit, onEditEnd, strong,
}: {
  title: string
  onTitle: (v: string) => void
  second?: string
  onSecond?: (v: string) => void
  text?: string
  onText?: (v: string) => void
  /** второй комментарий — он есть только у топлива и только если заполнен */
  extra?: string
  onExtra?: (v: string) => void
  warn?: string
  can: boolean
  required?: boolean
  autoEdit?: boolean
  onEditEnd?: () => void
  strong?: boolean
}) {
  return (
    <span className="block">
      <InlineText
        value={title}
        onSave={onTitle}
        can={can}
        label={title || 'Название строки'}
        required={required}
        placeholder="Название"
        autoEdit={autoEdit}
        onEditEnd={onEditEnd}
        className={cn('text-body leading-snug text-ink', strong ? 'font-[650]' : 'font-medium')}
      />
      {second && onSecond ? (
        <InlineText
          value={second}
          onSave={onSecond}
          can={can}
          label="Как эта позиция называется сама"
          className="text-micro text-muted"
        />
      ) : null}
      {/* Пустая строка описания у того, кто править не может, — пустое место
          на экране. Ему её просто нет. */}
      {onText && (can || text) ? (
        <InlineText
          value={text ?? ''}
          onSave={onText}
          can={can}
          multiline
          label="Описание строки"
          placeholder="Описание"
          className="text-note leading-snug text-muted"
        />
      ) : text ? (
        <span className="block text-note leading-snug text-muted">{text}</span>
      ) : null}
      {extra && onExtra ? (
        <InlineText
          value={extra}
          onSave={onExtra}
          can={can}
          multiline
          label="Ещё комментарий"
          className="text-note leading-snug text-muted"
        />
      ) : null}
      {warn ? (
        <span className="mt-0.5 block text-note leading-snug font-semibold text-accent-text">
          {warn}
        </span>
      ) : null}
    </span>
  )
}

/** Строка, которую нельзя переименовать: это не данные, а подпись самого расчёта. */
export function Static({ title, text }: { title: string; text?: string }) {
  return (
    <span className="block">
      <span className="block text-body leading-snug font-[650] text-ink">{title}</span>
      {text ? <span className="block text-note leading-snug text-muted">{text}</span> : null}
    </span>
  )
}

/** Посчитанное число: правке не подлежит, поэтому и намёка на неё нет. */
export function Calc({ children }: { children: ReactNode }) {
  return <span className="tnum text-note text-muted">{children}</span>
}

/** Итог строки — самое крупное число в ней. */
export function Result({ children }: { children: ReactNode }) {
  return <span className="tnum text-body font-bold text-ink">{children}</span>
}
