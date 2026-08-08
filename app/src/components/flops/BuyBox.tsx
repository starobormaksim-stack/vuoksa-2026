import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Галочка «куплено» — один орган на все места, где она показывается.
 *
 * ─── Почему общий ───
 * Копий было две, слово в слово: в `buy/BuyRow.tsx` (десктоп) и в
 * `buy/BuyStrip.tsx` (телефон), и у обеих в комментарии стояло «два экрана
 * одного раздела обязаны показывать галочку одинаково». 08.08.2026 понадобилось
 * третье место — строка находки в поиске: заказчик просил отмечать товар, не
 * выходя из поиска («можно галочкой тоже отметить уже прям в поиске, когда
 * выпадает эта история»). Третья копия того же кода — это уже не совпадение,
 * а велосипед (постулат 3), поэтому орган вынут сюда, а обе прежние копии
 * заменены на него. Разметка и классы не тронуты ни на символ: галочка обязана
 * выглядеть ровно так же, как выглядела.
 *
 * ⛔ Права нет — рисуется только состояние, без кнопки и без серого
 * заглушечного вида (постулат 6): человек видит, куплено или нет, но нажать
 * ему не на что.
 */
export function BuyBox({
  on, can, label, onToggle,
}: {
  on: boolean
  can: boolean
  label: string
  onToggle: () => void
}) {
  const mark = (
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
