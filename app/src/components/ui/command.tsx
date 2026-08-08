import * as React from "react"
import { Command as CommandPrimitive } from "cmdk"

import { cn } from "@/lib/utils"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { SearchIcon, CheckIcon } from "lucide-react"

/*
 * ⚠️ Кегли здесь — шкала проекта (12 / 13 / 15,5 / 20 …), а не `text-sm`
 * и `text-xs` из образца shadcn. Заказчик 05.08.2026: «я нажимаю на поиск,
 * и там какая-то херобора… наверху всё перекошено, дизайн не единообразен,
 * и размеры у тебя все везде по-разному». Замер это подтвердил: поле ввода
 * было 30 px высоты при цели касания 44, кегль 14 px — чужой шкале, а строки
 * находок под ним 53 px. Чужие кегли приезжают из компонента-органа, а не
 * из экрана (урок У-71), поэтому чинится здесь, а не в SearchCommand.tsx.
 */

function Command({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive>) {
  return (
    <CommandPrimitive
      data-slot="command"
      className={cn(
        "flex size-full flex-col overflow-hidden rounded-xl! bg-popover text-popover-foreground",
        className
      )}
      {...props}
    />
  )
}

function CommandDialog({
  title = "Command Palette",
  description = "Search for a command to run...",
  children,
  className,
  showCloseButton = false,
  shouldFilter,
  ...props
}: React.ComponentProps<typeof Dialog> & {
  title?: string
  description?: string
  className?: string
  showCloseButton?: boolean
  /** отбирать ли находки своими силами: `false` — отбор делает экран (см. SearchCommand) */
  shouldFilter?: boolean
}) {
  return (
    <Dialog {...props}>
      <DialogHeader className="sr-only">
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      <DialogContent
        className={cn(
          /* ⛔ На телефоне окно прижато к ВЕРХУ (top-4), а не к трети высоты.
             Центрированное окно на iPhone накрывается клавиатурой: поле ввода
             стояло на y ≈ 281, клавиатура занимает нижнюю половину, Safari
             дёргает вьюпорт к полю — и окно «съезжает» (слово заказчика,
             08.08.2026). Наверху окну дёргаться некуда: поле видно всегда,
             клавиатура срезает только хвост списка. На десктопе клавиатуры
             нет — там прежняя треть высоты. */
          "top-4 translate-y-0 overflow-hidden rounded-xl! p-0 sm:top-1/3",
          className
        )}
        showCloseButton={showCloseButton}
      >
        {/* ⚠️ Обёртка <Command> ОБЯЗАТЕЛЬНА и однажды была здесь потеряна.
            Поле ввода, список и строки поиска берут своё состояние из контекста
            этого компонента. Без него первый же дочерний элемент обращается
            к несуществующему хранилищу («Cannot read properties of undefined
            (reading 'subscribe')»), React выбрасывает исключение при отрисовке
            и сносит ВСЁ дерево приложения — экран становится пустым.
            Заказчик 04.08.2026: «нажимаю на строку поиска, и у меня полностью
            весь сервис закрывается». Не удалять. */}
        <Command shouldFilter={shouldFilter}>{children}</Command>
      </DialogContent>
    </Dialog>
  )
}

function CommandInput({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Input>) {
  return (
    /* Поле во всю ширину окна, значок слева, волосяная линия снизу — так же,
       как шапка отделена от содержимого в шторках. Высота 52 (шкала 36 · 44 · 52):
       это главный орган окна, и он не может быть мельче строки находки. */
    <div
      data-slot="command-input-wrapper"
      className="flex h-13 shrink-0 items-center gap-3 border-b border-line px-4"
    >
      <SearchIcon size={20} strokeWidth={1.75} aria-hidden className="shrink-0 text-muted" />
      <CommandPrimitive.Input
        data-slot="command-input"
        className={cn(
          "h-13 w-full bg-transparent text-body text-ink outline-hidden placeholder:text-muted disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        {...props}
      />
    </div>
  )
}

function CommandList({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.List>) {
  return (
    <CommandPrimitive.List
      data-slot="command-list"
      className={cn(
        "no-scrollbar max-h-72 scroll-py-2 overflow-x-hidden overflow-y-auto p-1.5 outline-none",
        className
      )}
      {...props}
    />
  )
}

function CommandEmpty({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Empty>) {
  return (
    <CommandPrimitive.Empty
      data-slot="command-empty"
      className={cn("py-6 text-center text-note text-muted", className)}
      {...props}
    />
  )
}

function CommandGroup({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Group>) {
  return (
    <CommandPrimitive.Group
      data-slot="command-group"
      className={cn(
        "overflow-hidden text-foreground **:[[cmdk-group-heading]]:px-3 **:[[cmdk-group-heading]]:pt-3 **:[[cmdk-group-heading]]:pb-1 **:[[cmdk-group-heading]]:text-micro **:[[cmdk-group-heading]]:font-semibold **:[[cmdk-group-heading]]:text-muted",
        className
      )}
      {...props}
    />
  )
}

function CommandSeparator({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Separator>) {
  return (
    <CommandPrimitive.Separator
      data-slot="command-separator"
      className={cn("-mx-1 h-px bg-border", className)}
      {...props}
    />
  )
}

function CommandItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Item>) {
  return (
    <CommandPrimitive.Item
      data-slot="command-item"
      className={cn(
        "group/command-item relative flex min-h-11 cursor-default items-center gap-3 rounded-lg px-3 py-2 text-body outline-hidden select-none in-data-[slot=dialog-content]:rounded-lg! data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 data-selected:bg-zebra data-selected:text-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 data-selected:*:[svg]:text-foreground",
        className
      )}
      {...props}
    >
      {children}
      {/* ⛔ `hidden`, а не `opacity-0`: невидимый значок — это всё равно 16 px
          плюс зазор, и правый столбец каждой находки стоял на 28 px левее края
          окна. Отметок `data-checked` у поиска нет вовсе — место резервировалось
          под то, что никогда не показывается (постулат 7: лишних пробелов нет). */}
      <CheckIcon className="ml-auto hidden group-has-data-[slot=command-shortcut]/command-item:hidden group-data-[checked=true]/command-item:inline-block" />
    </CommandPrimitive.Item>
  )
}

function CommandShortcut({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="command-shortcut"
      className={cn(
        "ml-auto text-micro tracking-widest text-muted group-data-selected/command-item:text-foreground",
        className
      )}
      {...props}
    />
  )
}

export {
  Command,
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
  CommandSeparator,
}
