import type { PersonTone } from '@/lib/people'
import { cn } from '@/lib/utils'

/**
 * Личная метка участника (см. lib/people.ts).
 *
 * Правка 04.08.2026 по просьбе заказчика: «пускай будут кружочки, но цвета пускай будут
 * на подложке, чтобы их было лучше видно». Отсюда устройство метки:
 *
 *  1. Снаружи у всех — кружок. Квадрат и ромб убраны.
 *  2. Под янтарём лежит ПОДЛОЖКА цвета карточки (`--surface`) с волосяной каймой
 *     (`--line-strong`). Она и решает задачу видимости: метка чаще всего стоит поверх
 *     фотографии участника под тёмным градиентом, где янтарь сам по себе тонул.
 *     Подложка темизирована, поэтому читается и в светлой теме, и в тёмной.
 *  3. Различие между людьми — насыщенность янтаря И рисунок внутри кружка
 *     (сплошной, кольцо, половинка, точка). Рисунок обязателен: цвет один на всех,
 *     разброс насыщенности узкий, и без рисунка требование WCAG 1.4.1 «различие
 *     не только цветом» не выполнялось бы.
 *
 * Насыщенность даётся прозрачностью отдельного слоя, а не color-mix: встроенный
 * браузер Телеграма на старых телефонах color-mix понимает не везде.
 */

/**
 * Ниже 14 px подложка с рисунком превращается в кашу: на кайму и на просвет кольца
 * остаётся меньше пикселя. Поэтому метка не уменьшается дальше этой границы, какой бы
 * размер ни просили вызывающие (в списках стояли 10 и 12 — они подтягиваются до 14).
 */
const MIN = 14

export function PersonMark({
  tone,
  size = MIN,
  className,
}: {
  tone: PersonTone
  size?: number
  className?: string
}) {
  const d = Math.max(size, MIN)
  /** толщина каймы подложки: она же зазор между янтарём и краем метки */
  const pad = Math.max(2, Math.round(d * 0.16))
  /** поле под сам янтарь */
  const core = d - pad * 2

  return (
    <span
      aria-hidden
      className={cn('relative inline-block shrink-0 rounded-full', className)}
      style={{
        width: d,
        height: d,
        background: 'var(--surface)',
        /* кайма тенью, а не рамкой: не отнимает у янтаря ни пикселя поля */
        boxShadow: '0 0 0 1px var(--line-strong)',
      }}
    >
      <span
        className="absolute overflow-hidden rounded-full"
        style={{ inset: pad, opacity: tone.alpha }}
      >
        {tone.pattern === 'solid' && (
          <span className="absolute inset-0 rounded-full" style={{ background: 'var(--accent-fill)' }} />
        )}

        {tone.pattern === 'ring' && (
          <span
            className="absolute inset-0 rounded-full"
            style={{
              border: `${Math.max(2, Math.round(core * 0.3))}px solid var(--accent-fill)`,
            }}
          />
        )}

        {/* половинка: правая часть остаётся подложкой — видно и без цвета */}
        {tone.pattern === 'half' && (
          <span className="absolute inset-y-0 left-0 w-1/2" style={{ background: 'var(--accent-fill)' }} />
        )}

        {tone.pattern === 'dot' && (
          <span
            className="absolute top-1/2 left-1/2 rounded-full"
            style={{
              width: Math.max(4, Math.round(core * 0.55)),
              height: Math.max(4, Math.round(core * 0.55)),
              transform: 'translate(-50%, -50%)',
              background: 'var(--accent-fill)',
            }}
          />
        )}
      </span>
    </span>
  )
}

/**
 * Цвет полосы/сегмента этого человека — тот же янтарь, но своя насыщенность.
 * Почему не та же, что у метки, — объяснено у `barAlpha` в lib/people.ts.
 */
export function toneStyle(tone: PersonTone): { background: string; opacity: number } {
  return { background: 'var(--accent-fill)', opacity: tone.barAlpha }
}
