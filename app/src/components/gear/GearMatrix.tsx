import { useEffect, useState, type RefObject } from 'react'
import { ListPlus, Plus, Trash2, TriangleAlert } from 'lucide-react'
import type { Gear, Person } from '@/lib/types'
import type { Perms } from '@/lib/perm'
import {
  cantOf, cycleMark, markName, markOf, setCantWhy, setUnitOf, statusOf, totalQty, unitOf,
} from '@/lib/gearx'
import {
  DataCell, DataHead, DataRow, DataTable, InlineNum, InlineText, PersonHead,
  ProductLink, RowAction, RowActions, StatusDial, numText, type TableScroll,
} from '@/components/flops'
import { safeUrl, saveNameOrUrl } from '@/lib/producturl'
import { applyCard, clearGrab, grabProduct } from '@/lib/product'
import { NBSP } from '@/format'
import { cn } from '@/lib/utils'

/**
 * Таблица «вещь × люди» — единственный вид «Сборов» на всех ширинах.
 * Эталон — лист «Снаряжение» таблицы заказчика: строка на вещь, колонка на каждого,
 * «Всего» справа, названия закреплены слева.
 *
 * Всё правится на месте (постулат 2, решение заказчика 04.08.2026: «мне не нужен
 * поп-ап, в котором всё написано; это прямо вот здесь, в этой таблице уже должно
 * быть»). Поэтому здесь нет ни карточки позиции, ни мастера добавления:
 *
 *   название и примечание — тап по тексту в первой колонке;
 *   количество           — тап по числу, дальше счётчик прямо в ячейке;
 *   состояние            — кружок в ячейке;
 *   единица измерения    — тап по слову под «Всего»;
 *   удалить и вставить   — действия в самой строке.
 *
 * ⛔ Долгого нажатия здесь больше нет. Именно оно ломало то, на что жаловался
 * заказчик: «могу плюсиком добавить, а удалить его уже не могу, и отметить тоже
 * не могу». Задержка в полсекунды съедала обычный тап по ячейке (палец на телефоне
 * держится дольше, чем кажется), и вместо смены состояния открывалась шторка
 * количества, а снять назначение можно было только в ней. Теперь снятие —
 * видимое действие: счётчик доводится до нуля.
 */

interface Props {
  /** позиции одного раздела в порядке ord */
  rows: Gear[]
  people: Person[]
  perms: Perms
  /** название раздела — для подписи таблицы скринридеру */
  label: string
  sync: RefObject<TableScroll>
  /** частые единицы измерения из справочника S.units[] */
  units: string[]
  /** только что заведённая строка: название открыто в правке, единица ждёт выбора */
  fresh: string
  onFreshDone: () => void
  patch: (id: string, f: (g: Gear) => void) => void
  onDelete: (g: Gear) => void
  /** завести строку перед строкой с этим номером */
  onInsert: (before: number) => void
}

export function GearMatrix({
  rows, people, perms, label, sync, units, fresh, onFreshDone, patch, onDelete, onInsert,
}: Props) {
  /** ячейка с раскрытым счётчиком — «вещь:человек»; открыта всегда одна */
  const [qtyAt, setQtyAt] = useState('')

  /**
   * Прочитать карточку товара со страницы и положить снятое в вещь.
   * ⛔ Что именно кладётся, решает `applyCard` (`lib/product.ts`) — правило про
   * цену живёт в одном месте на оба раздела.
   */
  const grabItem = (id: string, url: string) =>
    void grabProduct(id, url, (card) => patch(id, (x) => applyCard(x, card)))
  /** строка, у которой выбирается единица измерения */
  const [unitAt, setUnitAt] = useState('')

  /* Новая строка сразу спрашивает единицу: «пара» у носков и «шт.» у топора —
     решение, которое заказчик принимает в момент, когда заводит вещь. */
  useEffect(() => {
    if (fresh) setUnitAt(fresh)
  }, [fresh])

  /* Счётчик закрывается нажатием мимо ячейки. Перед закрытием снимаем фокус:
     если человек набирал число с клавиатуры, поле должно успеть его отдать,
     иначе набранное молча пропадёт. */
  useEffect(() => {
    if (!qtyAt) return
    const off = (e: PointerEvent) => {
      const t = e.target as HTMLElement | null
      if (t && t.closest('[data-qty]')) return
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
      setQtyAt('')
    }
    document.addEventListener('pointerdown', off, true)
    return () => document.removeEventListener('pointerdown', off, true)
  }, [qtyAt])

  /* Первая колонка ТЯНЕТСЯ, а не стоит по своей ширине: заказчик 05.08.2026 —
     «с правой стороны до хера пустого пространства, я не понимаю, зачем ты его
     оставляешь». Пустота была ровно от того, что сетка вставала по содержимому
     (936 px при блоке 1205), а остаток отдавался распорке. Теперь остаток
     достаётся названиям вещей, и хвостовой распорки не нужно вовсе. */
  const cols =
    `minmax(var(--ncol),1fr) repeat(${people.length}, var(--pcol)) var(--tcol) var(--acol)`

  return (
    <DataTable
      cols={cols}
      label={`Кто что везёт: ${label}`}
      sync={sync}
      /* Ширина колонок задана переменными, чтобы шапка и строки считали её одинаково.
         Прокрутку вбок внутри блока держит `w-max min-w-full` самого DataTable:
         на узком экране сетка шире блока и листается, на широком — растягивается
         до его ширины. ⛔ `min-w-max` сюда возвращать нельзя: он снимает растяжение
         и возвращает пустое поле справа (замер: сетка 936 при блоке 1205). */
      className={cn(
        '[--acol:6.5rem] [--ncol:10rem] [--pcol:6rem] [--tcol:4rem]',
        'lg:[--ncol:20rem] lg:[--pcol:7rem] lg:[--tcol:5rem]',
      )}
    >
      <DataHead>
        <DataCell sticky head align="left">
          Вещь
        </DataCell>
        {people.map((p) => (
          <DataCell
            key={p.id}
            head
            /* колонка читателя слегка подсвечена: свою человек ищет первой */
            className={cn(p.id === perms.me && 'bg-accent-soft')}
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
        <DataCell head>Всего</DataCell>
        <DataCell head />
      </DataHead>

      {rows.map((g, idx) => {
        const alarm = people.some((p) => !!cantOf(g, p.id))
        const bg = alarm ? 'alarm' : idx % 2 === 1 ? 'zebra' : 'surface'
        const canEdit = perms.canEditItem(g)
        const isFresh = fresh === g.i
        return (
          <DataRow key={g.i} zebra={idx % 2 === 1} alarm={alarm} fresh={isFresh} dataHit={g.i}>
              <DataCell sticky bg={bg} align="left">
                <InlineText
                  value={g.n}
                  /* Вставили в название адрес — он уезжает в `url`, а названием
                     остаётся имя сайта, пока человек не напишет своё (заказчик
                     05.08.2026: «либо вписываю название товара, либо вставляю
                     ссылку»). Обычный текст ведёт себя ровно как раньше. */
                  onSave={(v) => {
                    patch(g.i, (x) => { saveNameOrUrl(x, v) })
                    /* Вставили адрес — тут же спрашиваем карточку у посредника.
                       У вещи цены нет вовсе, поэтому приедут только название
                       и фотография (`applyCard` в lib/product.ts). */
                    const u = safeUrl(v)
                    if (u) grabItem(g.i, u)
                  }}
                  can={canEdit}
                  label="Название вещи"
                  placeholder="Без названия"
                  autoEdit={isFresh}
                  onEditEnd={onFreshDone}
                  className="text-body font-semibold text-ink"
                />

                {g.url ? (
                  <ProductLink
                    url={g.url}
                    img={g.img}
                    itemId={g.i}
                    canEdit={canEdit}
                    onRefresh={() => grabItem(g.i, g.url as string)}
                    onClear={() => {
                      clearGrab(g.i)
                      patch(g.i, (x) => {
                        x.url = ''
                        x.img = ''
                        x.pat = 0
                      })
                    }}
                  />
                ) : null}
                <InlineText
                  value={g.c}
                  onSave={(v) => patch(g.i, (x) => { x.c = v })}
                  can={canEdit}
                  label="Примечание к вещи"
                  placeholder="примечание"
                  multiline
                  className="text-note text-muted"
                />

                {people.map((p) => {
                  const cant = cantOf(g, p.id)
                  if (!cant) return null
                  return (
                    <span key={p.id} className="mt-1 flex w-full min-w-0 items-start gap-1.5">
                      <TriangleAlert
                        size={16}
                        strokeWidth={1.75}
                        className="mt-0.5 shrink-0 text-accent-text"
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-micro font-semibold text-accent-text">
                          {p.name} не может взять
                        </span>
                        <InlineText
                          value={cant.why || ''}
                          onSave={(v) => patch(g.i, (x) => { setCantWhy(x, p.id, v) })}
                          can={perms.canMark(p.id)}
                          label="Почему не может взять"
                          placeholder="причина не записана"
                          multiline
                          className="text-micro text-muted"
                        />
                      </span>
                    </span>
                  )
                })}

                {unitAt === g.i && canEdit && (
                  <UnitPick
                    units={units}
                    value={unitOf(g)}
                    onPick={(u) => {
                      patch(g.i, (x) => { setUnitOf(x, u) })
                      setUnitAt('')
                    }}
                  />
                )}
              </DataCell>

              {people.map((p) => (
                <Cell
                  key={p.id}
                  g={g}
                  p={p}
                  perms={perms}
                  unit={unitOf(g)}
                  open={qtyAt === g.i + ':' + p.id}
                  onOpen={() => setQtyAt(g.i + ':' + p.id)}
                  patch={patch}
                />
              ))}

              <DataCell>
                <span className="tnum text-body font-semibold text-ink">
                  {numText(totalQty(g))}
                </span>
                {canEdit ? (
                  <button
                    type="button"
                    onClick={() => setUnitAt(unitAt === g.i ? '' : g.i)}
                    aria-label={`Единица измерения: ${unitOf(g)}. Изменить`}
                    /* Видимое слово мелкое, а нажимать по нему пальцем —
                       поэтому зону нажатия добираем невидимым слоем до 44 px. */
                    className="relative rounded-md px-1 transition-colors before:absolute before:-inset-x-2 before:-inset-y-3.5 before:content-[''] hover:bg-zebra/70 active:bg-zebra"
                  >
                    <span className="editable text-micro text-muted">{unitOf(g)}</span>
                  </button>
                ) : (
                  <span className="text-micro text-muted">{unitOf(g)}</span>
                )}
              </DataCell>

              <DataCell className="px-1">
                <RowActions>
                  {/* Вставка живёт в САМОЙ строке и на обеих ширинах. Прежде
                      на десктопе её давала невидимая полоса между строками —
                      то есть орган, о котором человек узнавал случайно. Двух
                      органов одного действия не бывает (урок У-58). */}
                  <RowAction
                    icon={ListPlus}
                    label={`Завести вещь после «${g.n}»`}
                    onClick={() => onInsert(idx + 1)}
                  />
                  {perms.canDel(g) && (
                    <RowAction
                      icon={Trash2}
                      tone="danger"
                      label={`Удалить «${g.n}»`}
                      onClick={() => onDelete(g)}
                    />
                  )}
                </RowActions>
              </DataCell>
          </DataRow>
        )
      })}
    </DataTable>
  )
}

/**
 * Ячейка человека: кружок состояния и количество.
 *
 * Пустая ячейка — пунктирный кружок с плюсом: тап записывает одну штуку.
 * Занятая — кружок состояния (тап меняет по кругу) и число (тап раскрывает
 * счётчик прямо здесь). Счётчик доводится до нуля — так назначение снимается
 * видимым действием, а не спрятанным жестом.
 *
 * Чего человеку не положено — того здесь нет вовсе (постулат 5): отмечать
 * за другого может не каждый, и тогда кружок остаётся значком, а не кнопкой.
 */
function Cell({
  g, p, perms, unit, open, onOpen, patch,
}: {
  g: Gear
  p: Person
  perms: Perms
  unit: string
  open: boolean
  onOpen: () => void
  patch: (id: string, f: (g: Gear) => void) => void
}) {
  const qty = g.o?.[p.id] || 0
  const mark = markOf(g, p.id)
  const canQty = perms.canEditQty(g, p.id)
  const canMark = perms.canMark(p.id)

  /* Ноль — человек вещь не везёт: убираем и его отметки, иначе они «висят»
     за назначением, которого больше нет. */
  const write = (n: number) =>
    patch(g.i, (x) => {
      x.o = x.o || {}
      x.oby = x.oby || {}
      if (n > 0) {
        x.o[p.id] = n
        x.oby[p.id] = x.oby[p.id] || perms.me || ''
        return
      }
      delete x.o[p.id]
      delete x.oby[p.id]
      if (x.s) delete x.s[p.id]
      if (x.q) delete x.q[p.id]
    })

  if (qty <= 0) {
    if (!canQty) return <DataCell />
    return (
      <DataCell>
        <button
          type="button"
          data-qty
          onClick={() => write(1)}
          aria-label={`${g.n}: ${p.name} не везёт. Записать 1${NBSP}${unit}`}
          className="grid size-11 place-items-center rounded-full text-muted transition-colors hover:bg-accent-soft hover:text-accent-text active:scale-95"
        >
          <span
            className="grid size-7 place-items-center rounded-full border border-dashed border-line-strong"
            aria-hidden
          >
            <Plus size={18} strokeWidth={1.75} />
          </span>
        </button>
      </DataCell>
    )
  }

  return (
    <DataCell>
      {/* Кружок и число стоят столбиком на телефоне и в строку на широком экране:
          зона нажатия у кружка 44 px, и в узкую колонку рядом с числом она не встаёт.
          Раскрытый счётчик всегда уходит под кружок: со стрелками он шире колонки. */}
      <span
        data-qty
        className={cn(
          'flex w-full flex-col items-center gap-1',
          !open && 'lg:flex-row lg:justify-center',
        )}
      >
        <StatusDial
          value={statusOf(g, p.id)}
          cant={mark === 'cant'}
          who={p.name}
          size={44}
          onCycle={canMark ? () => patch(g.i, (x) => { cycleMark(x, p.id) }) : undefined}
        />
        {open ? (
          <InlineNum
            value={qty}
            onSave={write}
            can={canQty}
            label={`${p.name}: сколько везёт`}
            min={0}
            step={1}
            className="text-note font-semibold text-ink"
          />
        ) : canQty ? (
          <button
            type="button"
            onClick={onOpen}
            aria-label={`${p.name}: ${qty}${NBSP}${unit}, ${markName(mark)}. Изменить количество`}
            className="w-full rounded-md py-1 transition-colors hover:bg-zebra/70 active:bg-zebra lg:w-auto lg:px-2"
          >
            <span className="editable tnum text-note font-semibold text-ink">{numText(qty)}</span>
          </button>
        ) : (
          <span className="tnum py-1 text-note font-semibold text-ink">{numText(qty)}</span>
        )}
      </span>
    </DataCell>
  )
}

/**
 * Выбор единицы измерения: ряд частых из справочника плюс своя.
 * Живёт в первой колонке — она закреплена и видна на любой прокрутке,
 * а в узкой колонке «Всего» ряд кнопок не поместился бы.
 */
export function UnitPick({
  units, value, onPick,
}: {
  units: string[]
  value: string
  onPick: (u: string) => void
}) {
  return (
    <span className="mt-2 block w-full">
      <span className="block text-micro text-muted">Единица</span>
      <span className="mt-1 flex flex-wrap items-center gap-1">
        {units.map((u) => (
          <button
            key={u}
            type="button"
            onClick={() => onPick(u)}
            aria-pressed={u === value}
            className={cn(
              'grid h-11 min-w-11 place-items-center rounded-md border px-2 text-note transition-colors',
              u === value
                ? 'border-accent bg-accent-soft text-accent-text'
                : 'border-line-strong text-ink hover:bg-zebra/70 active:bg-zebra',
            )}
          >
            {u}
          </button>
        ))}
        <span className="min-w-16 flex-1">
          <InlineText
            value={units.includes(value) ? '' : value}
            onSave={(v) => onPick(v)}
            can
            label="Своя единица измерения"
            placeholder="своя"
            className="text-note text-muted"
          />
        </span>
      </span>
    </span>
  )
}
