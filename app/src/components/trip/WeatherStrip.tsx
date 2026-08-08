import { useEffect, useState } from 'react'
import { ChevronDown, CloudSun, Droplets, Wind } from 'lucide-react'
import type { State } from '@/lib/types'
import { MDASH, NBSP } from '@/format'
import { cn } from '@/lib/utils'
import {
  askKey, fetchWeather, FRESH_MS, isoDay, readCache, type LiveWeather,
} from '@/lib/weather'

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

/** Что вернул живой прогноз: сами числа и то, удалось ли за ними сходить. */
export interface Live {
  data: LiveWeather | null
  /** сходить не удалось — на экране об этом говорится словами (постулат 5) */
  failed: boolean
}

/**
 * Живой прогноз: снять при открытии листа и обновлять сам каждые полчаса,
 * а также когда человек возвращается во вкладку.
 *
 * Заказчик 08.08.2026: «пускай автоматически актуализируется». Раньше числа
 * лежали в документе и обновлялись руками.
 *
 * ⛔ Документ этой функцией не правится — см. `lib/weather.ts`.
 */
/**
 * Для какого места прогноз — словами.
 *
 * Место одно и то же, что берёт `useLiveWeather`: главное место поездки.
 * Двух источников быть не может — иначе подпись однажды разойдётся с числами.
 */
export function weatherWhere(S: State): string {
  const place = S.trip.places?.find((p) => p.main) ?? S.trip.places?.[0]
  const has = place && typeof place.lat === 'number' && typeof place.lon === 'number'
  if (has && place.n) return `Погода на дни поездки${NBSP}${MDASH} ${place.n}`
  if (has) return 'Погода на дни поездки'
  return 'Погода на дни поездки. Выберите место поездки из списка — прогноз пойдёт за ним'
}

export function useLiveWeather(S: State): Live {
  const place = S.trip.places?.find((p) => p.main) ?? S.trip.places?.[0]
  const lat = place?.lat
  const lon = place?.lon
  const from = isoDay(S.trip.start)
  const to = isoDay(S.trip.end) || from
  const key = lat !== undefined && lon !== undefined && from ? askKey(lat, lon, from, to) : ''

  /* Сохранённое с прошлого раза показывается сразу, не дожидаясь сети:
     иначе при каждом открытии лист на секунду показывал бы позавчерашние
     цифры и только потом свежие. */
  const [data, setData] = useState<LiveWeather | null>(() => (key ? readCache(key) : null))
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!key || lat === undefined || lon === undefined) return
    const ac = new AbortController()
    let live = true

    const tick = () => {
      /* Свежее получаса — не тревожим сеть. */
      const have = readCache(key)
      if (have && Date.now() - have.at < FRESH_MS) {
        if (live) {
          setData(have)
          setFailed(false)
        }
        return
      }
      void fetchWeather(lat, lon, from, to, ac.signal).then((r) => {
        if (!live) return
        if (r) {
          setData(r)
          setFailed(false)
        } else {
          /* Отказ не стирает уже показанное: лучше вчерашние числа с честной
             подписью, чем пустая лента. */
          setFailed(true)
        }
      })
    }

    tick()
    const timer = window.setInterval(tick, FRESH_MS)
    /* Вкладку открыли снова — спрашиваем сразу, а не через полчаса: телефон
       усыпляет таймеры, и на экране заказчика они не сработают вовсе. */
    const wake = () => {
      if (document.visibilityState === 'visible') tick()
    }
    document.addEventListener('visibilitychange', wake)

    return () => {
      live = false
      ac.abort()
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', wake)
    }
  }, [key, lat, lon, from, to])

  return { data, failed }
}

/**
 * Наложить живые числа на дни документа.
 *
 * ⛔ Совпадение ищется по дате («10.08»), а `means` — авторский текст «что это
 * значит для нас» — остаётся документным всегда: его писал человек. Дней,
 * которых в документе нет, живой прогноз не добавляет — кроме случая, когда
 * документ про погоду не знает вовсе.
 */
function withLive(w: WeatherData, live: LiveWeather | null): WeatherData {
  if (!live || live.days.length === 0) return w
  if (w.days.length === 0) {
    return {
      ...w,
      updated: live.updated,
      days: live.days.map((d) => ({ ...d, i: `w-${d.d}`, means: '' })),
    }
  }
  const by = new Map(live.days.map((d) => [d.d, d]))
  return {
    ...w,
    updated: live.updated,
    days: w.days.map((d) => {
      const x = by.get(d.d)
      return x ? { ...d, wd: x.wd || d.wd, day: x.day, night: x.night, prec: x.prec, wind: x.wind } : d
    }),
  }
}

/**
 * Лента дней в панели обложки.
 *
 * ⛔ Над лентой стоит слово «Погода», и убирать его нельзя. Заказчик 05.08.2026:
 * «там, где погода, у тебя не написано… у тебя конечно прописано там градусы,
 * но непонятно, что это имеет отношение к погоде». Ряд «10.08 · 22° / 12°» сам
 * по себе читается как что угодно — от температуры воды до расписания. Подпись
 * объясняет, ЧТО это, а не как этим пользоваться (постулат 7).
 */
export function WeatherRow({
  S, open, onOpen, live,
}: {
  S: State
  /** id раскрытого дня */
  open: string | null
  onOpen: (id: string | null) => void
  /** свежие числа поверх сохранённых; `null` — показываем документ */
  live: LiveWeather | null
}) {
  const { days } = withLive(weatherOf(S), live)
  if (days.length === 0) return null

  return (
    <div>
      {/* ⛔ Место названо прямо здесь. Заказчик 08.08.2026: «Я не знаю, чего
          сейчас она отталкивается… она должна отталкиваться от точки, которую
          отметит человек». Прогноз и правда считается от координат главного
          места (`useLiveWeather`), но об этом нигде не было сказано —
          вычисленное, о котором молчат, читается как выдумка (постулат 5).
          Координат у места нет — говорим и это, вместе с тем, что делать. */}
      <div className="flex items-center gap-1.5 text-micro text-muted">
        <CloudSun size={16} strokeWidth={1.75} aria-hidden className="shrink-0" />
        <span>{weatherWhere(S)}</span>
      </div>
      <div className="-mx-1 mt-1 flex gap-1 overflow-x-auto px-1 pb-0.5">
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
                'hover:bg-zebra',
                on && 'bg-zebra ring-1 ring-line-strong ring-inset',
              )}
            >
              <span className="tnum text-micro text-muted">{d.d}</span>
              <span className="tnum text-note font-semibold text-ink">
                {d.day}°{NBSP}/{NBSP}{d.night}°
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

/**
 * Подробности под фотографией: раскрытый день и складная строка «Световой день
 * и выводы». Пустых заглушек не рисуем — нет данных, нет и блока.
 */
export function WeatherDetail({
  S, open, live,
}: {
  S: State
  open: string | null
  live: Live
}) {
  const [more, setMore] = useState(false)
  const w = withLive(weatherOf(S), live.data)
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
                  {live.data ? ' — сам, каждые полчаса' : null}
                </p>
              ) : null}
              {/* Отказ говорится словами: молчание человек читает как «сервис
                  сломан», и он прав (постулат 5). */}
              {live.failed ? (
                <p className="text-note text-muted">
                  Свежий прогноз получить не удалось{live.data ? '' : ' — показан сохранённый'}
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
