import { useState } from 'react'
import { ChevronDown, Droplets, Wind } from 'lucide-react'
import type { State } from '@/lib/types'
import { cn } from '@/lib/utils'

/**
 * Погода на дни поездки.
 *
 * Заказчик 04.08.2026: прогноз стоит НА САМОЙ ОБЛОЖКЕ, вместе с названием, датами
 * и суммами. Поэтому блок разбит надвое:
 *   · `WeatherRow` — лента дней поверх фотографии: число, день недели, день/ночь;
 *   · `WeatherDetail` — то, что в ленту не влезает, прямо под фотографией:
 *     осадки, ветер, «что это значит для нас», световой день, выводы и источник.
 *
 * Ни одно значение из `S.weather` не потеряно: лента показывает цифры, панель под
 * ней — все остальные поля. Шторки здесь нет ни одной: день раскрывается на месте.
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
interface WeatherData {
  updated?: string
  days: WeatherDay[]
  daylight: DaylightRow[]
  concl: string[]
  src?: string
}

/** Прогноз из документа в разобранном виде. Нет данных — пустые списки, а не падение. */
function weatherOf(S: State): WeatherData {
  const w = S.weather as Partial<WeatherData> | undefined
  return {
    updated: w?.updated,
    days: w?.days ?? [],
    daylight: w?.daylight ?? [],
    concl: w?.concl ?? [],
    src: w?.src,
  }
}

/**
 * Лента дней поверх фотографии. Выбранный день отмечен кремовым контуром, а не
 * заливкой: заливка съедает контраст подписи на светлом снимке.
 */
export function WeatherRow({
  S, open, onOpen,
}: {
  S: State
  /** id раскрытого дня */
  open: string | null
  onOpen: (id: string | null) => void
}) {
  const { days } = weatherOf(S)
  if (days.length === 0) return null

  return (
    <div className="-mx-1 mt-3 flex gap-1 overflow-x-auto px-1 pb-0.5">
      {days.map((d) => {
        const on = open === d.i
        return (
          <button
            key={d.i}
            type="button"
            onClick={() => onOpen(on ? null : d.i)}
            aria-expanded={on}
            aria-label={`Погода ${d.d}: днём ${d.day}, ночью ${d.night} градусов`}
            className={cn(
              'flex min-h-11 shrink-0 flex-col items-center justify-center rounded-md px-2 transition-colors',
              'hover:bg-brand-cream/12',
              on && 'bg-brand-cream/12 ring-1 ring-brand-cream/70 ring-inset',
            )}
          >
            <span className="tnum text-micro text-brand-cream/85">{d.d}</span>
            <span className="tnum text-note font-semibold text-brand-cream">
              {d.day}° / {d.night}°
            </span>
          </button>
        )
      })}
    </div>
  )
}

/**
 * Подробности под фотографией: раскрытый день и складная строка «Световой день
 * и выводы». Пустых заглушек не рисуем — нет данных, нет и блока.
 */
export function WeatherDetail({ S, open }: { S: State; open: string | null }) {
  const [more, setMore] = useState(false)
  const w = weatherOf(S)
  const day = open ? w.days.find((d) => d.i === open) : undefined
  const hasMore = w.daylight.length > 0 || w.concl.length > 0 || !!w.src || !!w.updated
  if (!day && !hasMore) return null

  return (
    <>
      {day && (
        <div className="border-t border-line px-4 py-3 lg:px-6">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-note text-muted">
            <span className="font-semibold text-ink">
              {day.wd}, <span className="tnum">{day.d}</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Droplets size={16} strokeWidth={1.75} aria-hidden className="text-accent-text" />
              {day.prec}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Wind size={16} strokeWidth={1.75} aria-hidden className="text-accent-text" />
              {day.wind}
            </span>
          </div>
          <p className="mt-1 text-body leading-snug text-ink text-pretty">{day.means}</p>
        </div>
      )}

      {hasMore && (
        <>
          <button
            type="button"
            onClick={() => setMore(!more)}
            aria-expanded={more}
            className="flex min-h-12 w-full items-center gap-2 border-t border-line px-4 text-left text-body font-semibold text-ink transition-colors hover:bg-zebra lg:px-6"
          >
            <span className="flex-1">Световой день и выводы</span>
            <ChevronDown
              size={20}
              strokeWidth={1.75}
              aria-hidden
              className={cn('shrink-0 text-muted transition-transform', more && 'rotate-180')}
            />
          </button>

          {more && (
            <div className="border-t border-line px-4 py-3 lg:px-6">
              {w.updated ? (
                <p className="text-note text-muted">
                  Прогноз обновлён <span className="tnum">{w.updated}</span>
                </p>
              ) : null}

              {w.daylight.map((r) => (
                <div key={r.t} className="border-b border-line/60 py-2 last:border-b-0">
                  <div className="flex items-center gap-3">
                    <span className="min-w-0 flex-1 text-note text-muted">{r.t}</span>
                    <span className="tnum shrink-0 text-note font-semibold text-ink">{r.v}</span>
                  </div>
                  {r.c ? <p className="mt-0.5 text-note leading-snug text-muted">{r.c}</p> : null}
                </div>
              ))}

              {w.concl.length > 0 && (
                <ul className="mt-3 flex flex-col gap-2">
                  {w.concl.map((c) => (
                    <li key={c} className="flex gap-2 text-note leading-snug text-ink">
                      <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
                      <span className="text-pretty">{c}</span>
                    </li>
                  ))}
                </ul>
              )}

              {w.src ? <p className="mt-3 text-micro leading-snug text-muted">{w.src}</p> : null}
            </div>
          )}
        </>
      )}
    </>
  )
}
