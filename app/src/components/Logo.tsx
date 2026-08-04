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
 * Высота знака в шапке: 26 px на мобильном, 28 px на десктопе. Это тот диапазон,
 * в котором знак читается и не давит на содержимое — крупнее он начинает
 * конкурировать с заголовками экрана.
 */
export function Logo({ height = 28 }: { height?: number }) {
  return (
    <span
      className="inline-flex shrink-0 items-center text-ink"
      style={{ height, gap: Math.round(height * 0.28) }}
      role="img"
      aria-label={BRAND}
    >
      <span className="inline-flex h-full" style={{ width: height }}>
        <InlineSvg raw={emblemLight} className="logo logo-light h-full" />
        <InlineSvg raw={emblemDark} className="logo logo-dark h-full" />
      </span>
      <Wordmark size={Math.round(height * 0.82)} />
    </span>
  )
}
