import { Search } from 'lucide-react'
import { Logo } from './Logo'
import { ThemeToggle } from './ThemeToggle'
import { MoreMenu } from './MoreMenu'

/** Мобильная шапка: знак 26 px по левому краю, справа поиск, тема и «⋯». */
export function MobileHeader({
  dark,
  onToggleTheme,
  onSearch,
}: {
  dark: boolean
  onToggleTheme: () => void
  onSearch: () => void
}) {
  return (
    <header className="sticky top-0 z-40 border-b border-line/70 bg-bg/90 backdrop-blur lg:hidden">
      <div className="flex h-14 items-center justify-between px-4">
        <Logo height={26} />
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
