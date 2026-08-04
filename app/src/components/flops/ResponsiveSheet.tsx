import { useEffect, useState, type ReactNode } from 'react'
import { ChevronLeft } from 'lucide-react'
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
} from '@/components/ui/drawer'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

/**
 * Единая обёртка «шторка / окно» (docs/v2-ux-redesign.md, 5.4).
 * Мобайл (< 1024) — Drawer снизу с ручкой, десктоп — окно по центру шириной 480.
 *
 * Отступление от макета: на десктопе вместо Popover у строки — окно по центру.
 * Причина: строка списка сама по себе кнопка с вложенными кнопками, и якорить к ней
 * поповер во всех разделах пришлось бы шестью разными способами. Единый API вместо
 * этого даёт одну механику и на мобайле, и на десктопе.
 */

/** Ширина, с которой считаем экран десктопным. */
const DESKTOP = '(min-width: 1024px)'

export function useIsDesktop(): boolean {
  const [v, setV] = useState(() =>
    typeof window === 'undefined' ? false : window.matchMedia(DESKTOP).matches,
  )
  useEffect(() => {
    const mq = window.matchMedia(DESKTOP)
    const on = (e: MediaQueryListEvent) => setV(e.matches)
    mq.addEventListener('change', on)
    setV(mq.matches)
    return () => mq.removeEventListener('change', on)
  }, [])
  return v
}

export interface ResponsiveSheetProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  title: ReactNode
  subtitle?: ReactNode
  /** «‹» слева от заголовка — возврат на первый уровень шторки */
  onBack?: () => void
  children?: ReactNode
  /** прилипающий низ: обычно кнопка «Готово» */
  footer?: ReactNode
  className?: string
}

/*
 * ── Единая геометрия шторки и окна ──
 * Отступы, типографика и высота полос набраны здесь по одному разу и одинаковы
 * на телефоне и на десктопе. Раньше шапка, середина и подвал имели по своему
 * набору чисел в каждой из двух веток, и вторые уровни шторок «прыгали».
 *
 * Поле по бокам — PAD_X, одно на шапку, середину и подвал: заголовок и строки
 * списка обязаны стоять на одной вертикали.
 * Сверху до шапки 24 и на телефоне, и на десктопе: на телефоне эти 24 набирает
 * полоска-ручка (8 + 4 + 12, см. ui/drawer.tsx), на десктопе — одно pt-6.
 * Снизу у середины 16, у подвала 12 сверху и 12 снизу плюс безопасная зона.
 */
const PAD_X = 'px-4'

function Head({ title, subtitle, onBack }: Pick<ResponsiveSheetProps, 'title' | 'subtitle' | 'onBack'>) {
  return (
    <div className={cn('flex items-start gap-2 pb-4 text-left', PAD_X)}>
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          aria-label="Назад"
          className="-ml-2 grid size-11 shrink-0 place-items-center rounded-md text-muted transition-colors hover:bg-zebra hover:text-ink"
        >
          <ChevronLeft size={22} strokeWidth={1.5} aria-hidden />
        </button>
      )}
      {/* Скринридеру заголовок уже объявлен через DrawerTitle/DialogTitle —
          здесь он был бы вторым таким же. Показываем его только глазами.
          min-h-11 равен высоте кнопки «‹», поэтому шапка одинаковой высоты и на
          первом уровне, и на втором: заголовок не подпрыгивает при переходе.
          pt-2 ставит первую строку заголовка на одну линию со стрелкой. */}
      <div className="min-h-11 min-w-0 flex-1 pt-2" aria-hidden>
        <div className="text-head font-[650] text-ink text-balance">{title}</div>
        {subtitle ? <div className="mt-1 text-note text-muted">{subtitle}</div> : null}
      </div>
    </div>
  )
}

export function ResponsiveSheet({
  open,
  onOpenChange,
  title,
  subtitle,
  onBack,
  children,
  footer,
  className,
}: ResponsiveSheetProps) {
  const desktop = useIsDesktop()

  /* Заголовок для скринридера: у Drawer и Dialog он обязателен. */
  const a11yTitle = typeof title === 'string' ? title : 'Карточка'

  /*
   * shrink-0 у шапки и подвала обязателен: без него длинное содержимое сжимает
   * подвал, кнопка «Готово» вылезает за низ шторки и срезается краем экрана.
   * Сжиматься и прокручиваться должна только середина — она одна и несёт
   * min-h-0 flex-1 overflow-y-auto.
   */
  const body = (
    <div className={cn('min-h-0 flex-1 overflow-y-auto overscroll-contain pb-4', PAD_X)}>
      {children}
    </div>
  )

  if (desktop) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          showCloseButton
          className={cn(
            'max-h-[88dvh] gap-0 overflow-hidden bg-surface p-0 text-ink sm:max-w-[480px]',
            className,
          )}
        >
          <DialogTitle className="sr-only">{a11yTitle}</DialogTitle>
          <DialogDescription className="sr-only">
            {typeof subtitle === 'string' ? subtitle : 'Карточка позиции'}
          </DialogDescription>
          {/* pr-14 — чтобы длинный заголовок не залезал под крестик закрытия (44 + 12) */}
          <div className="shrink-0 pt-6 pr-14">
            <Head title={title} subtitle={subtitle} onBack={onBack} />
          </div>
          {body}
          {footer ? (
            <div className={cn('shrink-0 border-t border-line bg-surface py-3', PAD_X)}>
              {footer}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      {/* Потолок высоты (88dvh) и полоска-ручка заданы в ui/drawer.tsx —
          там у правил с data-атрибутом специфичность выше здешних классов. */}
      <DrawerContent className={cn('border-line bg-surface text-ink', className)}>
        <DrawerTitle className="sr-only">{a11yTitle}</DrawerTitle>
        <DrawerDescription className="sr-only">
          {typeof subtitle === 'string' ? subtitle : 'Карточка позиции'}
        </DrawerDescription>
        <div className="shrink-0">
          <Head title={title} subtitle={subtitle} onBack={onBack} />
        </div>
        {body}
        {footer ? (
          <div
            className={cn('shrink-0 border-t border-line bg-surface pt-3', PAD_X)}
            style={{ paddingBottom: 'calc(12px + env(safe-area-inset-bottom))' }}
          >
            {footer}
          </div>
        ) : (
          /* Без подвала низ шторки всё равно обязан отступить от жеста «домой». */
          <div className="shrink-0" style={{ height: 'env(safe-area-inset-bottom)' }} />
        )}
      </DrawerContent>
    </Drawer>
  )
}
