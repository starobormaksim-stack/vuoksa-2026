import { Fragment, type RefObject } from 'react'
import { ShoppingCart } from 'lucide-react'
import type { BuySection, Person, State } from '@/lib/types'
import type { Perms } from '@/lib/perm'
import { money } from '@/lib/calc'
import {
  AddRow, DataCell, DataHead, DataTable, EmptyState, PersonHead, RowInsert,
  type TableScroll,
} from '@/components/flops'
import { cn } from '@/lib/utils'
import { BuyRow } from './BuyRow'
import { colsFor, secSum, type BuyItem } from './buylocal'

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
  /** id только что добавленной строки */
  fresh: string | null
  onPatch: (id: string, f: (x: BuyItem) => void) => void
  onDelete: (p: BuyItem) => void
  /** добавить строку: afterId — вставить сразу под этой, иначе в конец блока */
  onAdd: (secId: string, afterId?: string) => void
  onFreshEnd: (id: string, saved: boolean) => void
}

export function BuyTable({
  sec, rows, S, perms, people, scroll, fresh, onPatch, onDelete, onAdd, onFreshEnd,
}: Props) {
  const canAdd = perms.isEditor() || !!perms.me
  const sum = secSum(rows)

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

  return (
    <>
      <DataTable
        cols={colsFor(people.length)}
        label={`Закупка · ${sec.t}`}
        sync={scroll}
        /* `min-w-max` держит сетку шире блока: лист листается вбок внутри блока,
           а у страницы горизонтальной прокрутки нет ни на одной ширине. */
        className="[&>[role=grid]]:min-w-max"
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
          <DataCell head align="right">
            Сумма
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

        {rows.map((p, idx) => (
          <Fragment key={p.i}>
            {canAdd && (
              <RowInsert
                onInsert={() => onAdd(sec.i, idx === 0 ? '' : rows[idx - 1].i)}
                label={p.n ? `Вставить строку перед «${p.n}»` : 'Вставить строку'}
              />
            )}
            <BuyRow
              p={p}
              S={S}
              perms={perms}
              people={people}
              zebra={idx % 2 === 1}
              fresh={fresh === p.i}
              onPatch={(f) => onPatch(p.i, f)}
              onDelete={() => onDelete(p)}
              onInsert={() => onAdd(sec.i, p.i)}
              onFreshEnd={(saved) => onFreshEnd(p.i, saved)}
            />
          </Fragment>
        ))}
      </DataTable>

      {canAdd && (
        <div className="border-t border-line">
          <AddRow label="Добавить позицию" onClick={() => onAdd(sec.i)} />
        </div>
      )}

      <div className="flex items-center gap-3 border-t border-line bg-zebra/60 px-4 py-2.5">
        <span className="min-w-0 flex-1 text-note font-semibold text-muted">
          {sec.personal ? 'Подытог · в общий бюджет не входит' : 'Подытог'}
        </span>
        <span className="tnum shrink-0 text-body font-bold text-ink">{money(sum, S.doc)}</span>
      </div>
    </>
  )
}
