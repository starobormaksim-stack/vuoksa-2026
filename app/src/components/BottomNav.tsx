import { useState } from 'react'
import { ChevronDown, ChevronUp, Ellipsis } from 'lucide-react'
import { splitForBottomNav, type SectionDef } from '../sections'

interface Props {
  sections: SectionDef[]
  active: string
  onSelect: (id: string) => void
  /** развёрнута ли панель; состояние держит App — от него зависит отступ страницы */
  open: boolean
  onToggle: () => void
}

/**
 * Нижняя панель разделов (мобайл). Все элементы ≥44×44, отступ под safe-area.
 * При >6 разделов последним встаёт «Ещё» — шторка появится вместе с пользовательскими
 * разделами (TODO), пока это только раскладочная логика.
 *
 * ─── Язычок ───
 * Заказчик 06.08.2026: «дай возможность сворачивать вот это меню, которое снизу.
 * Она мешает». Свёрнутая панель убирает ряд разделов совсем, оставляя один язычок:
 * он остаётся видимым всегда, потому что вернуть панель больше нечем — исчезнувший
 * без следа орган управления это молчаливый отказ (постулат 5).
 *
 * Ряд разделов при этом СНИМАЕТСЯ с разметки, а не прячется прозрачностью: скрытые
 * кнопки продолжали бы ловить нажатия сквозь карту (тот же корень, что у правила
 * в `index.css` про подложку шторки).
 */
export function BottomNav({ sections, active, onSelect, open, onToggle }: Props) {
  const { visible, overflow } = splitForBottomNav(sections)
  const overflowActive = overflow.some((s) => s.id === active)
  /** раскрыт ли перечень остальных разделов над панелью */
  const [more, setMore] = useState(false)

  /** Уйти в раздел из перечня: перечень закрывается сам, как любое меню. */
  const go = (id: string) => {
    setMore(false)
    onSelect(id)
  }

  return (
    <nav
      aria-label="Разделы"
      className="fixed inset-x-0 bottom-0 z-40 lg:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {/* ── Язычок ──
          Видимая плашка 56 × 28, а цель касания растянута до 44 px невидимой
          зоной `before` — тот же приём, что у кружков в карточке метки.
          Замер 390 × 844: 70 × 44, `elementFromPoint` в центре отдаёт язычок. */}
      <div className="flex justify-center">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls="bottom-nav-list"
          aria-label={open ? 'Свернуть разделы' : 'Показать разделы'}
          className="relative grid h-7 w-14 place-items-center rounded-t-xl border border-b-0 border-line/70 bg-surface text-muted before:absolute before:-inset-x-2 before:-top-5 before:bottom-0 before:content-['']"
        >
          {open ? (
            <ChevronDown size={20} strokeWidth={1.75} aria-hidden />
          ) : (
            <ChevronUp size={20} strokeWidth={1.75} aria-hidden />
          )}
        </button>
      </div>

      {/* ── Остальные разделы: перечнем НАД панелью ──
          Строками, а не сеткой: длинные названия («Проживание») в колонку
          шириной 55 px не помещаются, а обрезанное название — не название. */}
      {open && more && overflow.length > 0 && (
        <div className="border-t border-line/70 bg-surface px-2 py-1">
          {overflow.map((s) => {
            const isActive = s.id === active
            const Icon = s.icon
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => go(s.id)}
                aria-current={isActive ? 'page' : undefined}
                className={`flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left transition-colors active:scale-[0.99] ${
                  isActive ? 'bg-accent-soft text-accent-text' : 'text-ink hover:bg-zebra'
                }`}
              >
                <Icon size={20} strokeWidth={1.75} aria-hidden className="shrink-0 text-muted" />
                <span className="text-note font-semibold">{s.title}</span>
              </button>
            )
          })}
        </div>
      )}

      {open && (
        <div
          id="bottom-nav-list"
          /* Фон непрозрачный: содержимое должно уезжать под панель и там пропадать,
             а не просвечивать сквозь неё. */
          className="grid border-t border-line/70 bg-surface"
          style={{ gridTemplateColumns: `repeat(${visible.length + (overflow.length ? 1 : 0)}, 1fr)` }}
        >
          {visible.map((s) => {
            const isActive = s.id === active
            const Icon = s.icon
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => go(s.id)}
                aria-current={isActive ? 'page' : undefined}
                className={`flex min-h-14 min-w-11 flex-col items-center justify-center gap-0.5 pt-1.5 pb-1 transition-colors active:scale-[0.98] ${
                  isActive ? 'text-accent-text' : 'text-muted'
                }`}
              >
                <span
                  className={`grid h-7 w-12 place-items-center rounded-full transition-colors ${
                    isActive ? 'bg-accent-soft' : ''
                  }`}
                >
                  <Icon size={20} strokeWidth={1.75} aria-hidden />
                </span>
                <span className="text-micro font-semibold">{s.title}</span>
              </button>
            )
          })}
          {overflow.length > 0 && (
            <button
              type="button"
              aria-label="Остальные разделы"
              aria-expanded={more}
              /* ⛔ Здесь кнопка молча прыгала на ПЕРВЫЙ переполненный раздел,
                 и остальные достать было нечем — молчаливый отказ (постулат 5).
                 Пока разделов было шесть, ветка не рисовалась вовсе и дефект
                 не проявлялся; седьмой раздел («Проживание», 09.08.2026) её
                 включил. Теперь она раскрывает перечень НАД панелью — списком
                 прямо здесь, а не шторкой (постулат 2), как выбор вида техники
                 в полосе веток карты. */
              onClick={() => setMore((v) => !v)}
              className={`flex min-h-14 min-w-11 flex-col items-center justify-center gap-0.5 pt-1.5 pb-1 transition-colors active:scale-[0.98] ${
                overflowActive || more ? 'text-accent-text' : 'text-muted'
              }`}
            >
              <span
                className={`grid h-7 w-12 place-items-center rounded-full transition-colors ${
                  overflowActive ? 'bg-accent-soft' : ''
                }`}
              >
                <Ellipsis size={20} strokeWidth={1.75} aria-hidden />
              </span>
              <span className="text-micro font-semibold">Ещё</span>
            </button>
          )}
        </div>
      )}
    </nav>
  )
}
