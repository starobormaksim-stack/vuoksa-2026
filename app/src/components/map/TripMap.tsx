import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Car, ChevronRight, Footprints, MapPinned, MapPinPlus, Sailboat, Tent, TriangleAlert, WifiOff,
  type LucideIcon,
} from 'lucide-react'
import { toast } from 'sonner'
import type { LegMode, RoutePoint, State, TripPlace } from '@/lib/types'
import type { Perms } from '@/lib/perm'
import { update, touch, remove } from '@/store'
import { hasGoogleKey, onGoogleAuthFail, retryGoogle } from '@/lib/gmaps'
import { reversePlace, shortPlaceName, type PlaceFound } from '@/lib/geocode'
import {
  focusInList,
  onAskPlaceMain,
  onMapLook,
  onMapRequest,
  type MapRequest,
} from '@/lib/mapfocus'
import { mapCenter, mapPoints } from '@/components/road/roadx'
import { goSection } from '@/lib/jump'
import { Btn } from '@/components/flops'
import { cn } from '@/lib/utils'
import { GoogleRouteMap, type MapCard, type MapDest } from './GoogleRouteMap'
import { OsmRouteMap } from './OsmRouteMap'
import { RouteMarkSheet } from './RouteMarkSheet'
import { MapSearch } from './MapSearch'
import { MapPointCard } from './MapPointCard'
import { leafletDash, threads, type Thread } from './marks'

/**
 * Карта поездки — правый из двух блоков раздела «Поездка», рядом с обложкой
 * (см. `trip/TripSection.tsx`).
 *
 * Карта на всю поездку одна, и это буквально: второго её экземпляра на странице
 * нет. Сначала она пряталась за вкладкой «На карте» и не монтировалась, пока
 * вкладку не нажали, — заказчик 04.08.2026 так и сказал: «карты нет». Потом
 * стояла в «Дороге» над лентой точек. С 05.08.2026 она наверху страницы:
 * «карта наверху сразу же, с точками показана… справа такой же блок будет
 * с изображением карты, вот этой, логистика». В «Дороге» осталась лента точек,
 * связь с ней двусторонняя и идёт через `lib/mapfocus.ts`.
 *
 * На карте два вида меток, и это разные вещи:
 *   точки маршрута — остановки по пути, кружки с номерами; у точки может быть
 *   своя техника, и тогда кружок и нитка берут её тон;
 *   конечная точка — цель поездки (trip.places, main), подписанная плашка.
 *
 * Главное действие: тап по пустому месту ставит точку и тут же открывает её
 * карточку прямо на карте — там пишут название, адрес подставляется сам
 * (заказчик: «он автоматически называет адрес… и я пишу название действия»).
 * Никакого режима «нажмите кнопку, а потом тапните»: тап работает всегда, пока
 * у человека есть право правки. Участнику тап точку не ставит и полей не показывает.
 */

interface Props {
  S: State
  perms: Perms
  /** место карточки в раскладке единого блока (см. RouteBoard.tsx) */
  className?: string
}

/** Значок участка — тот же, что карта рисует в углу метки. */
const LEG_ICONS: Record<LegMode, LucideIcon> = {
  road: Car,
  water: Sailboat,
  walk: Footprints,
}

/** Сколько ждём, прежде чем закрыть карточку, за которой ушёл курсор, мс. */
const HOVER_OFF_MS = 260

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

/**
 * Это офлайн-копия — файл, скачанный владельцем и открытый двойным щелчком.
 * В ней не должно быть ни одной внешней загрузки, поэтому карта не поднимается
 * вовсе, даже если сеть есть: вместо неё честный текст и координаты точек.
 * Признаки: документ вшит в файл строкой (window.__PINE_DOC__) либо адрес file://.
 */
function isOfflineCopy(): boolean {
  if (typeof window === 'undefined') return false
  if ((window as unknown as { __PINE_DOC__?: unknown }).__PINE_DOC__) return true
  return location.protocol === 'file:'
}

/**
 * Почему вместо Google показывается OpenStreetMap — человеческими словами.
 * Коды приходят из lib/gmaps.ts. null — говорить нечего: ключа просто нет,
 * и это штатное состояние, а не поломка. Незнакомый код объясняем общо:
 * лучше расплывчато, чем молча.
 */
function failWhy(code: string): string | null {
  if (code === 'no-key') return null
  if (code === 'auth') return 'Google не пускает с этого адреса'
  if (code === 'timeout') return 'Google не ответил'
  if (code.startsWith('import-failed:')) return 'часть карты Google не докачалась'
  return 'не удалось загрузить карту Google'
}

/**
 * Что человек может с этим сделать. Отдельно от причины: причина объясняет,
 * а это подсказывает следующий шаг. Заказчик 05.08.2026 видел OpenStreetMap
 * и не знал, почему, — потому что причина стояла подписью в самом мелком кегле
 * под картой и читалась как украшение (урок У-76).
 */
function failFix(code: string): string {
  if (code === 'auth') return 'Ключ карты не принят этим адресом — это чинится в настройках ключа.'
  if (code === 'timeout') return 'Скорее всего медленная сеть. Нажмите «Попробовать снова».'
  if (code.startsWith('import-failed:')) return 'Докачалось не всё. Нажмите «Попробовать снова».'
  return 'Google не открылся: сеть, блокировщик или расширение браузера. Нажмите «Попробовать снова».'
}

/** Главное место поездки: та самая «конечная». Пусто — его ещё не отметили. */
function mainPlace(S: State): TripPlace | null {
  const list = S.trip.places ?? []
  return list.find((p) => p.main) ?? list[0] ?? null
}

export function TripMap({ S, perms, className }: Props) {
  const live = useOnline()
  const online = live && !isOfflineCopy()
  const canEdit = perms.isEditor()
  const points = mapPoints(S)
  const center = mapCenter(S)

  const [focus, setFocus] = useState<MapRequest | null>(null)
  /** какой точке ждём координаты: следующий тап по карте отдаст их именно ей */
  const [placing, setPlacing] = useState<string | null>(null)
  /** ждём тап для конечной точки поездки */
  const [placingMain, setPlacingMain] = useState(false)
  /**
   * Ждём тап для НОВОЙ точки маршрута — режим включается кнопкой «Точка».
   *
   * Тап по пустому месту заводил точку и раньше, но узнать об этом было неоткуда:
   * заказчик 05.08.2026 — «я вот забил туда условную информацию по разным точкам,
   * но толку я не увидел… если я хочу добавить новую точку, я её даже должен…».
   * Невидимый жест на телефоне равен отсутствующей функции: наведения там нет,
   * подсказаться нечему. Поэтому у действия появился видимый орган, парный
   * «Конечной», а прежний тап остался как быстрый путь для тех, кто его знает.
   */
  const [placingNew, setPlacingNew] = useState(false)
  /** карточка, оставленная открытой: по метке тапнули или точку только что поставили */
  const [pinned, setPinned] = useState<string | null>(null)
  /** карточка под курсором: показывается, пока курсор на метке или на ней самой */
  const [hover, setHover] = useState<string | null>(null)
  /** точка, поставленная последним тапом: Esc убирает её целиком */
  const [fresh, setFresh] = useState<string | null>(null)
  /** у какой точки сейчас спрашивают адрес — карточка говорит об этом словами */
  const [addrBusy, setAddrBusy] = useState<string | null>(null)
  /**
   * Google не поднялся — дальше показываем OpenStreetMap и не дёргаем его больше.
   * Хранится не «да/нет», а код причины: без него откат виден, а объяснить его нечем.
   */
  const [googleDead, setGoogleDead] = useState<string | null>(null)
  /**
   * Номер попытки поднять Google. Меняется кнопкой «Попробовать снова» и служит
   * ключом компонента: карта создаётся один раз за монтирование, и без смены ключа
   * повтор был бы кнопкой, которая ничего не делает.
   */
  const [googleTry, setGoogleTry] = useState(0)
  /** открыт мастер «Разметить маршрут» */
  const [wizard, setWizard] = useState(false)
  /** метка «подгони вид под точки заново»: после разметки маршрут вылезает за экран */
  const [fitAt, setFitAt] = useState(0)
  /** куда навести карту по находке из строки поиска */
  const [lookAt, setLookAt] = useState<{ lat: number; lon: number; at: number } | null>(null)

  /** Отложенное закрытие карточки: курсор мог уйти с метки НА карточку. */
  const hoverOff = useRef(0)

  const patch = useCallback(
    (id: string, f: (p: RoutePoint) => void) =>
      update((s) => {
        const p = s.route.find((x) => x.i === id)
        if (p) {
          f(p)
          touch(p)
        }
      }),
    [],
  )

  /* Google отказал (домен не в списке, ключ отозван, кончился биллинг) —
     молча уходим на OpenStreetMap, а не показываем серый прямоугольник. */
  useEffect(() => onGoogleAuthFail((reason) => setGoogleDead(reason)), [])

  /* ── просьбы из ленты точек ── */
  useEffect(
    () =>
      onMapRequest((r) => {
        setFocus(r)
        setPlacing(r.mode === 'place' ? r.pointId : null)
        if (r.mode === 'place') {
          setPlacingMain(false)
          setPlacingNew(false)
        }
        /* Показать точку — значит и открыть её карточку: связь ленты и карты
           двусторонняя, и «показать» должно давать столько же, сколько тап по метке. */
        if (r.mode === 'show') {
          setPinned(r.pointId)
          setFresh(null)
        }
      }),
    [],
  )

  /* ── просьба «покажи это место» с обложки ──
     Наводим вид и только. Карточку не открываем и точку не заводим: главное
     место поездки — не точка маршрута, у него нет ни времени, ни техники.
     Участнику это доступно наравне с владельцем: смотреть можно всем. */
  useEffect(() => onMapLook((r) => setLookAt({ lat: r.lat, lon: r.lon, at: r.at })), [])

  /* ── просьба «дай поставить место поездки» с обложки ──
     Тот же режим, что даёт кнопка «Конечная» под картой: следующий тап по карте
     задаёт координаты главного места. Заводится он отсюда потому, что у места
     без координат другого входа не было вовсе (см. `askPlaceMain`). */
  useEffect(
    () =>
      onAskPlaceMain(() => {
        setPlacingMain(true)
        setPlacing(null)
        setPlacingNew(false)
      }),
    [],
  )

  useEffect(() => () => window.clearTimeout(hoverOff.current), [])

  /**
   * Подставить адрес по координатам. Название точки не трогаем: его пишет человек
   * («я пишу название действия, которое происходит»), а геокодер вернул бы улицу.
   */
  const guessAddr = useCallback(
    async (id: string, lat: number, lon: number) => {
      setAddrBusy(id)
      const g = await reversePlace(lat, lon)
      setAddrBusy((cur) => (cur === id ? null : cur))
      if (!g?.addr) return
      patch(id, (p) => {
        p.addr = g.addr
      })
    },
    [patch],
  )

  /** Завести новую точку маршрута. Возвращает её id. */
  const addPoint = (lat: number, lon: number, n: string, addr: string) => {
    const id = 'rp' + Date.now().toString(36)
    update((s) => {
      s.route.push({
        i: id, n, time: '', c: '', done: false, lat, lon, addr,
        lab: '', labT: '', mode: 'road', tr: '', leg: 0, legSrc: '',
        ord: (s.route.length + 1) * 10, ua: Date.now(),
      })
    })
    return id
  }

  /**
   * Записать конечную точку поездки. Место может быть ещё не заведено вовсе —
   * тогда собираем его из старого поля trip.place, чтобы не потерять название.
   */
  const setDest = (lat: number, lon: number) => {
    update((s) => {
      if (!s.trip.places) s.trip.places = []
      const list = s.trip.places
      let place = list.find((p) => p.main) ?? list[0]
      if (!place) {
        place = { i: 'pl' + Date.now().toString(36), n: s.trip.place || 'Конечная точка' }
        list.push(place)
      }
      place.main = true
      place.lat = lat
      place.lon = lon
      /* Точку переставили — прежний адрес относится к прежнему месту. */
      place.addr = ''
    })
    /* Пункт 6 разбора: «адрес места, точки приезда… везде автоматически
       показывается». Значит и заводиться он должен сам, тем же геокодером,
       что подписывает точки маршрута. Не ответил — место живёт с названием,
       как раньше: неудача чтения ничего не ломает. */
    void guessDestAddr(lat, lon)
  }

  /** Спросить адрес конечной точки и подписать её. Молча не отказываем — см. ниже. */
  const guessDestAddr = async (lat: number, lon: number) => {
    const g = await reversePlace(lat, lon)
    if (!g?.addr) return
    update((s) => {
      const place = s.trip.places?.find((p) => p.main) ?? s.trip.places?.[0]
      if (place) place.addr = g.addr
    })
  }

  /** Открыть карточку точки насовсем (до закрытия или тапа по другой метке). */
  const openCard = (id: string, isFresh = false) => {
    window.clearTimeout(hoverOff.current)
    setHover(null)
    setPinned(id)
    setFresh(isFresh ? id : null)
  }

  const closeCard = () => {
    window.clearTimeout(hoverOff.current)
    setPinned(null)
    setHover(null)
    setFresh(null)
  }

  /** Тап по карте: конечная точка, ждущая точка маршрута — или новая точка. */
  const onAdd = (lat: number, lon: number) => {
    if (placingMain) {
      setPlacingMain(false)
      setDest(lat, lon)
      toast('Конечная точка на карте')
      return
    }
    if (placing) {
      const id = placing
      setPlacing(null)
      patch(id, (p) => {
        p.lat = lat
        p.lon = lon
      })
      openCard(id)
      void guessAddr(id, lat, lon)
      return
    }
    /* Ждали именно новую точку — ожидание кончилось, дальше обычный путь. */
    setPlacingNew(false)
    const id = addPoint(lat, lon, 'Новая точка', '')
    openCard(id, true)
    void guessAddr(id, lat, lon)
  }

  /** Находка строки поиска. Карта наводится всегда, точка ставится по обстановке. */
  const onPick = (hit: PlaceFound) => {
    setLookAt({ lat: hit.lat, lon: hit.lon, at: Date.now() })
    if (!canEdit) return
    if (placingMain) {
      setPlacingMain(false)
      setDest(hit.lat, hit.lon)
      toast('Конечная точка на карте')
      return
    }
    if (placing) {
      const id = placing
      setPlacing(null)
      patch(id, (p) => {
        p.lat = hit.lat
        p.lon = hit.lon
        if (!p.addr) p.addr = hit.addr
      })
      openCard(id)
      return
    }
    setPlacingNew(false)
    const id = addPoint(hit.lat, hit.lon, shortPlaceName(hit.addr), hit.addr)
    openCard(id)
  }

  /** Метку перетащили: координаты новые — значит и адрес новый, спрашиваем заново. */
  const onMove = (id: string, lat: number, lon: number) => {
    patch(id, (p) => {
      p.lat = lat
      p.lon = lon
    })
    void guessAddr(id, lat, lon)
  }

  /** Тап по метке: подсветить точку в ленте рядом и открыть её карточку. */
  const onSelect = (id: string) => {
    focusInList(id)
    openCard(id)
  }

  /** Курсор пришёл на метку или ушёл с неё. */
  const onHover = (id: string | null) => {
    window.clearTimeout(hoverOff.current)
    if (id) {
      setHover(id)
      return
    }
    /* Не закрываем сразу: курсор мог идти с метки на саму карточку. */
    hoverOff.current = window.setTimeout(() => setHover(null), HOVER_OFF_MS)
  }

  /** Координаты, найденные мастером: адрес подставляем, только если своего нет. */
  const setCoords = useCallback(
    (id: string, lat: number, lon: number, addr: string) =>
      patch(id, (p) => {
        p.lat = lat
        p.lon = lon
        if (addr && !p.addr) p.addr = addr
      }),
    [patch],
  )

  const waiting = placing ? S.route.find((p) => p.i === placing) : null
  /** Точки без места на карте — пока они есть, маршрута на карте не видно. */
  const unplaced = S.route.filter((p) => typeof p.lat !== 'number' || typeof p.lon !== 'number')

  const place = mainPlace(S)
  const dest: MapDest | null =
    place && typeof place.lat === 'number' && typeof place.lon === 'number'
      ? { lat: place.lat, lon: place.lon, n: place.n }
      : null

  /* ── нет сети: карта не рисуется, но точки никуда не делись ── */
  if (!online) {
    return (
      <Card className={className}>
        <div className="flex flex-col items-center justify-center gap-3 bg-zebra px-6 py-8 text-center">
          <span className="grid size-16 place-items-center rounded-full bg-surface text-muted">
            <WifiOff size={28} strokeWidth={1.75} aria-hidden />
          </span>
          <div>
            <div className="text-body font-semibold text-ink">Карта показывается в онлайне</div>
            {/* ⛔ Здесь стоял СПИСОК точек с координатами — второе перечисление
                того же маршрута, который лентой показан в «Дороге» и в сеть
                не ходит вовсе. Постулат 3.5: список живёт ровно в одном месте,
                сводка допустима числом. Поэтому здесь число и дорога к списку,
                а не сам список. */}
            <p className="mx-auto mt-1 max-w-72 text-note text-balance text-muted">
              {isOfflineCopy()
                ? 'Это скачанная копия: она ничего не тянет из сети.'
                : 'Сейчас сети нет.'}{' '}
              {points.length > 0
                ? `Точки маршрута никуда не делись: их ${points.length} и они с координатами — в разделе «Дорога».`
                : 'Точки маршрута ставятся на карте — она вернётся вместе со связью.'}
            </p>
          </div>
          {points.length > 0 && (
            <Btn tone="secondary" onClick={() => goSection('road')}>
              Показать маршрут
            </Btn>
          )}
        </div>
      </Card>
    )
  }

  const useGoogle = hasGoogleKey() && !googleDead
  /** Причина отката словами — её показываем под картой вместе с номером сборки. */
  const osmWhy = googleDead ? failWhy(googleDead) : null

  /* ── карточка метки ── */
  const shownId = pinned ?? hover
  const shown = shownId ? points.find((p) => p.i === shownId) : null
  const card: MapCard | null = shown
    ? {
        id: shown.i,
        lat: shown.lat as number,
        lon: shown.lon as number,
        /* Вид подводим только под карточку, открытую насовсем: от наведения
           мышью карта не должна уезжать из-под руки. */
        pan: pinned === shown.i,
        node: (
          <MapPointCard
            key={shown.i}
            point={shown}
            index={points.findIndex((p) => p.i === shown.i) + 1}
            canEdit={canEdit}
            transports={S.transport}
            busy={addrBusy === shown.i}
            fresh={fresh === shown.i}
            onPatch={(f) => patch(shown.i, f)}
            onKeep={() => setFresh(null)}
            onDelete={() => {
              closeCard()
              remove('route', shown.i)
              toast(`«${shown.n}» убрана из маршрута`)
            }}
            onClose={closeCard}
            onPin={() => {
              window.clearTimeout(hoverOff.current)
              setPinned(shown.i)
            }}
            onPointerEnter={() => window.clearTimeout(hoverOff.current)}
            onPointerLeave={() => {
              if (pinned) return
              hoverOff.current = window.setTimeout(() => setHover(null), HOVER_OFF_MS)
            }}
          />
        ),
      }
    : null

  const mapProps = {
    points,
    transports: S.transport,
    centerLat: center.lat,
    centerLon: center.lon,
    canEdit,
    onAdd,
    onMove,
    onSelect,
    onHover,
    dest,
    onMoveDest: setDest,
    focusId: focus?.pointId ?? null,
    focusAt: focus?.at,
    fitAt,
    lookAt,
    card,
    /* На телефоне у карточки высоты нет вовсе — её задаёт сама карта.
       На десктопе карточка растянута по колонке, и карта забирает остаток. */
    className: 'min-h-[280px] flex-1',
  }

  /** Что случится с находкой поиска — человек должен знать это ДО выбора. */
  const searchHint = !canEdit
    ? 'Выберите — покажем на карте'
    : placingMain
      ? 'Выберите — это станет конечной точкой'
      : waiting
        ? `Выберите — сюда встанет «${waiting.n}»`
        : 'Выберите — поставим новую точку маршрута'

  const list = threads(points, S.transport)

  return (
    <>
      <Card className={className}>
        <div className="flex h-full flex-col">
          <MapSearch near={center} onPick={onPick} hint={searchHint} />

          {/* Откат на чужую карту — это отказ, а не мелочь оформления, и говорить
              о нём надо в полный голос (постулат 5). До 05.08.2026 причина стояла
              подписью в самом мелком кегле под картой, и заказчик читал происходящее
              как «опять сделал OpenStreetMap вместо Google» — урок У-76. */}
          {osmWhy && (
            <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line bg-zebra px-3 py-2">
              <TriangleAlert size={20} strokeWidth={1.75} aria-hidden className="shrink-0 text-accent-text" />
              <p className="min-w-0 flex-1 text-note text-ink">
                <span className="font-semibold">Карта Google не открылась.</span>{' '}
                {failFix(googleDead as string)} Пока показываем OpenStreetMap.
              </p>
              <Btn
                tone="secondary"
                className="shrink-0"
                onClick={() => {
                  retryGoogle()
                  setGoogleDead(null)
                  setGoogleTry((n) => n + 1)
                }}
              >
                Попробовать снова
              </Btn>
            </div>
          )}

          {useGoogle ? (
            <GoogleRouteMap
              key={googleTry}
              {...mapProps}
              onFail={(reason) => setGoogleDead(reason)}
            />
          ) : (
            <OsmRouteMap {...mapProps} />
          )}

          <div className="flex min-h-13 shrink-0 flex-wrap items-center gap-2 border-t border-line px-3 py-2">
            <Legend list={list} S={S} />

            {waiting ? (
              <>
                <span className="min-w-0 flex-1 text-note text-ink">
                  Тапните по карте, где стоит «{waiting.n}» — адрес подставится сам
                </span>
                {/* Передумал — из ожидания надо уметь выйти. */}
                <Btn tone="ghost" className="shrink-0" onClick={() => setPlacing(null)}>
                  Отменить
                </Btn>
              </>
            ) : placingMain ? (
              <>
                <span className="min-w-0 flex-1 text-note text-ink">
                  Тапните по карте, где конечная точка поездки
                </span>
                <Btn tone="ghost" className="shrink-0" onClick={() => setPlacingMain(false)}>
                  Отменить
                </Btn>
              </>
            ) : placingNew ? (
              <>
                <span className="min-w-0 flex-1 text-note text-ink">
                  Тапните по карте, где новая точка маршрута
                </span>
                <Btn tone="ghost" className="shrink-0" onClick={() => setPlacingNew(false)}>
                  Отменить
                </Btn>
              </>
            ) : (
              <>
                {canEdit && unplaced.length > 0 ? (
                  /* Пока точки без координат, карта пустая или неполная — и это первое,
                     что надо сказать. Мастер проходит их списком: что нашлось
                     по названию, то подтверждают, остальное ставят пальцем.

                     ⚠️ `basis-64` обязателен, и вот почему (замер 05.08.2026, родня У-81).
                     Полоса переносится (`flex-wrap`), но при `flex-1` без базиса браузер
                     предпочитает СЖАТЬ соседа, а не перенести его: на 390 кнопка
                     съёживалась до 83 × 147, и подпись «Точек без места на карте: 6»
                     вставала в столбик по одной букве — 19 px ширины при 108 высоты.
                     Базис говорит «мне нужно 16rem», и тогда на узкой ширине кнопка
                     честно уезжает на свою строку, а на 1280 стоит в ряд с соседями. */
                  <button
                    type="button"
                    onClick={() => setWizard(true)}
                    className="flex min-h-11 min-w-0 flex-1 basis-64 items-center gap-3 rounded-lg text-left transition-colors hover:bg-zebra/70"
                  >
                    <MapPinned size={20} strokeWidth={1.75} aria-hidden className="shrink-0 text-accent-text" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-body leading-tight font-semibold text-ink">
                        Разметить маршрут
                      </span>
                      <span className="block text-note text-muted">
                        {unplaced.length === S.route.length
                          ? `Ни одна точка ещё не на карте: ${unplaced.length}`
                          : `Точек без места на карте: ${unplaced.length}`}
                      </span>
                    </span>
                    <ChevronRight size={20} strokeWidth={1.75} aria-hidden className="shrink-0 text-muted" />
                  </button>
                ) : (
                  !canEdit && (
                    <p className="min-w-0 flex-1 text-note text-muted">
                      Маршрут ведут владелец и редактор
                    </p>
                  )
                )}
                {canEdit && (
                  <div className="ml-auto flex shrink-0 items-center gap-2">
                    {/* Главное действие карты — завести точку. Оно было доступно
                        только жестом, а жест на телефоне неоткуда узнать (пункт 11
                        разбора). Кнопка заливкой, потому что это «продолжить»,
                        а «Конечная» рядом — действие пореже и стоит контуром. */}
                    <Btn
                      aria-label="Добавить точку маршрута тапом по карте"
                      onClick={() => {
                        setPlacing(null)
                        setPlacingMain(false)
                        setPlacingNew(true)
                        toast('Тапните по карте, где новая точка')
                      }}
                    >
                      <MapPinPlus size={16} strokeWidth={1.75} aria-hidden />
                      Точка
                    </Btn>
                    <Btn
                      tone="secondary"
                      aria-label="Указать конечную точку поездки тапом по карте"
                      onClick={() => {
                        setPlacing(null)
                        setPlacingNew(false)
                        setPlacingMain(true)
                        toast('Тапните по карте, где конечная точка')
                      }}
                    >
                      <Tent size={16} strokeWidth={1.75} aria-hidden />
                      Конечная
                    </Btn>
                  </div>
                )}
              </>
            )}

            {/* Заказчик: «пиши под картой всегда, какая карта нарисована и какая
                сборка». Строка не пропадает никогда, а не только при откате —
                иначе следующий спор про карту снова требует сессию переписки
                вместо одного снимка экрана (уроки У-30, У-31, У-32). */}
            <p className="w-full text-micro leading-snug text-muted">
              {useGoogle ? 'Карта Google' : 'Карта OpenStreetMap'}
              {osmWhy ? ` · ${osmWhy}` : ''} · сборка {__BUILD__}
            </p>
          </div>
        </div>
      </Card>

      {/* Разовый мастер: точки без места — списком, с находками геокодера. */}
      <RouteMarkSheet
        open={wizard}
        onOpenChange={(v) => {
          setWizard(v)
          /* Закрыли — показываем весь маршрут целиком: после разметки он вылезает
             далеко за прежний вид (Петербург и Вуокса — 130 км друг от друга). */
          if (!v) setFitAt(Date.now())
        }}
        route={S.route}
        near={center}
        onSet={setCoords}
        onPlaceByHand={(id) => {
          setWizard(false)
          setPlacing(id)
          toast('Тапните по карте, где это')
        }}
      />
    </>
  )
}

/**
 * Легенда: какой тон чей. Нужна ровно тогда, когда ниток больше одной, — иначе
 * объяснять нечего и лишняя строка только шумит.
 *
 * Различие не только цветом (WCAG 1.4.1): у каждой нитки свой рисунок линии
 * и свой значок участка, и в легенде показаны все три признака сразу.
 */
function Legend({ list, S }: { list: Thread[]; S: State }) {
  const own = list.filter((t) => t.tr && t.points.length > 0)
  if (own.length === 0) return null
  const common = list[0].points.length > 0 ? [list[0]] : []

  return (
    <ul className="flex w-full flex-wrap items-center gap-x-3 gap-y-1">
      {[...common, ...own].map((t) => {
        const tr = t.tr ? S.transport.find((x) => x.i === t.tr) : null
        const Icon = t.leg ? LEG_ICONS[t.leg] : null
        return (
          <li key={t.tr || 'common'} className="flex items-center gap-1.5 text-micro text-muted">
            <svg width="22" height="6" viewBox="0 0 22 6" aria-hidden className="shrink-0">
              <line
                x1="0"
                y1="3"
                x2="22"
                y2="3"
                stroke={t.tone.fill}
                strokeWidth="3"
                strokeDasharray={leafletDash(t.tone.dash)}
                strokeLinecap={t.tone.dash === 'dot' ? 'round' : 'butt'}
              />
            </svg>
            {Icon && <Icon size={16} strokeWidth={1.75} aria-hidden className="shrink-0" />}
            <span className="truncate">{tr ? tr.n : 'Общие точки'}</span>
          </li>
        )
      })}
    </ul>
  )
}

/** Общая рамка блока: та же, что у остальных карточек «Поездки». */
function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <section
      className={cn(
        'overflow-hidden rounded-xl border border-line bg-surface shadow-sm',
        className,
      )}
    >
      {children}
    </section>
  )
}
