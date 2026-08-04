import { useCallback, useEffect, useState } from 'react'
import { Map as MapIcon, MapPin, WifiOff } from 'lucide-react'
import { toast } from 'sonner'
import type { RoutePoint, State } from '@/lib/types'
import type { Perms } from '@/lib/perm'
import { update, touch, remove } from '@/store'
import { hasGoogleKey, onGoogleAuthFail } from '@/lib/gmaps'
import { reversePlace } from '@/lib/geocode'
import { onMapRequest, type MapRequest } from '@/lib/mapfocus'
import { coordLabel, mapCenter, mapPoints } from '@/components/road/roadx'
import { RoutePointSheet } from '@/components/road/RoutePointSheet'
import { TextSheet } from '@/components/flops'
import { GoogleRouteMap } from './GoogleRouteMap'
import { OsmRouteMap } from './OsmRouteMap'

/**
 * Карта поездки — второй блок «Поездки», сразу за заглавной фотографией
 * (заказчик 04.08.2026: «сначала заглавная фотография, за ней сразу должна следовать карта»).
 *
 * Карта на всю поездку одна. Раньше она пряталась во вкладке «Маршрут» в самом низу
 * «Дороги», и заказчик её попросту не находил. Теперь она наверху, а «Тайминг» в «Дороге»
 * умеет к ней обращаться: тап по адресу точки прокручивает страницу сюда и наводит карту
 * (см. lib/mapfocus.ts).
 *
 * Точка без координат ставится тапом по карте, после чего название и адрес подставляются
 * сами обратным геокодированием, и человеку сразу предлагается их поправить.
 */

interface Props {
  S: State
  perms: Perms
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

export function TripMap({ S, perms }: Props) {
  const live = useOnline()
  const online = live && !isOfflineCopy()
  const canEdit = perms.isEditor()
  const points = mapPoints(S)
  const center = mapCenter(S)

  const [sheet, setSheet] = useState<string | null>(null)
  const [focus, setFocus] = useState<MapRequest | null>(null)
  /** какой точке ждём координаты: следующий тап по карте отдаст их именно ей */
  const [placing, setPlacing] = useState<string | null>(null)
  /** после постановки: предложенное название, которое человек может исправить */
  const [rename, setRename] = useState<{ id: string; name: string } | null>(null)
  /** Google не поднялся — дальше показываем OpenStreetMap и не дёргаем его больше */
  const [googleDead, setGoogleDead] = useState(false)

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

  /* ── просьбы из «Тайминга» ── */
  useEffect(
    () =>
      onMapRequest((r) => {
        setFocus(r)
        setPlacing(r.mode === 'place' ? r.pointId : null)
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

  /** Тап по карте: либо ставим координаты ждущей точке, либо заводим новую. */
  const onAdd = (lat: number, lon: number) => {
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
    const id = 'rp' + Date.now().toString(36)
    update((s) => {
      s.route.push({
        i: id, n: 'Новая точка', time: '', c: '', done: false, lat, lon, addr: '',
        lab: '', labT: '', mode: 'road', leg: 0, legSrc: '',
        ord: (s.route.length + 1) * 10, ua: Date.now(),
      })
    })
    toast('Точка поставлена', {
      action: { label: 'Отменить', onClick: () => remove('route', id) },
    })
    void guessPlace(id, lat, lon)
  }

  const onMove = (id: string, lat: number, lon: number) => {
    patch(id, (p) => {
      p.lat = lat
      p.lon = lon
    })
  }

  const current = sheet ? S.route.find((p) => p.i === sheet) : null
  const waiting = placing ? S.route.find((p) => p.i === placing) : null

  /* ── нет сети: карта не рисуется, но точки никуда не делись ── */
  if (!online) {
    return (
      <Card>
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
    onOpen: setSheet,
    focusId: focus?.pointId ?? null,
    focusAt: focus?.at,
    className: 'min-h-0 flex-1',
  }

  return (
    <>
      <Card>
        <div className="flex h-[320px] flex-col lg:h-full lg:min-h-[420px]">
          {useGoogle ? (
            <GoogleRouteMap {...mapProps} onFail={() => setGoogleDead(true)} />
          ) : (
            <OsmRouteMap {...mapProps} />
          )}

          <p className="flex min-h-11 shrink-0 items-center gap-2 border-t border-line px-4 py-2 text-[13px] text-muted">
            {waiting ? (
              <>
                <MapPin size={16} strokeWidth={1.5} aria-hidden className="shrink-0 text-accent-text" />
                <span className="text-ink">
                  Тапните по карте, где стоит «{waiting.n}» — название подставится само
                </span>
              </>
            ) : (
              <>
                <MapIcon size={16} strokeWidth={1.5} aria-hidden className="shrink-0" />
                <span>
                  {canEdit
                    ? 'Тап по карте ставит точку, маркер можно перетащить'
                    : 'Маршрут ведут владелец и редактор'}
                </span>
              </>
            )}
          </p>
        </div>
      </Card>

      {current && (
        <RoutePointSheet
          item={current}
          index={S.route.findIndex((p) => p.i === current.i) + 1}
          canEdit={canEdit}
          canDelete={canEdit}
          onPatch={(f) => patch(current.i, f)}
          onDelete={() => {
            remove('route', current.i)
            toast(`«${current.n}» убрана`)
          }}
          onClose={() => setSheet(null)}
        />
      )}

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
function Card({ children }: { children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">
      {children}
    </section>
  )
}
