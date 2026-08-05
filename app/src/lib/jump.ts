/**
 * Переход к разделу и к строке внутри него.
 *
 * Механизм написан для поиска (`App.jump`) и понадобился второй раз — общему
 * «плюсу»: позиция заводится в СВОЁМ разделе (постулат 3.5 «один список —
 * один раздел»), значит человека туда надо увести. Иначе он остался бы смотреть
 * на список, в котором после нажатия ничего не появилось, — а это молчаливый
 * отказ (постулат 5).
 *
 * ⚠️ Строка может быть внутри свёрнутой группы или ещё не отрисована к моменту
 * перехода, поэтому ищем её несколько раз подряд и молча сдаёмся, если не нашли:
 * прыжок — украшение перехода, а не сам переход.
 */
import { anchorOf, scrollToSection } from '@/sections'

/**
 * Переход из меню. Его ставит `App`: там же гасится наблюдатель активного
 * раздела, иначе подчёркивание пробегает по всем разделам, через которые
 * страница пролетает по дороге. Без App (в тестах, в офлайн-копии до монтажа)
 * работает обычная прокрутка.
 */
let nav: ((id: string) => void) | null = null

export function setSectionNav(f: ((id: string) => void) | null): void {
  nav = f
}

export function goSection(id: string): void {
  if (nav) nav(id)
  else scrollToSection(id)
}

/** Виден ли раздел прямо сейчас — по этому решается, «здесь» человек или пришёл извне. */
export function sectionInView(id: string): boolean {
  if (typeof document === 'undefined') return false
  const el = document.getElementById(anchorOf(id))
  if (!el) return false
  const r = el.getBoundingClientRect()
  return r.top < window.innerHeight && r.bottom > 0
}

/** Прокрутить к разделу, дождаться строки и подсветить её. */
export function jumpToItem(sectionId: string, itemId: string): void {
  goSection(sectionId)
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
}
