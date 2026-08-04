import { useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { SECTIONS } from './sections'
import { useDoc } from './store'
import { useTheme } from './theme'
import { TopNav } from './components/TopNav'
import { MobileHeader } from './components/MobileHeader'
import { BottomNav } from './components/BottomNav'
import { Placeholder } from './components/Placeholder'
import { TripSection } from './components/trip/TripSection'

/**
 * Каркас FLOPS v2: динамические разделы, верхнее меню на десктопе,
 * нижняя панель на мобайле, документ в React-состоянии с персистом в localStorage.
 * TODO: сетевая синхронизация и слияние правок по позициям — отдельным слоем.
 */
function App() {
  const [doc, update] = useDoc()
  const { dark, toggle } = useTheme()
  const [active, setActive] = useState(SECTIONS[0].id)
  const reduce = useReducedMotion()

  const section = SECTIONS.find((s) => s.id === active) ?? SECTIONS[0]

  return (
    <div className="min-h-svh">
      <TopNav
        sections={SECTIONS}
        active={active}
        onSelect={setActive}
        people={doc.people}
        dark={dark}
        onToggleTheme={toggle}
      />
      <MobileHeader dark={dark} onToggleTheme={toggle} />

      <main className="mx-auto max-w-[1120px] px-4 py-6 pb-28 lg:px-6 lg:py-8 lg:pb-12">
        <AnimatePresence mode="wait" initial={false}>
          <motion.section
            key={section.id}
            initial={reduce ? { opacity: 1 } : { opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 1 } : { opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.4, ease: [0.2, 0.8, 0.2, 1] }}
            aria-label={section.title}
          >
            {section.id === 'trip' ? (
              <TripSection S={doc} update={update} />
            ) : (
              <Placeholder section={section} />
            )}
          </motion.section>
        </AnimatePresence>
      </main>

      <BottomNav sections={SECTIONS} active={active} onSelect={setActive} />
    </div>
  )
}

export default App
