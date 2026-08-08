import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { ResponsiveSheet, useIsDesktop } from './ResponsiveSheet'
import { Btn } from './Btn'

/**
 * Правка одной текстовой строки — второй уровень поверх карточки позиции.
 * Поле живёт только здесь: в списке полей ввода не бывает (правило 1 UX-проекта).
 */
export function TextSheet({
  open,
  onOpenChange,
  title,
  subtitle,
  value,
  placeholder,
  multiline,
  quiet,
  onDone,
  onBack,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  title: string
  subtitle?: string
  value: string
  placeholder?: string
  multiline?: boolean
  /**
   * Шаг внутри мастера, где сущность ещё не заведена: свой тост «сохранено»
   * не показывать — иначе человек видит «готово» на середине пути.
   * По умолчанию выключено: обычная правка тост показывает.
   */
  quiet?: boolean
  onDone: (v: string) => void
  onBack?: () => void
}) {
  const [draft, setDraft] = useState(value)
  useEffect(() => {
    if (open) setDraft(value)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  /*
   * ⛔ На телефоне поле НЕ фокусируется атрибутом autoFocus. Шторка vaul при
   * фокусе в поле сама подвозит себя над клавиатурой (repositionInputs), и если
   * фокус случается ВО ВРЕМЯ входной анимации, расчёт сдвига на iOS ломается —
   * шторку уносит за верх экрана целиком (заказчик 08.08.2026: «вверх улетает
   * весь попап, и я ничего не вижу» при добавлении участника). Поэтому фокус
   * приходит после того, как шторка доехала (анимация vaul — полсекунды).
   * На десктопе окно не движется и клавиатуры нет — там фокус сразу.
   */
  const desktop = useIsDesktop()
  const box = useRef<HTMLElement | null>(null)
  useEffect(() => {
    if (!open || desktop) return
    const t = window.setTimeout(() => box.current?.focus(), 550)
    return () => window.clearTimeout(t)
  }, [open, desktop])

  const save = () => {
    const next = draft.trim()
    onOpenChange(false)
    if (next === value) return
    onDone(next)
    if (quiet) return
    toast(`${title} сохранено`, {
      action: { label: 'Отменить', onClick: () => onDone(value) },
    })
  }

  /* 16 px — не из шкалы: на меньшем размере iOS зумит страницу при фокусе в поле. */
  const cls =
    'w-full rounded-lg border border-line-strong bg-surface px-3 py-3 text-field text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/30'

  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={(v) => (v ? onOpenChange(true) : save())}
      onBack={onBack}
      title={title}
      subtitle={subtitle}
      footer={
        <Btn scale="lg" className="w-full" onClick={save}>
          Готово
        </Btn>
      }
    >
      {multiline ? (
        <textarea
          autoFocus={desktop}
          ref={(el) => { box.current = el }}
          rows={4}
          value={draft}
          placeholder={placeholder}
          aria-label={title}
          onChange={(e) => setDraft(e.target.value)}
          className={cls}
        />
      ) : (
        <input
          autoFocus={desktop}
          ref={(el) => { box.current = el }}
          value={draft}
          placeholder={placeholder}
          aria-label={title}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && save()}
          className={cls + ' h-12 py-0'}
        />
      )}
    </ResponsiveSheet>
  )
}
