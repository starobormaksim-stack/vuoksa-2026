import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import type { Idea } from '@/lib/types'
import { Btn, ResponsiveSheet, SheetRow, TextSheet } from '@/components/flops'
import { Switch } from '@/components/ui/switch'

/**
 * Карточка вопроса (docs/v2-ux-redesign.md, 10.7).
 * Вопросы — единственное в «Дороге», что заводит и участник: спросить может каждый,
 * поэтому правка здесь не привязана к правам редактора.
 */

/** Что открыто вторым уровнем. */
type Level2 = null | 'name' | 'who' | 'why'

interface Props {
  item: Idea
  canDelete: boolean
  onPatch: (f: (i: Idea) => void) => void
  onDelete: () => void
  onClose: () => void
}

export function IdeaSheet({ item, canDelete, onPatch, onDelete, onClose }: Props) {
  const [lvl, setLvl] = useState<Level2>(null)
  const back = () => setLvl(null)

  return (
    <>
      <ResponsiveSheet
        open={lvl === null}
        onOpenChange={(v) => !v && onClose()}
        title={item.n}
        subtitle={item.who ? `На ком: ${item.who}` : 'Пока ни на ком'}
        footer={
          <Btn scale="lg" className="w-full" onClick={onClose}>
            Готово
          </Btn>
        }
      >
        {item.why ? <p className="text-sm leading-snug text-muted">{item.why}</p> : null}

        <div className="mt-2">
          <SheetRow label="Вопрос" value={item.n} onClick={() => setLvl('name')} />
          <SheetRow
            label="На ком"
            value={item.who || 'ни на ком'}
            empty={!item.who}
            onClick={() => setLvl('who')}
          />
          <SheetRow
            label="Почему важно"
            value={item.why || 'нет'}
            empty={!item.why}
            onClick={() => setLvl('why')}
          />

          <div className="flex min-h-14 items-center gap-3 border-b border-line/70 px-1">
            <label
              htmlFor={`idea-${item.i}`}
              className="min-w-0 flex-1 py-2 text-[15px] font-medium text-muted"
            >
              Вопрос закрыт
            </label>
            <Switch
              id={`idea-${item.i}`}
              checked={!!item.done}
              onCheckedChange={(v) =>
                onPatch((x) => {
                  x.done = v
                })
              }
            />
          </div>
        </div>

        {canDelete && (
          <div className="mt-6 border-t border-line pt-4">
            <Btn
              tone="danger"
              className="w-full"
              onClick={() => {
                onDelete()
                onClose()
              }}
            >
              <Trash2 size={18} strokeWidth={1.5} aria-hidden />
              Убрать вопрос
            </Btn>
          </div>
        )}
      </ResponsiveSheet>

      {/* ─── второй уровень ─── */}
      <TextSheet
        open={lvl === 'name'}
        onOpenChange={(v) => !v && back()}
        onBack={back}
        title="Вопрос"
        value={item.n}
        multiline
        placeholder="Что нужно уточнить"
        onDone={(v) =>
          v &&
          onPatch((x) => {
            x.n = v
          })
        }
      />
      <TextSheet
        open={lvl === 'who'}
        onOpenChange={(v) => !v && back()}
        onBack={back}
        title="На ком вопрос"
        subtitle={item.n}
        value={item.who}
        placeholder="Например, Костя"
        onDone={(v) =>
          onPatch((x) => {
            x.who = v
          })
        }
      />
      <TextSheet
        open={lvl === 'why'}
        onOpenChange={(v) => !v && back()}
        onBack={back}
        title="Почему важно"
        subtitle={item.n}
        value={item.why}
        multiline
        placeholder="Что зависит от ответа"
        onDone={(v) =>
          onPatch((x) => {
            x.why = v
          })
        }
      />
    </>
  )
}
