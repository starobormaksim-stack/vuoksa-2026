import { useEffect, useRef, useState } from 'react'
import * as LeafletModule from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { WifiOff } from 'lucide-react'
import type { RoutePoint } from '@/lib/types'
import { cn } from '@/lib/utils'
import { coordLabel } from './roadx'

/**
 * Карта маршрута (docs/v2-ux-redesign.md, 10.6) — OpenStreetMap через Leaflet.
 *
 * Редактор ставит точку тапом по карте и двигает её перетаскиванием маркера;
 * участник карту только смотрит — обработчиков правки ему не выдаём вовсе
 * (правило 12.2: кнопки нет, а не «серая»).
 *
 * Тайлы — сеть. Без сети карту не рисуем и честно пишем об этом, показывая
 * координаты точек текстом: иначе человек смотрит в серый квадрат и решает,
 * что приложение сломалось.
 */

/* Leaflet 1.9 отдаётся UMD-сборкой: одни сборщики кладут её в пространство имён,
   другие — в поле default. Берём то, что реально приехало. */
const L =
  (LeafletModule as unknown as { default?: typeof LeafletModule }).default ?? LeafletModule

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

/** Живая метка «есть сеть» — от неё зависит, рисуем карту или объяснение. */
function useOnline(): boolean {
  const [on, setOn] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine !== false,
  )
  useEffect(() => {
    const up = () => setOn(true)
    const down = () => setOn(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => {
      window.removeEventListener('online', up)
      window.removeEventListener('offline', down)
    }
  }, [])
  return on
}

export function RouteMap({
  points, centerLat, centerLon, canEdit, onAdd, onMove, onOpen, className,
}: Props) {
  const online = useOnline()
  const box = useRef<HTMLDivElement | null>(null)
  const map = useRef<ReturnType<typeof L.map> | null>(null)
  const layer = useRef<ReturnType<typeof L.layerGroup> | null>(null)
  const fitted = useRef(false)

  /* Обработчики меняются на каждой перерисовке, а карта создаётся один раз —
     держим свежие ссылки в ref, иначе Leaflet позовёт устаревшее замыкание. */
  const cb = useRef({ canEdit, onAdd, onMove, onOpen })
  cb.current = { canEdit, onAdd, onMove, onOpen }

  /* ── создание карты ── */
  useEffect(() => {
    if (!online || !box.current || map.current) return
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
    }
  }, [online])

  /* ── маркеры ──
     Зависимость — строка-слепок: пересобирать слой на каждой перерисовке нельзя,
     иначе маркер выпрыгивает из-под пальца прямо во время перетаскивания. */
  const sig = points.map((p) => `${p.i}:${p.lat}:${p.lon}:${p.done ? 1 : 0}:${p.n}`).join('|')
  useEffect(() => {
    const m = map.current
    const g = layer.current
    if (!m || !g) return
    g.clearLayers()

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

  if (!online) {
    return (
      <div className={className}>
        <div className="flex h-full flex-col items-center justify-center gap-3 bg-zebra px-6 py-8 text-center">
          <span className="grid size-16 place-items-center rounded-full bg-surface text-muted">
            <WifiOff size={28} strokeWidth={1.5} aria-hidden />
          </span>
          <div>
            <div className="text-base font-[650] text-ink">Карта показывается в онлайне</div>
            <p className="mx-auto mt-1 max-w-72 text-sm text-balance text-muted">
              Сейчас сети нет. Точки маршрута никуда не делись — вот их координаты.
            </p>
          </div>
          {points.length > 0 && (
            <ul className="w-full max-w-80 text-left">
              {points.map((p, idx) => (
                <li key={p.i} className="flex min-h-11 items-center gap-3 border-t border-line">
                  <span className="tnum grid size-7 shrink-0 place-items-center rounded-full bg-accent-fill text-[13px] font-bold text-on-accent">
                    {idx + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-ink">
                    {p.n}
                  </span>
                  <span className="tnum shrink-0 text-[13px] text-muted">{coordLabel(p)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    )
  }

  /* isolate: панели Leaflet живут на z-index 400 и без своего слоя лезут поверх шторок. */
  return <div ref={box} className={cn('isolate bg-zebra', className)} />
}
