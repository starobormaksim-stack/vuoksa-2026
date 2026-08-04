import { Check, ShoppingBasket } from 'lucide-react'
import type { Buy, State } from '@/lib/types'
import { money } from '@/lib/calc'
import { buyLine, sumOf, unitOf } from '@/lib/buyx'
import { EmptyState, ResponsiveSheet, Btn } from '@/components/flops'
import { fmtNum, NBSP } from '@/format'
import { cn } from '@/lib/utils'

/**
 * «Режим магазина» — только то, что надо взять с полки: одна колонка,
 * крупные галочки, никаких цен-полей. Личные разделы сюда не попадают.
 */
export function ShopSheet({
  S,
  open,
  onOpenChange,
  onToggle,
}: {
  S: State
  open: boolean
  onOpenChange: (v: boolean) => void
  onToggle: (id: string, bought: boolean) => void
}) {
  const personal = new Set(S.buySections.filter((s) => s.personal).map((s) => s.i))
  const list = S.buy.filter((p) => p.st === 'buy' && !personal.has(p.sec))
  const left = list.filter((p) => !p.b)
  const sum = left.reduce((s, p) => s + sumOf(p), 0)

  const row = (p: Buy) => (
    <li key={p.i}>
      <button
        type="button"
        onClick={() => onToggle(p.i, !p.b)}
        className="flex min-h-16 w-full items-center gap-3 border-b border-line/60 px-1 text-left transition-colors hover:bg-zebra"
      >
        <span
          className={cn(
            'grid size-7 shrink-0 place-items-center rounded-lg border-[1.5px]',
            p.b ? 'border-accent bg-accent text-on-accent' : 'border-line-strong',
          )}
          aria-hidden
        >
          {p.b && <Check size={18} strokeWidth={3} />}
        </span>
        <span className="min-w-0 flex-1 py-2">
          <span
            className={cn(
              'block text-[16px] font-semibold text-ink',
              p.b && 'text-muted line-through',
            )}
          >
            {p.n}
          </span>
          <span className="mt-0.5 block text-[13px] text-muted">
            {fmtNum(p.q)}
            {NBSP}
            {unitOf(p, S)}
            {p.c ? ` · ${p.c}` : ''}
          </span>
        </span>
        <span className={cn('tnum shrink-0 text-[15px] font-bold', p.b ? 'text-muted' : 'text-ink')}>
          {money(sumOf(p), S.doc)}
        </span>
      </button>
    </li>
  )

  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Режим магазина"
      subtitle={
        left.length > 0
          ? `Осталось взять ${left.length} · примерно ${money(sum, S.doc)}`
          : 'Всё отмечено'
      }
      footer={
        <Btn scale="lg" className="w-full" onClick={() => onOpenChange(false)}>
          Готово
        </Btn>
      }
    >
      {list.length === 0 ? (
        <EmptyState
          icon={ShoppingBasket}
          title="Покупать нечего"
          text="Ни одной позиции со статусом «Купить»"
        />
      ) : left.length === 0 ? (
        <EmptyState icon={Check} title="Корзина собрана" text="Всё из списка отмечено. Можно на кассу" />
      ) : null}

      {list.length > 0 && (
        <ul className="pb-2">
          {left.map(row)}
          {list.filter((p) => p.b).map(row)}
        </ul>
      )}
      {/* Строка buyLine здесь намеренно не показывается: в магазине важны вещь и количество */}
      <span className="sr-only">{list.map((p) => buyLine(p, S)).join('. ')}</span>
    </ResponsiveSheet>
  )
}
