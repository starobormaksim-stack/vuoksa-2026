import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import type { RoutePoint, State } from '@/lib/types'
import type { Perms } from '@/lib/perm'
import { touch, update } from '@/store'
import { onListFocus, type ListFocus } from '@/lib/mapfocus'
import { RouteTiming } from '@/components/road/RouteTiming'
import { RouteStrip } from '@/components/road/RouteStrip'
import { TextSheet, useIsDesktop } from '@/components/flops'
import { plural } from '@/format'

/**
 * Блок «Маршрут» в «Дороге»: лента точек со временем.
 *
 * ⛔ Карты здесь БОЛЬШЕ НЕТ, и вернуть её сюда нельзя. Заказчик 05.08.2026:
 * «карта наверху сразу же, с точками показана» — она переехала в раздел
 * «Поездка», вторым блоком рядом с обложкой (`trip/TripSection.tsx`).
 * Второй экземпляр карты на той же странице означал бы два места правки одних
 * и тех же точек и вторую живую карту Google — ровно то дублирование, которое
 * запрещает урок У-53. В «Дороге» остались лента точек и расчёт дороги.
 *
 * Связь ленты с уехавшей наверх картой цела и идёт через lib/mapfocus.ts: тап
 * по строке наводит карту (и подводит к ней страницу — `scrollToSection('trip')`),
 * тап по метке подсвечивает строку здесь. Страницу при этом не рвёт: у ленты
 * своя прокрутка, `scrollIntoView` находит её, а не окно.
 *
 * Правка точки живёт в двух местах, и оба на месте, а не в шторке: карточка
 * метки прямо на карте (название, время, описание, техника) и строка в ленте.
 * Шторки точки (`RoutePointSheet`) больше нет вовсе: метка этапа, чем
 * добираемся, расстояние от прошлой точки и координаты правятся в раскрытой
 * полоске ленты на телефоне и в панели под строкой матрицы на широком экране —
 * один общий блок `road/RoutePointSetup.tsx` (06.08.2026, постулат 2).
 */

interface Props {
  S: State
  perms: Perms
}

export function RouteBoard({ S, perms }: Props) {
  const canEdit = perms.isEditor()
  const desktop = useIsDesktop()
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
    /* Новую точку подводим к глазам и раскрываем — тем же путём, каким это
       делает тап по метке на карте. Прежде на её месте открывалась шторка. */
    setActive({ pointId: id, at: Date.now() })
  }

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

        {/* ⚠️ Потолок высоты с прокруткой ВНУТРИ ленты снимать нельзя, и после
            переезда карты наверх он стал ещё важнее. На нём держится наведение
            с карты: тап по метке зовёт `scrollIntoView` у строки, и без своего
            контейнера прокрутки тот находит ближайшего прокручиваемого предка —
            страницу. Карту, по которой человек только что попал пальцем, уволокло
            бы из вида, а она теперь на другом конце страницы.
            Договор записан в `road/RouteTiming.tsx`: «карта рядом должна
            остаться на месте». */}
        {/* ⛔ `overflow-clip`, а не `overflow-hidden`: `hidden` делает блок
            прокручиваемым, и липкая шапка ленты («Точка · Пройдено · имена»)
            прилипала бы к верху ЭТОГО блока, то есть никуда (замер 05.08.2026:
            уезжала на y = −237). На десктопе своя прокрутка по высоте остаётся —
            там шапка честно липнет к верху блока. */}
        {/* ⛔ Две плотности одной логики, а не два продукта — ровно как
            в «Сборах» и «Закупке». На широком экране остаётся матрица
            «точка × люди»: там видно, кто едет каким этапом, не раскрывая
            ни одной строки. На телефоне колонка точки была 13 rem, и название
            вставало в ней по два-три слова, — там лента. Модель, права
            и правка общие, рисуется ровно один вид. */}
        <section className="overflow-clip rounded-xl border border-line bg-surface shadow-sm lg:max-h-[600px] lg:overflow-y-auto">
          {desktop ? (
            <RouteTiming
              points={S.route}
              people={S.people}
              perms={perms}
              canEdit={canEdit}
              onToggle={(id) =>
                patch(id, (p) => {
                  p.done = !p.done
                })
              }
              onAdd={() => setAdding(true)}
              activeId={active?.pointId ?? null}
              activeAt={active?.at}
            />
          ) : (
            <RouteStrip
              points={S.route}
              people={S.people}
              perms={perms}
              canEdit={canEdit}
              onToggle={(id) =>
                patch(id, (p) => {
                  p.done = !p.done
                })
              }
              onAdd={() => setAdding(true)}
              activeId={active?.pointId ?? null}
              activeAt={active?.at}
            />
          )}
        </section>
      </section>

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
