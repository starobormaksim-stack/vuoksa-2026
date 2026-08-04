import { useState, type ReactNode } from 'react'
import { CircleHelp, Plus } from 'lucide-react'
import { useTrip, update } from '@/store'
import { hintOf, setSectionTitle, titleOf } from '@/lib/sectitles'
import { TextSheet } from './TextSheet'

/**
 * Заголовок раздела: название, кнопка «что означают значки» и главное действие.
 * Легенда значков живёт здесь, а не карточкой над списком (раздел 4.5 UX-проекта) —
 * это освобождает 120 px экрана.
 *
 * С `secId` название и подпись берутся из документа (`S.secTitles`) и правятся тапом
 * у владельца и редактора: раздел, переименованный человеком, должен так и называться.
 * Без `secId` заголовок остаётся обычным текстом — так его зовут неразделочные блоки.
 */
export function SectionHead({
  title,
  hint,
  secId,
  onHelp,
  action,
  children,
}: {
  title: string
  hint?: string
  /** идентификатор раздела из sections.ts — включает своё название и правку */
  secId?: string
  onHelp?: () => void
  action?: { label: string; onClick: () => void }
  children?: ReactNode
}) {
  const { S, perms } = useTrip()
  const [edit, setEdit] = useState<null | 'h' | 'sub'>(null)
  const canEdit = !!secId && perms.isEditor()
  const шапка = secId ? titleOf(S, secId, title) : title
  const подпись = secId ? hintOf(S, secId, hint) : hint

  const save = (h: string, sub: string) =>
    update((s) => {
      setSectionTitle(s, secId!, h, sub)
    })

  return (
    <div className="mb-3">
      <div className="flex min-h-11 items-center gap-2">
        {canEdit ? (
          <h2 className="min-w-0 flex-1">
            <button
              type="button"
              onClick={() => setEdit('h')}
              aria-label={`Раздел «${шапка}». Переименовать`}
              className="editable -mx-2 flex min-h-11 max-w-full items-center rounded-md px-2 text-left text-title font-[700] text-ink transition-colors hover:bg-zebra"
            >
              <span className="truncate">{шапка}</span>
            </button>
          </h2>
        ) : (
          <h2 className="min-w-0 flex-1 text-title font-[700] text-ink">{шапка}</h2>
        )}
        {onHelp && (
          <button
            type="button"
            onClick={onHelp}
            aria-label="Что означают значки"
            className="grid size-11 shrink-0 place-items-center rounded-md text-muted transition-colors hover:bg-zebra hover:text-ink"
          >
            <CircleHelp size={21} strokeWidth={1.5} aria-hidden />
          </button>
        )}
        {action && (
          <button
            type="button"
            onClick={action.onClick}
            className="flex h-11 shrink-0 items-center gap-1.5 rounded-lg bg-accent-fill px-4 text-body font-semibold text-on-accent transition-opacity hover:opacity-90"
          >
            <Plus size={18} strokeWidth={2} aria-hidden />
            {action.label}
          </button>
        )}
      </div>
      {canEdit ? (
        <button
          type="button"
          onClick={() => setEdit('sub')}
          className="editable -mx-2 mt-0.5 block min-h-8 max-w-full rounded-md px-2 text-left text-note text-muted transition-colors hover:bg-zebra"
        >
          {подпись || <span className="opacity-70">Подпись раздела</span>}
        </button>
      ) : подпись ? (
        <p className="mt-0.5 text-note text-muted">{подпись}</p>
      ) : null}
      {children}

      {canEdit && (
        <>
          <TextSheet
            open={edit === 'h'}
            onOpenChange={(v) => !v && setEdit(null)}
            title="Название раздела"
            subtitle={`Заводское — «${title}»`}
            value={шапка}
            placeholder={title}
            onDone={(v) => v && save(v, подпись ?? '')}
          />
          <TextSheet
            open={edit === 'sub'}
            onOpenChange={(v) => !v && setEdit(null)}
            title="Подпись раздела"
            subtitle={шапка}
            value={подпись ?? ''}
            placeholder={hint ?? 'Короткая строка под названием'}
            onDone={(v) => save(шапка, v)}
          />
        </>
      )}
    </div>
  )
}

/** Строка «+ Добавить …» в конце списка. */
export function AddRow({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-14 w-full items-center gap-2 px-4 text-left text-body font-semibold text-accent-text transition-colors hover:bg-zebra"
    >
      <Plus size={18} strokeWidth={2} aria-hidden />
      {label}
    </button>
  )
}
