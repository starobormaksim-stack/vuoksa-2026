/**
 * Расстояния по дорогам между точками маршрута.
 *
 * Считает публичный маршрутизатор OSRM (router.project-osrm.org) — без ключа
 * и без регистрации. Спрашиваем у него две разные вещи, и каждая своим запросом:
 *   `roadLegs` — сколько километров по дорогам от точки до следующей. Ответ
 *     нужен короткий, поэтому `overview=false`: геометрия там лишний вес;
 *   `roadShape` — сама линия по дорогам, `overview=full&geometries=geojson`.
 *     Она нужна только чтобы нарисовать нитку, и в документ не попадает.
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
  routes?: {
    legs?: { distance?: number }[]
    /** приезжает только при `geometries=geojson`; координаты в порядке [долгота, широта] */
    geometry?: { coordinates?: [number, number][] }
  }[]
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

/* ─────────── геометрия линии ─────────── */

/** Точка ломаной по дорогам: широта и долгота, в порядке Leaflet и Google. */
export type ShapePoint = [number, number]

/**
 * Линия маршрута ПО НАСТОЯЩИМ ДОРОГАМ между точками, по порядку.
 *
 * Заказчик 06.08.2026: «Google-карты простраивали реальный маршрут». До этой
 * правки нитка на карте шла прямой из точки в точку — через леса и залив, —
 * а километры при этом считались по дорогам (`roadLegs`). Картинка расходилась
 * с числом, и верить приходилось числу.
 *
 * ⛔ Возвращённая ломаная в документ НЕ кладётся и класться не должна: это
 * несколько тысяч координат на каждую нитку, а форму хранения потом не
 * поменять (постулат 4). Линия живёт в памяти вкладки, ровно до перезагрузки.
 *
 * `null` — честный отказ: точек меньше двух, нет сети, сервис не ответил или
 * ответил непонятным. Вызывающий рисует прямую и ГОВОРИТ, почему она прямая
 * (постулат 5): молчаливого отката не бывает.
 */
export async function roadShape(
  points: OsrmPoint[],
  timeoutMs = TIMEOUT_MS,
): Promise<ShapePoint[] | null> {
  const pts = points.filter(placed).slice(0, MAX_POINTS)
  if (pts.length < 2) return null

  const url =
    `${BASE}${pts.map((p) => `${p.lon},${p.lat}`).join(';')}` +
    '?overview=full&geometries=geojson'

  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), timeoutMs)
  try {
    const r = await fetch(url, { signal: ctl.signal, headers: { Accept: 'application/json' } })
    if (!r.ok) return null
    const j = (await r.json()) as OsrmAnswer
    const coords = j.routes?.[0]?.geometry?.coordinates
    if (j.code !== 'Ok' || !Array.isArray(coords) || coords.length < 2) return null

    const out: ShapePoint[] = []
    for (const c of coords) {
      /* GeoJSON отдаёт [долгота, широта] — обе карты ждут обратного порядка. */
      const lon = c?.[0]
      const lat = c?.[1]
      if (typeof lat !== 'number' || typeof lon !== 'number') continue
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue
      out.push([lat, lon])
    }
    return out.length > 1 ? out : null
  } catch {
    /* нет сети, отказ сервиса, обрыв по времени — линия останется прямой */
    return null
  } finally {
    clearTimeout(timer)
  }
}
