import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import type { MenuDay, MenuDish } from '@/lib/types'
import { Btn, ResponsiveSheet, SheetRow, TextSheet } from '@/components/flops'

/**
 * Карточка блюда (docs/v2-ux-redesign.md, 11.2).
 * Строки — кнопки, а не поля: в списке правки не бывает. Участник карточку видит,
 * но правки в ней не рисуются вовсе — меню ему только на чтение (12.1).
 */

/** Что открыто вторым уровнем. */
type Level2 = null | 'name' | 'qty' | 'sub'

interface Props {
  day: MenuDay
  dish: MenuDish
  canEdit: boolean
  onPatch: (f: (d: MenuDish) => void) => void
  /** «В какой приём» — поле всего дня, а не одного блюда */
  onPatchDay: (f: (d: MenuDay) => void) => void
  onDelete: () => void
  onClose: () => void
}

export function DishSheet({ day, dish, canEdit, onPatch, onPatchDay, onDelete, onClose }: Props) {
  const [lvl, setLvl] = useState<Level2>(null)
  const back = () => setLvl(null)

  return (
    <>
      <ResponsiveSheet
        open={lvl === null}
        onOpenChange={(v) => !v && onClose()}
        title={dish.n}
        subtitle={day.sub ? `${day.t} · ${day.sub}` : day.t}
        footer={
          <Btn scale="lg" className="w-full" onClick={onClose}>
            Готово
          </Btn>
        }
      >
        <div className="rounded-2xl bg-accent-soft p-4">
          <p className="text-sm text-ink">
            {dish.q || 'Сколько брать продуктов — ещё не вписано'}
          </p>
          <p className="mt-1.5 text-[13px] font-semibold text-accent-text">
            {dish.done ? 'Приготовили' : 'Ещё не готовили'}
          </p>
        </div>

        {canEdit ? (
          <div className="mt-3">
            <SheetRow label="Название" value={dish.n} onClick={() => setLvl('name')} />
            <SheetRow
              label="Сколько"
              value={dish.q || 'не вписано'}
              empty={!dish.q}
              onClick={() => setLvl('qty')}
            />
            <SheetRow
              label="В какой приём"
              value={day.sub || 'не выбран'}
              empty={!day.sub}
              hint="Приём указан у всего дня — поменяется у всех его блюд"
              onClick={() => setLvl('sub')}
            />
          </div>
        ) : (
          <div className="mt-3">
            <SheetRow label="В какой приём" value={day.sub || 'не выбран'} empty={!day.sub} />
          </div>
        )}

        {canEdit && (
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
              Удалить блюдо
            </Btn>
          </div>
        )}
      </ResponsiveSheet>

      {/* ─── второй уровень ─── */}
      <TextSheet
        open={lvl === 'name'}
        onOpenChange={(v) => !v && back()}
        onBack={back}
        title="Название"
        subtitle={day.t}
        value={dish.n}
        placeholder="Например, уха"
        onDone={(v) => v && onPatch((d) => { d.n = v })}
      />
      <TextSheet
        open={lvl === 'qty'}
        onOpenChange={(v) => !v && back()}
        onBack={back}
        title="Сколько"
        subtitle={dish.n}
        value={dish.q}
        multiline
        placeholder="1 уп. хлеба, 2 уп. паштета, 100 г салями"
        onDone={(v) => onPatch((d) => { d.q = v })}
      />
      <TextSheet
        open={lvl === 'sub'}
        onOpenChange={(v) => !v && back()}
        onBack={back}
        title="В какой приём"
        subtitle={`${day.t} — весь день целиком`}
        value={day.sub}
        placeholder="обедо-ужин"
        onDone={(v) => onPatchDay((d) => { d.sub = v })}
      />
    </>
  )
}
