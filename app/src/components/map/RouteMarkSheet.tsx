import { useCallback, useEffect, useMemo, useState } from 'react'
import { Check, Crosshair, LoaderCircle, MapPin, SearchX, Trash2 } from 'lucide-react'
import type { RoutePoint } from '@/lib/types'
import { forwardPlace, placeQueries, type PlaceFound } from '@/lib/geocode'
import { coordLabel } from '@/components/road/roadx'
import { Btn, InlineText, ResponsiveSheet, RowAction, RowActions } from '@/components/flops'

/**
 * Разовый мастер «Разметить маршрут» (заказчик 04.08.2026: «те точки маршрута,
 * которые у нас есть, должны быть уже отмечены… он уже должен показываться на карте»).
 *
 * У точек боевого маршрута координат нет вовсе, а на карту попадают только точки
 * с координатами — поэтому карта пустая. Мастер проходит по точкам без места,
 * спрашивает у геокодера, где это, и показывает найденное СПИСКОМ, не подставляя
 * ничего молча: половину названий геокодер найдёт («Приозерск», «Санкт-Петербург,
 * Суздальский пр., 95»), а «Первый костёр и обедо-ужин» не найдёт никогда — такие
 * точки ставятся пальцем по карте, и для этого у каждой строки своя кнопка.
 *
 * Список точек замораживается при открытии: строка не должна исчезать из-под пальца
 * ровно в тот момент, когда человек её разметил, — вместо этого она отмечается галочкой.
 */

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  /** весь маршрут по порядку — по нему считаются номера точек */
  route: RoutePoint[]
  /** куда смотрит поездка: около этого места и ищем */
  near: { lat: number; lon: number }
  /** поставить точке координаты (адрес подставится, если своего у точки нет) */
  onSet: (id: string, lat: number, lon: number, addr: string) => void
  /** «поставлю пальцем»: шторка закрывается, следующий тап по карте отдаст координаты */
  onPlaceByHand: (id: string) => void
  /** есть ли право правки: без него ни переименования, ни удаления не рисуется */
  canEdit: boolean
  /** переименовать точку прямо здесь: на карте её нет, карточки метки тоже */
  onRename: (id: string, n: string) => void
  /** убрать точку из маршрута совсем */
  onDrop: (id: string) => void
}

/** Что известно про точку прямо сейчас. */
type Hit =
  | { state: 'busy' }
  | { state: 'found'; at: PlaceFound }
  | { state: 'none' }

/** Снимок точки на момент открытия: имя потом может измениться, запрос — нет. */
interface Ask {
  id: string
  name: string
  addr: string
}

export function RouteMarkSheet({
  open, onOpenChange, route, near, onSet, onPlaceByHand, canEdit, onRename, onDrop,
}: Props) {
  const [queue, setQueue] = useState<Ask[]>([])
  const [hits, setHits] = useState<Record<string, Hit>>({})

  const nearLat = near.lat
  const nearLon = near.lon

  /* ── замораживаем список при открытии ── */
  useEffect(() => {
    if (!open) return
    setQueue(
      route
        .filter((p) => typeof p.lat !== 'number' || typeof p.lon !== 'number')
        .map((p) => ({ id: p.i, name: p.n, addr: p.addr })),
    )
    setHits({})
    /* route намеренно не в зависимостях: список берётся один раз, на открытии. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  /* ── спрашиваем геокодер по одной точке за раз ──
     Подряд, а не разом: у бесплатного Nominatim порог — один запрос в секунду,
     и залп из восьми он просто отбросит. Восемь точек проходятся за пару секунд. */
  useEffect(() => {
    if (!open || queue.length === 0) return
    let dead = false
    setHits(Object.fromEntries(queue.map((q) => [q.id, { state: 'busy' as const }])))
    void (async () => {
      for (const q of queue) {
        if (dead) return
        let found: PlaceFound | null = null
        for (const query of placeQueries(q.name, q.addr)) {
          found = await forwardPlace(query, { lat: nearLat, lon: nearLon })
          if (found) break
        }
        if (dead) return
        setHits((h) => ({ ...h, [q.id]: found ? { state: 'found', at: found } : { state: 'none' } }))
      }
    })()
    return () => {
      dead = true
    }
  }, [open, queue, nearLat, nearLon])

  /** Точки, которые нашлись и ещё не поставлены, — их можно принять разом. */
  const ready = useMemo(
    () =>
      queue.filter((q) => {
        const h = hits[q.id]
        const p = route.find((x) => x.i === q.id)
        return h?.state === 'found' && p && typeof p.lat !== 'number'
      }),
    [queue, hits, route],
  )

  const accept = useCallback(
    (id: string) => {
      const h = hits[id]
      if (h?.state !== 'found') return
      onSet(id, h.at.lat, h.at.lon, h.at.addr)
    },
    [hits, onSet],
  )

  const left = queue.filter((q) => {
    const p = route.find((x) => x.i === q.id)
    return p && typeof p.lat !== 'number'
  }).length

  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Разметить маршрут"
      subtitle={
        left > 0
          ? `Осталось поставить на карту: ${left} из ${queue.length}`
          : 'Все точки на карте'
      }
      footer={
        <Btn className="w-full" onClick={() => onOpenChange(false)}>
          Готово
        </Btn>
      }
    >
      <p className="pb-3 text-body text-balance text-muted">
        Где смогли — нашли по названию. Проверьте адрес и поставьте точку на карту.
        Стоянку и костёр по названию не найти: их укажите пальцем. А если написано
        «примерно» — место угадано грубо, потом сдвиньте метку на карте пальцем.
        Время, описание, техника и «кто едет» правятся в карточке точки — она
        открывается тапом по метке, когда точка встала на карту.
      </p>

      {ready.length > 1 && (
        <Btn
          tone="secondary"
          className="mb-2 w-full"
          onClick={() => ready.forEach((q) => accept(q.id))}
        >
          Поставить все найденные: {ready.length}
        </Btn>
      )}

      <ul>
        {queue.map((q) => {
          const p = route.find((x) => x.i === q.id)
          if (!p) return null
          const idx = route.findIndex((x) => x.i === q.id) + 1
          const placed = typeof p.lat === 'number' && typeof p.lon === 'number'
          const h = hits[q.id]
          return (
            <li key={q.id} className="border-t border-line py-3 first:border-t-0">
              <div className="flex min-h-11 items-start gap-3">
                <span
                  className={
                    'tnum mt-0.5 grid size-7 shrink-0 place-items-center rounded-full text-note font-bold ' +
                    (placed ? 'bg-ink text-bg' : 'bg-accent-fill text-on-accent')
                  }
                >
                  {idx}
                </span>
                <div className="min-w-0 flex-1">
                  {/* Название правится здесь же. Пока точка не на карте, карточки
                      метки у неё нет вовсе, а другого места правки после ухода
                      ленты «Дороги» не осталось: без этого поля точка стала бы
                      неуправляемой (постулат 4, постулат 1). */}
                  <InlineText
                    value={p.n}
                    onSave={(v) => onRename(q.id, v)}
                    can={canEdit}
                    required
                    label="Название точки"
                    placeholder="Например, Приозерск: закупка"
                    className="text-body leading-snug font-semibold text-ink"
                  />
                  <div className="mt-0.5 flex items-start gap-1.5 text-note break-words text-muted">
                    <Status placed={placed} point={p} hit={h} />
                  </div>
                  {/* Время и описание точки показываем, но не правим: пока метки
                      на карте нет, их место — карточка метки, и заводить второй
                      орган правки на то же поле нельзя (У-53). Молчать о них тоже
                      нельзя — иначе человек решит, что данные пропали (постулат 5). */}
                  {!placed && (p.time || p.c) ? (
                    <p className="mt-0.5 text-note leading-snug text-muted">
                      {[p.time, p.c].filter(Boolean).join(' · ')}
                    </p>
                  ) : null}
                </div>
                {placed ? (
                  <Check size={18} strokeWidth={1.75} aria-hidden className="mt-1 shrink-0 text-accent-text" />
                ) : canEdit ? (
                  <RowActions>
                    <RowAction
                      icon={Trash2}
                      tone="danger"
                      label={`Убрать точку «${p.n || 'без названия'}»`}
                      onClick={() => onDrop(q.id)}
                    />
                  </RowActions>
                ) : null}
              </div>

              {/* Обе кнопки полной высоты (44): это главные действия мастера,
                  а не мелкие пояснения, и попадать по ним надо с первого раза. */}
              {!placed && (
                <div className="mt-2 flex flex-wrap gap-2 pl-10">
                  {h?.state === 'found' && (
                    <Btn onClick={() => accept(q.id)}>Поставить сюда</Btn>
                  )}
                  <Btn tone="secondary" onClick={() => onPlaceByHand(q.id)}>
                    <Crosshair size={18} strokeWidth={1.75} aria-hidden />
                    Указать на карте
                  </Btn>
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </ResponsiveSheet>
  )
}

/** Вторая строка точки: что с ней сейчас — ищем, нашли, не нашли, уже на карте. */
function Status({ placed, point, hit }: { placed: boolean; point: RoutePoint; hit?: Hit }) {
  if (placed) {
    return (
      <>
        <MapPin size={16} strokeWidth={1.75} aria-hidden className="mt-0.5 shrink-0 text-accent-text" />
        <span className="tnum">На карте: {coordLabel(point)}</span>
      </>
    )
  }
  if (!hit || hit.state === 'busy') {
    return (
      <>
        <LoaderCircle size={16} strokeWidth={1.75} aria-hidden className="mt-0.5 shrink-0 animate-spin" />
        <span>Ищем на карте…</span>
      </>
    )
  }
  if (hit.state === 'none') {
    return (
      <>
        <SearchX size={16} strokeWidth={1.75} aria-hidden className="mt-0.5 shrink-0" />
        <span>По названию не нашлось — укажите пальцем</span>
      </>
    )
  }
  return (
    <>
      <MapPin size={16} strokeWidth={1.75} aria-hidden className="mt-0.5 shrink-0" />
      <span>
        {hit.at.precise ? '' : 'Примерно: '}
        {hit.at.addr}
      </span>
    </>
  )
}
