import { useEffect, useRef, useState } from 'react'
import type { RoutePoint } from '@/lib/types'
import { GOOGLE_MAP_ID, googleFailCode, loadGoogleMaps } from '@/lib/gmaps'
import { cn } from '@/lib/utils'
import { destPinEl, pointPinEl } from './marks'

/**
 * Карта маршрута на Google Maps.
 *
 * Устройство то же, что было на Leaflet, и намеренно: редактор ставит точку тапом
 * по карте и двигает её перетаскиванием маркера, участник карту только смотрит —
 * обработчиков правки ему не выдаём вовсе (правило 12.2: кнопки нет, а не «серая»).
 *
 * Метки — свои (см. marks.ts): кружок с номером у точки маршрута и подписанная
 * плашка у конечной точки. Стандартная «капля» Google на шести точках подряд
 * читается хуже, чем порядковый номер, а цель поездки обязана отличаться от остановок.
 *
 * ⚠️ Маркеры — google.maps.marker.AdvancedMarkerElement, а не устаревший
 * google.maps.Marker. Отсюда два следствия, которые легко забыть:
 *   1) карте обязателен mapId (см. GOOGLE_MAP_ID в lib/gmaps.ts), иначе маркеры
 *      не рисуются вовсе;
 *   2) у AdvancedMarkerElement нет setAnimation — «качнуть» метку можно только
 *      анимацией её собственного узла (element.animate).
 *
 * Библиотека грузится тегом script при первом показе (см. lib/gmaps.ts), поэтому
 * компонент сначала ничего не рисует. Не загрузилась — говорим об этом словами
 * и отдаём управление вызывающему через onFail: он покажет OpenStreetMap.
 */

/** Конечная точка поездки — цель, а не остановка по пути. */
export interface MapDest {
  lat: number
  lon: number
  n: string
}

interface Props {
  /** только точки с координатами */
  points: RoutePoint[]
  /** куда смотреть, если точек на карте ещё нет */
  centerLat: number
  centerLon: number
  canEdit: boolean
  /** тап по карте — поставить точку */
  onAdd: (lat: number, lon: number) => void
  /** маркер перетащили — обновить координаты точки */
  onMove: (id: string, lat: number, lon: number) => void
  /** тап по метке — показать эту точку в ленте рядом */
  onSelect: (id: string) => void
  /** конечная точка поездки (trip.places, main) */
  dest?: MapDest | null
  /** метку конечной перетащили */
  onMoveDest?: (lat: number, lon: number) => void
  /** к какой точке подвести карту (просьба из ленты) */
  focusId?: string | null
  /** метка времени просьбы: одна и та же точка может понадобиться дважды */
  focusAt?: number
  /** метка «подгони вид под все точки заново» (после мастера «Разметить маршрут») */
  fitAt?: number
  /** навестись на произвольное место (находка строки поиска над картой) */
  lookAt?: { lat: number; lon: number; at: number } | null
  /**
   * Google не поднялся — вызывающий откатится на OpenStreetMap. Код причины
   * (см. GoogleFailCode в lib/gmaps.ts) нужен, чтобы человеку под картой
   * написали, что именно случилось, а не «карта другая, и почему — неизвестно».
   */
  onFail?: (reason: string) => void
  className?: string
}

/** Через сколько переспросить Google после сетевой неудачи, мс. */
const RETRY_MS = 2000

/**
 * Стоит ли пробовать ещё раз. Сеть могла моргнуть — такое лечится повтором.
 * Отказ по ключу или домену ('auth') от повтора не изменится, а вот вторая
 * попытка отложит откат на OpenStreetMap ещё на две секунды впустую.
 */
function worthRetry(code: string): boolean {
  return code === 'script-error' || code === 'timeout' || code.startsWith('import-failed:')
}

/** Метка на карте: сам маркер и его узел — узел нужен, чтобы качнуть метку. */
interface Mark {
  mk: google.maps.marker.AdvancedMarkerElement
  el: HTMLElement
}

/** Короткая ссылка на пространство google.maps: оно уже загружено (см. ready). */
function gmaps(): typeof google.maps {
  return (window as unknown as { google: { maps: typeof google.maps } }).google.maps
}

export function GoogleRouteMap({
  points, centerLat, centerLon, canEdit, onAdd, onMove, onSelect,
  dest, onMoveDest, focusId, focusAt, fitAt, lookAt, onFail, className,
}: Props) {
  const box = useRef<HTMLDivElement | null>(null)
  const map = useRef<google.maps.Map | null>(null)
  const markers = useRef<Map<string, Mark>>(new Map())
  const destMark = useRef<google.maps.marker.AdvancedMarkerElement | null>(null)
  const line = useRef<google.maps.Polyline | null>(null)
  const fitted = useRef(false)
  const [ready, setReady] = useState(false)

  /* Обработчики меняются на каждой перерисовке, а карта создаётся один раз —
     держим свежие ссылки в ref, иначе Google позовёт устаревшее замыкание. */
  const cb = useRef({ canEdit, onAdd, onMove, onSelect, onMoveDest, onFail })
  cb.current = { canEdit, onAdd, onMove, onSelect, onMoveDest, onFail }

  /* ── создание карты ──
     Одна повторная попытка на сетевые причины и обязательный доклад наверх на всех
     остальных путях: молчаливый выход оставлял бы пустой прямоугольник вместо карты. */
  useEffect(() => {
    let dead = false
    let timer = 0

    const attempt = (retried: boolean) => {
      loadGoogleMaps()
        .then((maps) => {
          if (dead || map.current) return
          if (!box.current) {
            /* Рисовать некуда: контейнера уже нет, а компонент ещё жив. Промолчать
               нельзя — на месте карты останется пустое место без объяснения. */
            cb.current.onFail?.('script-error')
            return
          }
          const m = new maps.Map(box.current, {
            center: { lat: centerLat, lng: centerLon },
            zoom: 9,
            /* Без mapId AdvancedMarkerElement не рисуется — см. комментарий наверху. */
            mapId: GOOGLE_MAP_ID,
            mapTypeControl: false,
            streetViewControl: false,
            fullscreenControl: false,
            /* Прокрутка колесом без Ctrl пролистывала бы страницу мимо карты. */
            gestureHandling: 'cooperative',
          })
          m.addListener('click', (e: google.maps.MapMouseEvent) => {
            if (!cb.current.canEdit || !e.latLng) return
            cb.current.onAdd(e.latLng.lat(), e.latLng.lng())
          })
          map.current = m
          fitted.current = false
          setReady(true)
        })
        .catch((e: unknown) => {
          if (dead) return
          const code = googleFailCode(e)
          console.warn(`Google Maps не поднялся (${code})`, e)
          if (!retried && worthRetry(code)) {
            timer = window.setTimeout(() => {
              if (!dead) attempt(true)
            }, RETRY_MS)
            return
          }
          cb.current.onFail?.(code)
        })
    }

    attempt(false)
    return () => {
      dead = true
      window.clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* ── метки маршрута ──
     Зависимость — строка-слепок: пересобирать слой на каждой перерисовке нельзя,
     иначе маркер выпрыгивает из-под пальца прямо во время перетаскивания. */
  const sig = points.map((p) => `${p.i}:${p.lat}:${p.lon}:${p.done ? 1 : 0}:${p.n}`).join('|')
  useEffect(() => {
    const m = map.current
    if (!m || !ready) return
    const maps = gmaps()

    markers.current.forEach(({ mk }) => {
      mk.map = null
    })
    markers.current.clear()

    points.forEach((p, idx) => {
      const el = pointPinEl(idx + 1, p.done)
      const mk = new maps.marker.AdvancedMarkerElement({
        position: { lat: p.lat as number, lng: p.lon as number },
        map: m,
        content: el,
        gmpDraggable: canEdit,
        /* Без gmpClickable маркер вообще не получает событий — и тап по нему
           проваливается на карту, то есть ставит новую точку поверх старой. */
        gmpClickable: true,
        title: `${idx + 1}. ${p.n || 'Точка без названия'}`,
      })
      mk.addListener('gmp-click', () => cb.current.onSelect(p.i))
      mk.addListener('dragend', (e: google.maps.MapMouseEvent) => {
        if (e.latLng) cb.current.onMove(p.i, e.latLng.lat(), e.latLng.lng())
      })
      markers.current.set(p.i, { mk, el })
    })

    /* Нитка маршрута: точки идут по порядку, и линия между ними читается сразу. */
    line.current?.setMap(null)
    line.current =
      points.length > 1
        ? new maps.Polyline({
            path: points.map((p) => ({ lat: p.lat as number, lng: p.lon as number })),
            map: m,
            strokeColor: '#A74612',
            strokeOpacity: 0.85,
            strokeWeight: 3,
          })
        : null

    /* Подгоняем вид один раз: дальше человек сам решает, куда смотреть. */
    if (!fitted.current) {
      fitView(m, points, dest, centerLat, centerLon)
      fitted.current = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, canEdit, ready, centerLat, centerLon])

  /* ── метка конечной точки ──
     Отдельно от маршрута: это цель поездки, а не остановка по пути, и живёт она
     в trip.places, а не в route. Зависимость снова слепком: вызывающий собирает
     объект заново на каждой перерисовке, и по самому объекту метка пересоздавалась
     бы постоянно — прямо из-под пальца, которым её тащат. */
  const destRef = useRef(dest)
  destRef.current = dest
  const destSig = dest ? `${dest.lat}:${dest.lon}:${dest.n}` : ''
  useEffect(() => {
    const m = map.current
    if (!m || !ready) return
    if (destMark.current) {
      destMark.current.map = null
      destMark.current = null
    }
    const d = destRef.current
    if (!d) return
    const maps = gmaps()
    const mk = new maps.marker.AdvancedMarkerElement({
      position: { lat: d.lat, lng: d.lon },
      map: m,
      content: destPinEl(d.n),
      gmpDraggable: canEdit,
      gmpClickable: false,
      title: `Конечная точка: ${d.n}`,
      /* Поверх номерков: цель поездки не должна прятаться за остановкой. */
      zIndex: 10,
    })
    mk.addListener('dragend', (e: google.maps.MapMouseEvent) => {
      if (e.latLng) cb.current.onMoveDest?.(e.latLng.lat(), e.latLng.lng())
    })
    destMark.current = mk
  }, [destSig, canEdit, ready])

  /* ── «покажи весь маршрут заново» ──
     Вид подгоняется один раз (см. выше), и это правильно: дальше человек сам решает,
     куда смотреть. Но после мастера «Разметить маршрут» точек стало на восемь больше,
     и почти все они за краем экрана — тут вид надо пересобрать. Точки читаем из ref:
     иначе эффект пришлось бы вешать на слепок и он срабатывал бы на каждую правку. */
  const ptsRef = useRef(points)
  ptsRef.current = points
  useEffect(() => {
    const m = map.current
    if (!m || !ready || !fitAt) return
    fitView(m, ptsRef.current, destRef.current, centerLat, centerLon)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitAt, ready])

  /* ── находка строки поиска: просто наводимся, метку ставит вызывающий ── */
  useEffect(() => {
    const m = map.current
    if (!m || !ready || !lookAt) return
    m.panTo({ lat: lookAt.lat, lng: lookAt.lon })
    if ((m.getZoom() ?? 0) < 13) m.setZoom(13)
  }, [lookAt, ready])

  /* ── просьба из ленты: подвести карту к точке и качнуть метку ── */
  useEffect(() => {
    const m = map.current
    if (!m || !ready || !focusId) return
    const mark = markers.current.get(focusId)
    if (!mark?.mk.position) return
    m.panTo(mark.mk.position)
    if ((m.getZoom() ?? 0) < 12) m.setZoom(12)
    /* setAnimation у AdvancedMarkerElement нет — качаем сам узел метки. */
    const a = mark.el.animate(
      [
        { transform: 'translateY(50%) translateY(0)' },
        { transform: 'translateY(50%) translateY(-10px)' },
        { transform: 'translateY(50%) translateY(0)' },
      ],
      { duration: 520, iterations: 3, easing: 'ease-in-out' },
    )
    return () => a.cancel()
  }, [focusId, focusAt, ready, sig])

  return <div ref={box} className={cn('isolate bg-zebra', className)} />
}

/**
 * Собрать вид под всё, что на карте есть: точки маршрута и конечную.
 * Одна точка — просто центр и разумный масштаб: у рамки из одной точки
 * нулевой размер, и Google уводит масштаб в максимум.
 */
function fitView(
  m: google.maps.Map,
  points: RoutePoint[],
  dest: MapDest | null | undefined,
  centerLat: number,
  centerLon: number,
): void {
  const all: google.maps.LatLngLiteral[] = points.map((p) => ({
    lat: p.lat as number,
    lng: p.lon as number,
  }))
  if (dest) all.push({ lat: dest.lat, lng: dest.lon })

  if (all.length === 0) {
    m.setCenter({ lat: centerLat, lng: centerLon })
    m.setZoom(9)
    return
  }
  if (all.length === 1) {
    m.setCenter(all[0])
    m.setZoom(12)
    return
  }
  const b = new (gmaps().LatLngBounds)()
  all.forEach((p) => b.extend(p))
  m.fitBounds(b, 36)
}
