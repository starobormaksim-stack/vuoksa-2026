import { useCallback, useEffect, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { SECTIONS } from './sections'
import { useTrip } from './store'
import { useTheme } from './theme'
import { TopNav } from './components/TopNav'
import { MobileHeader } from './components/MobileHeader'
import { BottomNav } from './components/BottomNav'
import { Placeholder } from './components/Placeholder'
import { SearchCommand } from './components/SearchCommand'
import { TripSection } from './components/trip/TripSection'
import { BuySection } from './components/buy/BuySection'
import { GearSection } from './components/gear/GearSection'
import { RoadSection } from './components/road/RoadSection'
import { CrewSection } from './components/crew/CrewSection'
import { MenuSection } from './components/menu/MenuSection'
import { Toaster } from './components/ui/sonner'

/**
 * Каркас Pine-to-Pine: динамические разделы, верхнее меню на десктопе,
 * нижняя панель на мобайле, документ в React-состоянии с персистом в localStorage
 * и синхронизацией через Supabase (см. store.ts).
 */
function App() {
  const { S, perms } = useTrip()
  const { dark, toggle } = useTheme()
  const [active, setActive] = useState(SECTIONS[0].id)
  const [search, setSearch] = useState(false)
  const reduce = useReducedMotion()
  /** Куда прокрутиться после перехода из поиска. */
  const pending = useRef<string | null>(null)

  const section = SECTIONS.find((s) => s.id === active) ?? SECTIONS[0]

  /* Переход из поиска: сменить раздел, дождаться отрисовки, подсветить строку. */
  const jump = useCallback((sectionId: string, itemId: string) => {
    setActive(sectionId)
    pending.current = itemId
  }, [])

  useEffect(() => {
    const id = pending.current
    if (!id) return
    pending.current = null
    const t = window.setTimeout(() => {
      const el = document.querySelector<HTMLElement>(`[data-hit="${CSS.escape(id)}"]`)
      if (!el) return
      el.scrollIntoView({ block: 'center' })
      el.animate(
        [{ background: 'var(--accent-soft)' }, { background: 'var(--accent-soft)' }, { background: 'transparent' }],
        { duration: 2000, easing: 'ease-out' },
      )
    }, 120)
    return () => window.clearTimeout(t)
  })

  /* Тап по знаку — возврат к началу страницы (и на мобильном, и на десктопе). */
  const goHome = useCallback(() => {
    window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' })
  }, [reduce])

  /* Ctrl/⌘+K — привычная горячая клавиша поиска на десктопе. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setSearch((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="min-h-svh">
      <TopNav
        sections={SECTIONS}
        active={active}
        onSelect={setActive}
        people={S.people}
        dark={dark}
        onToggleTheme={toggle}
        onSearch={() => setSearch(true)}
        onHome={goHome}
      />
      <MobileHeader
        dark={dark}
        onToggleTheme={toggle}
        onSearch={() => setSearch(true)}
        onHome={goHome}
      />

      <main className="mx-auto w-full max-w-[1280px] px-4 py-6 pb-28 lg:px-6 lg:py-8 lg:pb-12">
        {/* Без AnimatePresence mode="wait": там смена раздела ждёт окончания
            анимации ухода, и если кадры не рисуются (фоновая вкладка, экономия
            батареи), переключение просто зависает. Въезд нового раздела — есть,
            ожидания ухода старого — нет. */}
        <motion.section
          key={section.id}
          initial={reduce ? { opacity: 1 } : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduce ? 0 : 0.35, ease: [0.2, 0.8, 0.2, 1] }}
          aria-label={section.title}
        >
            {section.id === 'trip' ? (
              <TripSection S={S} perms={perms} />
            ) : section.id === 'gear' ? (
              <GearSection />
            ) : section.id === 'buy' ? (
              <BuySection />
            ) : section.id === 'road' ? (
              <RoadSection />
            ) : section.id === 'crew' ? (
              <CrewSection />
            ) : section.id === 'menu' ? (
              <MenuSection />
          ) : (
            <Placeholder section={section} />
          )}
        </motion.section>
      </main>

      <BottomNav sections={SECTIONS} active={active} onSelect={setActive} />
      <SearchCommand S={S} open={search} onOpenChange={setSearch} onJump={jump} />
      <Toaster />
    </div>
  )
}

export default App
