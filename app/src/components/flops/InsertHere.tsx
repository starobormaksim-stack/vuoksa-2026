import { Plus } from 'lucide-react'

/**
 * Плюс в промежутке между карточками — «вставить сюда».
 *
 * ─── Слово заказчика (09.08.2026) ───
 * Про полноширинную пунктирную кнопку «Добавить подраздел», стоявшую в конце
 * списка статей: «почему-то у тебя подраздел можно добавить внутри, прямо между
 * карточками „Алкоголь“ и „Аренда“… оно попадает между существующими списками —
 * нет, это не вариант». И дальше, чего он хочет вместо: «между любой карточкой
 * плюсиком добавить… между строками вот этими — „Бытовое“, „Расходники“,
 * „Напитки“ и „Горячее“ — чтобы между ними по центру был просто плюсик,
 * и это касается вообще везде».
 *
 * Отсюда форма: не строка во всю ширину, которую глаз читает как ещё одну
 * карточку, а маленький кружок по центру промежутка. Он не претендует на место
 * в списке — он и есть промежуток.
 *
 * ⚠️ Цель касания 44 px (постулат 8) больше, чем видимый кружок 28 px: полоса
 * прозрачная, отрицательные поля съедают часть промежутка родителя, чтобы
 * список не растягивался на высоту кнопки.
 *
 * ⚠️ Показан всегда, а не по наведению: на телефоне наведения нет вовсе,
 * а орган, которого не видно, для заказчика не существует (постулат 1).
 */
export function InsertHere({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <div className="-my-3 flex min-h-11 items-center justify-center">
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        title={label}
        className="group grid size-11 place-items-center rounded-full"
      >
        <span className="grid size-7 place-items-center rounded-full border border-dashed border-line-strong bg-bg text-muted transition-colors group-hover:border-accent group-hover:bg-accent-fill group-hover:text-on-accent">
          <Plus size={16} strokeWidth={1.75} aria-hidden />
        </span>
      </button>
    </div>
  )
}
