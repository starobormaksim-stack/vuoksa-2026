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
 *  3. Различие между людьми — насыщенность янтаря И рисунок внутри кружка. Рисунок
 *     обязателен: цвет один на всех, разброс насыщенности узкий, и без рисунка
 *     требование WCAG 1.4.1 «различие не только цветом» не выполнялось бы.
 *
 * Правка 04.08.2026, вторая: рисунков стало восемь вместо четырёх — на четырёх пятый
 * участник поездки получал метку первого. Добавлены четверть, две точки, диагональная
 * половинка и шахматка; первые четыре (сплошной, кольцо, половинка, точка) не тронуты.
 * Порядок и насыщенности — в lib/people.ts.
 *
 * Насыщенность даётся прозрачностью отдельного слоя, а не color-mix: встроенный
 * браузер Телеграма на старых телефонах color-mix понимает не везде. По той же причине
 * диагональ нарисована линейным градиентом с резкой границей, а не clip-path.
 */

/**
 * Ниже этой границы подложка с рисунком превращается в кашу: на кайму и на просвет
 * кольца остаётся меньше пикселя. Метка не уменьшается дальше, какой бы размер ни
 * просили вызывающие (в списках стояли 10 и 12 — они подтягиваются сюда).
 * 04.08.2026 поднято с 14 до 16: восемь узоров на 14 px заказчик назвал мелковатыми,
 * и различить их можно было только вплотную.
 */
const MIN = 16

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
  /** точка в парном рисунке: две такие и зазор между ними должны влезть в поле янтаря */
  const twin = Math.max(3, Math.round(core * 0.38))

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

        {/* четверть: закрашена одна четвертина, круглая обрезка делает из неё сектор */}
        {tone.pattern === 'quarter' && (
          <span className="absolute top-0 left-0 h-1/2 w-1/2" style={{ background: 'var(--accent-fill)' }} />
        )}

        {/* две точки: главное отличие от одиночной — их две, а не размер */}
        {tone.pattern === 'twin' && (
          <span
            className="absolute inset-0 flex items-center justify-center"
            style={{ gap: Math.max(1, Math.round(core * 0.12)) }}
          >
            <span
              className="rounded-full"
              style={{ width: twin, height: twin, background: 'var(--accent-fill)' }}
            />
            <span
              className="rounded-full"
              style={{ width: twin, height: twin, background: 'var(--accent-fill)' }}
            />
          </span>
        )}

        {/* диагональная половинка: та же половина поля, но граница идёт под 45° —
            от вертикальной половинки отличается наклоном края, а не цветом */}
        {tone.pattern === 'diag' && (
          <span
            className="absolute inset-0"
            style={{
              background: 'linear-gradient(45deg, var(--accent-fill) 50%, transparent 50%)',
            }}
          />
        )}

        {/* шахматка: две четвертины по диагонали, между ними просвет подложки */}
        {tone.pattern === 'checker' && (
          <>
            <span className="absolute top-0 left-0 h-1/2 w-1/2" style={{ background: 'var(--accent-fill)' }} />
            <span
              className="absolute right-0 bottom-0 h-1/2 w-1/2"
              style={{ background: 'var(--accent-fill)' }}
            />
          </>
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
