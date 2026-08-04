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

function Head({ title, subtitle, onBack }: Pick<ResponsiveSheetProps, 'title' | 'subtitle' | 'onBack'>) {
  return (
    <div className="flex items-start gap-1 px-4 pt-1 pb-2 text-left">
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          aria-label="Назад"
          className="-ml-2 grid size-11 shrink-0 place-items-center rounded-xl text-muted hover:bg-zebra hover:text-ink"
        >
          <ChevronLeft size={22} strokeWidth={1.5} aria-hidden />
        </button>
      )}
      {/* Скринридеру заголовок уже объявлен через DrawerTitle/DialogTitle —
          здесь он был бы вторым таким же. Показываем его только глазами. */}
      <div className="min-w-0 flex-1 py-1" aria-hidden>
        <div className="text-xl leading-tight font-[650] text-ink text-balance">{title}</div>
        {subtitle ? <div className="mt-0.5 text-[13px] text-muted">{subtitle}</div> : null}
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

  if (desktop) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          showCloseButton
          className={cn(
            'max-h-[86dvh] gap-0 overflow-hidden rounded-2xl border border-line bg-surface p-0 text-ink sm:max-w-[480px]',
            className,
          )}
        >
          <DialogTitle className="sr-only">{a11yTitle}</DialogTitle>
          <DialogDescription className="sr-only">
            {typeof subtitle === 'string' ? subtitle : 'Карточка позиции'}
          </DialogDescription>
          {/* pr-10 — чтобы длинный заголовок не залезал под крестик закрытия */}
          <div className="shrink-0 pt-4 pr-10">
            <Head title={title} subtitle={subtitle} onBack={onBack} />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4">
            {children}
          </div>
          {footer ? (
            <div className="shrink-0 border-t border-line bg-surface p-4">{footer}</div>
          ) : null}
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      {/* Потолок высоты (88dvh) задан в ui/drawer.tsx — там у правила выше специфичность. */}
      <DrawerContent
        className={cn(
          'rounded-t-2xl border-line bg-surface text-ink [&>div:first-child]:bg-line-strong [&>div:first-child]:w-9',
          className,
        )}
      >
        <DrawerTitle className="sr-only">{a11yTitle}</DrawerTitle>
        <DrawerDescription className="sr-only">
          {typeof subtitle === 'string' ? subtitle : 'Карточка позиции'}
        </DrawerDescription>
        {/*
         * shrink-0 у шапки и подвала обязателен: без него длинное содержимое сжимает
         * подвал, кнопка «Готово» вылезает за низ шторки и срезается краем экрана.
         * Сжиматься и прокручиваться должна только середина.
         */}
        <div className="shrink-0 pt-3">
          <Head title={title} subtitle={subtitle} onBack={onBack} />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-2">
          {children}
        </div>
        {footer ? (
          <div
            className="shrink-0 border-t border-line bg-surface px-4 pt-3"
            style={{ paddingBottom: 'calc(12px + env(safe-area-inset-bottom))' }}
          >
            {footer}
          </div>
        ) : (
          <div className="shrink-0" style={{ height: 'calc(8px + env(safe-area-inset-bottom))' }} />
        )}
      </DrawerContent>
    </Drawer>
  )
}
