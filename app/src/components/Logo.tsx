import { useEffect, useRef } from 'react'
import logoLight from '../assets/logo-light.svg?raw'
import logoDark from '../assets/logo-dark.svg?raw'

/**
 * Логотип FLOPS. Название сервиса никогда не набирается текстом — только этот знак.
 * SVG инлайнится в DOM (безопасно: это наши статические файлы из бандла), чтобы
 * CSS-правила из index.css красили песочные/хвойные элементы эмблемы в цвет фона
 * var(--bg) — логотип «прозрачен» к заднику. Светлый/тёмный вариант переключается
 * классом .dark на <html> (см. index.css).
 */

function parseSvg(raw: string): SVGSVGElement | null {
  const parsed = new DOMParser().parseFromString(raw, 'image/svg+xml')
  const root = parsed.documentElement
  return root instanceof SVGSVGElement ? root : null
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

  return <span ref={ref} className={className} />
}

export function Logo({ height = 44 }: { height?: number }) {
  return (
    <span className="inline-flex shrink-0" style={{ height }}>
      <InlineSvg raw={logoLight} className="logo logo-light h-full" />
      <InlineSvg raw={logoDark} className="logo logo-dark h-full" />
    </span>
  )
}
