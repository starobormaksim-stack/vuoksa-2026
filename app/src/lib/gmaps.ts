/**
 * Google Maps: ключ, загрузка библиотеки и обратное геокодирование.
 *
 * ─── Про ключ ───
 * Ключ Google Maps лежит в коде открытым текстом — и это штатный способ, а не оплошность:
 * у Google ключ карт защищается не секретностью, а ограничением по HTTP-referrer.
 * Ключ, ограниченный доменами pine-to-pine.com, *.pages.dev и starobormaksim-stack.github.io,
 * с чужого сайта просто не работает, поэтому его публикация безопасна.
 * ⚠️ Ключ БЕЗ ограничения по referrer в репозиторий класть нельзя: его снимут и потратят.
 *
 * Пока ключа нет, KEY пустой — карта честно откатывается на OpenStreetMap (см. TripMap.tsx),
 * то есть приложение работает и без него.
 *
 * ─── Про загрузку ───
 * Библиотека не входит в сборку: она подтягивается тегом script при первом показе карты.
 * Так офлайн-копия остаётся «ни одной внешней загрузки» — в ней карта не показывается вовсе.
 */

/**
 * Ключ Maps JavaScript API. Ограничен по HTTP-referrer в кабинете Google Cloud
 * (pine-to-pine.com, *.pine-to-pine.com, starobormaksim-stack.github.io, *.pages.dev, localhost).
 * Заведён 04.08.2026 в проекте `pine-to-pine`.
 */
export const GOOGLE_MAPS_KEY = 'AIzaSyDIVMTSa86eoaOYSlkqGP6xEZXEQTtInAY'

/**
 * Идентификатор карты (Map ID). Нужен не для красоты: без него
 * `google.maps.marker.AdvancedMarkerElement` вообще не рисуется — Google пишет
 * в консоль «The map is initialized without a valid Map ID» и молча выбрасывает
 * маркеры. Старый `google.maps.Marker` обходился без Map ID, но он объявлен
 * устаревшим, и предупреждение об этом висело у заказчика в консоли.
 *
 * Свой Map ID заказчика, заведён 04.08.2026 в кабинете Google Cloud
 * (проект `pine-to-pine`, Maps → Map management, тип JavaScript / Raster).
 * До него здесь стоял служебный `DEMO_MAP_ID` самого Google: он работает
 * без настройки и без денег, но пишет в консоль пометку «для разработки»
 * и для боевого сайта не предназначен. Ключ при замене не меняется.
 */
export const GOOGLE_MAP_ID = 'f1d79f071272cbb163518d34'

/** Ключ выдан — можно показывать Google. Иначе остаётся OpenStreetMap. */
export function hasGoogleKey(): boolean {
  return GOOGLE_MAPS_KEY.length > 0
}

/**
 * Google уже отказал в этой вкладке (домен не в списке, ключ отозван, биллинг).
 * Взводится один раз и навсегда: переспрашивать бессмысленно, а каждая попытка
 * стоит человеку секунд ожидания на пустом месте.
 */
let denied = false

/**
 * Стоит ли вообще идти к Google. Ключа нет или он уже отказал — не стоит:
 * геокодирование сразу уходит на запасной путь (Nominatim), и человек получает
 * адрес, а не молчание. См. lib/geocode.ts.
 */
export function googleUsable(): boolean {
  return hasGoogleKey() && !denied
}

/**
 * Забыть прошлый отказ и разрешить новую попытку. Зовёт кнопка «Попробовать
 * снова» под картой: причина отказа могла быть временной (моргнула сеть, медленный
 * мобильный интернет), и человек должен иметь право переспросить сам, а не сидеть
 * на OpenStreetMap до перезагрузки страницы.
 */
export function retryGoogle(): void {
  denied = false
  loading = null
}

/** Промис загрузки: библиотеку тянем один раз на всё приложение. */
let loading: Promise<typeof google.maps> | null = null

/**
 * Код причины, по которой Google-карта не поднялась. По нему вызывающий решает,
 * имеет ли смысл повторная попытка, а бейдж под картой говорит причину по-русски:
 *   'no-key'          — ключ не задан (штатное состояние, не поломка);
 *   'auth'            — Google отказал: домен не в списке, ключ отозван, биллинг;
 *   'script-error'    — тег script не загрузился (нет сети, блокировщик);
 *   'timeout'         — загрузка молча зависла и не ответила за отведённое время;
 *   'import-failed:…' — скрипт поднялся, но одна из библиотек не докачалась.
 */
export type GoogleFailCode =
  | 'no-key'
  | 'auth'
  | 'script-error'
  | 'timeout'
  | `import-failed:${string}`

/** Ошибка загрузки с машиночитаемым кодом причины — для бейджа и решения о повторе. */
export class GoogleMapsError extends Error {
  readonly code: GoogleFailCode
  constructor(code: GoogleFailCode, message: string) {
    super(message)
    this.code = code
  }
}

/** Достать код причины из любой ошибки загрузки; незнакомую считаем сетевой. */
export function googleFailCode(e: unknown): GoogleFailCode {
  return e instanceof GoogleMapsError ? e.code : 'script-error'
}

/**
 * Google отказал: домен не в списке разрешённых, ключ отозван, кончился биллинг.
 * Скрипт при этом загружается нормально, и без этого сигнала на месте карты остался бы
 * серый прямоугольник с чужой надписью поверх. Google зовёт глобальную gm_authFailure —
 * ловим её и переводим приложение на OpenStreetMap.
 */
const authFailed = new Set<(reason: 'auth') => void>()

/** Подписаться на отказ Google. Слушателю приходит код 'auth'. Возвращает отписку. */
export function onGoogleAuthFail(l: (reason: 'auth') => void): () => void {
  authFailed.add(l)
  return () => {
    authFailed.delete(l)
  }
}

if (typeof window !== 'undefined') {
  ;(window as unknown as { gm_authFailure?: () => void }).gm_authFailure = () => {
    /* Единственное место, где видно причину отката на OpenStreetMap. Без этой строки
       остаётся гадать, почему карта «не та»: сам Google в консоль ничего не пишет. */
    console.warn('Google Maps отказал (домен, ключ или биллинг) — показываем OpenStreetMap')
    denied = true
    authFailed.forEach((l) => l('auth'))
  }
}

/** Имя глобальной функции, которой Google сообщает, что загрузчик готов. */
const READY = '__pineMapsReady'

/**
 * Сколько ждём загрузку целиком, мс. Без этого срока промис мог висеть вечно:
 * тег script отдал 200, а обещанный callback так и не позвали (перехватчик
 * трафика, корпоративный прокси, отрезанная на полпути сеть). Тогда карта не
 * появлялась и отката на OpenStreetMap тоже не было — оставался пустой
 * прямоугольник, и понять по нему было нечего.
 *
 * ⚠️ Стояло 12 с, и этого мало. Загрузчик Google плюс четыре набора классов —
 * это шесть-семь запросов подряд; на мобильной сети они укладываются в двенадцать
 * секунд далеко не всегда, и человек получал откат на OpenStreetMap там, где надо
 * было просто подождать. Заказчик 05.08.2026: «у тебя по-прежнему OpenStreetMap
 * вместо Google-карты». Ждать долго неприятно, но подмена карты — хуже (урок У-76).
 */
const LOAD_TIMEOUT_MS = 25_000

/**
 * Загрузить Maps JavaScript API и дождаться нужных наборов классов.
 *
 * Тонкость, на которой это уже один раз сломалось: с `loading=async` тег script
 * поднимает только ЗАГРУЗЧИК. Пространство `google.maps` при этом уже существует,
 * но `google.maps.Map` в нём ещё нет — классы приезжают вызовом importLibrary().
 * Поэтому промис резолвится не по onload, а после importLibrary: иначе компонент
 * получает «Map is not a constructor» и молча уходит на OpenStreetMap.
 *
 * Повторные вызовы получают тот же промис. Отказ промис не запоминает: после
 * неудачи следующий вызов честно пробует всё заново.
 */
export function loadGoogleMaps(): Promise<typeof google.maps> {
  if (loading) return loading
  const attempt = withTimeout(loadAll(), LOAD_TIMEOUT_MS)
  loading = attempt
  /* Не удалось — забываем промис, чтобы следующая попытка началась с чистого листа.
     Сверяемся с attempt: пока этот отказ шёл, кто-то мог начать новую попытку. */
  attempt.catch(() => {
    if (loading === attempt) loading = null
  })
  return attempt
}

/** Вся загрузка: скрипт, потом четыре набора классов. Сроком её ограничивает вызывающий. */
async function loadAll(): Promise<typeof google.maps> {
  if (!hasGoogleKey()) throw new GoogleMapsError('no-key', 'Ключ Google Maps не задан')

  const w = window as unknown as Record<string, unknown> & {
    google?: { maps?: typeof google.maps }
  }
  if (!w.google?.maps) await injectScript()

  const maps = (window as unknown as { google: { maps: typeof google.maps } }).google.maps
  /* Наборы классов: core — LatLngBounds и перечисления, maps — сама карта и линии,
     marker — маркеры, geocoding — обратное геокодирование. После importLibrary
     классы появляются и в самом пространстве google.maps, так что дальше код
     пользуется привычным `maps.Map`, `maps.Marker` и так далее.

     Каждый набор оборачиваем отдельно: у общего Promise.all все четыре падают
     скопом и по ошибке не понять, чего именно не приехало. */
  await Promise.all([
    needLib('core', () => maps.importLibrary('core')),
    needLib('maps', () => maps.importLibrary('maps')),
    needLib('marker', () => maps.importLibrary('marker')),
    needLib('geocoding', () => maps.importLibrary('geocoding')),
  ])
  return maps
}

/** Дождаться одного набора классов, назвав его в коде отказа. */
async function needLib(name: string, load: () => Promise<unknown>): Promise<void> {
  try {
    await load()
  } catch (e) {
    throw new GoogleMapsError(`import-failed:${name}`, `Набор «${name}» не докачался: ${String(e)}`)
  }
}

/** Подтянуть загрузчик тегом script и дождаться его сигнала готовности. */
function injectScript(): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const w = window as unknown as Record<string, unknown>
    const ready = () => {
      /* Убираем только своё имя: новая попытка могла уже положить туда своё. */
      if (w[READY] === ready) delete w[READY]
      resolve()
    }
    w[READY] = ready

    /* Прошлая попытка могла оставить тег, который так и не ожил. Второй такой же
       Google встречает руганью «included multiple times» — старый сначала убираем. */
    document.querySelector('script[data-pine-maps]')?.remove()

    const s = document.createElement('script')
    s.async = true
    s.dataset.pineMaps = ''
    s.src =
      'https://maps.googleapis.com/maps/api/js?key=' +
      encodeURIComponent(GOOGLE_MAPS_KEY) +
      '&language=ru&region=RU&loading=async&callback=' +
      READY
    s.onerror = () => reject(new GoogleMapsError('script-error', 'Google Maps не загрузился'))
    document.head.appendChild(s)
  })
}

/** Ограничить ожидание сроком: молчание тоже должно кончаться отказом, а не висеть. */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = window.setTimeout(() => {
      reject(new GoogleMapsError('timeout', `Google Maps не ответил за ${Math.round(ms / 1000)} с`))
    }, ms)
    p.then(
      (v) => {
        window.clearTimeout(t)
        resolve(v)
      },
      (e: unknown) => {
        window.clearTimeout(t)
        reject(e instanceof Error ? e : new GoogleMapsError('script-error', String(e)))
      },
    )
  })
}

/** Что вернуло обратное геокодирование: адрес целиком и короткое имя для названия точки. */
export interface PlaceGuess {
  /** полный адрес — уходит в point.addr */
  addr: string
  /** короткое название — предлагается в point.n, человек может исправить */
  name: string
}

/**
 * Обратное геокодирование: координаты → адрес и предполагаемое название.
 *
 * Короткое имя берём от самого мелкого «человеческого» уровня: сначала
 * достопримечательность или точка интереса, потом улица с домом, потом населённый пункт.
 * Иначе в названии точки оказывается «Ленинградская область, Россия» — бесполезно.
 */
export async function reverseGeocode(lat: number, lon: number): Promise<PlaceGuess | null> {
  const maps = await loadGoogleMaps()
  const geo = new maps.Geocoder()
  const res = await geo.geocode({ location: { lat, lng: lon } })
  const list = res.results
  if (!list || list.length === 0) return null

  const addr = list[0].formatted_address || ''
  const name = shortName(list) || addr
  return { addr, name }
}

/** Найденное место: координаты, адрес и признак «попали точно, а не в область». */
export interface GeoHit {
  lat: number
  lon: number
  /** полный адрес, как его называет геокодер — его и показываем человеку */
  addr: string
  /** false — геокодер попал только в район или область, координаты приблизительные */
  precise: boolean
}

/**
 * Типы результата, означающие «попали только в область, район или страну».
 * Такой ответ приходит, когда геокодер не понял запрос и вернул хоть что-нибудь:
 * «Первый костёр и обедо-ужин» → «Ленинградская область». Координаты формально есть,
 * но ставить по ним точку нельзя — человеку это надо сказать вслух.
 */
const COARSE = new Set([
  'country',
  'administrative_area_level_1',
  'administrative_area_level_2',
  'political',
])

/**
 * Прямое геокодирование: строка → координаты. Нужно мастеру «Разметить маршрут»:
 * у восьми точек боевого маршрута координат нет вовсе, и половину из них геокодер
 * находит по названию («Приозерск», «Санкт-Петербург, Суздальский пр., 95»).
 *
 * `near` — куда смотрит поездка. Им смещается поиск: без подсказки «Лодочная база»
 * находится где угодно по стране. Дальнюю находку отбраковывает уже вызывающий
 * (lib/geocode.ts) — здесь только смещение.
 *
 * null — геокодер честно ответил «не нашлось». Всё остальное (лимит, отозванный
 * ключ, нет сети) улетает исключением: вызывающий по нему уходит на запасной путь.
 */
export async function forwardGeocode(
  query: string,
  near: { lat: number; lon: number },
): Promise<GeoHit | null> {
  const list = await forwardGeocodeAll(query, near, 1)
  return list[0] ?? null
}

/**
 * То же прямое геокодирование, но списком: строке поиска над картой мало одной
 * находки. Человек должен увидеть, что нашлось, и выбрать сам — молча наводить
 * карту на первый попавшийся ответ нельзя, у «Приозерск» их несколько.
 *
 * Пустой список — честное «не нашлось». Всё остальное (лимит, отозванный ключ,
 * нет сети) улетает исключением: вызывающий по нему уходит на запасной путь.
 */
export async function forwardGeocodeAll(
  query: string,
  near: { lat: number; lon: number },
  limit = 5,
): Promise<GeoHit[]> {
  const maps = await loadGoogleMaps()
  const geo = new maps.Geocoder()
  const bounds = new maps.LatLngBounds(
    { lat: near.lat - 3, lng: near.lon - 6 },
    { lat: near.lat + 3, lng: near.lon + 6 },
  )
  let res: google.maps.GeocoderResponse
  try {
    res = await geo.geocode({ address: query, bounds, region: 'ru' })
  } catch (e) {
    /* «Не нашлось» приезжает исключением, а не пустым списком. */
    if ((e as { code?: string }).code === 'ZERO_RESULTS') return []
    throw e
  }
  return (res.results ?? []).slice(0, limit).map((r) => {
    const loc = r.geometry.location
    return {
      lat: loc.lat(),
      lon: loc.lng(),
      addr: r.formatted_address || query,
      precise: r.types.some((t) => !COARSE.has(t)) && r.partial_match !== true,
    }
  })
}

/** Название покороче — по типам компонентов адреса, от частного к общему. */
function shortName(results: google.maps.GeocoderResult[]): string {
  const byType = (t: string): string => {
    for (const r of results) {
      for (const c of r.address_components) {
        if (c.types.includes(t)) return c.long_name
      }
    }
    return ''
  }
  /* «Заведение» вроде базы отдыха или заправки — самое понятное название точки. */
  const poi = results.find((r) => r.types.includes('point_of_interest') || r.types.includes('establishment'))
  if (poi) {
    const first = poi.formatted_address.split(',')[0].trim()
    if (first) return first
  }
  const street = byType('route')
  const house = byType('street_number')
  if (street) return house ? `${street}, ${house}` : street
  return (
    byType('locality') ||
    byType('sublocality') ||
    byType('administrative_area_level_2') ||
    byType('administrative_area_level_1')
  )
}
