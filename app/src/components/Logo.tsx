import { useEffect, useRef } from 'react'
import emblemLight from '../assets/emblem-light.svg?raw'
import emblemDark from '../assets/emblem-dark.svg?raw'

/**
 * Знак сервиса: эмблема из брендбука + название «Pine-to-Pine».
 *
 * Название сервиса набирается ТОЛЬКО шрифтом Chewy (решение заказчика от 04.08.2026,
 * шрифт прислан им же, лицензия Apache 2.0, вшит base64 в src/fonts-chewy.css).
 * Ни системным шрифтом, ни капслоком название не пишется нигде.
 *
 * Эмблема инлайнится в DOM (безопасно: это наш статический файл из бандла), чтобы
 * CSS-правила из index.css красили её сквозные элементы в цвет фона var(--bg) —
 * знак «прозрачен» к заднику. Светлый/тёмный вариант переключается классом .dark.
 */

/** Название сервиса. Одно место на весь проект — менять только здесь. */
export const BRAND = 'Pine-to-Pine'

function parseSvg(raw: string): SVGSVGElement | null {
  const parsed = new DOMParser().parseFromString(raw, 'image/svg+xml')
  const root = parsed.documentElement
  if (!(root instanceof SVGSVGElement)) return null
  /* подпись даёт обёртка — у самой эмблемы она была бы дублем */
  root.removeAttribute('role')
  root.removeAttribute('aria-label')
  root.setAttribute('aria-hidden', 'true')
  return root
}

function InlineSvg({ raw, className }: { raw: string; className: string }) {
  const ref = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const host = ref.current
    if (!host) return
    const svg = parseSvg(raw)
    if (svg) host.replaceChildren(document.importNode(svg, true))
    return () => host.replaceChildren()
  }, [raw])

  return <span ref={ref} className={className} aria-hidden />
}

/** Одно только название, шрифтом Chewy — там, где эмблема не нужна. */
export function Wordmark({ size = 23, className }: { size?: number; className?: string }) {
  return (
    <span
      className={className}
      style={{
        fontFamily: 'var(--font-brand)',
        fontSize: size,
        lineHeight: 1,
        letterSpacing: '.01em',
        whiteSpace: 'nowrap',
      }}
    >
      {BRAND}
    </span>
  )
}

/**
 * Внутреннее соотношение знака (правка 04.08.2026).
 *
 * Заказчик просил знак покрупнее — «почти ничего не рассмотреть», — но он же раньше
 * просил уменьшить локап со 100 px («подумай о премиальном размере»). Поэтому растёт
 * не весь знак, а только эмблема: она несёт узнавание, слово несёт чтение.
 * При `height` 26–28 (мобильная и десктопная шапки) эмблема выходит 36–39 px,
 * слово остаётся прежних 21–23 px — ровно как до правки. Вызывающий код менять
 * не пришлось: пропорция живёт здесь.
 *
 * Полоса шапки — 56 px на мобильном и 64 px на десктопе, так что 39 px эмблемы
 * встают внутрь с запасом.
 */
const EMBLEM_RATIO = 1.4
/** Кегль слова от `height` — то же число, что было до правки: слово не растёт. */
const WORD_RATIO = 0.82

/**
 * Знак в шапке. `height` — не габарит, а базовая величина знака: от неё считаются
 * и эмблема, и слово (см. соотношения выше).
 *
 * Цвет слова — хвоя (`--pine`), решение заказчика 04.08.2026. Токен темизирован:
 * в светлой теме это #2B391A из брендбука, в тёмной — осветлённая кремом хвоя,
 * иначе слово слилось бы с фоном страницы (в тёмной теме фон и есть #2B391A).
 * Эмблемы это не касается: у неё в SVG свои заливки, `currentColor` в ней нет.
 *
 * Выравнивание — по центрам, а не по базовой линии текста. Эмблема выше слова,
 * и её оптический центр совпадает с геометрическим (рисунок вписан в квадрат
 * 326,8 × 326,8). У слова «Pine-to-Pine» нет выносных элементов вниз, а
 * `line-height: 1` делает строчную коробку симметричной — значит центр коробки
 * и есть оптический центр слова. Знак читается одним предметом, а не двумя.
 */
export function Logo({ height = 28 }: { height?: number }) {
  const emblem = Math.round(height * EMBLEM_RATIO)
  return (
    <span
      className="inline-flex shrink-0 items-center text-pine"
      /* Просвет считается от эмблемы: он должен расти вместе с ней, а не с высотой слова. */
      style={{ height: emblem, gap: Math.round(emblem * 0.2) }}
      role="img"
      aria-label={BRAND}
    >
      <span className="inline-flex h-full" style={{ width: emblem }}>
        <InlineSvg raw={emblemLight} className="logo logo-light h-full" />
        <InlineSvg raw={emblemDark} className="logo logo-dark h-full" />
      </span>
      <Wordmark size={Math.round(height * WORD_RATIO)} />
    </span>
  )
}
