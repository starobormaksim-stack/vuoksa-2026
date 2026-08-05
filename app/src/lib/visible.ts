/**
 * Какой блок раздела сейчас перед глазами.
 *
 * Нужно липкому «плюсу»: заказчик 06.08.2026 — «захотел добавить что-то новое —
 * у меня есть всегда при прокрутке… с правой стороны плюсик, оно как бы
 * прилипает». Кнопка одна, а подразделов в «Сборах» пять, и класть новую вещь
 * всегда в первый нельзя: человек, дочитавший до «Аптечки», получил бы строку
 * в «Одежде» и не нашёл её.
 *
 * ⚠️ Считается `getBoundingClientRect()` в момент нажатия, а не наблюдателем.
 * `IntersectionObserver` в среде проверки спит, а доставка событий `scroll`
 * заморожена (см. `.claude/rules/environment.md`) — замер по требованию честен
 * везде и не заводит ни подписок, ни состояния.
 */

/** Высота липкой шапки: под ней и проходит граница «вижу — не вижу». */
function headerHeight(): number {
  if (typeof document === 'undefined') return 0
  const v = getComputedStyle(document.documentElement).getPropertyValue('--header-h')
  const n = parseFloat(v)
  return Number.isFinite(n) ? n : 56
}

/**
 * Id блока, в который попадёт новая позиция.
 *
 * Берём первый блок, чей низ ещё ниже полосы шапки, — то есть тот, который
 * человек сейчас читает. Все прокручены выше — значит он в конце списка,
 * и новая позиция идёт в последний блок.
 */
export function visibleBlockId(root: HTMLElement | null, fallback: string): string {
  if (!root) return fallback
  const nodes = Array.from(root.querySelectorAll<HTMLElement>('[data-block]'))
  if (nodes.length === 0) return fallback
  const edge = headerHeight() + 1
  for (const el of nodes) {
    const r = el.getBoundingClientRect()
    if (r.bottom > edge) return el.dataset.block || fallback
  }
  return nodes[nodes.length - 1].dataset.block || fallback
}
