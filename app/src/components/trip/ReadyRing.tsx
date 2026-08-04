import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import type { State } from '@/lib/types'
import { breakdownAll, readyAll, restLineAll } from '@/lib/gearx'
import { countdown, daysUntil, fmtDate, plural } from '@/format'
import { ReadySheet } from './ReadySheet'

/**
 * Обратный отсчёт и итог сборов одной карточкой (docs/v2-ux-redesign.md, 6.3):
 * в v1 это были два разных элемента, дублировавших «сколько осталось».
 *
 * Процента и кольца здесь нет: заказчик спросил, что ему делать с долей, —
 * ему нужны штуки. Считаются они из реальных статусов «Сборов»: пара
 * «человек × вещь» готова, когда доведена до «упаковано» или «в машине» (readyAll).
 *
 * Итог нажимается и открывает разбор по ВСЕЙ команде, а не по себе: цифра
 * общая, и шторка должна объяснять именно её. Свой личный разбор
 * открывается тапом по своей строке в блоке «Кто уже собрался».
 */
export function ReadyRing({ S }: { S: State }) {
  const [open, setOpen] = useState(false)
  const crew = breakdownAll(S)
  const r = readyAll(S)
  const days = daysUntil(S.trip.start)
  const start = new Date(S.trip.start)
  const time = start.toTimeString().slice(0, 5)

  return (
    <section className="rounded-2xl border border-line bg-surface p-4 shadow-sm">
      <div className="min-w-0">
        <div className="text-[13px] font-semibold text-muted">
          {days > 0 ? 'До выезда' : days === 0 ? 'Выезжаем' : 'Поездка'}
        </div>
        <div className="tnum mt-0.5 text-[32px] leading-none font-bold text-ink">
          {days > 0
            ? `${days} ${plural(days, 'день', 'дня', 'дней')}`
            : countdown(S.trip.start, S.trip.end)}
        </div>
        <div className="mt-1 text-[14px] text-muted">
          {fmtDate(start)}, <span className="tnum">{time}</span>
        </div>
      </div>

      {/* Итог штуками, под ним живая фраза: «чего и у кого» */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Сборы: собрано ${r.done} из ${r.total} позиций. Открыть разбор`}
        className="mt-3 flex min-h-14 w-full items-center gap-2 border-t border-line pt-3 text-left"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-[17px] leading-snug font-[650] text-ink">
            Собрано <span className="tnum">{r.done}</span> из <span className="tnum">{r.total}</span>{' '}
            {plural(r.total, 'позиции', 'позиций', 'позиций')}
          </span>
          <span className="mt-0.5 block text-[13px] leading-snug text-muted text-pretty">
            {restLineAll(crew)}
          </span>
        </span>
        <span className="shrink-0 text-[13px] font-semibold text-accent-text">Разбор</span>
        <ChevronRight size={18} strokeWidth={1.5} aria-hidden className="shrink-0 text-muted" />
      </button>

      {open && <ReadySheet S={S} personId={null} onClose={() => setOpen(false)} />}
    </section>
  )
}
