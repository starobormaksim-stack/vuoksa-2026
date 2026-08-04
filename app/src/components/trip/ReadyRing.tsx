import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import type { State } from '@/lib/types'
import { breakdownAll, restLineAll } from '@/lib/gearx'
import { countdown, daysUntil, fmtDate, plural } from '@/format'
import { ReadySheet } from './ReadySheet'

/**
 * Обратный отсчёт и кольцо готовности одной карточкой (docs/v2-ux-redesign.md, 6.3):
 * в v1 это были два разных элемента, дублировавших «сколько осталось».
 *
 * Процент считается из реальных статусов «Сборов»: доля пар «человек × вещь»,
 * доведённых до «упаковано» или «в машине» (breakdownAll в lib/gearx.ts даёт
 * ту же цифру, что readyAll, и вдобавок списки несобранного).
 *
 * Кольцо нажимается и открывает разбор по ВСЕЙ команде, а не по себе: цифра на
 * кольце общая, и шторка должна объяснять именно её. Свой личный разбор
 * открывается тапом по своей строке в блоке «Кто уже собрался».
 */
export function ReadyRing({ S }: { S: State }) {
  const [open, setOpen] = useState(false)
  const crew = breakdownAll(S)
  const days = daysUntil(S.trip.start)
  const start = new Date(S.trip.start)
  const time = start.toTimeString().slice(0, 5)

  const rad = 40
  const c = 2 * Math.PI * rad
  const doneN = crew.total - crew.left

  return (
    <section className="rounded-2xl border border-line bg-surface p-4 shadow-sm">
      <div className="flex items-center gap-4">
        <div className="min-w-0 flex-1">
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

        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={`Готовность сборов ${crew.pct} процентов: собрано ${doneN} из ${crew.total}. Открыть разбор`}
          className="shrink-0 rounded-full transition-opacity hover:opacity-85"
        >
          <svg width={96} height={96} viewBox="0 0 96 96" aria-hidden className="-rotate-90">
            <circle cx="48" cy="48" r={rad} fill="none" stroke="var(--zebra)" strokeWidth="8" />
            <circle
              cx="48"
              cy="48"
              r={rad}
              fill="none"
              stroke="var(--accent)"
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={c}
              strokeDashoffset={c * (1 - crew.pct / 100)}
            />
            <text
              x="48"
              y="44"
              textAnchor="middle"
              dominantBaseline="central"
              transform="rotate(90 48 48)"
              className="tnum"
              style={{ fill: 'var(--ink)', fontSize: 22, fontWeight: 700 }}
            >
              {crew.pct}%
            </text>
            <text
              x="48"
              y="61"
              textAnchor="middle"
              dominantBaseline="central"
              transform="rotate(90 48 48)"
              style={{ fill: 'var(--muted)', fontSize: 10, fontWeight: 600 }}
            >
              сборы
            </text>
          </svg>
        </button>
      </div>

      {/* Живая фраза про несобранное: кольцо говорит «насколько», строка — «чего и у кого» */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 flex min-h-11 w-full items-center gap-2 border-t border-line pt-3 text-left"
      >
        <span className="min-w-0 flex-1 text-[13px] leading-snug text-muted text-pretty">
          {restLineAll(crew)}
        </span>
        <span className="shrink-0 text-[13px] font-semibold text-accent-text">Разбор</span>
        <ChevronRight size={18} strokeWidth={1.5} aria-hidden className="shrink-0 text-muted" />
      </button>

      {open && <ReadySheet S={S} personId={null} onClose={() => setOpen(false)} />}
    </section>
  )
}
