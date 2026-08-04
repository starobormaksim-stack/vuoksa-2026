import { useState } from 'react'
import { ChevronDown, Store } from 'lucide-react'
import type { State } from '@/lib/types'
import { money } from '@/lib/calc'
import { buyBreak, plurItems } from '@/lib/buyx'
import { Btn } from '@/components/flops'
import { cn } from '@/lib/utils'

/**
 * Итоги закупки и разбор «Как это считается» (docs/v2-ux-redesign.md, 9.4).
 * Блок «Не вошло в сумму» обязателен: без него человек складывает строки глазами,
 * не сходится с итогом и делает вывод «всё криво».
 */
export function BuyTotals({ S, onShop }: { S: State; onShop: () => void }) {
  const [open, setOpen] = useState(false)
  const b = buyBreak(S)
  const per = S.people.length > 0 ? b.total / S.people.length : 0

  const Row = ({ title, sum, count, muted }: { title: string; sum: number; count?: number; muted?: boolean }) => (
    <div className="flex min-h-9 items-center gap-3 text-[14px]">
      <span className={cn('min-w-0 flex-1', muted ? 'text-muted' : 'text-ink')}>
        {title}
        {count != null ? <span className="text-muted"> · {count} {plurItems(count)}</span> : null}
      </span>
      <span className={cn('tnum shrink-0 font-semibold', muted ? 'text-muted' : 'text-ink')}>
        {money(sum, S.doc)}
      </span>
    </div>
  )

  return (
    <section className="rounded-2xl border border-line bg-surface shadow-sm">
      <div className="p-4">
        <div className="flex items-end gap-3">
          <h3 className="min-w-0 flex-1 text-[15px] font-[650] text-ink">Продукты и расходники</h3>
          <span className="tnum text-[28px] leading-none font-bold text-ink">
            {money(b.total, S.doc)}
          </span>
        </div>
        <p className="mt-1 text-[13px] text-muted">
          {b.anyFact ? 'Часть цен уже по факту из магазина' : 'Пока всё по плановым ценам'}
        </p>

        <div className="mt-3 flex items-center gap-3 border-t border-line pt-3">
          <span className="min-w-0 flex-1 text-[15px] font-[650] text-ink">
            С каждого · делим на {S.people.length}
          </span>
          <span className="tnum text-[20px] font-bold text-ink">{money(per, S.doc)}</span>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex min-h-12 w-full items-center gap-2 border-t border-line px-4 text-left text-[15px] font-semibold text-ink transition-colors hover:bg-zebra"
      >
        <span className="flex-1">Как это считается</span>
        <ChevronDown
          size={20}
          strokeWidth={1.5}
          aria-hidden
          className={cn('text-muted transition-transform', open && 'rotate-180')}
        />
      </button>

      {open && (
        <div className="border-t border-line px-4 py-3">
          {b.sections.map((r) => (
            <Row key={r.key} title={r.title} sum={r.sum} />
          ))}

          {b.excluded.length > 0 && (
            <>
              <div className="mt-3 border-t border-line pt-2 text-[13px] font-semibold text-accent-text">
                Не вошло в сумму
              </div>
              {b.excluded.map((r) => (
                <Row key={r.key} title={r.title} sum={r.sum} count={r.count} muted />
              ))}
            </>
          )}

          {b.personal.length > 0 && (
            <>
              <div className="mt-3 border-t border-line pt-2 text-[13px] font-semibold text-muted">
                Личное, в делёж не входит
              </div>
              {b.personal.map((r) => (
                <Row key={r.key} title={r.title} sum={r.sum} muted />
              ))}
            </>
          )}
        </div>
      )}

      <div className="border-t border-line p-4">
        <Btn scale="lg" className="w-full" onClick={onShop}>
          <Store size={18} strokeWidth={1.5} aria-hidden />
          Режим магазина
        </Btn>
      </div>
    </section>
  )
}
