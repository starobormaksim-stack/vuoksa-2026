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
 * Id блока, в который попадёт новая позиция: тот, что стоит перед глазами.
 *
 * ⛔ Мерим по СЕРЕДИНЕ видимой части, а не по её верхнему краю. Прежнее правило
 * («первый блок, чей низ ниже полосы шапки») выбирало блок, который лишь
 * доживает в верхних пикселях экрана: замер 08.08.2026 на 390 — человек читает
 * «Алкоголь и сигареты» посреди экрана, нажимает «плюс», а строка ложится
 * в «Снеки и сладкое», потому что низ «Снеков» проходил на 420 px, то есть
 * «ниже шапки». Заказчик в тот день сказал ровно об этом: «если я добавляю
 * какой-то пункт, допустим, в снеки… вот там, где я добавил, там оно и должно
 * появляться… чтобы я никуда не прыгал, не скакал, потом не искал».
 *
 * Середина — это то место, куда человек смотрит. Блок, который её накрывает,
 * и есть читаемый; если середину не накрывает никто (короткий список между
 * двумя длинными), берём ближайший к ней.
 */
export function visibleBlockId(root: HTMLElement | null, fallback: string): string {
  if (!root) return fallback
  const nodes = Array.from(root.querySelectorAll<HTMLElement>('[data-block]'))
  if (nodes.length === 0) return fallback
  const top = headerHeight()
  const mid = top + Math.max(0, window.innerHeight - top) / 2

  let best = nodes[0]
  let bestGap = Infinity
  for (const el of nodes) {
    const r = el.getBoundingClientRect()
    if (r.top <= mid && r.bottom >= mid) return el.dataset.block || fallback
    const gap = r.bottom < mid ? mid - r.bottom : r.top - mid
    if (gap < bestGap) {
      bestGap = gap
      best = el
    }
  }
  return best.dataset.block || fallback
}
