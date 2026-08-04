import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import type { RoutePoint, State } from '@/lib/types'
import type { Perms } from '@/lib/perm'
import { remove, touch, update } from '@/store'
import { onListFocus, type ListFocus } from '@/lib/mapfocus'
import { RouteTiming } from '@/components/road/RouteTiming'
import { RoutePointSheet } from '@/components/road/RoutePointSheet'
import { TextSheet } from '@/components/flops'
import { plural } from '@/format'
import { TripMap } from './TripMap'

/**
 * Блок «Маршрут»: сам маршрут и есть — карта и лента точек с таймингом.
 *
 * Живёт в разделе «Дорога» (заказчик 04.08.2026: «в „Дороге“ должен жить сам
 * маршрут и расчёт, а не ссылка на них»).
 *
 * ⚠️ Вкладок «Списком / На карте» здесь больше нет, и это главное изменение.
 * Пока вкладку не нажали, карта не монтировалась вовсе — заказчик открывал
 * «Дорогу» и говорил «карты нет вообще», и был прав. Теперь карта и лента видны
 * сразу: на десктопе рядом, на телефоне карта сверху, лента под ней.
 *
 * Связь двусторонняя и идёт через lib/mapfocus.ts: тап по строке в ленте наводит
 * карту, тап по метке подсвечивает строку в ленте. Никаких повторов просьбы
 * «когда карта наконец появится» больше не нужно — она есть всегда.
 *
 * Правка точки живёт в двух местах, и оба на месте, а не в шторке: карточка
 * метки прямо на карте (название, время, описание, техника) и строка в ленте.
 * Шторка RoutePointSheet осталась только как карточка точки из ленты — она
 * показывает поля, которых на карте нет (метка этапа, способ передвижения).
 */

interface Props {
  S: State
  perms: Perms
}

export function RouteBoard({ S, perms }: Props) {
  const canEdit = perms.isEditor()
  const [sheet, setSheet] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  /** какую точку подсветить в ленте: по её метке тапнули на карте */
  const [active, setActive] = useState<ListFocus | null>(null)

  useEffect(() => onListFocus(setActive), [])

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
        mode: 'road', tr: '', leg: 0, legSrc: '', ord: (s.route.length + 1) * 10, ua: Date.now(),
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
          <h3 className="text-head font-semibold text-ink">Маршрут</h3>
          {/* Словесное описание маршрута из документа (trip.route). Показать его
              больше негде, а потерять нельзя. */}
          {S.trip.route ? (
            <p className="mt-0.5 text-note leading-snug text-muted">{S.trip.route}</p>
          ) : null}
          <p className="tnum mt-0.5 text-note text-muted">
            {S.route.length} {plural(S.route.length, 'точка', 'точки', 'точек')}
            {onMap > 0 ? ` · ${onMap} на карте` : ' · на карте ни одной'}
          </p>
        </div>

        {/* Карта и лента рядом. На телефоне колонка одна: карта сверху, лента под
            ней — так человек сначала видит, куда едем, а потом когда. */}
        <div className="grid gap-3 lg:grid-cols-2 lg:items-start">
          {/* Высота задана числом, а не «сколько получится»: карта без высоты
              схлопывается в полоску, а карточке метки нужно место над меткой. */}
          <TripMap S={S} perms={perms} className="h-[460px] lg:h-[600px]" />

          <section className="overflow-hidden rounded-xl border border-line bg-surface shadow-sm lg:max-h-[600px] lg:overflow-y-auto">
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
          </section>
        </div>
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
