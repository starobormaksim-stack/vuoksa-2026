import { useEffect, useRef, useState } from 'react'
import { List, MapPin } from 'lucide-react'
import { toast } from 'sonner'
import type { RoutePoint, State } from '@/lib/types'
import type { Perms } from '@/lib/perm'
import { remove, touch, update } from '@/store'
import { askMap, onListFocus, onMapRequest, type ListFocus, type MapRequest } from '@/lib/mapfocus'
import { RouteTiming } from '@/components/road/RouteTiming'
import { RoutePointSheet } from '@/components/road/RoutePointSheet'
import { TextSheet } from '@/components/flops'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { plural } from '@/format'
import { TripMap } from './TripMap'

/**
 * Блок «Маршрут»: сам маршрут и есть — лента точек с таймингом и карта.
 *
 * Живёт в разделе «Дорога» (заказчик 04.08.2026: «в „Дороге“ должен жить сам
 * маршрут и расчёт, а не ссылка на них»). Раньше блок стоял в «Поездке», а в
 * «Дороге» на его месте была карточка-указатель «Маршрут и тайминг наверху» —
 * её заказчик и назвал идиотизмом. Обложка поездки осталась в «Поездке», одна.
 *
 * Две вкладки, а не две колонки: на телефоне карта и лента одна под другой
 * занимали два экрана, и до расчёта человек не доезжал.
 *   «Списком» — лента точек во всю ширину: время, название, заметка, расстояние;
 *   «На карте» — карта с полосой действий под ней (полосу рисует сам TripMap).
 *
 * Тап по строке «на карте» в ленте сам открывает вкладку с картой и повторяет
 * просьбу, когда карта уже смонтирована: карта на скрытой вкладке не живёт
 * и просьбу, посланную до её появления, услышать не может.
 *
 * Правка точки живёт здесь, а не в карте и не в ленте: и лента, и карта только
 * показывают, а правит одна шторка на двоих (правило «список показывает —
 * шторка редактирует»).
 */

interface Props {
  S: State
  perms: Perms
}

type Tab = 'list' | 'map'

export function RouteBoard({ S, perms }: Props) {
  const canEdit = perms.isEditor()
  const [tab, setTab] = useState<Tab>('list')
  const [sheet, setSheet] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  /** какую точку подсветить в ленте: по её метке тапнули на карте */
  const [active, setActive] = useState<ListFocus | null>(null)
  /** просьба к карте, которую та ещё не слышала: карта была на скрытой вкладке */
  const pending = useRef<MapRequest | null>(null)
  /** это наш собственный повтор просьбы — второй раз вкладку переключать не надо */
  const replaying = useRef(false)

  useEffect(() => onListFocus(setActive), [])

  useEffect(
    () =>
      onMapRequest((r) => {
        if (replaying.current) return
        pending.current = r
        setTab('map')
      }),
    [],
  )

  /* Карта появилась — повторяем просьбу, которая пришла, пока её не было. */
  useEffect(() => {
    if (tab !== 'map') return
    const r = pending.current
    if (!r) return
    pending.current = null
    const t = window.setTimeout(() => {
      replaying.current = true
      askMap(r.pointId, r.mode, false)
      replaying.current = false
    }, 0)
    return () => window.clearTimeout(t)
  }, [tab])

  const patch = (id: string, f: (p: RoutePoint) => void) =>
    update((s) => {
      const p = s.route.find((x) => x.i === id)
      if (p) {
        f(p)
        touch(p)
      }
    })

  const addPoint = (n: string) => {
    const id = 'rp' + Date.now().toString(36)
    update((s) => {
      s.route.push({
        i: id, n, time: '', c: '', done: false, addr: '', lab: '', labT: '',
        mode: 'road', leg: 0, legSrc: '', ord: (s.route.length + 1) * 10, ua: Date.now(),
      })
    })
    toast('Точка в маршруте')
    setSheet(id)
  }

  const current = sheet ? S.route.find((p) => p.i === sheet) : null
  const onMap = S.route.filter((p) => typeof p.lat === 'number' && typeof p.lon === 'number').length

  return (
    <>
      <section className="flex flex-col gap-3">
        <div>
          <h3 className="text-[17px] font-[650] text-ink">Маршрут</h3>
          {/* Словесное описание маршрута из документа (trip.route). Показать его
              больше негде, а потерять нельзя. */}
          {S.trip.route ? (
            <p className="mt-0.5 text-[14px] leading-snug text-muted">{S.trip.route}</p>
          ) : null}
          <p className="tnum mt-0.5 text-[13px] text-muted">
            {S.route.length} {plural(S.route.length, 'точка', 'точки', 'точек')}
            {onMap > 0 ? ` · ${onMap} на карте` : ' · на карте ни одной'}
          </p>
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="gap-3">
          <TabsList className="h-12! w-full justify-start gap-1 rounded-2xl border border-line bg-surface p-1">
            <TabsTrigger
              value="list"
              className="h-10 flex-none gap-2 rounded-xl px-3 text-[15px] font-semibold whitespace-nowrap text-muted data-active:bg-accent-soft data-active:text-ink dark:data-active:border-transparent dark:data-active:bg-accent-soft"
            >
              <List size={18} strokeWidth={1.5} aria-hidden />
              Списком
            </TabsTrigger>
            <TabsTrigger
              value="map"
              className="h-10 flex-none gap-2 rounded-xl px-3 text-[15px] font-semibold whitespace-nowrap text-muted data-active:bg-accent-soft data-active:text-ink dark:data-active:border-transparent dark:data-active:bg-accent-soft"
            >
              <MapPin size={18} strokeWidth={1.5} aria-hidden />
              На карте
            </TabsTrigger>
          </TabsList>

          <TabsContent value="list">
            <section className="overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">
              {tab === 'list' && (
                <RouteTiming
                  points={S.route}
                  canEdit={canEdit}
                  onToggle={(id) =>
                    patch(id, (p) => {
                      p.done = !p.done
                    })
                  }
                  onOpen={setSheet}
                  onAdd={() => setAdding(true)}
                  activeId={active?.pointId ?? null}
                  activeAt={active?.at}
                />
              )}
            </section>
          </TabsContent>

          <TabsContent value="map">
            {/* Карта поднимается только на своей вкладке: на скрытой ей нечего
                показывать, а тайлы она тянет всерьёз. */}
            {tab === 'map' && <TripMap S={S} perms={perms} />}
          </TabsContent>
        </Tabs>
      </section>

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

      <TextSheet
        open={adding}
        onOpenChange={(v) => !v && setAdding(false)}
        title="Что за точка"
        subtitle="Место, где мы окажемся по пути"
        value=""
        placeholder="Например, Приозерск: закупка"
        onDone={(v) => {
          if (v) addPoint(v)
          setAdding(false)
        }}
      />
    </>
  )
}
