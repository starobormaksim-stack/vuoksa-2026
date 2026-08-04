import type { State } from '@/lib/types'
import { readyAll } from '@/lib/gearx'
import { countdown, daysUntil, fmtDate, plural } from '@/format'

/**
 * Обратный отсчёт и кольцо готовности одной карточкой (docs/v2-ux-redesign.md, 6.3):
 * в v1 это были два разных элемента, дублировавших «сколько осталось».
 *
 * Процент считается из реальных статусов «Сборов»: доля пар «человек × вещь»,
 * доведённых до «упаковано» или «в машине» (readyAll в lib/gearx.ts).
 */
export function ReadyRing({ S }: { S: State }) {
  const r = readyAll(S)
  const days = daysUntil(S.trip.start)
  const start = new Date(S.trip.start)
  const time = start.toTimeString().slice(0, 5)

  const rad = 40
  const c = 2 * Math.PI * rad

  return (
    <section className="flex items-center gap-4 rounded-2xl border border-line bg-surface p-4 shadow-sm">
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

      <svg
        width={96}
        height={96}
        viewBox="0 0 96 96"
        role="img"
        aria-label={`Готовность сборов ${r.pct} процентов: собрано ${r.done} из ${r.total}`}
        className="shrink-0 -rotate-90"
      >
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
          strokeDashoffset={c * (1 - r.pct / 100)}
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
          {r.pct}%
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
    </section>
  )
}
