import { Search } from 'lucide-react'
import { Logo } from './Logo'
import { ThemeToggle } from './ThemeToggle'
import { MoreMenu } from './MoreMenu'

/** Высота полосы с кнопками, без учёта безопасной зоны. */
const BAR = 56

/**
 * Мобильная шапка: знак по левому краю, справа поиск, тема и «⋯».
 *
 * ─── Почему шапка `fixed`, а не `sticky` (правка 04.08.2026, третий заход) ───
 * Заказчик трижды присылал снимок из встроенного браузера Телеграма на iOS: над
 * шапкой, в полосе системного статуса и адреса, просвечивало содержимое страницы —
 * «сквозное отверстие: входит и выходит с обратной стороны». Прежние правки красили
 * фон шапки, но не трогали причину.
 *
 * Причин у «отверстия» две, и лечим обе разом:
 *
 * 1. `position: sticky` держится на том, что прокручивается корневой элемент.
 *    У нас `body { overflow-x: hidden }`, а всплытие overflow к области просмотра
 *    ломается, стоит любому слою (шторка Radix/vaul, движок Телеграма) поставить
 *    `overflow` на `<html>`. Тогда прокручивается уже `body`, липкость отваливается,
 *    шапка уезжает вверх — и наверху экрана оказывается карта. `position: fixed`
 *    от этого не зависит вовсе: шапка прибита к окну при любом устройстве прокрутки.
 *    Плата — распорка `<div>` той же высоты, чтобы содержимое не залезало под шапку.
 *
 * 2. Своя полоска Телеграма (крестик, адрес, «⋯») полупрозрачная и показывает
 *    сквозь себя страницу, если та не сказала, каким цветом полоску красить.
 *    Цвет говорит `<meta name="theme-color">` — он теперь один и меняется вместе
 *    с темой (см. `src/theme.ts`), а не привязан к системным настройкам.
 *
 * Фон — `var(--bg)`, ровно цвет фона сайта, без размытия и без полупрозрачности,
 * в обеих темах. Область `env(safe-area-inset-top)` залита тем же цветом дважды:
 * отступом самой шапки и отдельной полосой поверх неё — на случай, когда движок
 * рисует шапку ниже безопасной зоны.
 */
export function MobileHeader({
  dark,
  onToggleTheme,
  onSearch,
  onHome,
}: {
  dark: boolean
  onToggleTheme: () => void
  onSearch: () => void
  onHome: () => void
}) {
  return (
    <>
      {/* Полоса безопасной зоны: непрозрачная заливка цветом фона поверх всего. */}
      <div
        aria-hidden
        className="fixed inset-x-0 top-0 z-45 bg-bg lg:hidden"
        style={{ height: 'env(safe-area-inset-top)' }}
      />

      <header
        className="fixed inset-x-0 top-0 z-40 border-b border-line/70 bg-bg lg:hidden"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <div className="flex items-center justify-between px-4" style={{ height: BAR }}>
          <button
            type="button"
            onClick={onHome}
            aria-label="Pine-to-Pine — наверх"
            className="rounded-xl transition-opacity active:opacity-70"
          >
            <Logo height={26} />
          </button>
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="Поиск по листу"
              onClick={onSearch}
              className="grid size-11 place-items-center rounded-xl text-muted transition-colors hover:bg-zebra hover:text-ink"
            >
              <Search size={21} strokeWidth={1.5} aria-hidden />
            </button>
            <ThemeToggle dark={dark} onToggle={onToggleTheme} />
            <MoreMenu />
          </div>
        </div>
      </header>

      {/* Распорка под вынутую из потока шапку: содержимое начинается ровно под ней. */}
      <div
        aria-hidden
        className="lg:hidden"
        style={{ height: `calc(${BAR}px + env(safe-area-inset-top))` }}
      />
    </>
  )
}
