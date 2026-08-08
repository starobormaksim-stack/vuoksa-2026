/**
 * ЖИВОЙ ПРОГНОЗ — погода, которая обновляется сама.
 *
 * ─── Откуда взялось (заказчик, 08.08.2026) ───
 * Дословно: «было бы неплохо, чтобы прогноз погоды постоянно актуализировался,
 * а то он у тебя не актуализируется. Пускай автоматически актуализируется».
 * До этого `S.weather` заполнялся руками: в боевом листе стояло «обновлён
 * 4 августа, 10:40», и за четыре дня до выезда человек читал позавчерашние цифры.
 *
 * ⛔ ДОКУМЕНТ ЭТИМ НЕ ПРАВИТСЯ, ни одним полем. Прогноз — не данные поездки,
 * а сведения снаружи: они меняются каждый час, а документ ходит через слияние
 * и синхронизацию, и фоновая запись погоды дёргала бы боевую строку без спроса
 * (постулат «ничего из данных не выбрасывать» и правило «`trip.dist.auto`
 * молча не включать»). Свежие числа живут в памяти вкладки и в `localStorage`,
 * а на экран кладутся ПОВЕРХ сохранённых.
 *
 * ⛔ Авторский текст «что это значит для нас» (`means`) берётся из документа
 * как есть: его писал человек, и никакой API его не заменит.
 *
 * ─── 08.08.2026: световой день тоже считает Open-Meteo ───
 * Дословно: «оставишь там только техническую информацию, которая автоматически
 * должна подтягиваться с Open-Meteo… информация должна строго оттуда
 * подтягиваться автоматически, не задействуя тебя как разработчика, который
 * там пишет мне: „нужна информация термобельё и нормальный спальник“».
 * До этого восход, закат и длина дня лежали в документе одной строкой на всю
 * поездку и не менялись вовсе. Теперь это семь величин КАЖДОГО дня, и все семь
 * приходят из ответа Open-Meteo: температура днём и ночью, осадки, ветер,
 * восход, закат, длина дня.
 *
 * ⛔ Температуры воды здесь нет и завести её неоткуда: морская модель
 * Open-Meteo на координатах Вуоксы отдаёт `null` — это озеро, а не море
 * (проверено 08.08.2026, `sea_surface_temperature_max` = null на все пять дней).
 * Стоявшая в документе строка «+17…+19 °C» была оценкой человека, а не замером,
 * и в техническую сводку она не идёт.
 *
 * Источник тот же, что уже указан в документе, — Open-Meteo: открытый, без ключа
 * и без регистрации (в чужие кабинеты заказчик не ходит, урок У-45).
 */

import { NBSP } from '../format.ts'

/** День живого прогноза — всё, что показывают лента и разбор дня. */
export interface LiveDay {
  /** «10.08» — по нему живой день сходится с днём документа */
  d: string
  wd: string
  day: number
  night: number
  prec: string
  wind: string
  /** «04:56» — восход по московскому времени */
  sunrise: string
  /** «21:13» */
  sunset: string
  /** «16 ч 17 мин» — сколько между ними */
  light: string
}

export interface LiveWeather {
  days: LiveDay[]
  /** «8 августа, 14:05» — тем же видом, что стоит в документе */
  updated: string
  /** когда сняли, мс */
  at: number
  /** что именно спрашивали: координаты и даты. Сменилось — кэш не годится */
  key: string
}

const STORE = 'pine.weather.v1'
/** Как часто ходить за прогнозом: чаще получаса он всё равно не меняется. */
export const FRESH_MS = 30 * 60 * 1000

const WD = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб']
const MONTHS = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
]

/**
 * Слова погоды по коду WMO — теми же оборотами, что стояли в документе
 * («Слабая морось», «Переменная облачность»), чтобы лента не заговорила
 * вдруг другим языком.
 */
const WMO: Record<number, string> = {
  0: 'Ясно',
  1: 'Малооблачно',
  2: 'Переменная облачность',
  3: 'Пасмурно',
  45: 'Туман',
  48: 'Изморозь',
  51: 'Слабая морось',
  53: 'Морось',
  55: 'Сильная морось',
  56: 'Ледяная морось',
  57: 'Ледяная морось',
  61: 'Слабый дождь',
  63: 'Дождь',
  65: 'Сильный дождь',
  66: 'Ледяной дождь',
  67: 'Ледяной дождь',
  71: 'Слабый снег',
  73: 'Снег',
  75: 'Сильный снег',
  77: 'Снежная крупа',
  80: 'Кратковременный дождь',
  81: 'Ливень',
  82: 'Сильный ливень',
  85: 'Снегопад',
  86: 'Сильный снегопад',
  95: 'Гроза',
  96: 'Гроза с градом',
  99: 'Гроза с градом',
}

/** «2026-08-10T07:30:00» → «2026-08-10». Пусто или мусор — пустая строка. */
export function isoDay(v: string | undefined): string {
  if (!v) return ''
  const m = v.match(/^(\d{4}-\d{2}-\d{2})/)
  return m ? m[1] : ''
}

/** «2026-08-10» → «10.08» — тем же видом, что лежит в документе. */
function dayLabel(iso: string): string {
  const [, m, d] = iso.split('-')
  return `${d}.${m}`
}

/** «8 августа, 14:05». */
function stamp(at: number): string {
  const t = new Date(at)
  const hh = String(t.getHours()).padStart(2, '0')
  const mm = String(t.getMinutes()).padStart(2, '0')
  return `${t.getDate()} ${MONTHS[t.getMonth()]}, ${hh}:${mm}`
}

/** Осадки словами: что за погода и с какой вероятностью польёт. */
function precWords(code: number, chance: number, mm: number): string {
  const what = WMO[code] ?? 'Без осадков'
  if (chance > 0) return `${what} (${Math.round(chance)}${' '}%)`
  if (mm > 0) return `${what} (${mm.toFixed(1)}${' '}мм)`
  return what
}

/** «2026-08-10T04:56» → «04:56». Кривое значение — пустая строка, а не падение. */
function clock(v: string | undefined): string {
  if (!v) return ''
  const m = v.match(/T(\d{2}:\d{2})/)
  return m ? m[1] : ''
}

/** 58 646 секунд → «16 ч 17 мин». Ноль и мусор — пустая строка. */
function span(sec: number | undefined): string {
  if (!sec || sec <= 0) return ''
  const total = Math.round(sec / 60)
  const h = Math.floor(total / 60)
  const m = total % 60
  if (!m) return `${h}${NBSP}ч`
  return `${h}${NBSP}ч ${m}${NBSP}мин`
}

interface DailyBag {
  time?: string[]
  weather_code?: number[]
  temperature_2m_max?: number[]
  temperature_2m_min?: number[]
  precipitation_sum?: number[]
  precipitation_probability_max?: number[]
  wind_speed_10m_max?: number[]
  sunrise?: string[]
  sunset?: string[]
  daylight_duration?: number[]
}

/** Разобрать ответ Open-Meteo. Кривой ответ — пустой список, а не падение. */
export function parseDaily(daily: DailyBag | undefined, at: number, key: string): LiveWeather {
  const time = daily?.time ?? []
  const days: LiveDay[] = []
  for (let n = 0; n < time.length; n++) {
    const iso = time[n]
    if (!iso) continue
    /* Полдень, а не полночь: у границы суток разбор даты часовым поясом
       браузера иначе сдвигает день недели на сутки назад. */
    const dt = new Date(`${iso}T12:00:00`)
    const wind = daily?.wind_speed_10m_max?.[n] ?? 0
    days.push({
      d: dayLabel(iso),
      wd: WD[dt.getDay()] ?? '',
      day: Math.round(daily?.temperature_2m_max?.[n] ?? 0),
      night: Math.round(daily?.temperature_2m_min?.[n] ?? 0),
      prec: precWords(
        daily?.weather_code?.[n] ?? -1,
        daily?.precipitation_probability_max?.[n] ?? 0,
        daily?.precipitation_sum?.[n] ?? 0,
      ),
      /* Open-Meteo отдаёт км/ч, а в документе стоят метры в секунду. */
      wind: `${Math.round((wind * 1000) / 3600)} м/с`,
      sunrise: clock(daily?.sunrise?.[n]),
      sunset: clock(daily?.sunset?.[n]),
      light: span(daily?.daylight_duration?.[n]),
    })
  }
  return { days, updated: stamp(at), at, key }
}

/** Что именно спрашиваем: координаты и обе даты. */
export function askKey(lat: number, lon: number, from: string, to: string): string {
  return `${lat.toFixed(3)},${lon.toFixed(3)},${from},${to}`
}

/** Снятое в прошлый раз. Ничего нет или мусор — `null`, без падения. */
export function readCache(key: string): LiveWeather | null {
  try {
    const raw = localStorage.getItem(STORE)
    if (!raw) return null
    const v = JSON.parse(raw) as LiveWeather
    if (!v || v.key !== key || !Array.isArray(v.days) || v.days.length === 0) return null
    return v
  } catch {
    return null
  }
}

function writeCache(v: LiveWeather): void {
  try {
    localStorage.setItem(STORE, JSON.stringify(v))
  } catch {
    /* Приватный режим или переполненное хранилище — прогноз просто не переживёт
       перезагрузку. Это не повод ломать экран. */
  }
}

/**
 * Сходить за прогнозом. Отказ сети, отказ сервера и кривой ответ — `null`:
 * показывается то, что лежит в документе, и человек читает об этом словами
 * (постулат «молчаливых отказов не бывает»).
 */
export async function fetchWeather(
  lat: number,
  lon: number,
  from: string,
  to: string,
  signal?: AbortSignal,
): Promise<LiveWeather | null> {
  const url =
    'https://api.open-meteo.com/v1/forecast'
    + `?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}`
    + '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,'
    + 'precipitation_probability_max,wind_speed_10m_max,sunrise,sunset,daylight_duration'
    + `&timezone=Europe%2FMoscow&start_date=${from}&end_date=${to}`
  try {
    const r = await fetch(url, { signal })
    if (!r.ok) return null
    const j = (await r.json()) as { daily?: DailyBag }
    const out = parseDaily(j.daily, Date.now(), askKey(lat, lon, from, to))
    if (out.days.length === 0) return null
    writeCache(out)
    return out
  } catch {
    return null
  }
}
