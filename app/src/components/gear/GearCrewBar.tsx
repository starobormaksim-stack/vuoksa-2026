import { crewAria, type CrewSegment } from '@/lib/gearx'
import { cn } from '@/lib/utils'

/**
 * Полоса экипажа в режиме «Все» (docs/v2-ux-redesign.md, 8.3).
 *
 * Заменяет ряд из четырёх чипов «фото + имя + количество + значок» — именно на них
 * жаловался заказчик: четыре чипа по 110 px не помещались в 358 px, переносились
 * в две строки, и вещь занимала пять экранных строк вместо одной.
 *
 * Порядок сегментов постоянный (порядок S.people), чтобы «третий сегмент — Миша»
 * стало привычкой. Имена в свёрнутом виде не перечисляются: они в карточке позиции.
 * Различие состояний — заливкой, контуром и штриховкой, не только цветом (WCAG 1.4.1).
 */
export function GearCrewBar({ segs }: { segs: CrewSegment[] }) {
  if (segs.length === 0) {
    return (
      <span role="img" aria-label="Никто не везёт" className="flex h-2 w-full">
        <span className="h-full w-full rounded-[2px] border border-dashed border-line-strong" />
      </span>
    )
  }

  return (
    <span role="img" aria-label={crewAria(segs)} className="flex h-2 w-full gap-0.5">
      {segs.map((s) => (
        <span key={s.id} className={cn('relative h-full flex-1 overflow-hidden rounded-[2px]', fill(s))}>
          {/* «в процессе» — половина заливки, как полукруг у кружка статуса */}
          {!s.cant && s.status === 1 && (
            <span className="absolute inset-y-0 left-0 w-1/2 bg-accent" aria-hidden />
          )}
        </span>
      ))}
    </span>
  )
}

/** Заливка сегмента — та же лестница, что у StatusDial (4.5). */
function fill(s: CrewSegment): string {
  if (s.cant) return 'hatch border border-accent-text'
  if (s.status === 3) return 'bg-loaded'
  if (s.status === 2) return 'bg-accent'
  if (s.status === 1) return 'border border-accent'
  return 'border border-line-strong'
}
