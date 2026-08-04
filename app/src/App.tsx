import { useCallback, useEffect, useRef, useState } from 'react'
import { useReducedMotion } from 'motion/react'
import { SECTIONS, anchorOf, scrollToSection, type SectionDef } from './sections'
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
 * Каркас Pine-to-Pine.
 *
 * ─── Единый лендинг (решение заказчика 04.08.2026) ───
 * Разделы больше не подменяют друг друга. Вся поездка — одна длинная страница:
 * разделы идут сверху вниз, прокруткой. Меню (верхнее и нижнее) ничего не переключает,
 * а прокручивает к разделу и подсвечивает тот, что сейчас на экране.
 * Раньше нажатие «Сборы» убирало «Поездку» с глаз, и заказчик справедливо сказал,
 * что так лист поездки не читается: он один, а не шесть отдельных экранов.
 *
 * Активный пункт определяет IntersectionObserver: полоса наблюдения начинается сразу
 * под шапкой и заканчивается на середине экрана, активным считается первый сверху
 * раздел, попавший в эту полосу.
 */
function App() {
  const { S, perms } = useTrip()
  const { dark, toggle } = useTheme()
  const [search, setSearch] = useState(false)
  const reduce = useReducedMotion()
  const { active, goTo } = useSectionNav(SECTIONS)

  /* Переход из поиска: прокрутить к разделу, дождаться строки и подсветить её.
     Строка может быть внутри свёрнутой группы или ещё не отрисованной вкладки,
     поэтому ищем её не один раз, а несколько подряд — и молча сдаёмся, если не нашли. */
  const jump = useCallback((sectionId: string, itemId: string) => {
    goTo(sectionId)
    let tries = 0
    const tick = () => {
      const el = document.querySelector<HTMLElement>(`[data-hit="${CSS.escape(itemId)}"]`)
      if (el) {
        el.scrollIntoView({ block: 'center' })
        el.animate(
          [
            { background: 'var(--accent-soft)' },
            { background: 'var(--accent-soft)' },
            { background: 'transparent' },
          ],
          { duration: 2000, easing: 'ease-out' },
        )
        return
      }
      if (++tries < 12) window.setTimeout(tick, 120)
    }
    window.setTimeout(tick, 160)
  }, [goTo])

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
        onSelect={goTo}
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
        {/* Все разделы на странице сразу, каждый — своя секция с якорем.
            `scroll-margin-top` уводит заголовок из-под прилипающей шапки. */}
        <div className="flex flex-col gap-10 lg:gap-14">
          {SECTIONS.map((s) => (
            <section
              key={s.id}
              id={anchorOf(s.id)}
              aria-label={s.title}
              className="scroll-mt-20 lg:scroll-mt-24"
            >
              {s.id === 'trip' ? (
                <TripSection S={S} perms={perms} />
              ) : s.id === 'gear' ? (
                <GearSection />
              ) : s.id === 'buy' ? (
                <BuySection />
              ) : s.id === 'road' ? (
                <RoadSection />
              ) : s.id === 'crew' ? (
                <CrewSection />
              ) : s.id === 'menu' ? (
                <MenuSection />
              ) : (
                <Placeholder section={s} />
              )}
            </section>
          ))}
        </div>
      </main>

      <BottomNav sections={SECTIONS} active={active} onSelect={goTo} />
      <SearchCommand S={S} open={search} onOpenChange={setSearch} onJump={jump} />
      <Toaster />
    </div>
  )
}

/**
 * Активный раздел и переход к нему.
 *
 * Пока идёт плавная прокрутка, наблюдатель молчит: иначе подчёркивание пробегает
 * по всем разделам, через которые страница пролетает по дороге к нужному.
 */
function useSectionNav(sections: SectionDef[]): {
  active: string
  goTo: (id: string) => void
} {
  const [active, setActive] = useState(sections[0]?.id ?? '')
  /** до какого момента наблюдатель не вмешивается (идёт наша прокрутка) */
  const quiet = useRef(0)

  const goTo = useCallback((id: string) => {
    setActive(id)
    quiet.current = Date.now() + 900
    scrollToSection(id)
  }, [])

  const ids = sections.map((s) => s.id).join('|')
  useEffect(() => {
    const list = ids.split('|').filter(Boolean)

    /**
     * Активным считается последний раздел, чей верх уже ушёл под шапку.
     * Считаем геометрией, а не одним лишь IntersectionObserver: наблюдатель молчит,
     * пока вкладка не рисует кадры (фоновая вкладка, экономия батареи, встроенный
     * браузер Телеграма в момент прокрутки), и подсветка тогда просто застревает.
     * Наблюдатель оставлен вторым будильником — он дёргает тот же расчёт.
     */
    const pick = () => {
      if (Date.now() < quiet.current) return
      /* Дочитали до самого низа — смотрим последний раздел, каким бы коротким он ни был. */
      const atBottom =
        window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4
      let hit = list[0]
      if (atBottom) {
        hit = list[list.length - 1]
      } else {
        /* Порог — нижний край прилипающей шапки плюс небольшой запас. */
        const line = 96
        for (const id of list) {
          const el = document.getElementById(anchorOf(id))
          if (el && el.getBoundingClientRect().top <= line) hit = id
        }
      }
      if (hit) setActive((cur) => (cur === hit ? cur : hit))
    }

    const io = new IntersectionObserver(() => pick(), { threshold: [0, 1] })
    list.forEach((id) => {
      const el = document.getElementById(anchorOf(id))
      if (el) io.observe(el)
    })

    window.addEventListener('scroll', pick, { passive: true })
    window.addEventListener('resize', pick)
    pick()
    return () => {
      io.disconnect()
      window.removeEventListener('scroll', pick)
      window.removeEventListener('resize', pick)
    }
  }, [ids])

  return { active, goTo }
}

export default App
