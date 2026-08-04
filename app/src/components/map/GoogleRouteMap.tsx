import { useEffect, useRef, useState } from 'react'
import type { RoutePoint } from '@/lib/types'
import { loadGoogleMaps } from '@/lib/gmaps'
import { cn } from '@/lib/utils'

/**
 * Карта маршрута на Google Maps.
 *
 * Устройство то же, что было на Leaflet, и намеренно: редактор ставит точку тапом
 * по карте и двигает её перетаскиванием маркера, участник карту только смотрит —
 * обработчиков правки ему не выдаём вовсе (правило 12.2: кнопки нет, а не «серая»).
 *
 * Маркеры — свои, кружок с номером: стандартная «капля» Google на шести точках
 * подряд читается хуже, чем порядковый номер.
 *
 * Библиотека грузится тегом script при первом показе (см. lib/gmaps.ts), поэтому
 * компонент сначала ничего не рисует. Не загрузилась — говорим об этом словами
 * и отдаём управление вызывающему через onFail: он покажет OpenStreetMap.
 */

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
  /** тап по маркеру — открыть карточку точки */
  onOpen: (id: string) => void
  /** к какой точке подвести карту (просьба из «Тайминга») */
  focusId?: string | null
  /** метка времени просьбы: одна и та же точка может понадобиться дважды */
  focusAt?: number
  /** Google не поднялся — вызывающий откатится на OpenStreetMap */
  onFail?: () => void
  className?: string
}

export function GoogleRouteMap({
  points, centerLat, centerLon, canEdit, onAdd, onMove, onOpen,
  focusId, focusAt, onFail, className,
}: Props) {
  const box = useRef<HTMLDivElement | null>(null)
  const map = useRef<google.maps.Map | null>(null)
  const markers = useRef<Map<string, google.maps.Marker>>(new Map())
  const line = useRef<google.maps.Polyline | null>(null)
  const fitted = useRef(false)
  const [ready, setReady] = useState(false)

  /* Обработчики меняются на каждой перерисовке, а карта создаётся один раз —
     держим свежие ссылки в ref, иначе Google позовёт устаревшее замыкание. */
  const cb = useRef({ canEdit, onAdd, onMove, onOpen, onFail })
  cb.current = { canEdit, onAdd, onMove, onOpen, onFail }

  /* ── создание карты ── */
  useEffect(() => {
    let dead = false
    loadGoogleMaps()
      .then((maps) => {
        if (dead || !box.current || map.current) return
        const m = new maps.Map(box.current, {
          center: { lat: centerLat, lng: centerLon },
          zoom: 9,
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
        console.warn('Google Maps не поднялся — показываем OpenStreetMap', e)
        if (!dead) cb.current.onFail?.()
      })
    return () => {
      dead = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* ── маркеры ──
     Зависимость — строка-слепок: пересобирать слой на каждой перерисовке нельзя,
     иначе маркер выпрыгивает из-под пальца прямо во время перетаскивания. */
  const sig = points.map((p) => `${p.i}:${p.lat}:${p.lon}:${p.done ? 1 : 0}:${p.n}`).join('|')
  useEffect(() => {
    const m = map.current
    if (!m || !ready) return
    const maps = (window as unknown as { google: { maps: typeof google.maps } }).google.maps

    markers.current.forEach((mk) => mk.setMap(null))
    markers.current.clear()

    points.forEach((p, idx) => {
      const mk = new maps.Marker({
        position: { lat: p.lat as number, lng: p.lon as number },
        map: m,
        draggable: canEdit,
        title: `${idx + 1}. ${p.n || 'Точка без названия'}`,
        label: {
          text: String(idx + 1),
          color: p.done ? '#F9F3D4' : '#FEFAE0',
          fontSize: '13px',
          fontWeight: '700',
        },
        icon: {
          path: maps.SymbolPath.CIRCLE,
          scale: 13,
          fillColor: p.done ? '#262513' : '#A74612',
          fillOpacity: 1,
          strokeColor: '#FEFAE0',
          strokeWeight: 2,
        },
      })
      mk.addListener('click', () => cb.current.onOpen(p.i))
      mk.addListener('dragend', (e: google.maps.MapMouseEvent) => {
        if (e.latLng) cb.current.onMove(p.i, e.latLng.lat(), e.latLng.lng())
      })
      markers.current.set(p.i, mk)
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
      if (points.length > 1) {
        const b = new maps.LatLngBounds()
        points.forEach((p) => b.extend({ lat: p.lat as number, lng: p.lon as number }))
        m.fitBounds(b, 36)
      } else if (points.length === 1) {
        m.setCenter({ lat: points[0].lat as number, lng: points[0].lon as number })
        m.setZoom(12)
      } else {
        m.setCenter({ lat: centerLat, lng: centerLon })
        m.setZoom(9)
      }
      fitted.current = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, canEdit, ready, centerLat, centerLon])

  /* ── просьба из «Тайминга»: подвести карту к точке и качнуть маркер ── */
  useEffect(() => {
    const m = map.current
    if (!m || !ready || !focusId) return
    const mk = markers.current.get(focusId)
    if (!mk) return
    const pos = mk.getPosition()
    if (!pos) return
    m.panTo(pos)
    if (m.getZoom() !== undefined && (m.getZoom() as number) < 12) m.setZoom(12)
    const maps = (window as unknown as { google: { maps: typeof google.maps } }).google.maps
    mk.setAnimation(maps.Animation.BOUNCE)
    const t = window.setTimeout(() => mk.setAnimation(null), 1600)
    return () => window.clearTimeout(t)
  }, [focusId, focusAt, ready, sig])

  return <div ref={box} className={cn('isolate bg-zebra', className)} />
}
