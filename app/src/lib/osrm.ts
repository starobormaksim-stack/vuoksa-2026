/**
 * Расстояния по дорогам между точками маршрута.
 *
 * Считает публичный маршрутизатор OSRM (router.project-osrm.org) — без ключа
 * и без регистрации. Мы спрашиваем у него одну вещь: сколько километров по дорогам
 * от каждой точки маршрута до следующей. Никакой геометрии, никаких подсказок —
 * `overview=false`, чтобы ответ был коротким.
 *
 * Правила этого файла:
 *   ничего не пишет в документ — только считает и возвращает числа;
 *   не бросает исключений: нет сети, отказал сервис, странный ответ — пустой список.
 *     «Не посчиталось» здесь не поломка, а обычное дело: человек может открыть
 *     поездку в лесу без связи, и раздел обязан работать дальше;
 *   без новых зависимостей — обычный fetch и AbortController с разумным ожиданием.
 */

/** Точка, которую можно отдать маршрутизатору. Координат может и не быть. */
export interface OsrmPoint {
  i: string
  lat?: number
  lon?: number
}

/** Участок: до какой точки и сколько до неё километров по дорогам. */
export interface LegKm {
  /** id точки маршрута, К КОТОРОЙ ведёт участок (расстояние от предыдущей) */
  i: string
  /** километры, округлённые до целых — как их показывает интерфейс */
  km: number
}

/** Сколько ждём ответа, мс. Дальше считаем, что связи нет. */
const TIMEOUT_MS = 10_000

/**
 * Больше этого числа точек публичный маршрутизатор в одном запросе не берёт
 * (и адрес запроса становится неприлично длинным). Считаем по первым — лучше
 * часть правды, чем пустой ответ.
 */
const MAX_POINTS = 25

const BASE = 'https://router.project-osrm.org/route/v1/driving/'

/** Ответ OSRM в том объёме, который нам нужен. */
interface OsrmAnswer {
  code?: string
  routes?: { legs?: { distance?: number }[] }[]
}

/** Есть ли у точки координаты (без них маршрутизатору её показать нечем). */
function placed(p: OsrmPoint): boolean {
  return typeof p.lat === 'number' && typeof p.lon === 'number'
}

/**
 * Километры по дорогам между точками маршрута, по порядку.
 *
 * Берутся только точки с координатами — остальные маршрутизатору неизвестны.
 * Участков всегда на один меньше, чем точек: первой точке предыдущей нет.
 *
 * Пустой список — честный ответ «не посчитали»: точек меньше двух, нет сети,
 * сервис не ответил или ответил непонятным. Ошибок не бросает никогда.
 */
export async function roadLegs(points: OsrmPoint[], timeoutMs = TIMEOUT_MS): Promise<LegKm[]> {
  const pts = points.filter(placed).slice(0, MAX_POINTS)
  if (pts.length < 2) return []

  const url = `${BASE}${pts.map((p) => `${p.lon},${p.lat}`).join(';')}?overview=false`

  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), timeoutMs)
  try {
    const r = await fetch(url, { signal: ctl.signal, headers: { Accept: 'application/json' } })
    if (!r.ok) return []
    const j = (await r.json()) as OsrmAnswer
    const legs = j.routes?.[0]?.legs
    if (j.code !== 'Ok' || !Array.isArray(legs)) return []

    const out: LegKm[] = []
    for (let k = 0; k < legs.length && k + 1 < pts.length; k++) {
      const metres = legs[k]?.distance
      if (typeof metres !== 'number' || !Number.isFinite(metres)) continue
      out.push({ i: pts[k + 1].i, km: Math.round(metres / 1000) })
    }
    return out
  } catch {
    /* нет сети, отказ сервиса, обрыв по времени — просто не считаем */
    return []
  } finally {
    clearTimeout(timer)
  }
}
