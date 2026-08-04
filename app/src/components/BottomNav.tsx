import { Ellipsis } from 'lucide-react'
import { splitForBottomNav, type SectionDef } from '../sections'

interface Props {
  sections: SectionDef[]
  active: string
  onSelect: (id: string) => void
}

/**
 * Нижняя панель разделов (мобайл). Все элементы ≥44×44, отступ под safe-area.
 * При >6 разделов последним встаёт «Ещё» — шторка появится вместе с пользовательскими
 * разделами (TODO), пока это только раскладочная логика.
 */
export function BottomNav({ sections, active, onSelect }: Props) {
  const { visible, overflow } = splitForBottomNav(sections)
  const overflowActive = overflow.some((s) => s.id === active)

  return (
    <nav
      aria-label="Разделы"
      /* Фон непрозрачный: содержимое должно уезжать под панель и там пропадать,
         а не просвечивать сквозь неё. */
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line/70 bg-surface lg:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div
        className="grid"
        style={{ gridTemplateColumns: `repeat(${visible.length + (overflow.length ? 1 : 0)}, 1fr)` }}
      >
        {visible.map((s) => {
          const isActive = s.id === active
          const Icon = s.icon
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => onSelect(s.id)}
              aria-current={isActive ? 'page' : undefined}
              className={`flex min-h-14 min-w-11 flex-col items-center justify-center gap-0.5 pt-1.5 pb-1 transition-colors ${
                isActive ? 'text-accent-text' : 'text-muted'
              }`}
            >
              <span
                className={`grid h-7 w-12 place-items-center rounded-full transition-colors ${
                  isActive ? 'bg-accent-soft' : ''
                }`}
              >
                <Icon size={21} strokeWidth={1.5} aria-hidden />
              </span>
              <span className="text-[11px] font-semibold leading-tight">{s.title}</span>
            </button>
          )
        })}
        {overflow.length > 0 && (
          <button
            type="button"
            aria-label="Остальные разделы"
            className={`flex min-h-14 min-w-11 flex-col items-center justify-center gap-0.5 pt-1.5 pb-1 ${
              overflowActive ? 'text-accent-text' : 'text-muted'
            }`}
          >
            <span className="grid h-7 w-12 place-items-center">
              <Ellipsis size={21} strokeWidth={1.5} aria-hidden />
            </span>
            <span className="text-[11px] font-semibold leading-tight">Ещё</span>
          </button>
        )}
      </div>
    </nav>
  )
}
