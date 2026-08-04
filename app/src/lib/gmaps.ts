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

/** Ключ выдан — можно показывать Google. Иначе остаётся OpenStreetMap. */
export function hasGoogleKey(): boolean {
  return GOOGLE_MAPS_KEY.length > 0
}

/** Промис загрузки: библиотеку тянем один раз на всё приложение. */
let loading: Promise<typeof google.maps> | null = null

/**
 * Google отказал: домен не в списке разрешённых, ключ отозван, кончился биллинг.
 * Скрипт при этом загружается нормально, и без этого сигнала на месте карты остался бы
 * серый прямоугольник с чужой надписью поверх. Google зовёт глобальную gm_authFailure —
 * ловим её и переводим приложение на OpenStreetMap.
 */
const authFailed = new Set<() => void>()

/** Подписаться на отказ Google. Возвращает отписку. */
export function onGoogleAuthFail(l: () => void): () => void {
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
    authFailed.forEach((l) => l())
  }
}

/** Имя глобальной функции, которой Google сообщает, что загрузчик готов. */
const READY = '__pineMapsReady'

/**
 * Загрузить Maps JavaScript API и дождаться нужных наборов классов.
 *
 * Тонкость, на которой это уже один раз сломалось: с `loading=async` тег script
 * поднимает только ЗАГРУЗЧИК. Пространство `google.maps` при этом уже существует,
 * но `google.maps.Map` в нём ещё нет — классы приезжают вызовом importLibrary().
 * Поэтому промис резолвится не по onload, а после importLibrary: иначе компонент
 * получает «Map is not a constructor» и молча уходит на OpenStreetMap.
 *
 * Повторные вызовы получают тот же промис.
 */
export function loadGoogleMaps(): Promise<typeof google.maps> {
  if (loading) return loading
  loading = (async () => {
    if (!hasGoogleKey()) throw new Error('Ключ Google Maps не задан')

    const w = window as unknown as Record<string, unknown> & {
      google?: { maps?: typeof google.maps }
    }

    if (!w.google?.maps) {
      await new Promise<void>((resolve, reject) => {
        w[READY] = () => {
          delete w[READY]
          resolve()
        }
        const s = document.createElement('script')
        s.async = true
        s.src =
          'https://maps.googleapis.com/maps/api/js?key=' +
          encodeURIComponent(GOOGLE_MAPS_KEY) +
          '&language=ru&region=RU&loading=async&callback=' +
          READY
        s.onerror = () => reject(new Error('Google Maps не загрузился'))
        document.head.appendChild(s)
      })
    }

    const maps = (window as unknown as { google: { maps: typeof google.maps } }).google.maps
    /* Наборы классов: core — LatLngBounds и перечисления, maps — сама карта и линии,
       marker — маркеры, geocoding — обратное геокодирование. После importLibrary
       классы появляются и в самом пространстве google.maps, так что дальше код
       пользуется привычным `maps.Map`, `maps.Marker` и так далее. */
    await Promise.all([
      maps.importLibrary('core'),
      maps.importLibrary('maps'),
      maps.importLibrary('marker'),
      maps.importLibrary('geocoding'),
    ])
    return maps
  })()
  /* Не удалось — забываем промис, чтобы следующая попытка началась с чистого листа. */
  loading.catch(() => {
    loading = null
  })
  return loading
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
    if ((e as { code?: string }).code === 'ZERO_RESULTS') return null
    throw e
  }
  const r = res.results?.[0]
  if (!r) return null
  const loc = r.geometry.location
  return {
    lat: loc.lat(),
    lon: loc.lng(),
    addr: r.formatted_address || query,
    precise: r.types.some((t) => !COARSE.has(t)) && r.partial_match !== true,
  }
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
