import { useState } from 'react'
import { ChevronDown, CloudRain, Droplets, Sun, Wind } from 'lucide-react'
import type { State } from '@/lib/types'
import { EmptyState } from '@/components/flops'
import { cn } from '@/lib/utils'

/**
 * Погода по дням поездки.
 *
 * Пожелание заказчика от 04.08.2026: день раскрывается ГАРМОШКОЙ ПРЯМО В СТРОКЕ,
 * а не шторкой. Шторка ради трёх фактов — лишний слой: человек теряет из виду
 * соседние дни, а сравнивает он их именно между собой.
 *
 * Ни одно значение из данных не теряется: осадки, ветер, «что это значит для нас»,
 * световой день и выводы — всё показано.
 */

interface WeatherDay {
  i: string
  d: string
  wd: string
  day: number
  night: number
  prec: string
  wind: string
  means: string
}
interface DaylightRow { t: string; v: string; c?: string }

export function WeatherStrip({ S }: { S: State }) {
  const w = S.weather as
    | { updated?: string; days?: WeatherDay[]; daylight?: DaylightRow[]; concl?: string[]; src?: string }
    | undefined
  const days = w?.days ?? []
  const [open, setOpen] = useState<string | null>(null)
  const [more, setMore] = useState(false)

  if (days.length === 0) {
    return (
      <section className="rounded-2xl border border-line bg-surface shadow-sm">
        <EmptyState
          icon={CloudRain}
          title="Прогноза пока нет"
          text="Дальше 16 суток погоду не показывают. Появится ближе к выезду"
        />
      </section>
    )
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">
      <div className="flex min-h-12 items-center gap-2 px-4 pt-3">
        <h3 className="min-w-0 flex-1 text-[15px] font-[650] text-ink">Погода на дни поездки</h3>
        {w?.updated ? <span className="text-[13px] text-muted">{w.updated}</span> : null}
      </div>

      <ul className="mt-1">
        {days.map((d, idx) => {
          const on = open === d.i
          return (
            <li key={d.i} className={cn(idx % 2 === 1 && !on && 'bg-zebra/50')}>
              <button
                type="button"
                onClick={() => setOpen(on ? null : d.i)}
                aria-expanded={on}
                className="flex min-h-14 w-full items-center gap-3 px-4 text-left transition-colors hover:bg-zebra"
              >
                <span className="tnum w-12 shrink-0 text-[15px] font-bold text-ink">{d.d}</span>
                <span className="w-8 shrink-0 text-[13px] text-muted">{d.wd}</span>
                <span className="min-w-0 flex-1 truncate text-[13px] text-muted">{d.prec}</span>
                <span className="tnum shrink-0 text-[15px] font-semibold text-ink">
                  {d.day}° <span className="text-muted">/ {d.night}°</span>
                </span>
                <ChevronDown
                  size={18}
                  strokeWidth={1.5}
                  aria-hidden
                  className={cn('shrink-0 text-muted transition-transform', on && 'rotate-180')}
                />
              </button>

              {on && (
                <div className="bg-accent-soft/60 px-4 pt-1 pb-3">
                  <div className="flex flex-wrap gap-x-5 gap-y-1 text-[13px] text-ink">
                    <span className="inline-flex items-center gap-1.5">
                      <Droplets size={15} strokeWidth={1.5} aria-hidden className="text-accent-text" />
                      {d.prec}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <Wind size={15} strokeWidth={1.5} aria-hidden className="text-accent-text" />
                      {d.wind}
                    </span>
                  </div>
                  <p className="mt-1.5 text-[14px] leading-snug text-ink text-pretty">{d.means}</p>
                </div>
              )}
            </li>
          )
        })}
      </ul>

      <button
        type="button"
        onClick={() => setMore(!more)}
        aria-expanded={more}
        className="flex min-h-12 w-full items-center gap-2 border-t border-line px-4 text-left text-[15px] font-semibold text-ink transition-colors hover:bg-zebra"
      >
        <Sun size={18} strokeWidth={1.5} aria-hidden className="text-muted" />
        <span className="flex-1">Световой день и выводы</span>
        <ChevronDown
          size={20}
          strokeWidth={1.5}
          aria-hidden
          className={cn('text-muted transition-transform', more && 'rotate-180')}
        />
      </button>

      {more && (
        <div className="border-t border-line px-4 py-3">
          {(w?.daylight ?? []).map((r) => (
            <div key={r.t} className="border-b border-line/60 py-2 last:border-b-0">
              <div className="flex items-center gap-3">
                <span className="min-w-0 flex-1 text-[14px] text-muted">{r.t}</span>
                <span className="tnum shrink-0 text-[14px] font-semibold text-ink">{r.v}</span>
              </div>
              {r.c ? <p className="mt-0.5 text-[13px] leading-snug text-muted">{r.c}</p> : null}
            </div>
          ))}
          {(w?.concl ?? []).length > 0 && (
            <ul className="mt-3 flex flex-col gap-2">
              {(w?.concl ?? []).map((c, i) => (
                <li key={i} className="flex gap-2 text-[14px] leading-snug text-ink">
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
                  <span className="text-pretty">{c}</span>
                </li>
              ))}
            </ul>
          )}
          {w?.src ? <p className="mt-3 text-[12px] leading-snug text-muted">{w.src}</p> : null}
        </div>
      )}
    </section>
  )
}
