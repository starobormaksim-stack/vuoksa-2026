import { useCallback, useEffect, useState } from 'react'
import { ChevronRight, Map as MapIcon, MapPin, MapPinned, Tent, WifiOff } from 'lucide-react'
import { toast } from 'sonner'
import type { RoutePoint, State, TripPlace } from '@/lib/types'
import type { Perms } from '@/lib/perm'
import { update, touch, remove } from '@/store'
import { hasGoogleKey, onGoogleAuthFail } from '@/lib/gmaps'
import { reversePlace, shortPlaceName, type PlaceFound } from '@/lib/geocode'
import { focusInList, onMapRequest, type MapRequest } from '@/lib/mapfocus'
import { coordLabel, mapCenter, mapPoints } from '@/components/road/roadx'
import { Btn, TextSheet } from '@/components/flops'
import { cn } from '@/lib/utils'
import { GoogleRouteMap, type MapDest } from './GoogleRouteMap'
import { OsmRouteMap } from './OsmRouteMap'
import { RouteMarkSheet } from './RouteMarkSheet'
import { MapSearch } from './MapSearch'

/**
 * Карта поездки — правая половина единого блока «Маршрут» в «Поездке»
 * (см. RouteBoard.tsx: слева обложка и лента точек, справа карта).
 *
 * Карта на всю поездку одна. Раньше она пряталась во вкладке «Маршрут» в самом низу
 * «Дороги», и заказчик её попросту не находил.
 *
 * На карте два вида меток, и это разные вещи:
 *   точки маршрута — остановки по пути, кружки с номерами;
 *   конечная точка — цель поездки (trip.places, main), подписанная плашка.
 * Заказчик 04.08.2026: «указывается Приозерское озеро Вуокса, и оно прям на карте
 * тоже указывается. Нажимаешь на карте на эту точку — указать конечную точку».
 *
 * Поставить место можно тремя способами, и все три ничего не делают молча:
 * тапом по карте, находкой в строке поиска над картой, мастером «Разметить маршрут».
 */

interface Props {
  S: State
  perms: Perms
  /** место карточки в раскладке единого блока (см. RouteBoard.tsx) */
  className?: string
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
  /** после постановки: предложенное название, которое человек может исправить */
  const [rename, setRename] = useState<{ id: string; name: string } | null>(null)
  /** Google не поднялся — дальше показываем OpenStreetMap и не дёргаем его больше */
  const [googleDead, setGoogleDead] = useState(false)
  /** открыт мастер «Разметить маршрут» */
  const [wizard, setWizard] = useState(false)
  /** метка «подгони вид под точки заново»: после разметки маршрут вылезает за экран */
  const [fitAt, setFitAt] = useState(0)
  /** куда навести карту по находке из строки поиска */
  const [lookAt, setLookAt] = useState<{ lat: number; lon: number; at: number } | null>(null)

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
  useEffect(() => onGoogleAuthFail(() => setGoogleDead(true)), [])

  /* ── просьбы из ленты точек ── */
  useEffect(
    () =>
      onMapRequest((r) => {
        setFocus(r)
        setPlacing(r.mode === 'place' ? r.pointId : null)
        if (r.mode === 'place') setPlacingMain(false)
      }),
    [],
  )

  /** Подставить адрес и предложить название по координатам. */
  const guessPlace = useCallback(
    async (id: string, lat: number, lon: number) => {
      const g = await reversePlace(lat, lon)
      if (!g) return
      patch(id, (p) => {
        p.addr = g.addr || p.addr
      })
      /* Название не подменяем молча: у точки может быть осмысленное имя
         («Приозерск: закупка»), а геокодер вернёт улицу. Предлагаем и спрашиваем. */
      if (g.name) setRename({ id, name: g.name })
    },
    [patch],
  )

  /** Завести новую точку маршрута. Возвращает её id — для тоста «Отменить». */
  const addPoint = (lat: number, lon: number, n: string, addr: string) => {
    const id = 'rp' + Date.now().toString(36)
    update((s) => {
      s.route.push({
        i: id, n, time: '', c: '', done: false, lat, lon, addr,
        lab: '', labT: '', mode: 'road', leg: 0, legSrc: '',
        ord: (s.route.length + 1) * 10, ua: Date.now(),
      })
    })
    return id
  }

  /**
   * Записать конечную точку поездки. Место может быть ещё не заведено вовсе —
   * тогда собираем его из старого поля trip.place, чтобы не потерять название.
   */
  const setDest = (lat: number, lon: number) =>
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
    })

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
      toast('Точка на карте')
      void guessPlace(id, lat, lon)
      return
    }
    const id = addPoint(lat, lon, 'Новая точка', '')
    toast('Точка поставлена', {
      action: { label: 'Отменить', onClick: () => remove('route', id) },
    })
    void guessPlace(id, lat, lon)
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
      toast('Точка на карте')
      return
    }
    const id = addPoint(hit.lat, hit.lon, shortPlaceName(hit.addr), hit.addr)
    toast('Точка поставлена', {
      action: { label: 'Отменить', onClick: () => remove('route', id) },
    })
  }

  const onMove = (id: string, lat: number, lon: number) => {
    patch(id, (p) => {
      p.lat = lat
      p.lon = lon
    })
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
            <WifiOff size={28} strokeWidth={1.5} aria-hidden />
          </span>
          <div>
            <div className="text-base font-[650] text-ink">Карта показывается в онлайне</div>
            <p className="mx-auto mt-1 max-w-72 text-sm text-balance text-muted">
              {isOfflineCopy()
                ? 'Это скачанная копия: она ничего не тянет из сети. Точки маршрута никуда не делись — вот их координаты.'
                : 'Сейчас сети нет. Точки маршрута никуда не делись — вот их координаты.'}
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
      </Card>
    )
  }

  const useGoogle = hasGoogleKey() && !googleDead
  const mapProps = {
    points,
    centerLat: center.lat,
    centerLon: center.lon,
    canEdit,
    onAdd,
    onMove,
    /* Тап по метке подсвечивает точку в ленте слева — правит её лента, не карта. */
    onSelect: focusInList,
    dest,
    onMoveDest: setDest,
    focusId: focus?.pointId ?? null,
    focusAt: focus?.at,
    fitAt,
    lookAt,
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

  return (
    <>
      <Card className={className}>
        <div className="flex h-full flex-col">
          <MapSearch near={center} onPick={onPick} hint={searchHint} />

          {useGoogle ? (
            <GoogleRouteMap {...mapProps} onFail={() => setGoogleDead(true)} />
          ) : (
            <OsmRouteMap {...mapProps} />
          )}

          <div className="flex min-h-13 shrink-0 flex-wrap items-center gap-2 border-t border-line px-3 py-2">
            {waiting ? (
              <>
                <MapPin size={16} strokeWidth={1.5} aria-hidden className="shrink-0 text-accent-text" />
                <span className="min-w-0 flex-1 text-[13px] text-ink">
                  Тапните по карте, где стоит «{waiting.n}» — название подставится само
                </span>
                {/* Передумал — из ожидания надо уметь выйти. */}
                <Btn tone="ghost" className="shrink-0" onClick={() => setPlacing(null)}>
                  Отменить
                </Btn>
              </>
            ) : placingMain ? (
              <>
                <Tent size={16} strokeWidth={1.5} aria-hidden className="shrink-0 text-accent-text" />
                <span className="min-w-0 flex-1 text-[13px] text-ink">
                  Тапните по карте, где конечная точка поездки
                </span>
                <Btn tone="ghost" className="shrink-0" onClick={() => setPlacingMain(false)}>
                  Отменить
                </Btn>
              </>
            ) : (
              <>
                {canEdit && unplaced.length > 0 ? (
                  /* Пока точки без координат, карта пустая или неполная — и это первое,
                     что надо сказать. Мастер проходит их списком: что нашлось
                     по названию, то подтверждают, остальное ставят пальцем. */
                  <button
                    type="button"
                    onClick={() => setWizard(true)}
                    className="flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-xl text-left transition-colors hover:bg-zebra"
                  >
                    <MapPinned size={20} strokeWidth={1.5} aria-hidden className="shrink-0 text-accent-text" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] leading-tight font-semibold text-ink">
                        Разметить маршрут
                      </span>
                      <span className="block text-[13px] text-muted">
                        {unplaced.length === S.route.length
                          ? `Ни одна точка ещё не на карте: ${unplaced.length}`
                          : `Точек без места на карте: ${unplaced.length}`}
                      </span>
                    </span>
                    <ChevronRight size={18} strokeWidth={1.5} aria-hidden className="shrink-0 text-muted" />
                  </button>
                ) : (
                  <p className="flex min-w-0 flex-1 items-center gap-2 text-[13px] text-muted">
                    <MapIcon size={16} strokeWidth={1.5} aria-hidden className="shrink-0" />
                    <span>
                      {canEdit
                        ? 'Тап по карте ставит точку, метку можно перетащить'
                        : 'Маршрут ведут владелец и редактор'}
                    </span>
                  </p>
                )}
                {canEdit && (
                  <Btn
                    tone="secondary"
                    className="shrink-0"
                    aria-label="Указать конечную точку поездки тапом по карте"
                    onClick={() => {
                      setPlacing(null)
                      setPlacingMain(true)
                      toast('Тапните по карте, где конечная точка')
                    }}
                  >
                    <Tent size={16} strokeWidth={1.5} aria-hidden />
                    Конечная
                  </Btn>
                )}
              </>
            )}
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

      {/* Название, подставленное по координатам: сразу видно и сразу правится. */}
      <TextSheet
        open={rename !== null}
        onOpenChange={(v) => !v && setRename(null)}
        title="Как называется точка"
        subtitle="Подставлено по координатам — поправьте, если надо"
        value={rename?.name ?? ''}
        placeholder="Например, Приозерск: закупка"
        onDone={(v) => {
          if (rename && v) {
            patch(rename.id, (p) => {
              p.n = v
            })
          }
          setRename(null)
        }}
      />
    </>
  )
}

/** Общая рамка блока: та же, что у остальных карточек «Поездки». */
function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <section
      className={cn(
        'overflow-hidden rounded-2xl border border-line bg-surface shadow-sm',
        className,
      )}
    >
      {children}
    </section>
  )
}
