import { Ellipsis } from 'lucide-react'
import { Logo } from './Logo'
import { ThemeToggle } from './ThemeToggle'

/** Мобильная шапка: логотип 44px по левому краю, справа тема и «⋯». */
export function MobileHeader({ dark, onToggleTheme }: { dark: boolean; onToggleTheme: () => void }) {
  return (
    <header className="sticky top-0 z-40 border-b border-line/70 bg-bg/90 backdrop-blur lg:hidden">
      <div className="flex h-14 items-center justify-between px-4">
        <Logo height={26} />
        <div className="flex items-center gap-1">
          <ThemeToggle dark={dark} onToggle={onToggleTheme} />
          <button
            type="button"
            aria-label="Ещё действия (скоро)"
            className="grid size-11 place-items-center rounded-xl text-muted transition-colors hover:bg-zebra hover:text-ink"
          >
            <Ellipsis size={21} strokeWidth={1.5} aria-hidden />
          </button>
        </div>
      </div>
    </header>
  )
}
