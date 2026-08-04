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
 *   конечная точка — пин с остриём вниз: кружок цвета хвои с палаткой, под ним
 *   хвостик, кончик которого и указывает на место, а ещё ниже — название.
 * Заказчик просил именно так: «Приозерское озеро Вуокса… оно прям на карте тоже
 * указывается» — цель поездки не должна теряться среди остановок по пути.
 * До этого конечная была широкой плашкой с названием внутри: она закрывала пол-озера,
 * и понять, на какую именно точку берега она показывает, было нельзя.
 */

/** Кружок с номером — точка маршрута. */
const POINT_CLASS =
  'grid size-7 place-items-center rounded-full border-2 border-surface text-[13px] ' +
  'font-bold shadow-md'

/**
 * Размер конечной метки: кружок 32 px плюс хвостик под ним. Кончик хвостика —
 * нижняя середина этого прямоугольника — и есть отмеченное место. По этим числам
 * ставится якорь на обеих картах, поэтому они вынесены наружу, а не зашиты в классы.
 */
export const DEST_W = 32
export const DEST_H = 42

/** Коробка метки. Название висит ниже абсолютом и на высоту не влияет — иначе уедет якорь. */
const DEST_ROOT = 'relative block h-[42px] w-8'

/** Кружок цвета хвои с кремовой каймой. */
const DEST_CIRCLE =
  'absolute top-0 left-0 grid size-8 place-items-center rounded-full border-2 ' +
  'border-brand-cream bg-brand-pine text-brand-cream shadow-md'

/* Хвостик — два треугольника на границах CSS, один поверх другого. Кремовый шире и
   длиннее: он продолжает кайму кружка и доводит метку до самого кончика (29 + 13 = 42).
   Хвойный лежит сверху и заходит на кружок, чтобы шея была сплошная, а не в кайме. */
const DEST_TAIL_CREAM =
  'absolute top-[29px] left-1/2 size-0 -translate-x-1/2 border-x-8 border-x-transparent ' +
  'border-t-[13px] border-t-brand-cream'
const DEST_TAIL_PINE =
  'absolute top-[29px] left-1/2 size-0 -translate-x-1/2 border-x-[5px] border-x-transparent ' +
  'border-t-[11px] border-t-brand-pine'

/** Название под пином: отдельной строкой, мельче и с подложкой — поверх карты иначе не прочесть. */
const DEST_NAME =
  'pointer-events-none absolute top-full left-1/2 mt-1 block max-w-[150px] -translate-x-1/2 ' +
  'truncate rounded-md bg-brand-cream/95 px-1.5 py-0.5 text-[12px] leading-tight font-semibold ' +
  'text-brand-pine shadow-sm'

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
  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
  'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  TENT_PATHS.map((d) => `<path d="${d}"/>`).join('') +
  '</svg>'

/** Кружок с номером для divIcon. Размер 28 × 28, якорь по центру. */
export function pointPinHtml(n: number, done: boolean): string {
  return `<span class="${POINT_CLASS} ${pointTone(done)}">${n}</span>`
}

/** Внутренности конечной метки. Порядок узлов — это порядок наложения, см. хвостик выше. */
function destInner(name: string): string {
  return (
    `<span class="${DEST_TAIL_CREAM}"></span>` +
    `<span class="${DEST_CIRCLE}">${TENT_SVG}</span>` +
    `<span class="${DEST_TAIL_PINE}"></span>` +
    `<span class="${DEST_NAME}">${esc(name)}</span>`
  )
}

/** Конечная метка для divIcon. Якорь ставит вызывающий — по DEST_W и DEST_H. */
export function destPinHtml(name: string): string {
  return `<span class="${DEST_ROOT}">${destInner(name)}</span>`
}

/* ─────────── Google: готовый узел ─────────── */

/**
 * У AdvancedMarkerElement содержимое по умолчанию стоит НАД точкой: нижней серединой
 * ровно на координате, как капля остриём вниз. Кружку маршрута острия взять неоткуда,
 * ему нужен центр — сдвигаем на половину высоты. Конечной метке этот сдвиг не нужен:
 * у неё остриё настоящее, и оно как раз внизу по центру.
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
  svg.setAttribute('width', '16')
  svg.setAttribute('height', '16')
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

/** Коротко: пустой узел с готовым набором классов. */
function span(cls: string): HTMLSpanElement {
  const el = document.createElement('span')
  el.className = cls
  return el
}

/**
 * Конечная метка как узел DOM.
 *
 * Слои и их порядок — те же, что в destInner для Leaflet: обе карты обязаны
 * показывать один и тот же пин, человек не должен видеть, какая из них сегодня
 * поднялась. Классы на оба способа общие, поэтому расходиться нечему.
 *
 * Центрирование здесь не нужно и вредно: AdvancedMarkerElement ставит содержимое
 * нижней серединой ровно на координату, а нижняя середина у нас — кончик хвостика.
 */
export function destPinEl(name: string): HTMLElement {
  const el = document.createElement('div')
  el.className = DEST_ROOT

  const circle = span(DEST_CIRCLE)
  circle.append(tentNode())

  const text = span(DEST_NAME)
  /* Название — только текстом: в документе может оказаться что угодно. */
  text.textContent = name

  el.append(span(DEST_TAIL_CREAM), circle, span(DEST_TAIL_PINE), text)
  return el
}
