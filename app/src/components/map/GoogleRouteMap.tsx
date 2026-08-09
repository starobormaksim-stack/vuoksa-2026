import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import type { RoutePoint, Transport } from '@/lib/types'
import { GOOGLE_MAP_ID, googleFailCode, loadGoogleMaps } from '@/lib/gmaps'
import { cn } from '@/lib/utils'
import {
  LINE_CASING, LINE_CASING_W, LINE_W,
  destPinEl, googleDash, markStyles, pointPinEl, threads, type MapTone,
} from './marks'
import { threadKey, type RoadShapes } from './shapes'

/**
 * Карта маршрута на Google Maps.
 *
 * Устройство то же, что было на Leaflet, и намеренно: редактор ставит точку тапом
 * по карте и двигает её перетаскиванием маркера, участник карту только смотрит —
 * обработчиков правки ему не выдаём вовсе (правило 12.2: кнопки нет, а не «серая»).
 *
 * Метки — свои (см. marks.ts): кружок с номером у точки маршрута и подписанная
 * плашка у конечной точки. Ниток столько, сколько единиц техники: у каждой свой
 * тон и свой рисунок линии (заказчик 04.08.2026: «ты должен разным цветом условно
 * указать маршрутные точки»).
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

/**
 * Карточка метки — та самая правка «прямо на карте».
 *
 * Разметку карточки собирает вызывающий (см. MapPointCard.tsx), а карта только
 * держит её у нужной метки. Карточка живёт СЛОЕМ НАД картой, а не внутри метки,
 * и это принципиально: узлы меток принадлежат Google, и поля ввода внутри них
 * теряли бы нажатия — карта забирает их себе как жест перетаскивания.
 */
export interface MapCard {
  /** id точки: по его смене карта решает, надо ли подвести вид заново */
  id: string
  lat: number
  lon: number
  /**
   * Подвести вид к метке. Только для карточки, открытой насовсем (тап по метке,
   * только что поставленная точка): карточка стоит над меткой, и у самого края
   * её было бы не прочесть. На простое наведение курсора карту не двигаем —
   * иначе она уезжала бы из-под руки от каждого случайного касания мышью.
   */
  pan?: boolean
  node: ReactNode
}

interface Props {
  /** только точки с координатами */
  points: RoutePoint[]
  /** техника поездки — по ней раскладываются нитки и тона */
  transports: Transport[]
  /** линии ниток по настоящим дорогам; чего нет — рисуется прямой (см. shapes.ts) */
  shapes?: RoadShapes
  /** куда смотреть, если точек на карте ещё нет */
  centerLat: number
  centerLon: number
  canEdit: boolean
  /** тап по карте — поставить точку */
  onAdd: (lat: number, lon: number) => void
  /** маркер перетащили — обновить координаты точки */
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

/**
 * Где рисовать карточку метки.
 * `under` — метка в верхней половине карты, и карточку надо повесить ПОД ней:
 * над меткой у края экрана её было бы просто не видно.
 */
export interface Spot {
  x: number
  y: number
  under: boolean
}

/** Насколько ниже середины сажаем метку, когда подводим к ней вид: доля высоты. */
export const PAN_DOWN = 0.18

/** Отступ карточки от самой метки, чтобы кружок точки остался виден. */
const CARD_GAP = 22
/** Сколько оставить между карточкой и краем карты. */
const CARD_EDGE = 8

/**
 * Слой карточки метки над полотном карты — общий для Google и OpenStreetMap.
 *
 * ⛔ Сторону выбирает ЖИВАЯ высота карточки, а не одна лишь середина карты.
 * Карточка растёт: внутри неё раскрывается поиск адреса. Пока сторона решалась
 * только по `at.under`, выросшая карточка уезжала за верхний край и накрывала
 * строку поиска карты — замер 09.08.2026 на 1280: верх карточки 50 при верхе
 * карты 159, то есть на 109 px выше края (урок У-175).
 *
 * Высоту приходится мерить наблюдателем: поиск раскрывается состоянием ВНУТРИ
 * карточки, и этот слой от такой правки сам по себе не перерисовывается.
 */
function CardLayer({ at, children }: { at: Spot; children: ReactNode }) {
  const el = useRef<HTMLDivElement | null>(null)
  const [size, setSize] = useState({ h: 0, box: 0 })

  useLayoutEffect(() => {
    const node = el.current
    const parent = node?.parentElement
    if (!node || !parent) return
    const read = () => setSize({ h: node.offsetHeight, box: parent.clientHeight })
    read()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(read)
    ro.observe(node)
    ro.observe(parent)
    return () => ro.disconnect()
  }, [])

  const { h, box } = size
  /* Пока не измерились — держимся прежнего поведения: иначе первый кадр
     показал бы карточку не с той стороны и она бы прыгнула. */
  const measured = h > 0 && box > 0

  let top = at.y + (at.under ? CARD_GAP : -CARD_GAP)
  if (measured) {
    const fitsAbove = at.y - CARD_GAP - h >= CARD_EDGE
    const fitsBelow = at.y + CARD_GAP + h <= box - CARD_EDGE
    /* Подсказку карты («метка в верхней половине») уважаем, но последнее слово
       за тем, где карточка действительно помещается. */
    const under = at.under ? fitsBelow || !fitsAbove : !fitsAbove && fitsBelow
    top = under ? at.y + CARD_GAP : at.y - CARD_GAP - h
    /* Карточка выше самой карты — прижимаем к верху: заголовок и поля важнее
       низа, низ дочитывается прокруткой. */
    top = Math.min(Math.max(top, CARD_EDGE), Math.max(CARD_EDGE, box - h - CARD_EDGE))
  }

  return (
    <div
      ref={el}
      className={cn(
        'absolute z-10 -translate-x-1/2',
        !measured && !at.under && '-translate-y-full',
      )}
      style={{ left: at.x, top }}
    >
      {children}
    </div>
  )
}

export { CardLayer }

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
  points, transports, shapes, centerLat, centerLon, canEdit, onAdd, onMove, onSelect, onLine,
  dest, onMoveDest, fitAt, lookAt, card, onFail, className,
}: Props) {
  const box = useRef<HTMLDivElement | null>(null)
  const map = useRef<google.maps.Map | null>(null)
  const markers = useRef<Map<string, Mark>>(new Map())
  const destMark = useRef<google.maps.marker.AdvancedMarkerElement | null>(null)
  const lines = useRef<google.maps.Polyline[]>([])
  const spy = useRef<google.maps.OverlayView | null>(null)
  const fitted = useRef(false)
  const [ready, setReady] = useState(false)
  /** где сейчас метка открытой карточки, в пикселях внутри карты */
  const [at, setAt] = useState<Spot | null>(null)

  /* Обработчики меняются на каждой перерисовке, а карта создаётся один раз —
     держим свежие ссылки в ref, иначе Google позовёт устаревшее замыкание. */
  const cb = useRef({ canEdit, onAdd, onMove, onSelect, onLine, onMoveDest, onFail })
  cb.current = { canEdit, onAdd, onMove, onSelect, onLine, onMoveDest, onFail }

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
            /*
             * Плюс и минус масштаба — свои, гугловские (заказчик 09.08.2026:
             * «плюсик и минусик… я бы всё-таки добавил на неё, на гугловскую
             * карту… не только с помощью Ctrl»). У соседней карты OSM такие
             * кнопки были всегда (`zoomControl: true` в OsmRouteMap), а здесь
             * их не было вовсе, и масштаб менялся только колесом с Ctrl или
             * щипком — на десктопе без мыши это тупик.
             *
             * ⛔ Своей вёрсткой не заменять: постулат 3. Готовый орган умеет
             * то, чего у самодельной пары кнопок не будет даром, — предел
             * масштаба, удержание нажатия, клавиатуру и подписи.
             */
            zoomControl: true,
            zoomControlOptions: { position: maps.ControlPosition.RIGHT_BOTTOM },
            /* Прокрутка колесом без Ctrl пролистывала бы страницу мимо карты. */
            gestureHandling: 'cooperative',
          })
          m.addListener('click', (e: google.maps.MapMouseEvent) => {
            if (!cb.current.canEdit || !e.latLng) return
            cb.current.onAdd(e.latLng.lat(), e.latLng.lng())
          })
          /* Пустой слой поверх карты нужен ровно за одним: у него можно спросить
             перевод координат в пиксели. Другого способа узнать, где сейчас метка,
             у Google нет, а без него карточку метки не к чему привязать. */
          const ov = new maps.OverlayView()
          ov.onAdd = () => {}
          ov.onRemove = () => {}
          ov.draw = () => {}
          ov.setMap(m)
          spy.current = ov
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

  /* ── метки маршрута и нитки ──
     Зависимость — строка-слепок: пересобирать слой на каждой перерисовке нельзя,
     иначе маркер выпрыгивает из-под пальца прямо во время перетаскивания. */
  /* ⛔ `tone` и `color` в слепке обязательны — та же причина, что в
     `OsmRouteMap`: без них смена цвета ветки карту не перерисовывает.
     Обе карты обязаны вести себя одинаково, поэтому правка парная. */
  const sig =
    points.map((p) => `${p.i}:${p.lat}:${p.lon}:${p.done ? 1 : 0}:${p.n}:${p.tr ?? ''}`).join('|') +
    '#' +
    transports.map((t) => `${t.i}:${t.leg}:${t.tone ?? ''}:${t.color ?? ''}`).join(',')
  /* Линии приезжают позже точек — слой обязан пересобраться, когда они пришли.
     Отдельным слепком, а не внутри `sig`: на `sig` висит ещё и покачивание метки
     по просьбе из ленты, и от прихода линии оно повторяться не должно. */
  const shapeSig = shapes
    ? [...shapes.entries()].map(([k, v]) => `${k}:${v.length}`).join(',')
    : ''
  useEffect(() => {
    const m = map.current
    if (!m || !ready) return
    const maps = gmaps()

    markers.current.forEach(({ mk }) => {
      mk.map = null
    })
    markers.current.clear()

    const list = threads(points, transports)
    const styles = markStyles(list)

    points.forEach((p, idx) => {
      const st = styles.get(p.i)
      /* Номер — свой у каждой ветки, с единицы (см. MarkStyle.no). */
      const no = st?.no ?? idx + 1
      const el = pointPinEl(no, p.done, st?.tone ?? list[0].tone, st?.leg)
      const mk = new maps.marker.AdvancedMarkerElement({
        position: { lat: p.lat as number, lng: p.lon as number },
        map: m,
        content: el,
        gmpDraggable: canEdit,
        /* Без gmpClickable маркер вообще не получает событий — и тап по нему
           проваливается на карту, то есть ставит новую точку поверх старой. */
        gmpClickable: true,
        title: `${no}. ${p.n || 'Точка без названия'}`,
      })
      mk.addListener('gmp-click', () => cb.current.onSelect(p.i))
      mk.addListener('dragend', (e: google.maps.MapMouseEvent) => {
        if (e.latLng) cb.current.onMove(p.i, e.latLng.lat(), e.latLng.lng())
      })
      markers.current.set(p.i, { mk, el })
    })

    /* Нитки: своя на каждую технику. Тон и рисунок линии идут парой — по одному
       цвету маршруты не различить (WCAG 1.4.1).

       Ломаная по дорогам берётся из `shapes`, если её успели спросить. Нет её —
       линия идёт прямой из точки в точку, как было всегда, а причину человек
       читает под картой (постулат 5). */
    lines.current.forEach((l) => l.setMap(null))
    lines.current = list
      .filter((t) => t.points.length > 1)
      .flatMap((t) => {
        const road = shapes?.get(threadKey(t))
        const path = road
          ? road.map(([lat, lng]) => ({ lat, lng }))
          : t.points.map((p) => ({ lat: p.lat as number, lng: p.lon as number }))
        /* Две линии на нитку: снизу кремовая обводка, сверху цветная нить.
           Порядок задаётся zIndex, а не порядком создания: у Google полилинии
           сами по себе не наслаиваются предсказуемо. Подробности —
           LINE_CASING в marks.ts. */
        const casing = new maps.Polyline({
          path,
          map: m,
          strokeColor: LINE_CASING,
          strokeOpacity: 0.9,
          strokeWeight: LINE_CASING_W,
          zIndex: 1,
        })
        const line = new maps.Polyline({
          path,
          map: m,
          zIndex: 2,
          ...strokeOf(maps, t.tone),
        })
        /* Зона нажатия на линию: сама линия 6 px, пальцем в неё не попасть.
           Почти прозрачная, а не полностью: у совсем невидимой линии Google
           событий не отдаёт. По линии нажали — точка встаёт в СЕРЕДИНУ
           маршрута (см. `onLine` в TripMap.tsx). Клик по полилинии до карты
           не доходит, поэтому второй точки в конце не появляется. */
        const hit = new maps.Polyline({
          path,
          map: m,
          strokeColor: t.tone.fill,
          strokeOpacity: 0.01,
          strokeWeight: 18,
          zIndex: 3,
          clickable: true,
        })
        hit.addListener('click', (e: google.maps.PolyMouseEvent) => {
          if (!cb.current.canEdit || !cb.current.onLine || !e.latLng) return
          cb.current.onLine(t.tr, e.latLng.lat(), e.latLng.lng())
        })
        return [casing, line, hit]
      })

    /* Подгоняем вид один раз: дальше человек сам решает, куда смотреть. */
    if (!fitted.current) {
      fitView(m, points, dest, centerLat, centerLon)
      fitted.current = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, shapeSig, canEdit, ready, centerLat, centerLon])

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

  /* ⛔ Подводки «по просьбе ленты» здесь больше нет: ленты точек не существует
     (06.08.2026). К нужной метке карту подводит `card.pan` — та же самая просьба,
     только приходит она от открытой карточки, а не от строки списка. */

  /* ── карточка метки едет вместе с картой ──
     Пиксели пересчитываются на каждый сдвиг вида, но не чаще кадра: без этого
     карточка отставала бы от метки на добрую половину экрана. */
  const cardLat = card?.lat
  const cardLon = card?.lon
  useEffect(() => {
    const m = map.current
    if (!m || !ready || cardLat == null || cardLon == null) {
      setAt(null)
      return
    }
    let frame = 0
    const put = () => {
      frame = 0
      const proj = spy.current?.getProjection()
      if (!proj) {
        /* Слой ещё не встал на карту — переспросим на следующем кадре.
           Иначе карточка так и не появилась бы, пока карту не тронут. */
        frame = window.requestAnimationFrame(put)
        return
      }
      const p = proj.fromLatLngToContainerPixel(new (gmaps().LatLng)(cardLat, cardLon))
      const h = box.current?.clientHeight ?? 0
      setAt(p ? { x: p.x, y: p.y, under: p.y < h / 2 } : null)
    }
    const soon = () => {
      if (frame) return
      frame = window.requestAnimationFrame(put)
    }
    put()
    const subs = (['bounds_changed', 'idle', 'projection_changed'] as const).map((ev) =>
      m.addListener(ev, soon),
    )
    return () => {
      window.cancelAnimationFrame(frame)
      subs.forEach((s) => s.remove())
    }
  }, [cardLat, cardLon, ready])

  /* ── открылась новая карточка — подводим к ней вид ── */
  const cardId = card?.pan ? card.id : ''
  useEffect(() => {
    const m = map.current
    if (!m || !ready || !cardId || cardLat == null || cardLon == null) return
    m.panTo({ lat: cardLat, lng: cardLon })
    /* Не ровно в середину, а чуть ниже: карточка висит НАД меткой, и ей нужно
       место сверху. Иначе она упирается в край карты и обрезается. */
    const h = box.current?.clientHeight ?? 0
    if (h > 0) m.panBy(0, -Math.round(h * PAN_DOWN))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardId, ready])

  return (
    <div className={cn('relative isolate', className)}>
      {/* z-0 у полотна обязателен: карта раскладывает свои слои собственными
          z-index, и без отдельного слоя они перекрыли бы карточку метки. */}
      <div ref={box} className="absolute inset-0 z-0 bg-zebra" />
      {/* `card.node` может быть пустым: на телефоне карточку держит не карта,
          а полоса под ней (см. TripMap.tsx, У-112). Метка при этом карте всё
          равно названа — вид к ней подводится. */}
      {card?.node && at && <CardLayer at={at}>{card.node}</CardLayer>}
    </div>
  )
}

/** Как рисовать нитку этого тона: сплошной линией или повторяющимися значками. */
function strokeOf(maps: typeof google.maps, tone: MapTone): google.maps.PolylineOptions {
  const parts = googleDash(tone.dash)
  if (!parts) {
    return { strokeColor: tone.fill, strokeOpacity: 1, strokeWeight: LINE_W }
  }
  return {
    /* Прерывистой линии у Google нет: сплошную гасят и выкладывают значками. */
    strokeColor: tone.fill,
    strokeOpacity: 0,
    strokeWeight: LINE_W,
    icons: parts.map((part) => ({
      icon:
        part.shape === 'dot'
          ? {
              path: maps.SymbolPath.CIRCLE,
              scale: part.scale,
              fillColor: tone.fill,
              fillOpacity: 1,
              strokeOpacity: 0,
            }
          : {
              path: 'M 0,-1 0,1',
              scale: part.scale,
              strokeColor: tone.fill,
              strokeOpacity: 1,
              strokeWeight: LINE_W,
            },
      offset: part.offset,
      repeat: part.repeat,
    })),
  }
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
