import type { LegMode, RoutePoint, Transport } from '@/lib/types'

/**
 * Как выглядят метки и нитки на карте — в одном месте на обе карты сразу.
 *
 * Карт две (Google и запасная OpenStreetMap), и метки на них обязаны выглядеть
 * одинаково: человек не должен замечать, какая из них сегодня поднялась. Google
 * принимает готовый узел DOM (AdvancedMarkerElement), Leaflet — разметку строкой
 * (divIcon), поэтому здесь два способа собрать одно и то же оформление.
 *
 * Метки две по смыслу, и это главное:
 *   точка маршрута — кружок с номером; за точкой может стоять своя техника,
 *   и тогда кружок берёт её тон, а в углу появляется значок «по дороге / по воде
 *   / пешком»;
 *   конечная точка — пин с остриём вниз: кружок цвета хвои с палаткой, под ним
 *   хвостик, кончик которого и указывает на место, а ещё ниже — название.
 * Заказчик просил именно так: «Приозерское озеро Вуокса… оно прям на карте тоже
 * указывается» — цель поездки не должна теряться среди остановок по пути.
 */

/* ─────────── тона: бренд и его смеси ─────────── */

/**
 * Рисунок нитки маршрута. У каждой единицы техники он свой, и это не украшение:
 * различать нитки одним лишь цветом нельзя (WCAG 1.4.1) — цвет не виден
 * дальтонику и пропадает на распечатке. Тон и рисунок работают парой.
 */
export type DashKind = 'solid' | 'dash' | 'dot' | 'short' | 'dashdot'

/** Тон одной нитки: чем красим метку, чем пишем внутри неё и чем рисуем линию. */
export interface MapTone {
  /** заливка кружка и цвет нитки */
  fill: string
  /** номер внутри кружка — контраст к fill не ниже 4,5 : 1 */
  text: string
  dash: DashKind
}

/**
 * Тона карты. Ни одного постороннего цвета: четыре брендовых — графит #262513,
 * хвоя #2B391A, крем #F9F3D4, янтарь #BC6C25 — и их смеси между собой.
 *
 * Тона намеренно НЕ темизируются: подложка карты в любой теме светлая, и метка,
 * перекрашенная под тёмную тему, на ней просто исчезнет.
 *
 * Первый тон — общий: им идут точки, за которыми не закреплена техника. Он же
 * и был единственным до появления нескольких маршрутов, поэтому такие точки
 * выглядят ровно как раньше.
 */
export const MAP_TONES: MapTone[] = [
  /* янтарь, углублённый графитом (он же --accent-deep) */
  { fill: '#A74612', text: '#F9F3D4', dash: 'solid' },
  /* хвоя */
  { fill: '#2B391A', text: '#F9F3D4', dash: 'dash' },
  /* янтарь пополам с хвоей */
  { fill: '#73521F', text: '#F9F3D4', dash: 'dot' },
  /* янтарь с кремом на четверть — светлый тон, поэтому номер графитовый.
     ⚠️ Был бледнее (#DAAF7C). Заказчик 06.08.2026 (Г-5): «сделай цвета более
     выразительными… чтобы они не сливались». Крема убавлено вдвое, цвет
     остался брендовой смесью (постулат 10). Контраст с графитом 5,07 : 1. */
  { fill: '#CB8443', text: '#262513', dash: 'short' },
  /* хвоя с кремом — светлая олива. Была ровно пополам (#929677) и на подложке
     карты читалась как грязь; крема добавлено до двух третей. Контраст
     с графитом 7,1 : 1. */
  { fill: '#B1B293', text: '#262513', dash: 'dashdot' },
]

/**
 * Названия тонов — для выбора цвета ветки человеком. Цвет в интерфейсе
 * никогда не остаётся безымянным пятном: подпись читает и тот, кто цвета
 * не различает (WCAG 1.4.1), и она же звучит в `aria-label`.
 */
export const TONE_NAMES = ['Янтарь', 'Хвоя', 'Тёмный янтарь', 'Светлый янтарь', 'Олива']

/** Общий тон — точки без своей техники. */
export const COMMON_TONE = MAP_TONES[0]

/**
 * Штрихи веток. `solid` сюда не входит намеренно: сплошная линия закреплена
 * за ОБЩЕЙ ниткой (точки без своей техники), и отдавать её ветке нельзя —
 * иначе ветка отличалась бы от общей только цветом, а различие одним лишь
 * цветом запрещено (WCAG 1.4.1, та же причина, по которой штрихи вообще есть).
 */
const BRANCH_DASHES: DashKind[] = ['dash', 'dot', 'short', 'dashdot']

/**
 * Тон единицы техники по её месту в списке `S.transport`.
 *
 * ─── Зачем понадобилась развязка ───
 * Раньше тон и штрих лежали в `MAP_TONES` СВЯЗАННОЙ ПАРОЙ, а своих пар четыре.
 * Пятая техника получала пару первой — и две ветки становились неотличимы
 * полностью: ни цветом, ни рисунком. Заказчик прямо просил разные маршруты
 * у двух машин и лодки, значит пятая ветка — вопрос времени, а не «когда-нибудь».
 *
 * ─── Как развязано ───
 * Цвет берётся по `index % 4`, штрих — по `index / 4`, и в сумме это латинский
 * квадрат: у первых шестнадцати веток нет ни одного повтора СОЧЕТАНИЯ, и ни
 * одна пара соседних веток не совпадает ни цветом, ни штрихом. Новых цветов
 * не заведено ни одного — бренд по-прежнему из четырёх (постулат 10).
 *
 * ⚠️ Первые ЧЕТЫРЕ ветки выглядят ровно как до правки: `(0,0) (1,1) (2,2) (3,3)`
 * — это главная диагональ квадрата, то есть прежние пары один в один. Ни у кого
 * из команды карта не перекрасится.
 */
export function toneAt(index: number): MapTone {
  if (index < 0) return COMMON_TONE
  const colors = MAP_TONES.length - 1
  const base = MAP_TONES[1 + (index % colors)]
  const dash = BRANCH_DASHES[(index + Math.floor(index / colors)) % BRANCH_DASHES.length]
  return { fill: base.fill, text: base.text, dash }
}

/**
 * Тон одной единицы техники: свой, если человек его выбрал, иначе по месту
 * в списке. Заказчик 06.08.2026 (Г-5): «они по умолчанию присваиваются.
 * Можно поменять на другие какие-то».
 *
 * Штрих при своём цвете остаётся ПРЕЖНИМ — тем, что дало место в списке.
 * Так две ветки, которым человек выбрал один и тот же цвет, всё равно
 * различимы рисунком линии (WCAG 1.4.1, та же причина, по которой штрихи есть).
 */
export function toneOf(t: { tone?: number }, index: number): MapTone {
  const base = toneAt(index)
  const pick = t.tone
  if (typeof pick !== 'number' || !MAP_TONES[pick]) return base
  return { fill: MAP_TONES[pick].fill, text: MAP_TONES[pick].text, dash: base.dash }
}

/** Тон точки: `tr` — id техники, `order` — порядок id из `S.transport`. */
export function toneFor(tr: string | undefined, order: string[]): MapTone {
  if (!tr) return COMMON_TONE
  return toneAt(order.indexOf(tr))
}

/** `dashArray` для Leaflet. undefined — сплошная линия. */
export function leafletDash(d: DashKind): string | undefined {
  if (d === 'dash') return '12 8'
  if (d === 'dot') return '1 7'
  if (d === 'short') return '5 5'
  if (d === 'dashdot') return '12 6 2 6'
  return undefined
}

/** Один значок в нитке Google: линия или точка, её размер, шаг и сдвиг. */
export interface GoogleDashPart {
  shape: 'line' | 'dot'
  /** половина длины штриха (или радиус точки) в пикселях */
  scale: number
  repeat: string
  offset: string
}

/**
 * Как Google рисует прерывистую линию: сплошную ей заменяют повторяющиеся значки
 * при `strokeOpacity: 0`. null — линия сплошная, значки не нужны.
 */
export function googleDash(d: DashKind): GoogleDashPart[] | null {
  if (d === 'dash') return [{ shape: 'line', scale: 3, repeat: '20px', offset: '0' }]
  if (d === 'dot') return [{ shape: 'dot', scale: 2, repeat: '9px', offset: '0' }]
  if (d === 'short') return [{ shape: 'line', scale: 1.5, repeat: '10px', offset: '0' }]
  if (d === 'dashdot') {
    return [
      { shape: 'line', scale: 3, repeat: '22px', offset: '0' },
      { shape: 'dot', scale: 1.8, repeat: '22px', offset: '11px' },
    ]
  }
  return null
}

/* ─────────── нитки: у каждой техники своя ─────────── */

/** Одна нитка маршрута: чья она, каким тоном идёт и из каких точек собрана. */
export interface Thread {
  /** id техники из `S.transport`; пусто — общая нитка */
  tr: string
  tone: MapTone
  /** чем идут по этой нитке; null — техника не выбрана, значка в метке нет */
  leg: LegMode | null
  points: RoutePoint[]
}

/**
 * Разложить маршрут на нитки: своя на каждую единицу техники плюс общая для
 * точек без неё (заказчик 04.08.2026: «2 автомобиля с разным расходом и разным
 * маршрутом, и лодка тоже с разным маршрутом»).
 *
 * Порядок точек внутри нитки — тот же, в каком они идут в документе: маршрут
 * читается сверху вниз, и нитка обязана повторять ленту, а не спрямлять её.
 * Нитки идут в порядке `S.transport`, общая — первой: так тон каждой техники
 * не зависит от того, какую точку куда переставили.
 */
export function threads(points: RoutePoint[], transports: Transport[]): Thread[] {
  const order = transports.map((t) => t.i)
  /* Точка могла ссылаться на технику, которой в документе уже нет. Терять такую
     точку нельзя — она возвращается в общую нитку, на своё место по порядку. */
  const common = points.filter((p) => !p.tr || !order.includes(p.tr))
  const out: Thread[] = [{ tr: '', tone: COMMON_TONE, leg: null, points: common }]
  transports.forEach((t, idx) => {
    const own = points.filter((p) => p.tr === t.i)
    if (own.length === 0) return
    out.push({ tr: t.i, tone: toneOf(t, idx), leg: t.leg, points: own })
  })
  return out
}

/** Чем рисовать конкретную метку: тон нитки и значок участка. */
export interface MarkStyle {
  tone: MapTone
  leg: LegMode | null
}

/** Разложить нитки в справочник «точка → чем её рисовать». */
export function markStyles(list: Thread[]): Map<string, MarkStyle> {
  const out = new Map<string, MarkStyle>()
  for (const t of list) {
    for (const p of t.points) out.set(p.i, { tone: t.tone, leg: t.leg })
  }
  return out
}

/* ─────────── значки ─────────── */

/**
 * Узел значка: тег и атрибуты — ровно тот вид, в котором значки лежат в lucide.
 * Карта живёт вне React, готовый компонент туда не вставить, поэтому рисунок
 * приходится держать данными. Взято из lucide 1.28 без изменений.
 */
type IconNode = [string, Record<string, string>][]

/** lucide Tent — конечная точка поездки. */
const TENT: IconNode = [
  ['path', { d: 'M3.5 21 14 3' }],
  ['path', { d: 'M20.5 21 10 3' }],
  ['path', { d: 'M15.5 21 12 15l-3.5 6' }],
  ['path', { d: 'M2 21h20' }],
]

/** lucide Car — участок по дороге. */
const CAR: IconNode = [
  [
    'path',
    {
      d: 'M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2',
    },
  ],
  ['circle', { cx: '7', cy: '17', r: '2' }],
  ['path', { d: 'M9 17h6' }],
  ['circle', { cx: '17', cy: '17', r: '2' }],
]

/** lucide Sailboat — участок по воде. */
const SAILBOAT: IconNode = [
  ['path', { d: 'M10 2v15' }],
  ['path', { d: 'M7 22a4 4 0 0 1-4-4 1 1 0 0 1 1-1h16a1 1 0 0 1 1 1 4 4 0 0 1-4 4z' }],
  ['path', { d: 'M9.159 2.46a1 1 0 0 1 1.521-.193l9.977 8.98A1 1 0 0 1 20 13H4a1 1 0 0 1-.824-1.567z' }],
]

/** lucide Footprints — участок пешком. */
const FOOTPRINTS: IconNode = [
  [
    'path',
    {
      d: 'M4 16v-2.38C4 11.5 2.97 10.5 3 8c.03-2.72 1.49-6 4.5-6C9.37 2 10 3.8 10 5.5c0 3.11-2 5.66-2 8.68V16a2 2 0 1 1-4 0Z',
    },
  ],
  [
    'path',
    {
      d: 'M20 20v-2.38c0-2.12 1.03-3.12 1-5.62-.03-2.72-1.49-6-4.5-6C14.63 6 14 7.8 14 9.5c0 3.11 2 5.66 2 8.68V20a2 2 0 1 0 4 0Z',
    },
  ],
  ['path', { d: 'M16 17h4' }],
  ['path', { d: 'M4 13h4' }],
]

/** Значок участка: чем до точки добираются. */
const LEG_ICONS: Record<LegMode, IconNode> = {
  road: CAR,
  water: SAILBOAT,
  walk: FOOTPRINTS,
}

/** Общие атрибуты обводки значка — одна толщина на весь слой карты. */
const SVG_ATTRS: Record<string, string> = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  'stroke-width': '1.75',
  'stroke-linecap': 'round',
  'stroke-linejoin': 'round',
  'aria-hidden': 'true',
}

/** Значок разметкой — так его принимает Leaflet. */
function iconMarkup(node: IconNode, size: number): string {
  const head = Object.entries({ ...SVG_ATTRS, width: String(size), height: String(size) })
    .map(([k, v]) => `${k}="${v}"`)
    .join(' ')
  const body = node
    .map(([tag, attrs]) => {
      const a = Object.entries(attrs)
        .map(([k, v]) => `${k}="${v}"`)
        .join(' ')
      return `<${tag} ${a}/>`
    })
    .join('')
  return `<svg ${head}>${body}</svg>`
}

/** Тот же значок узлами — так его принимает Google. */
function iconElement(node: IconNode, size: number): SVGElement {
  const NS = 'http://www.w3.org/2000/svg'
  const svg = document.createElementNS(NS, 'svg')
  for (const [k, v] of Object.entries(SVG_ATTRS)) svg.setAttribute(k, v)
  svg.setAttribute('width', String(size))
  svg.setAttribute('height', String(size))
  for (const [tag, attrs] of node) {
    const el = document.createElementNS(NS, tag)
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v)
    svg.append(el)
  }
  return svg
}

/* ─────────── точка маршрута ─────────── */

/** Коробка метки: сам кружок плюс значок техники, вылезающий за его край. */
const POINT_ROOT = 'relative block size-7'

/** Кружок с номером. Заливка приходит тоном, поэтому её здесь нет. */
const POINT_CIRCLE =
  'grid size-7 place-items-center rounded-full border-2 border-brand-cream text-note ' +
  'font-bold shadow-md'

/** Значок техники в углу кружка: кремовая пуговица, рисунок — тоном нитки. */
const POINT_LEG =
  'absolute -right-1.5 -bottom-1.5 grid size-4 place-items-center rounded-full ' +
  'border border-brand-cream bg-brand-cream shadow-sm'

/** Пройденная точка — графит с кремом: состояние важнее принадлежности. */
const DONE_TONE: MapTone = { fill: '#262513', text: '#F9F3D4', dash: 'solid' }

/** Каким тоном рисовать кружок: пройденный этап всегда графитовый. */
function pinTone(tone: MapTone, done: boolean): MapTone {
  return done ? DONE_TONE : tone
}

/* ─────────── конечная точка ─────────── */

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
  'truncate rounded-md bg-brand-cream/95 px-1.5 py-0.5 text-micro leading-tight font-semibold ' +
  'text-brand-pine shadow-sm'

/** Название приезжает из документа — в разметку его вставлять только экранированным. */
function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;',
  )
}

/* ─────────── Leaflet: разметка строкой ─────────── */

/** Кружок с номером для divIcon. Размер 28 × 28, якорь по центру. */
export function pointPinHtml(
  n: number,
  done: boolean,
  tone: MapTone,
  leg?: LegMode | null,
): string {
  const t = pinTone(tone, done)
  const badge = leg
    ? `<span class="${POINT_LEG}" style="color:${t.fill}">${iconMarkup(LEG_ICONS[leg], 11)}</span>`
    : ''
  return (
    `<span class="${POINT_ROOT}">` +
    `<span class="${POINT_CIRCLE}" style="background:${t.fill};color:${t.text}">${n}</span>` +
    badge +
    '</span>'
  )
}

/** Внутренности конечной метки. Порядок узлов — это порядок наложения, см. хвостик выше. */
function destInner(name: string): string {
  return (
    `<span class="${DEST_TAIL_CREAM}"></span>` +
    `<span class="${DEST_CIRCLE}">${iconMarkup(TENT, 16)}</span>` +
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

/** Коротко: пустой узел с готовым набором классов. */
function span(cls: string): HTMLSpanElement {
  const el = document.createElement('span')
  el.className = cls
  return el
}

/**
 * Кружок с номером как узел DOM.
 *
 * Возвращается корневая коробка: к ней же карта подвешивает карточку метки
 * (см. TripMap.tsx), поэтому она `relative` и на неё можно вешать что угодно.
 */
export function pointPinEl(
  n: number,
  done: boolean,
  tone: MapTone,
  leg?: LegMode | null,
): HTMLElement {
  const t = pinTone(tone, done)
  const root = document.createElement('div')
  root.className = POINT_ROOT

  const circle = span(POINT_CIRCLE)
  circle.style.background = t.fill
  circle.style.color = t.text
  circle.textContent = String(n)
  root.append(circle)

  if (leg) {
    const badge = span(POINT_LEG)
    badge.style.color = t.fill
    badge.append(iconElement(LEG_ICONS[leg], 11))
    root.append(badge)
  }

  return centered(root)
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
  circle.append(iconElement(TENT, 16))

  const text = span(DEST_NAME)
  /* Название — только текстом: в документе может оказаться что угодно. */
  text.textContent = name

  el.append(span(DEST_TAIL_CREAM), circle, span(DEST_TAIL_PINE), text)
  return el
}
