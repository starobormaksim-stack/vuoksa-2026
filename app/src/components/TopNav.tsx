import { motion, useReducedMotion } from 'motion/react'
import { Ellipsis, Search } from 'lucide-react'
import type { Person } from '../lib/types'
import type { SectionDef } from '../sections'
import { Logo } from './Logo'
import { PresenceStack } from './PresenceStack'
import { ThemeToggle } from './ThemeToggle'

interface Props {
  sections: SectionDef[]
  active: string
  onSelect: (id: string) => void
  people: Person[]
  dark: boolean
  onToggleTheme: () => void
}

/** Прилипающее верхнее меню (десктоп ≥1024): логотип · табы · присутствие · поиск · тема · «⋯». */
export function TopNav({ sections, active, onSelect, people, dark, onToggleTheme }: Props) {
  const reduce = useReducedMotion()
  return (
    <header className="sticky top-0 z-40 hidden border-b border-line/70 bg-bg/90 backdrop-blur lg:block">
      <div className="mx-auto flex h-16 max-w-[1120px] items-center gap-8 px-6">
        <Logo height={44} />

        <nav aria-label="Разделы" className="flex h-full min-w-0 flex-1 items-stretch gap-1">
          {sections.map((s) => {
            const isActive = s.id === active
            const Icon = s.icon
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => onSelect(s.id)}
                aria-current={isActive ? 'page' : undefined}
                className={`relative flex items-center gap-2 px-3 text-[15px] font-semibold transition-colors ${
                  isActive ? 'text-ink' : 'text-muted hover:text-ink'
                }`}
              >
                <Icon size={20} strokeWidth={1.5} aria-hidden />
                {s.title}
                {isActive && (
                  <motion.span
                    layoutId="nav-underline"
                    transition={
                      reduce
                        ? { duration: 0 }
                        : { duration: 0.25, ease: [0.2, 0.8, 0.2, 1] }
                    }
                    className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-accent"
                  />
                )}
              </button>
            )
          })}
        </nav>

        <div className="flex items-center gap-2">
          <PresenceStack people={people} />
          <button
            type="button"
            aria-label="Поиск (скоро)"
            className="grid size-11 place-items-center rounded-xl text-muted transition-colors hover:bg-zebra hover:text-ink"
          >
            <Search size={21} strokeWidth={1.5} aria-hidden />
          </button>
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
