import { useRef, type ReactNode } from 'react'
import { Check, Plus, Trash2 } from 'lucide-react'
import type { Person, State } from '@/lib/types'
import type { Perms } from '@/lib/perm'
import { counted, sumOf, unitOf } from '@/lib/buyx'
import { DataCell, DataRow, InlineNum, InlineText, RowAction, RowActions } from '@/components/flops'
import { SpendShareEdit } from '@/components/road/SpendShare'
import { cn } from '@/lib/utils'
import {
  buyerQty, descText, digitsOf, foldStatus, setBuyer, type BuyItem,
} from './buylocal'

/**
 * Строка закупки — целиком в таблице, без единой шторки.
 *
 * Заказчик 04.08.2026: «мне не нужен поп-ап, в котором всё написано; это прямо вот
 * здесь, в этой таблице уже должно быть». Поэтому название, количество, единица,
 * обе цены, сумма, отметки людей и галочки правятся в самих ячейках.
 *
 * Сумма — не отдельное поле, а результат: правка суммы вписывает цену по факту
 * (сумма ÷ количество). Так строка ведёт себя как в таблице заказчика, где сумма
 * считается формулой, но её всё равно можно поправить «сколько отдал на кассе».
 */
interface Props {
  p: BuyItem
  S: State
  perms: Perms
  /** порядок колонок-людей; тот же во всех блоках раздела */
  people: Person[]
  zebra: boolean
  /**
   * Есть ли право заводить позиции. Это НЕ то же, что право править эту строку:
   * участник заводит свои позиции, но чужие не правит. Раньше вставку между
   * строками давала отдельная полоса (`RowInsert`) с этим же правилом — полосы
   * больше нет, и правило переехало на кнопку в строке, чтобы участник вставку
   * не потерял.
   */
  canAdd: boolean
  /** только что добавленная строка: подсветка и сразу открытая правка названия */
  fresh: boolean
  onPatch: (f: (x: BuyItem) => void) => void
  onDelete: () => void
  onInsert: () => void
  /** правка названия новой строки закончилась; saved — успели что-то ввести */
  onFreshEnd: (saved: boolean) => void
}

export function BuyRow({
  p, S, perms, people, zebra, canAdd, fresh, onPatch, onDelete, onInsert, onFreshEnd,
}: Props) {
  const canEdit = perms.canEditItem(p)
  const canQty = canEdit && perms.canEditQty(p)
  const bg = zebra ? 'zebra' : 'surface'
  const take = counted(p)
  const saved = useRef(false)

  return (
    <DataRow zebra={zebra} fresh={fresh} dataHit={p.i}>
      <DataCell sticky bg={bg} align="left">
        <span className="flex w-full items-start gap-1">
          <Box
            on={!!p.b}
            can={canEdit}
            label={`${p.n || 'Позиция'}: ${p.b ? 'куплено' : 'ещё не куплено'}`}
            onToggle={() => onPatch((x) => { x.b = !x.b })}
          />
          <span className="min-w-0 flex-1 py-1">
            <InlineText
              value={p.n}
              can={canEdit}
              label="Название"
              required={!fresh}
              autoEdit={fresh}
              placeholder={fresh ? 'Что купить' : undefined}
              onSave={(v) => {
                saved.current = true
                onPatch((x) => { x.n = v })
              }}
              onEditEnd={fresh ? () => onFreshEnd(saved.current) : undefined}
              className="text-body font-semibold text-ink"
            />
            <InlineText
              value={descText(p, S)}
              can={canEdit}
              label="Описание"
              multiline
              placeholder={canEdit ? 'примечание' : undefined}
              onSave={(v) =>
                onPatch((x) => {
                  foldStatus(x, S)
                  x.c = v
                })
              }
              className="text-note text-muted"
            />
            {/* Круг делящих: «мясо берём только на троих». Плательщик здесь
                не спрашивается — им работают колонки людей справа (`Buy.o`),
                и второй орган для того же был бы дублем (У-58). */}
            <SpendShareEdit
              S={S}
              can={canEdit}
              circleOnly
              payer={p.payer}
              sp={p.sp}
              what={p.n || 'Позиция'}
              onSp={(ids) => onPatch((x) => { x.sp = ids })}
            />
          </span>
        </span>
      </DataCell>

      <DataCell align="center">
        <InlineNum
          value={p.q}
          can={canQty}
          label="Количество"
          step={1}
          digits={digitsOf(p.q)}
          onSave={(v) => onPatch((x) => { x.q = v; x.qby = perms.me || x.qby })}
          className="text-note font-semibold text-ink"
        />
      </DataCell>

      <DataCell align="center">
        <InlineText
          value={unitOf(p, S)}
          can={canEdit}
          label="Единица"
          onSave={(v) =>
            onPatch((x) => {
              const u = S.units.find((z) => z.t.toLowerCase() === v.trim().toLowerCase())
              x.u = u ? u.t : v
              x.uid = u ? u.i : ''
            })
          }
          className="text-note text-ink"
        />
      </DataCell>

      <DataCell align="right">
        <InlineNum
          value={p.pr}
          can={canEdit}
          label="Цена"
          kind="plain"
          digits={digitsOf(p.pr)}
          onSave={(v) => onPatch((x) => { x.pr = v })}
          className={cn('text-note', p.pr > 0 ? 'text-ink' : 'text-muted')}
        />
      </DataCell>

      <DataCell align="right">
        <InlineNum
          value={p.prf}
          can={canEdit}
          label="Цена по факту"
          kind="plain"
          digits={digitsOf(p.prf)}
          onSave={(v) => onPatch((x) => { x.prf = v })}
          className={cn('text-note', p.prf > 0 ? 'text-ink' : 'text-muted')}
        />
      </DataCell>

      <DataCell align="right">
        <InlineNum
          value={sumOf(p)}
          can={canEdit && p.q > 0}
          label="Сумма"
          kind="plain"
          onSave={(v) => onPatch((x) => { x.prf = x.q > 0 ? v / x.q : x.prf })}
          className={cn('text-body font-semibold', take ? 'text-ink' : 'text-muted line-through')}
        />
      </DataCell>

      <DataCell align="center" className="px-1">
        <Box
          on={take}
          can={canEdit}
          label={`${p.n || 'Позиция'}: ${take ? 'берём, идёт в сумму' : 'не берём, в сумму не идёт'}`}
          onToggle={() =>
            onPatch((x) => {
              const was = x.st === 'buy'
              foldStatus(x, S)
              x.st = was ? 'skip' : 'buy'
            })
          }
        />
      </DataCell>

      {people.map((who) => (
        <DataCell key={who.id} align="center" className="px-1">
          <Buyer
            qty={buyerQty(p, who.id)}
            /* Отметиться покупателем может и участник без права правки строки —
               это его собственная отметка, а за других он не отмечает. */
            can={perms.canMark(who.id)}
            label={`${who.name} покупает`}
            onSet={(v) => onPatch((x) => setBuyer(x, who.id, v, perms.me))}
          />
        </DataCell>
      ))}

      <DataCell align="right" className="px-1">
        <RowActions>
          {canAdd ? (
            <RowAction key="ins" icon={Plus} label="Вставить строку ниже" onClick={onInsert} />
          ) : null}
          {perms.canDel(p) ? (
            <RowAction key="del" icon={Trash2} label="Удалить позицию" tone="danger" onClick={onDelete} />
          ) : null}
        </RowActions>
      </DataCell>
    </DataRow>
  )
}

/**
 * Галочка в ячейке. Права нет — рисуется только состояние, без кнопки и без серого
 * заглушечного вида (постулат «не положено — кнопки нет»): человек видит, куплено
 * или нет, но нажать ему не на что.
 */
function Box({
  on, can, label, onToggle,
}: {
  on: boolean
  can: boolean
  label: string
  onToggle: () => void
}) {
  const mark: ReactNode = (
    <span
      className={cn(
        'grid size-6 place-items-center rounded-sm border-[1.5px]',
        on ? 'border-accent bg-accent text-on-accent' : 'border-line-strong',
      )}
    >
      {on && <Check size={18} strokeWidth={1.75} aria-hidden />}
    </span>
  )
  if (!can) {
    return (
      <span role="img" aria-label={label} className="grid size-11 shrink-0 place-items-center">
        {mark}
      </span>
    )
  }
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={on}
      aria-label={label}
      className="grid size-11 shrink-0 place-items-center rounded-md transition-colors hover:bg-zebra/70 active:scale-[0.98]"
    >
      {mark}
    </button>
  )
}

/**
 * Сколько берёт на себя один человек. Пусто — значит покупают все вместе, поэтому
 * пустая ячейка не кричит: тире. Одно нажатие ставит единицу, дальше число правится
 * прямо в ячейке.
 */
function Buyer({
  qty, can, label, onSet,
}: {
  qty: number
  can: boolean
  label: string
  onSet: (v: number) => void
}) {
  if (qty > 0) {
    return (
      <InlineNum
        value={qty}
        can={can}
        label={label}
        kind="plain"
        digits={digitsOf(qty)}
        onSave={onSet}
        className="text-note font-semibold text-ink"
      />
    )
  }
  if (!can) return <span className="text-note text-muted">&#8212;</span>
  return (
    <button
      type="button"
      onClick={() => onSet(1)}
      aria-label={`${label}. Отметить`}
      className={cn(
        'relative grid size-8 place-items-center rounded-md text-note text-muted',
        'transition-colors hover:bg-zebra/70 active:scale-[0.98]',
        /* Невидимое расширение зоны нажатия до 44 × 44 в узкой колонке. */
        'before:absolute before:-inset-2 before:content-[""]',
      )}
    >
      &#8212;
    </button>
  )
}
