import type { State } from '@/lib/types'
import { money } from '@/lib/calc'
import { buyBreak, plurItems } from '@/lib/buyx'
import { NBSP } from '@/format'
import { cn } from '@/lib/utils'

/**
 * Итог закупки. Подытоги блоков теперь стоят под самими блоками, как в таблице
 * заказчика, поэтому раскрывашка «Как это считается» отсюда убрана: она повторяла
 * те же числа вторым списком («очень много лишнего», 04.08.2026). Здесь остаётся
 * только то, чего больше нигде нет: общий счёт, доля с каждого и сколько денег
 * лежит в позициях без галочки «Берём».
 *
 * ─── План, факт и разница (заказчик 05.08.2026) ───
 * «В общем расчёте тоже должна быть планируемая стоимость и фактическая
 * стоимость, чтобы можно было даже сравнить разницу». Обе колонки в таблице
 * были и раньше (`Buy.pr` и `Buy.prf`), но итог считался один.
 *
 * ⛔ Общий счёт остаётся ровно тем, чем был, — на нём держатся контрольные цифры.
 * Он и есть «факт»: там, где фактическая цена ещё не вписана, в него идёт
 * плановая (`priceOf`). Это сказано словами под числом, иначе человек прочитал бы
 * незаполненный факт как настоящий (постулат 5).
 */
export function BuyTotals({ S }: { S: State }) {
  const b = buyBreak(S)
  const per = S.people.length > 0 ? b.total / S.people.length : 0
  const outSum = b.excluded.reduce((s, r) => s + r.sum, 0)
  const outCount = b.excluded.reduce((s, r) => s + (r.count || 0), 0)
  const diff = b.total - b.plan

  return (
    <section className="rounded-xl border border-line bg-surface p-4 shadow-sm">
      <div className="flex items-end gap-3">
        {/* ⚠️ Было «Общий счёт». С 09.08.2026 «Расходы» — раздел с подразделами,
            и над этим блоком стоят ещё «Аренда», «Логистика» и «Проживание».
            Слово «общий» читалось бы как итог всего раздела, а здесь только
            закупка: число обязано называть себя (постулат 5). Итог всего
            раздела — ниже, в «Итогах поездки». */}
        <h3 className="min-w-0 flex-1 text-body font-[650] text-ink">Итог по закупке</h3>
        <span className="tnum shrink-0 text-title leading-none font-bold text-ink">
          {money(b.total, S.doc)}
        </span>
      </div>

      {/* Пока ни одной фактической цены не вписано, план и счёт — одно и то же
          число, и сравнивать нечего: две одинаковые строки и «разница 0 ₽»
          были бы шумом. Поэтому сравнение появляется вместе с первым фактом. */}
      {b.anyFact && (
        <>
          <div className="mt-3 flex items-center gap-3 border-t border-line pt-3">
            <span className="min-w-0 flex-1 text-note text-muted">По плановым ценам</span>
            <span className="tnum shrink-0 text-note text-muted">{money(b.plan, S.doc)}</span>
          </div>

          <div className="mt-1.5 flex items-center gap-3">
            <span className="min-w-0 flex-1 text-note text-muted">
              {diff === 0
                ? 'Разница с планом'
                : diff > 0
                  ? 'Дороже плана на'
                  : 'Дешевле плана на'}
            </span>
            <span
              className={cn(
                'tnum shrink-0 text-note font-semibold',
                diff === 0 ? 'text-muted' : 'text-ink',
              )}
            >
              {money(Math.abs(diff), S.doc)}
            </span>
          </div>
        </>
      )}

      {/* Короче, чем было: правило остаётся, объяснение правила уходит
          (заказчик 05.08.2026 про «гигантское количество текста»). */}
      {b.noFact > 0 && (
        <p className={cn('text-micro text-muted', b.anyFact ? 'mt-1.5' : 'mt-3')}>
          Без фактической цены · {b.noFact}{NBSP}
          {plurItems(b.noFact)}: в счёт идёт план
        </p>
      )}

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
