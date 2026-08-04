/**
 * Как выглядят метки на карте — в одном месте на обе карты сразу.
 *
 * Карт две (Google и запасная OpenStreetMap), и метки на них обязаны выглядеть
 * одинаково: человек не должен замечать, какая из них сегодня поднялась. Google
 * принимает готовый узел DOM (AdvancedMarkerElement), Leaflet — строку разметки
 * (divIcon), поэтому здесь два способа собрать одно и то же оформление.
 *
 * Метки две по смыслу, и это главное:
 *   точка маршрута — кружок с номером, янтарный (пройденная — графитовая);
 *   конечная точка — подписанная плашка цвета хвои, с домиком-палаткой.
 * Заказчик просил именно так: «Приозерское озеро Вуокса… оно прям на карте тоже
 * указывается» — цель поездки не должна теряться среди остановок по пути.
 */

/** Кружок с номером — точка маршрута. */
const POINT_CLASS =
  'grid size-7 place-items-center rounded-full border-2 border-surface text-[13px] ' +
  'font-bold shadow-md'

/** Плашка с названием — конечная точка поездки. */
const DEST_CLASS =
  'flex max-w-[240px] items-center gap-1.5 rounded-full border-2 border-brand-cream ' +
  'bg-brand-pine px-2.5 py-1 text-[12px] font-bold whitespace-nowrap text-brand-cream shadow-md'

/** Значок палатки внутри плашки (lucide Tent: карта живёт вне React, рисуем руками). */
const TENT_PATHS = ['M3.5 21 14 3', 'M20.5 21 10 3', 'M15.5 21 12 15l-3.5 6', 'M2 21h20']

/** Название приезжает из документа — в разметку его вставлять только экранированным. */
function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;',
  )
}

const pointTone = (done: boolean) => (done ? 'bg-ink text-bg' : 'bg-accent-fill text-on-accent')

/* ─────────── Leaflet: разметка строкой ─────────── */

/** Тот же значок палатки, но строкой — Leaflet принимает только разметку. */
const TENT_SVG =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
  'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  TENT_PATHS.map((d) => `<path d="${d}"/>`).join('') +
  '</svg>'

/** Кружок с номером для divIcon. Размер 28 × 28, якорь по центру. */
export function pointPinHtml(n: number, done: boolean): string {
  return `<span class="${POINT_CLASS} ${pointTone(done)}">${n}</span>`
}

/**
 * Плашка конечной точки для divIcon. Ширина плавает вместе с названием,
 * поэтому у иконки нулевой размер, а плашка центрируется сама.
 */
export function destPinHtml(name: string): string {
  return (
    `<span class="${DEST_CLASS}" style="position:absolute;left:0;top:0;` +
    `transform:translate(-50%,-50%)">${TENT_SVG}<span>${esc(name)}</span></span>`
  )
}

/* ─────────── Google: готовый узел ─────────── */

/**
 * У AdvancedMarkerElement содержимое по умолчанию стоит НАД точкой (как капля,
 * остриём вниз). Нашим кружку и плашке нужен центр — сдвигаем на половину высоты.
 */
function centered(el: HTMLElement): HTMLElement {
  el.style.transform = 'translateY(50%)'
  return el
}

/** Кружок с номером как узел DOM. */
export function pointPinEl(n: number, done: boolean): HTMLElement {
  const el = document.createElement('div')
  el.className = `${POINT_CLASS} ${pointTone(done)}`
  el.textContent = String(n)
  return centered(el)
}

/** Значок палатки узлами SVG — без разметки строкой, её здесь взять неоткуда. */
function tentNode(): SVGElement {
  const NS = 'http://www.w3.org/2000/svg'
  const svg = document.createElementNS(NS, 'svg')
  svg.setAttribute('width', '14')
  svg.setAttribute('height', '14')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('fill', 'none')
  svg.setAttribute('stroke', 'currentColor')
  svg.setAttribute('stroke-width', '2')
  svg.setAttribute('stroke-linecap', 'round')
  svg.setAttribute('stroke-linejoin', 'round')
  svg.setAttribute('aria-hidden', 'true')
  for (const d of TENT_PATHS) {
    const p = document.createElementNS(NS, 'path')
    p.setAttribute('d', d)
    svg.append(p)
  }
  return svg
}

/** Плашка конечной точки как узел DOM. */
export function destPinEl(name: string): HTMLElement {
  const el = document.createElement('div')
  el.className = DEST_CLASS
  const text = document.createElement('span')
  /* Название — только текстом: в документе может оказаться что угодно. */
  text.textContent = name
  el.append(tentNode(), text)
  return centered(el)
}
