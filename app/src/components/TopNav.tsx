import { motion, useReducedMotion } from 'motion/react'
import { Search } from 'lucide-react'
import type { Person } from '../lib/types'
import type { SectionDef } from '../sections'
import { Logo } from './Logo'
import { PresenceStack } from './PresenceStack'
import { ThemeToggle } from './ThemeToggle'
import { MoreMenu } from './MoreMenu'

interface Props {
  sections: SectionDef[]
  active: string
  onSelect: (id: string) => void
  people: Person[]
  dark: boolean
  onToggleTheme: () => void
  onSearch: () => void
  onHome: () => void
}

/**
 * Прилипающее верхнее меню (десктоп ≥1024): знак · разделы · присутствие · поиск · тема · «⋯».
 *
 * Фон непрозрачный, без размытия: содержимое должно уезжать ПОД шапку и там пропадать,
 * как под мостом, а не просвечивать сквозь неё.
 *
 * Раскладка: знак и правый блок кнопок не сжимаются, разделы забирают остаток посередине.
 * Стопка присутствия появляется только от 1280 px — на 1024 она налезала на последний
 * пункт меню (это и было видно на снимке заказчика: аватарки поверх слова «Меню»).
 */
export function TopNav({
  sections, active, onSelect, people, dark, onToggleTheme, onSearch, onHome,
}: Props) {
  const reduce = useReducedMotion()
  return (
    <header className="sticky top-0 z-40 hidden border-b border-line/70 bg-bg lg:block">
      <div className="mx-auto flex h-16 w-full max-w-[1280px] items-center gap-4 px-6 xl:gap-6">
        <button
          type="button"
          onClick={onHome}
          aria-label="Pine-to-Pine — наверх"
          className="shrink-0 rounded-xl transition-opacity hover:opacity-80"
        >
          <Logo height={28} />
        </button>

        <nav aria-label="Разделы" className="flex h-full min-w-0 flex-1 items-stretch justify-center gap-0.5">
          {sections.map((s) => {
            const isActive = s.id === active
            const Icon = s.icon
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => onSelect(s.id)}
                aria-current={isActive ? 'page' : undefined}
                title={s.title}
                className={`relative flex min-w-0 items-center gap-2 px-2.5 text-[15px] font-semibold whitespace-nowrap transition-colors xl:px-3 ${
                  isActive ? 'text-ink' : 'text-muted hover:text-ink'
                }`}
              >
                <Icon size={20} strokeWidth={1.5} aria-hidden className="shrink-0" />
                <span className="truncate">{s.title}</span>
                {isActive && (
                  <motion.span
                    layoutId="nav-underline"
                    transition={
                      reduce ? { duration: 0 } : { duration: 0.25, ease: [0.2, 0.8, 0.2, 1] }
                    }
                    className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-accent"
                  />
                )}
              </button>
            )
          })}
        </nav>

        <div className="flex shrink-0 items-center gap-1">
          <span className="mr-1 hidden xl:inline-flex">
            <PresenceStack people={people} />
          </span>
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
