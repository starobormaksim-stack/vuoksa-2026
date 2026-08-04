import { useEffect, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import type { RoutePoint, State } from '@/lib/types'
import type { Perms } from '@/lib/perm'
import { remove, touch, update } from '@/store'
import { onListFocus, type ListFocus } from '@/lib/mapfocus'
import { RouteTiming } from '@/components/road/RouteTiming'
import { RoutePointSheet } from '@/components/road/RoutePointSheet'
import { TextSheet } from '@/components/flops'
import { TripMap } from './TripMap'

/**
 * Единый блок «куда и когда едем»: обложка, лента точек и карта — рядом.
 *
 * Раньше карта жила в «Поездке», а лента тайминга — в «Дороге», и заказчик
 * 04.08.2026 сказал прямо: «тайминг и маршрут вместе совпадали… вот это вот,
 * которое у тебя есть, оно должно быть рядом с картой». Разъезд был не только
 * зрительный: чтобы посмотреть, где точка, приходилось прокручивать страницу
 * через два раздела.
 *
 * Блок поселился в «Поездке», а не в «Дороге», по трём причинам:
 *   он начинается с обложки поездки, а она живёт здесь;
 *   заказчик уже просил «сначала заглавная фотография, за ней сразу карта»;
 *   «Дорога» осталась тем, чем и должна быть, — деньгами на дорогу.
 * В «Дороге» на месте бывшей ленты — короткая карточка со ссылкой сюда,
 * чтобы лента не оказалась в двух местах сразу и никто её не потерял.
 *
 * Раскладка: на десктопе слева обложка и под ней лента, справа карта во всю
 * высоту; на телефоне сверху обложка, под ней карта, под картой лента — карта
 * должна быть видна раньше списка, иначе тап по строке некуда наводить.
 *
 * Правка точки живёт здесь, а не в карте и не в ленте: и лента, и карта только
 * показывают, а правит одна шторка на двоих (правило «список показывает —
 * шторка редактирует»).
 */

interface Props {
  S: State
  perms: Perms
  /** обложка поездки — левый верхний угол блока */
  cover: ReactNode
}

export function RouteBoard({ S, perms, cover }: Props) {
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
        mode: 'road', leg: 0, legSrc: '', ord: (s.route.length + 1) * 10, ua: Date.now(),
      })
    })
    toast('Точка в маршруте')
    setSheet(id)
  }

  const current = sheet ? S.route.find((p) => p.i === sheet) : null

  return (
    <>
      <div className="grid gap-4 lg:grid-cols-2 lg:gap-6">
        <div className="lg:col-start-1 lg:row-start-1">{cover}</div>

        <TripMap S={S} perms={perms} className="lg:col-start-2 lg:row-span-2 lg:row-start-1" />

        <section className="flex flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-sm lg:col-start-1 lg:row-start-2 lg:max-h-[420px]">
          <h3 className="shrink-0 border-b border-line px-4 py-3 text-[17px] font-[650] text-ink">
            Тайминг
          </h3>
          {/* Прокрутка только на десктопе: на телефоне лента должна прокручиваться
              вместе со страницей, а не отдельным окошком внутри неё. */}
          <div className="min-h-0 flex-1 lg:overflow-y-auto">
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
          </div>
        </section>
      </div>

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
