import { Fragment, useEffect, useRef, useState, type RefObject } from 'react'
import { Check, MapPin, MapPinPlus, Route, Settings2, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import type { Person, RoutePoint } from '@/lib/types'
import type { Perms } from '@/lib/perm'
import {
  AddRow, DataCell, DataHead, DataRow, DataTable, EmptyState, InlineText,
  PersonHead, RowAction, RowActions,
} from '@/components/flops'
import { askMap, type MapMode } from '@/lib/mapfocus'
import { remove, touch, update } from '@/store'
import { scrollToSection } from '@/sections'
import { cn } from '@/lib/utils'
import { coordLabel, pointMeta } from './roadx'
import { RoutePointCoords, RoutePointSetup } from './RoutePointSetup'

/**
 * Попросить карту и подвести к ней страницу.
 *
 * Своя обёртка нужна из-за переезда: askMap(…, true) прокручивает к «Поездке»,
 * а маршрут теперь живёт в «Дороге». Прокрутку берём на себя, самой просьбе
 * говорим scroll:false — иначе страница улетела бы к обложке поездки.
 */
function askHere(pointId: string, mode: MapMode): void {
  scrollToSection('road')
  askMap(pointId, mode, false)
}

/**
 * Маршрут — та же матрица, что у «Сборов» и «Закупки» (урок У-54, требование
 * заказчика 05.08.2026: «слева столбец вещей, справа столбцы с участниками…
 * в зависимости от специфики раздела отображение локально немного изменено,
 * но чтобы единообразие было»).
 *
 * Слева закреплена точка: время, название, описание, адрес и «на карте».
 * Справа — «этап пройден» и столбец на каждого человека: **кто едет этой
 * точкой**. Это прямой ответ заказчика 05.08.2026 на вопрос, хватает ли
 * привязки точки к технике (`RoutePoint.tr`): «нужна: кто именно едет этой
 * точкой». Поле `RoutePoint.o` заведено ровно той же формы, что `Gear.o`.
 *
 * ⛔ Прежней ленты `<ol>` с ниткой между кружками здесь больше нет: она была
 * пятой формой списка в сервисе, где заказчик просил одну.
 *
 * Правится всё прямо в строке (постулат 2). То, что выбирается из списка —
 * метка этапа, чем добираемся, расстояние от прошлой точки и координаты, —
 * раскрывается кнопкой ⚙ панелью ПОД строкой и толкает таблицу вниз, ровно как
 * настройка позиции в «Расчёте дороги» (`RoadCalc.Matrix`). Шторки точки
 * (`RoutePointSheet`) больше нет: заказчик 06.08.2026 — «всё, что связано
 * с настройками по конкретным позициям, выпадающим списком».
 *
 * Матрица и карта — одна вещь, а не две, и связь у них двусторонняя через
 * lib/mapfocus.ts: строка адреса наводит карту, а тап по метке на карте
 * подсвечивает здесь нужную строку (activeId).
 *
 * Участнику матрица показывается целиком, но без кнопок правки: их просто нет
 * в разметке (постулат 5). Отметить СЕБЯ участник может — это его собственная
 * отметка, ровно как в «Сборах». Строка «показать на карте» остаётся всем:
 * смотреть можно каждому, это не правка.
 */
interface Props {
  points: RoutePoint[]
  people: Person[]
  perms: Perms
  canEdit: boolean
  /** отметить этап пройденным */
  onToggle: (id: string) => void
  onAdd: () => void
  /** какую точку подсветить: по её метке только что тапнули на карте */
  activeId?: string | null
  /** метка времени просьбы: по одной метке можно тапнуть дважды подряд */
  activeAt?: number
}

/**
 * Подсвеченная точка может оказаться за краем списка — подводим её к глазам.
 *
 * ⛔ `scrollIntoView` здесь нельзя, хотя он и стоял раньше: он прокручивает
 * ВСЕХ прокручиваемых предков, а не только список, и `block:'nearest'` этого
 * не отменяет. Пока список стоял справа от карты, разницы не было — они были
 * на одном уровне. Теперь карта уехала в «Поездку», и наведение из карты
 * утаскивало страницу на 351 px: карта, по которой человек только что попал
 * пальцем, уезжала вверх из вида.
 *
 * Поэтому двигаем ТОЛЬКО собственную прокрутку списка, руками. Страница
 * не трогается вовсе — замер: `scrollY` до и после совпадает.
 *
 * ⚠️ Вынесено в хук ради `road/RouteStrip.tsx`: лента на телефоне — тот же
 * список тех же точек, и наведение с карты обязано работать в ней так же.
 * Копия этой механики второй раз разъехалась бы с первой.
 */
export function useRouteFocus(
  box: RefObject<HTMLDivElement | null>,
  activeId?: string | null,
  activeAt?: number,
): void {
  useEffect(() => {
    if (!activeId) return
    const wrap = box.current
    const el = wrap?.querySelector<HTMLElement>(`[data-hit="${CSS.escape(activeId)}"]`)
    if (!wrap || !el) return
    /* Своя прокрутка может быть не у самого списка, а у обёртки-карточки.
       ⛔ Страница своей прокруткой ленты НЕ считается. На телефоне лента стоит
       в блоке `overflow-clip`, прокручиваемых предков у неё нет вовсе, и подъём
       доходил до самого `<html>`: тап по метке на карте уносил страницу к ленте
       «Дороги» (замер 06.08.2026 на 390: `scrollY` 734 → 18217), а карта вместе
       с карточкой метки уезжала из вида. Это тот же договор, ради которого
       здесь нет `scrollIntoView` (У-109): карта рядом остаётся на месте. */
    const страница: Element | null = document.scrollingElement ?? document.documentElement
    let pane: HTMLElement | null = wrap
    while (
      pane &&
      pane !== страница &&
      pane !== document.body &&
      pane.scrollHeight <= pane.clientHeight + 1
    ) {
      pane = pane.parentElement
    }
    if (!pane || pane === страница || pane === document.body) return
    /* ⛔ `offsetTop` здесь считать нельзя: у строки он отмеряется от ближайшего
       позиционированного предка (обёртки полоски), а у самой области прокрутки —
       от страницы. Разность двух разных начал отсчёта всегда выходила
       отрицательной, `scrollTop` зажимался в 0, и лента вместо подводки точки
       прыгала к своему началу. Считаем честно: положение строки относительно
       видимой части области плюс то, на сколько область уже прокручена. */
    const top = el.getBoundingClientRect().top - pane.getBoundingClientRect().top + pane.scrollTop
    const bottom = top + el.offsetHeight
    if (top < pane.scrollTop) pane.scrollTop = top
    else if (bottom > pane.scrollTop + pane.clientHeight) pane.scrollTop = bottom - pane.clientHeight
  }, [box, activeId, activeAt])
}

export function RouteTiming({
  points, people, perms, canEdit, onToggle, onAdd, activeId, activeAt,
}: Props) {
  const box = useRef<HTMLDivElement | null>(null)
  /** у какой точки раскрыта панель настройки; открыта всегда одна */
  const [setupAt, setSetupAt] = useState('')
  useRouteFocus(box, activeId, activeAt)

  /* Тап по метке на карте и «Добавить точку» обещают одно и то же: подвести
     точку к глазам И раскрыть её. Подводит `useRouteFocus`, раскрывает вот это.
     Без него на широком экране человек получал только подсветку строки, а поля
     новой точки — метку этапа, чем добираемся, координаты — приходилось искать
     кнопкой ⚙ самому. В ленте на телефоне (`RouteStrip`) раскрытие по `activeId`
     стояло с самого начала — здесь оно теперь такое же. */
  useEffect(() => {
    if (activeId) setSetupAt(activeId)
  }, [activeId, activeAt])

  const patch = (id: string, f: (p: RoutePoint) => void) =>
    update((s) => {
      const p = s.route.find((x) => x.i === id)
      if (p) {
        f(p)
        touch(p)
      }
    })

  const drop = (p: RoutePoint) => {
    remove('route', p.i)
    toast(`«${p.n || 'Точка'}» убрана`)
  }

  if (points.length === 0) {
    return (
      <EmptyState
        icon={Route}
        title="Маршрута пока нет"
        text="Место, где мы окажемся по пути"
        action={canEdit ? { label: 'Добавить точку', onClick: onAdd } : undefined}
      />
    )
  }

  const cols = `minmax(13rem,1fr) 4.5rem repeat(${people.length}, 4.5rem) 6rem`
  /* Сумма минимумов: 13 + 4,5 + люди × 4,5 + 6. Зачем — см. `minW` в DataTable. */
  const minW = `${13 + 4.5 + people.length * 4.5 + 6}rem`

  return (
    <div ref={box}>
      {/* ⛔ `inScroller`: на широком экране лента стоит внутри блока со своей
          прокруткой (`map/RouteBoard.tsx`), и шапка обязана липнуть к верху
          ЭТОГО блока. Без поправки она висела на 64 px ниже его края, а над ней
          проползали строки — заказчик 06.08.2026 прочитал это как «не прилипший».
          Саму прокрутку блока трогать нельзя: на ней держится наведение с карты
          (`scrollIntoView` ниже по файлу). */}
      <DataTable
        cols={cols}
        minW={minW}
        inScroller
        label="Маршрут: точки, кто едет и что пройдено"
      >
        <DataHead>
          <DataCell head sticky align="left">
            Точка
          </DataCell>
          <DataCell head>Пройдено</DataCell>
          {people.map((p) => (
            <DataCell
              key={p.id}
              head
              /* колонка читателя слегка подсвечена: свою человек ищет первой */
              className={cn('px-1 py-2', p.id === perms.me && 'bg-accent-soft')}
            >
              <PersonHead
                name={p.name}
                photo={p.photo}
                ini={p.ini}
                mine={p.id === perms.me}
                size={40}
              />
            </DataCell>
          ))}
          <DataCell head className="px-1" />
        </DataHead>

        {points.map((p, idx) => {
          const meta = pointMeta(p)
          const bg = idx % 2 === 1 ? 'zebra' : 'surface'
          /* Панель открывается и участнику: он читает те же поля документа,
             а органы внутри сами встают в режим чтения (`can={canEdit}`). */
          const setup = setupAt === p.i
          return (
            <Fragment key={p.i}>
              <DataRow
                zebra={idx % 2 === 1}
                fresh={p.i === activeId}
                dataHit={p.i}
              >
                <DataCell sticky bg={bg} align="left">
                  <span className="flex w-full items-baseline gap-2">
                    <span className="w-14 shrink-0">
                      <InlineText
                        value={p.time}
                        onSave={(v) => patch(p.i, (x) => { x.time = v })}
                        can={canEdit}
                        label="Время"
                        placeholder="··:··"
                        className="tnum text-note font-bold text-accent-text"
                      />
                    </span>
                    <span className="min-w-0 flex-1">
                      <InlineText
                        value={p.n}
                        onSave={(v) => patch(p.i, (x) => { x.n = v })}
                        can={canEdit}
                        required
                        label="Название точки"
                        placeholder="Например, Приозерск: закупка"
                        className={cn(
                          'text-body leading-snug font-semibold text-ink',
                          p.done && 'line-through',
                        )}
                      />
                    </span>
                  </span>

                  {canEdit || p.c ? (
                    <InlineText
                      value={p.c}
                      onSave={(v) => patch(p.i, (x) => { x.c = v })}
                      can={canEdit}
                      multiline
                      label="Описание точки"
                      placeholder="Что здесь важно не забыть"
                      className="text-note leading-snug text-muted"
                    />
                  ) : null}

                  {meta ? (
                    <span className="tnum mt-1 block text-micro leading-snug font-medium text-muted">
                      {meta}
                    </span>
                  ) : null}

                  <PlaceRow
                    point={p}
                    canEdit={canEdit}
                    onAddr={(v) => patch(p.i, (x) => { x.addr = v })}
                  />
                </DataCell>

                <DataCell>
                  {canEdit ? (
                    <button
                      type="button"
                      onClick={() => onToggle(p.i)}
                      aria-label={`${p.n}: ${p.done ? 'этап пройден' : 'этап впереди'}. Отметить`}
                      aria-pressed={p.done}
                      className="grid size-11 shrink-0 place-items-center rounded-xl transition-colors hover:bg-zebra"
                    >
                      <Dot done={p.done} />
                    </button>
                  ) : (
                    <span className="grid size-11 shrink-0 place-items-center">
                      <Dot done={p.done} />
                    </span>
                  )}
                </DataCell>

                {people.map((who) => (
                  <DataCell key={who.id} align="center" className="px-1">
                    <Rider
                      on={!!p.o?.[who.id]}
                      /* Отметиться может и участник без права правки точки:
                         это его собственная отметка, за других он не отмечает. */
                      can={perms.canMark(who.id)}
                      label={`${who.name} едет точкой «${p.n || 'без названия'}»`}
                      onSet={(v) =>
                        patch(p.i, (x) => {
                          const o = { ...(x.o || {}) }
                          if (v) o[who.id] = 1
                          else delete o[who.id]
                          x.o = o
                        })
                      }
                    />
                  </DataCell>
                ))}

                <DataCell className="px-1">
                  <RowActions>
                    {/* Смотреть поля точки может каждый — это не правка,
                        а просмотр документа (постулат 4). Кнопки действий
                        ниже остаются по правам. */}
                    <RowAction
                      icon={Settings2}
                      label={`${p.n || 'без названия'}: метка, чем добираемся, расстояние, координаты`}
                      onClick={() => setSetupAt(setupAt === p.i ? '' : p.i)}
                    />
                    {canEdit ? (
                      <RowAction
                        icon={Trash2}
                        tone="danger"
                        label={`Убрать точку «${p.n}»`}
                        onClick={() => drop(p)}
                      />
                    ) : null}
                  </RowActions>
                </DataCell>
              </DataRow>

              {/* Панель настройки — строка-вставка во всю ширину сетки. Оверлея
                  нет: таблица просто едет вниз, как раскрытая полоска в ленте
                  (образец — `RoadCalc.Matrix`). */}
              {setup ? (
                <DataRow zebra>
                  <DataCell align="left" className="col-span-full px-4 py-3">
                    {/* ⚠️ `w-full` обязателен: у ячейки `align="left"` стоит
                        `items-start`, и без явной ширины полки настройки сжались
                        бы по содержимому вместо того, чтобы занять строку.
                        Потолок ширины — чтобы список выбора не растягивался
                        на весь экран. */}
                    <div className="w-full max-w-3xl">
                      <RoutePointSetup
                        item={p}
                        canEdit={canEdit}
                        onPatch={(f) => patch(p.i, f)}
                      />
                      <RoutePointCoords
                        item={p}
                        canEdit={canEdit}
                        onPatch={(f) => patch(p.i, f)}
                      />
                    </div>
                  </DataCell>
                </DataRow>
              ) : null}
            </Fragment>
          )
        })}
      </DataTable>

      {canEdit && <AddRow label="Добавить точку" onClick={onAdd} />}
    </div>
  )
}

/** Кружок этапа: 32 px внутри цели касания 44 px (правило 8). */
export function Dot({ done }: { done: boolean }) {
  return (
    <span
      className={cn(
        'grid size-8 place-items-center rounded-full border-2 bg-surface',
        done ? 'border-accent bg-accent text-on-accent' : 'border-line-strong',
      )}
      aria-hidden
    >
      {done && <Check size={18} strokeWidth={1.75} />}
    </span>
  )
}

/**
 * Едет ли человек этой точкой. Пусто — точка общая, поэтому пустая ячейка
 * не кричит: тире. Одно нажатие ставит отметку, второе снимает.
 * Права нет — рисуется только состояние, без кнопки (постулат 6).
 */
export function Rider({
  on, can, label, onSet,
}: {
  on: boolean
  can: boolean
  label: string
  onSet: (v: boolean) => void
}) {
  const mark = (
    <span
      className={cn(
        'grid size-6 place-items-center rounded-full border-[1.5px]',
        on ? 'border-accent bg-accent text-on-accent' : 'border-line-strong',
      )}
    >
      {on && <Check size={16} strokeWidth={1.75} aria-hidden />}
    </span>
  )
  if (!can) {
    return on ? (
      <span role="img" aria-label={label} className="grid size-11 place-items-center">
        {mark}
      </span>
    ) : (
      <span className="text-note text-muted">&#8212;</span>
    )
  }
  return (
    <button
      type="button"
      onClick={() => onSet(!on)}
      aria-pressed={on}
      aria-label={`${label}. Отметить`}
      className="grid size-11 place-items-center rounded-md transition-colors hover:bg-zebra/70 active:scale-[0.98]"
    >
      {on ? mark : <span className="text-note text-muted">&#8212;</span>}
    </button>
  )
}

/**
 * Строка места: адрес правится словами прямо здесь, а кнопка справа наводит
 * на точку карту. Координат нет и правка разрешена — вместо кнопки предложение
 * поставить точку на карте.
 */
export function PlaceRow({
  point, canEdit, onAddr,
}: {
  point: RoutePoint
  canEdit: boolean
  onAddr: (v: string) => void
}) {
  const coord = coordLabel(point)
  if (!canEdit && !point.addr && !coord) return null

  return (
    /* ⚠️ `flex-wrap` и полная строка под адрес на узком экране. Колонка точки
       шириной 13 rem, и когда адрес делил её с кнопкой «на карте», ему
       оставалось около 100 px: длинный адрес вставал столбиком по одному слову
       («проспект / Медиков, / округ / Аптекарский…»). Заказчик 06.08.2026 —
       «выравнивание хреново сделано во всех таблицах, всё в разнобой».
       Кнопка уезжает строкой ниже, адрес получает колонку целиком.
       На широком экране всё как было: там места хватает обоим. */
    <span className="mt-1 flex w-full flex-wrap items-center gap-x-2 gap-y-1">
      <MapPin size={16} strokeWidth={1.75} aria-hidden className="shrink-0 text-accent-text" />
      <span className="min-w-0 flex-1 basis-[calc(100%-1.5rem)] lg:basis-auto">
        <InlineText
          value={point.addr}
          onSave={onAddr}
          can={canEdit}
          label="Адрес"
          placeholder={coord || 'Улица, дом или ориентир'}
          className="tnum text-note text-muted"
        />
      </span>
      {coord ? (
        <button
          type="button"
          onClick={() => askHere(point.i, 'show')}
          aria-label={`${point.n}: показать на карте`}
          className="min-h-11 shrink-0 rounded-md px-2 text-note font-semibold text-accent-text transition-colors hover:bg-zebra"
        >
          на карте
        </button>
      ) : canEdit ? (
        <button
          type="button"
          onClick={() => askHere(point.i, 'place')}
          className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-md px-2 text-note font-semibold text-accent-text transition-colors hover:bg-zebra"
        >
          <MapPinPlus size={16} strokeWidth={1.75} aria-hidden />
          поставить на карте
        </button>
      ) : null}
    </span>
  )
}
