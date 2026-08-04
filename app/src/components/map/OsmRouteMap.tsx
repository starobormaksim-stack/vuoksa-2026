import { useEffect, useRef } from 'react'
import * as LeafletModule from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { RoutePoint } from '@/lib/types'
import { cn } from '@/lib/utils'

/**
 * Карта маршрута на OpenStreetMap (Leaflet).
 *
 * Запасной путь: пока не выдан ключ Google Maps — или если Google не поднялся —
 * маршрут показывается здесь. Поведение то же, что у Google-карты: редактор ставит
 * точку тапом и двигает маркер перетаскиванием, участник только смотрит.
 *
 * Раньше этот файл лежал в components/road/RouteMap.tsx. Карта переехала в «Поездку»
 * (заказчик: «сначала заглавная фотография, за ней сразу карта»), поэтому и файл
 * переехал в общую папку map/: им пользуются оба раздела.
 */

/* Leaflet 1.9 отдаётся UMD-сборкой: одни сборщики кладут её в пространство имён,
   другие — в поле default. Берём то, что реально приехало. */
const L =
  (LeafletModule as unknown as { default?: typeof LeafletModule }).default ?? LeafletModule

interface Props {
  points: RoutePoint[]
  centerLat: number
  centerLon: number
  canEdit: boolean
  onAdd: (lat: number, lon: number) => void
  onMove: (id: string, lat: number, lon: number) => void
  onOpen: (id: string) => void
  /** к какой точке подвести карту (просьба из «Тайминга») */
  focusId?: string | null
  /** метка времени просьбы: одна и та же точка может понадобиться дважды */
  focusAt?: number
  className?: string
}

/** Свои маркеры: у Leaflet по умолчанию картинки, и в сборщиках они отваливаются. */
function pinIcon(n: number, done: boolean) {
  const tone = done ? 'bg-ink text-bg' : 'bg-accent-fill text-on-accent'
  return L.divIcon({
    className: '',
    html:
      `<span class="grid size-7 place-items-center rounded-full border-2 border-surface ` +
      `text-[13px] font-bold shadow-md ${tone}">${n}</span>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  })
}

export function OsmRouteMap({
  points, centerLat, centerLon, canEdit, onAdd, onMove, onOpen, focusId, focusAt, className,
}: Props) {
  const box = useRef<HTMLDivElement | null>(null)
  const map = useRef<ReturnType<typeof L.map> | null>(null)
  const layer = useRef<ReturnType<typeof L.layerGroup> | null>(null)
  const marks = useRef<Map<string, ReturnType<typeof L.marker>>>(new Map())
  const fitted = useRef(false)

  /* Обработчики меняются на каждой перерисовке, а карта создаётся один раз —
     держим свежие ссылки в ref, иначе Leaflet позовёт устаревшее замыкание. */
  const cb = useRef({ canEdit, onAdd, onMove, onOpen })
  cb.current = { canEdit, onAdd, onMove, onOpen }

  /* ── создание карты ── */
  useEffect(() => {
    if (!box.current || map.current) return
    const bag = marks.current
    const m = L.map(box.current, { scrollWheelZoom: false, zoomControl: true })
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution:
        'Карта © <a href="https://www.openstreetmap.org/copyright">участники OpenStreetMap</a>',
    }).addTo(m)
    m.on('click', (e) => {
      if (cb.current.canEdit) cb.current.onAdd(e.latlng.lat, e.latlng.lng)
    })
    layer.current = L.layerGroup().addTo(m)
    map.current = m
    fitted.current = false

    /* Блок меняет размер вместе с колонкой — Leaflet сам этого не замечает. */
    const ro = new ResizeObserver(() => m.invalidateSize())
    ro.observe(box.current)

    return () => {
      ro.disconnect()
      m.remove()
      map.current = null
      layer.current = null
      bag.clear()
    }
  }, [])

  /* ── маркеры ──
     Зависимость — строка-слепок: пересобирать слой на каждой перерисовке нельзя,
     иначе маркер выпрыгивает из-под пальца прямо во время перетаскивания. */
  const sig = points.map((p) => `${p.i}:${p.lat}:${p.lon}:${p.done ? 1 : 0}:${p.n}`).join('|')
  useEffect(() => {
    const m = map.current
    const g = layer.current
    if (!m || !g) return
    g.clearLayers()
    marks.current.clear()

    if (points.length > 1) {
      L.polyline(
        points.map((p) => [p.lat as number, p.lon as number]),
        { color: '#A74612', weight: 3, opacity: 0.85 },
      ).addTo(g)
    }

    points.forEach((p, idx) => {
      const marker = L.marker([p.lat as number, p.lon as number], {
        draggable: canEdit,
        icon: pinIcon(idx + 1, p.done),
        title: p.n,
        keyboard: true,
      })
      marker.bindTooltip(`${idx + 1}. ${p.n || 'Точка без названия'}`, { direction: 'top' })
      marker.on('click', () => cb.current.onOpen(p.i))
      marker.on('dragend', () => {
        const ll = marker.getLatLng()
        cb.current.onMove(p.i, ll.lat, ll.lng)
      })
      marker.addTo(g)
      marks.current.set(p.i, marker)
    })

    /* Подгоняем вид один раз: дальше человек сам решает, куда смотреть. */
    if (!fitted.current) {
      if (points.length > 0) {
        m.fitBounds(
          L.latLngBounds(points.map((p) => [p.lat as number, p.lon as number])),
          { padding: [36, 36], maxZoom: 13 },
        )
      } else {
        m.setView([centerLat, centerLon], 9)
      }
      fitted.current = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, canEdit, centerLat, centerLon])

  /* ── просьба из «Тайминга»: подвести карту к точке и открыть её подпись ── */
  useEffect(() => {
    const m = map.current
    if (!m || !focusId) return
    const mk = marks.current.get(focusId)
    if (!mk) return
    m.setView(mk.getLatLng(), Math.max(m.getZoom(), 12), { animate: true })
    mk.openTooltip()
    const t = window.setTimeout(() => mk.closeTooltip(), 2200)
    return () => window.clearTimeout(t)
  }, [focusId, focusAt, sig])

  /* isolate: панели Leaflet живут на z-index 400 и без своего слоя лезут поверх шторок. */
  return <div ref={box} className={cn('isolate bg-zebra', className)} />
}
