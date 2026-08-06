import { useEffect, useRef, useState } from 'react'
import * as LeafletModule from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { RoutePoint, Transport } from '@/lib/types'
import { cn } from '@/lib/utils'
import {
  DEST_H, DEST_W, LINE_CASING, LINE_CASING_W, LINE_W, POINT_SIZE,
  destPinHtml, leafletDash, markStyles, pointPinHtml, threads, type MapTone,
} from './marks'
import { PAN_DOWN, type MapCard, type MapDest, type Spot } from './GoogleRouteMap'
import { threadKey, type RoadShapes } from './shapes'

/**
 * Карта маршрута на OpenStreetMap (Leaflet).
 *
 * Запасной путь: пока не выдан ключ Google Maps — или если Google не поднялся —
 * маршрут показывается здесь. Поведение то же, что у Google-карты: редактор ставит
 * точку тапом и двигает маркер перетаскиванием, участник только смотрит, у каждой
 * единицы техники своя нитка своим тоном и своим рисунком линии.
 *
 * Раньше этот файл лежал в components/road/RouteMap.tsx. Карта переехала в общую
 * папку map/: ею пользуются оба раздела.
 */

/* Leaflet 1.9 отдаётся UMD-сборкой: одни сборщики кладут её в пространство имён,
   другие — в поле default. Берём то, что реально приехало. */
const L =
  (LeafletModule as unknown as { default?: typeof LeafletModule }).default ?? LeafletModule

interface Props {
  points: RoutePoint[]
  /** техника поездки — по ней раскладываются нитки и тона */
  transports: Transport[]
  /** линии ниток по настоящим дорогам; чего нет — рисуется прямой (см. shapes.ts) */
  shapes?: RoadShapes
  centerLat: number
  centerLon: number
  canEdit: boolean
  onAdd: (lat: number, lon: number) => void
  onMove: (id: string, lat: number, lon: number) => void
  /** тап по метке — открыть её карточку */
  onSelect: (id: string) => void
  /** тап по самой линии нитки — вставить точку в середину маршрута */
  onLine?: (tr: string, lat: number, lon: number) => void
  /* ⛔ Слушателя наведения здесь больше нет. Заказчик 06.08.2026, поздний вечер:
     «при наведении на точки не нужно, чтобы они показывали, что там есть,
     потому что при нажатии — да». Карточка открывается ТОЛЬКО нажатием. */
  /** конечная точка поездки (trip.places, main) */
  dest?: MapDest | null
  /** метку конечной перетащили */
  onMoveDest?: (lat: number, lon: number) => void
  /** метка «подгони вид под все точки заново» (после мастера «Разметить маршрут») */
  fitAt?: number
  /** навестись на произвольное место (находка строки поиска над картой) */
  lookAt?: { lat: number; lon: number; at: number } | null
  /** карточка открытой метки */
  card?: MapCard | null
  className?: string
}

/** Свои метки: у Leaflet по умолчанию картинки, и в сборщиках они отваливаются. */
function pinIcon(n: number, done: boolean, tone: MapTone, leg: Parameters<typeof pointPinHtml>[3]) {
  return L.divIcon({
    className: '',
    html: pointPinHtml(n, done, tone, leg),
    iconSize: [POINT_SIZE, POINT_SIZE],
    iconAnchor: [POINT_SIZE / 2, POINT_SIZE / 2],
  })
}

/** Пин конечной точки. Якорь — точно в кончик хвостика: им метка и указывает на место. */
function destIcon(name: string) {
  return L.divIcon({
    className: '',
    html: destPinHtml(name),
    iconSize: [DEST_W, DEST_H],
    iconAnchor: [DEST_W / 2, DEST_H],
  })
}

export function OsmRouteMap({
  points, transports, shapes, centerLat, centerLon, canEdit, onAdd, onMove, onSelect, onLine,
  dest, onMoveDest, fitAt, lookAt, card, className,
}: Props) {
  const box = useRef<HTMLDivElement | null>(null)
  const map = useRef<ReturnType<typeof L.map> | null>(null)
  const layer = useRef<ReturnType<typeof L.layerGroup> | null>(null)
  const destMark = useRef<ReturnType<typeof L.marker> | null>(null)
  const marks = useRef<Map<string, ReturnType<typeof L.marker>>>(new Map())
  const fitted = useRef(false)
  const [live, setLive] = useState(false)
  /** где сейчас метка открытой карточки, в пикселях внутри карты */
  const [at, setAt] = useState<Spot | null>(null)

  /* Обработчики меняются на каждой перерисовке, а карта создаётся один раз —
     держим свежие ссылки в ref, иначе Leaflet позовёт устаревшее замыкание. */
  const cb = useRef({ canEdit, onAdd, onMove, onSelect, onLine, onMoveDest })
  cb.current = { canEdit, onAdd, onMove, onSelect, onLine, onMoveDest }

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
    setLive(true)

    /* Блок меняет размер вместе с колонкой — Leaflet сам этого не замечает. */
    const ro = new ResizeObserver(() => m.invalidateSize())
    ro.observe(box.current)

    return () => {
      ro.disconnect()
      m.remove()
      map.current = null
      layer.current = null
      bag.clear()
      setLive(false)
    }
  }, [])

  /* ── маркеры и нитки ──
     Зависимость — строка-слепок: пересобирать слой на каждой перерисовке нельзя,
     иначе маркер выпрыгивает из-под пальца прямо во время перетаскивания. */
  const sig =
    points.map((p) => `${p.i}:${p.lat}:${p.lon}:${p.done ? 1 : 0}:${p.n}:${p.tr ?? ''}`).join('|') +
    '#' +
    transports.map((t) => `${t.i}:${t.leg}`).join(',')
  /* Линии приезжают позже точек — слой обязан пересобраться, когда они пришли.
     Отдельным слепком, а не внутри `sig`: на `sig` висит ещё и покачивание метки
     по просьбе из ленты, и от прихода линии оно повторяться не должно. */
  const shapeSig = shapes
    ? [...shapes.entries()].map(([k, v]) => `${k}:${v.length}`).join(',')
    : ''
  useEffect(() => {
    const m = map.current
    const g = layer.current
    if (!m || !g) return
    g.clearLayers()
    marks.current.clear()

    const list = threads(points, transports)
    const styles = markStyles(list)

    /* Нитки: своя на каждую технику. Тон и рисунок линии идут парой — по одному
       цвету маршруты не различить (WCAG 1.4.1).

       Ломаная по дорогам берётся из `shapes`, если её успели спросить. Нет её —
       линия идёт прямой из точки в точку, как было всегда, а причину человек
       читает под картой (постулат 5). */
    list
      .filter((t) => t.points.length > 1)
      .forEach((t) => {
        const road = shapes?.get(threadKey(t))
        const line =
          road ?? t.points.map((p) => [p.lat as number, p.lon as number] as [number, number])
        /* Обводка кладётся ПЕРВОЙ и потому лежит снизу: кремовая подложка
           отделяет цветную линию от подложки карты, какой бы та ни была.
           Она всегда сплошная — иначе штрих потерял бы фон именно там,
           где он и есть (см. LINE_CASING в marks.ts). */
        L.polyline(line, {
          color: LINE_CASING,
          weight: LINE_CASING_W,
          opacity: 0.9,
          lineCap: 'round',
          lineJoin: 'round',
        }).addTo(g)
        L.polyline(line, {
          color: t.tone.fill,
          weight: LINE_W,
          opacity: 1,
          dashArray: leafletDash(t.tone.dash),
          lineCap: t.tone.dash === 'dot' ? 'round' : 'butt',
        }).addTo(g)
        /* Зона нажатия на линию: сама линия 6 px, пальцем в неё не попасть.
           Почти прозрачная, а не полностью: у невидимой обводки браузер
           не считает попадание указателя. Ширина 18 px — пальцу хватает,
           а тап рядом с линией по-прежнему достаётся карте.
           ⚠️ `L.DomEvent.stop` обязателен: без него нажатие дойдёт и до карты,
           и вместе со вставленной точкой в конец маршрута прилетит вторая. */
        const hit = L.polyline(line, {
          color: t.tone.fill,
          weight: 18,
          opacity: 0.01,
          interactive: true,
        }).addTo(g)
        hit.on('click', (e) => {
          if (!cb.current.canEdit || !cb.current.onLine) return
          L.DomEvent.stop(e)
          cb.current.onLine(t.tr, e.latlng.lat, e.latlng.lng)
        })
      })

    points.forEach((p, idx) => {
      const st = styles.get(p.i)
      /* Номер — свой у каждой ветки, с единицы (см. MarkStyle.no). */
      const no = st?.no ?? idx + 1
      const marker = L.marker([p.lat as number, p.lon as number], {
        draggable: canEdit,
        icon: pinIcon(no, p.done, st?.tone ?? list[0].tone, st?.leg),
        title: `${no}. ${p.n || 'Точка без названия'}`,
        keyboard: true,
      })
      marker.on('click', () => cb.current.onSelect(p.i))
      marker.on('dragend', () => {
        const ll = marker.getLatLng()
        cb.current.onMove(p.i, ll.lat, ll.lng)
      })
      marker.addTo(g)
      marks.current.set(p.i, marker)
    })

    /* Подгоняем вид один раз: дальше человек сам решает, куда смотреть. */
    if (!fitted.current) {
      fitView(m, points, dest, centerLat, centerLon)
      fitted.current = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, shapeSig, canEdit, centerLat, centerLon])

  /* ── метка конечной точки ──
     Живёт в trip.places, а не в route, и рисуется иначе: это цель поездки.
     Зависимость слепком — иначе метка пересоздавалась бы на каждой перерисовке. */
  const destRef = useRef(dest)
  destRef.current = dest
  const destSig = dest ? `${dest.lat}:${dest.lon}:${dest.n}` : ''
  useEffect(() => {
    const m = map.current
    if (!m) return
    if (destMark.current) {
      destMark.current.remove()
      destMark.current = null
    }
    const d = destRef.current
    if (!d) return
    const mk = L.marker([d.lat, d.lon], {
      draggable: canEdit,
      icon: destIcon(d.n),
      title: `Конечная точка: ${d.n}`,
      /* Поверх номерков: цель поездки не должна прятаться за остановкой. */
      zIndexOffset: 1000,
    })
    mk.on('dragend', () => {
      const ll = mk.getLatLng()
      cb.current.onMoveDest?.(ll.lat, ll.lng)
    })
    mk.addTo(m)
    destMark.current = mk
  }, [destSig, canEdit])

  /* ── «покажи весь маршрут заново» (после мастера «Разметить маршрут») ──
     Точки читаем из ref: иначе эффект пришлось бы вешать на слепок, и вид
     пересобирался бы на каждую правку, вырывая карту из-под пальца. */
  const ptsRef = useRef(points)
  ptsRef.current = points
  useEffect(() => {
    const m = map.current
    if (!m || !fitAt) return
    fitView(m, ptsRef.current, destRef.current, centerLat, centerLon)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitAt])

  /* ── находка строки поиска: просто наводимся, метку ставит вызывающий ── */
  useEffect(() => {
    const m = map.current
    if (!m || !lookAt) return
    m.setView([lookAt.lat, lookAt.lon], Math.max(m.getZoom(), 13), { animate: true })
  }, [lookAt])

  /* ⛔ Подводки «по просьбе ленты» здесь больше нет: ленты точек не существует
     (06.08.2026). К нужной метке карту подводит `card.pan`. */

  /* ── карточка метки едет вместе с картой ── */
  const cardLat = card?.lat
  const cardLon = card?.lon
  useEffect(() => {
    const m = map.current
    if (!m || !live || cardLat == null || cardLon == null) {
      setAt(null)
      return
    }
    let frame = 0
    const put = () => {
      frame = 0
      const p = m.latLngToContainerPoint([cardLat, cardLon])
      const h = box.current?.clientHeight ?? 0
      setAt({ x: p.x, y: p.y, under: p.y < h / 2 })
    }
    const soon = () => {
      if (frame) return
      frame = window.requestAnimationFrame(put)
    }
    put()
    m.on('move zoom resize viewreset', soon)
    return () => {
      window.cancelAnimationFrame(frame)
      m.off('move zoom resize viewreset', soon)
    }
  }, [cardLat, cardLon, live])

  /* ── открылась новая карточка — подводим к ней вид ── */
  const cardId = card?.pan ? card.id : ''
  useEffect(() => {
    const m = map.current
    if (!m || !live || !cardId || cardLat == null || cardLon == null) return
    m.panTo([cardLat, cardLon], { animate: true })
    /* Не ровно в середину, а чуть ниже: карточка висит НАД меткой, и ей нужно
       место сверху. Иначе она упирается в край карты и обрезается. */
    const h = box.current?.clientHeight ?? 0
    if (h > 0) m.panBy([0, -Math.round(h * PAN_DOWN)], { animate: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardId, live])

  /* isolate: панели Leaflet живут на z-index 400 и без своего слоя лезут поверх шторок. */
  return (
    <div className={cn('relative isolate', className)}>
      {/* z-0 у полотна обязателен: панели Leaflet живут на z-index 400–800 и без
          собственного слоя у полотна перекрыли бы карточку метки. */}
      <div ref={box} className="absolute inset-0 z-0 bg-zebra" />
      {/* `card.node` может быть пустым: на телефоне карточку держит не карта,
          а полоса под ней (см. TripMap.tsx, У-112). */}
      {card?.node && at && (
        <div
          className={cn('absolute z-10 -translate-x-1/2', !at.under && '-translate-y-full')}
          style={{ left: at.x, top: at.y + (at.under ? 22 : -22) }}
        >
          {card.node}
        </div>
      )}
    </div>
  )
}

/** Собрать вид под всё, что на карте есть: точки маршрута и конечную. */
function fitView(
  m: ReturnType<typeof L.map>,
  points: RoutePoint[],
  dest: MapDest | null | undefined,
  centerLat: number,
  centerLon: number,
): void {
  const all: [number, number][] = points.map((p) => [p.lat as number, p.lon as number])
  if (dest) all.push([dest.lat, dest.lon])
  if (all.length === 0) {
    m.setView([centerLat, centerLon], 9)
    return
  }
  m.fitBounds(L.latLngBounds(all), { padding: [36, 36], maxZoom: 13 })
}
