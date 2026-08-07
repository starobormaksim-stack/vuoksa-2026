import { type RefObject } from 'react'
import { ShoppingCart } from 'lucide-react'
import type { BuySection, Person, State } from '@/lib/types'
import type { Perms } from '@/lib/perm'
import { money } from '@/lib/calc'
import {
  AddRow, DataCell, DataHead, DataTable, EmptyState, PersonHead,
  type TableScroll,
} from '@/components/flops'
import { cn } from '@/lib/utils'
import { BuyRow } from './BuyRow'
import { BuyStrip } from './BuyStrip'
import { colsFor, secPlan, secSum, type BuyItem } from './buylocal'

/**
 * Один блок закупки таблицей — как лист заказчика: строка на позицию, колонки
 * количества и денег, колонка на каждого человека, подытог справа внизу.
 *
 * Прокрутка вбок живёт внутри блока (у страницы её нет ни на одной ширине),
 * и все блоки раздела прокручиваются вместе: в бумажной таблице лист один.
 */
interface Props {
  sec: BuySection
  rows: BuyItem[]
  S: State
  perms: Perms
  people: Person[]
  scroll: RefObject<TableScroll>
  /** широкий экран — матрица; узкий — вертикальная лента (решение 06.08.2026) */
  desktop: boolean
  /** id только что добавленной строки */
  fresh: string | null
  onPatch: (id: string, f: (x: BuyItem) => void) => void
  onDelete: (p: BuyItem) => void
  /** добавить строку: afterId — вставить сразу под этой, иначе в конец блока */
  onAdd: (secId: string, afterId?: string) => void
  onFreshEnd: (id: string, saved: boolean) => void
}

export function BuyTable({
  sec, rows, S, perms, people, scroll, desktop, fresh, onPatch, onDelete, onAdd, onFreshEnd,
}: Props) {
  const canAdd = perms.isEditor() || !!perms.me
  const sum = secSum(rows)
  const plan = secPlan(rows)

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={ShoppingCart}
        title="Ничего не запланировано"
        text="Здесь пока нет ни одной позиции"
        action={canAdd ? { label: 'Добавить позицию', onClick: () => onAdd(sec.i) } : undefined}
      />
    )
  }

  /* ⛔ На телефоне — лента (заказчик 06.08.2026 назвал матрицу с прокруткой вбок
     «нереалистичной»). На широком экране матрица остаётся: её он сам прислал
     эталоном. Рисуется ровно одна: 53 позиции во второй разметке — лишняя работа
     на каждой перерисовке. */
  if (!desktop) {
    return (
      <>
        <BuyStrip
          rows={rows}
          S={S}
          perms={perms}
          people={people}
          fresh={fresh}
          canAdd={canAdd}
          onPatch={onPatch}
          onDelete={onDelete}
          onInsert={(afterId) => onAdd(sec.i, afterId)}
          onFreshEnd={onFreshEnd}
        />
        {canAdd && (
          <div className="border-t border-line">
            <AddRow label="Добавить позицию" onClick={() => onAdd(sec.i)} />
          </div>
        )}
        <SecTotals sec={sec} plan={plan} sum={sum} S={S} />
      </>
    )
  }

  return (
    <>
      <DataTable
        cols={colsFor(people.length)}
        label={`Закупка · ${sec.t}`}
        sync={scroll}
      >
        <DataHead>
          <DataCell head sticky align="left">
            Наименование
          </DataCell>
          <DataCell head>Кол-во</DataCell>
          <DataCell head>Ед.</DataCell>
          {/* Заказчик 05.08.2026: «в части покупок должна быть планируемая
              стоимость и фактическая — фактически это те цифры, которые вносятся
              вручную в момент уже в магазине». Обе колонки были и раньше (`pr`
              и `prf`), но назывались «Цена» и «По факту» — по этим словам
              не прочитать, что одна прикидка, а вторая та самая магазинная.
              Модель данных не тронута, изменились только подписи. */}
          <DataCell head align="right">
            Цена, план
          </DataCell>
          <DataCell head align="right">
            Цена, факт
          </DataCell>
          {/* 08.08.2026: «справа должна быть указана финальная стоимость,
              а не за единицу, и там фактическая» — см. `colsFor`. */}
          <DataCell head align="right">
            Стоимость
          </DataCell>
          <DataCell head className="px-1">
            Берём
          </DataCell>
          {people.map((who) => (
            <DataCell
              key={who.id}
              head
              /* колонка читателя слегка подсвечена: свою человек ищет первой */
              className={cn('px-1 py-2', who.id === perms.me && 'bg-accent-soft')}
            >
              <PersonHead
                name={who.name}
                photo={who.photo}
                ini={who.ini}
                size={40}
                mine={who.id === perms.me}
              />
            </DataCell>
          ))}
          <DataCell head className="px-1" />
        </DataHead>

        {/* Полосы вставки между строками здесь больше нет: она была видна только
            под курсором, а то же действие уже стоит видимой кнопкой в самой строке
            (`BuyRow`, «Вставить строку ниже»). Двух органов одного действия
            не бывает — урок У-58, требование заказчика 05.08.2026. */}
        {rows.map((p, idx) => (
          <BuyRow
            key={p.i}
            p={p}
            S={S}
            perms={perms}
            people={people}
            zebra={idx % 2 === 1}
            canAdd={canAdd}
            fresh={fresh === p.i}
            onPatch={(f) => onPatch(p.i, f)}
            onDelete={() => onDelete(p)}
            onInsert={() => onAdd(sec.i, p.i)}
            onFreshEnd={(saved) => onFreshEnd(p.i, saved)}
          />
        ))}
      </DataTable>

      {canAdd && (
        <div className="border-t border-line">
          <AddRow label="Добавить позицию" onClick={() => onAdd(sec.i)} />
        </div>
      )}

      <SecTotals sec={sec} plan={plan} sum={sum} S={S} />
    </>
  )
}

/**
 * Итоги блока — как в Excel заказчика: обе величины подписаны и стоят внизу.
 *
 * Дословно 06.08.2026: «сумма тоже считается, должна в итоге итоговая сумма.
 * То есть я внизу должен видеть условно как в Excel: сумма факт, сумма план».
 * Раньше здесь стояло одно число и приписка «по плану …» мелким шрифтом, да и то
 * только когда план отличался от факта.
 *
 * ⛔ Обе строки печатаются ВСЕГДА, даже нулями: «по умолчанию цена план, цена факт
 * у нас нулевые везде, мы её будем писать на месте» — значит человек обязан видеть
 * «0 ₽», а не пустоту, иначе непонятно, посчиталось ли вообще.
 */
function SecTotals({
  sec, plan, sum, S,
}: {
  sec: BuySection
  plan: number
  sum: number
  S: State
}) {
  return (
    <div className="border-t border-line bg-zebra/60 px-4 py-2.5">
      {sec.personal && (
        <p className="mb-1 text-micro text-muted">В общий бюджет не входит</p>
      )}
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-note text-muted">Сумма, план</span>
        <span className="tnum text-body font-semibold text-ink">{money(plan, S.doc)}</span>
      </div>
      <div className="mt-1 flex items-baseline justify-between gap-3">
        <span className="text-note font-semibold text-muted">Сумма, факт</span>
        <span className="tnum text-head font-bold text-ink">{money(sum, S.doc)}</span>
      </div>
    </div>
  )
}
