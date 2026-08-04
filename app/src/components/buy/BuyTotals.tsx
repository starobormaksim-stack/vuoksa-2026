import type { State } from '@/lib/types'
import { money } from '@/lib/calc'
import { buyBreak, plurItems } from '@/lib/buyx'

/**
 * Итог закупки. Подытоги блоков теперь стоят под самими блоками, как в таблице
 * заказчика, поэтому раскрывашка «Как это считается» отсюда убрана: она повторяла
 * те же числа вторым списком («очень много лишнего», 04.08.2026). Здесь остаётся
 * только то, чего больше нигде нет: общий счёт, доля с каждого и сколько денег
 * лежит в позициях без галочки «Берём».
 */
export function BuyTotals({ S }: { S: State }) {
  const b = buyBreak(S)
  const per = S.people.length > 0 ? b.total / S.people.length : 0
  const outSum = b.excluded.reduce((s, r) => s + r.sum, 0)
  const outCount = b.excluded.reduce((s, r) => s + (r.count || 0), 0)

  return (
    <section className="rounded-xl border border-line bg-surface p-4 shadow-sm">
      <div className="flex items-end gap-3">
        <h3 className="min-w-0 flex-1 text-body font-[650] text-ink">Общий счёт</h3>
        <span className="tnum shrink-0 text-title leading-none font-bold text-ink">
          {money(b.total, S.doc)}
        </span>
      </div>

      <div className="mt-3 flex items-center gap-3 border-t border-line pt-3">
        <span className="min-w-0 flex-1 text-body text-ink">
          С каждого · делим на {S.people.length}
        </span>
        <span className="tnum shrink-0 text-head font-bold text-ink">{money(per, S.doc)}</span>
      </div>

      {outCount > 0 && (
        <div className="mt-2 flex items-center gap-3">
          <span className="min-w-0 flex-1 text-note text-muted">
            Без галочки «Берём» · {outCount} {plurItems(outCount)}
          </span>
          <span className="tnum shrink-0 text-note text-muted">{money(outSum, S.doc)}</span>
        </div>
      )}
    </section>
  )
}
