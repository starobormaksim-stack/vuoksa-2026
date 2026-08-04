import { Search } from 'lucide-react'
import { Logo } from './Logo'
import { ThemeToggle } from './ThemeToggle'
import { MoreMenu } from './MoreMenu'

/**
 * Мобильная шапка: знак 26 px по левому краю, справа поиск, тема и «⋯».
 *
 * Фон непрозрачный, без размытия. Во встроенном браузере Телеграма над страницей
 * висит своя полоска (крестик, адрес, «⋯»), и полупрозрачная шапка просвечивала:
 * содержимое было видно и под полоской, и сквозь шапку. Теперь содержимое уезжает
 * под шапку и там пропадает — «под мостом», — а сверху остаётся ровный цвет фона.
 * `env(safe-area-inset-top)` добавляет отступ там, где системная полоска налезает.
 */
export function MobileHeader({
  dark,
  onToggleTheme,
  onSearch,
  onHome,
}: {
  dark: boolean
  onToggleTheme: () => void
  onSearch: () => void
  onHome: () => void
}) {
  return (
    <header
      className="sticky top-0 z-40 border-b border-line/70 bg-bg lg:hidden"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <div className="flex h-14 items-center justify-between px-4">
        <button
          type="button"
          onClick={onHome}
          aria-label="Pine-to-Pine — наверх"
          className="rounded-xl transition-opacity active:opacity-70"
        >
          <Logo height={26} />
        </button>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Поиск по листу"
            onClick={onSearch}
            className="grid size-11 place-items-center rounded-xl text-muted transition-colors hover:bg-zebra hover:text-ink"
          >
            <Search size={21} strokeWidth={1.5} aria-hidden />
          </button>
          <ThemeToggle dark={dark} onToggle={onToggleTheme} />
          <MoreMenu />
        </div>
      </div>
    </header>
  )
}
