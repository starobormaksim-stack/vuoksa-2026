import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { ResponsiveSheet } from './ResponsiveSheet'
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

  const cls =
    'w-full rounded-xl border border-line-strong bg-surface px-3 py-3 text-[16px] text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/30'

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
          autoFocus
          rows={4}
          value={draft}
          placeholder={placeholder}
          aria-label={title}
          onChange={(e) => setDraft(e.target.value)}
          className={cls}
        />
      ) : (
        <input
          autoFocus
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
