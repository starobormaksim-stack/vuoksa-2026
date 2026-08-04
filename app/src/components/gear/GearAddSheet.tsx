import { useEffect, useState } from 'react'
import { Check } from 'lucide-react'
import type { Person } from '@/lib/types'
import { qtyLabel } from '@/lib/gearx'
import { Btn, NumberSheet, ResponsiveSheet, SheetRow, TextSheet } from '@/components/flops'
import { GearAvatar } from './GearAvatar'
import { cn } from '@/lib/utils'

/**
 * Мастер «Новая вещь» (замечание заказчика: кто повезёт и сколько — сразу при добавлении).
 * Раньше вещь заводилась одним названием, а люди назначались потом, отдельным заходом
 * в карточку. Здесь всё три шага в одной шторке: название, кто везёт, сколько каждому.
 *
 * Устройство обычное для проекта: строки-кнопки, правка — вторым уровнем.
 * Список людей — переключатели: тап по строке ставит и снимает человека, полей ввода в нём нет.
 */

/** Что открыто вторым уровнем. */
type Level2 = null | 'name' | 'qty'

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  /** название раздела — подзаголовок шторки */
  sectionName?: string
  /** люди в порядке читателя (сам читатель первым) */
  people: Person[]
  /** открыт личный режим — этот человек уже отмечен */
  preselect?: string
  /** имя и раскладка «кому сколько»; пустая раскладка — позиция ничья */
  onAdd: (name: string, qty: Record<string, number>) => void
}

export function GearAddSheet({
  open, onOpenChange, sectionName, people, preselect, onAdd,
}: Props) {
  const [lvl, setLvl] = useState<Level2>(null)
  const [name, setName] = useState('')
  const [qty, setQty] = useState<Record<string, number>>({})
  /** человек, которому правим количество вторым уровнем */
  const [who, setWho] = useState('')

  useEffect(() => {
    if (!open) return
    setLvl(null)
    setName('')
    setQty(preselect ? { [preselect]: 1 } : {})
    setWho('')
    /* preselect намеренно не в зависимостях: черновик берётся ровно при открытии */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const back = () => setLvl(null)
  const chosen = people.filter((p) => (qty[p.id] || 0) > 0)
  const whoPerson = people.find((p) => p.id === who) ?? null
  const total = chosen.reduce((s, p) => s + (qty[p.id] || 0), 0)
  const ready = name.trim().length > 0

  const toggle = (id: string) =>
    setQty((q) => {
      const next = { ...q }
      if (next[id]) delete next[id]
      else next[id] = 1
      return next
    })

  const setQtyFor = (id: string, v: number) =>
    setQty((q) => {
      const next = { ...q }
      if (v > 0) next[id] = v
      else delete next[id]
      return next
    })

  const save = () => {
    if (!ready) return
    onAdd(name.trim(), qty)
    onOpenChange(false)
  }

  return (
    <>
      <ResponsiveSheet
        open={open && lvl === null}
        onOpenChange={(v) => !v && onOpenChange(false)}
        title="Новая вещь"
        subtitle={sectionName}
        footer={
          <Btn scale="lg" className="w-full" disabled={!ready} onClick={save}>
            Добавить
          </Btn>
        }
      >
        <SheetRow
          label="Название"
          value={name || 'не вписано'}
          empty={!name}
          onClick={() => setLvl('name')}
        />

        <div className="mt-3 text-[13px] font-semibold text-muted">Кто везёт</div>
        <p className="mt-0.5 text-[13px] leading-snug text-muted">
          Тап по строке отмечает и снимает. Можно отметить нескольких, можно никого —
          тогда вещь останется ничьей.
        </p>
        <div className="mt-1 overflow-hidden rounded-2xl border border-line">
          {people.map((p) => {
            const on = (qty[p.id] || 0) > 0
            return (
              <button
                key={p.id}
                type="button"
                role="checkbox"
                aria-checked={on}
                onClick={() => toggle(p.id)}
                className={cn(
                  'flex min-h-16 w-full items-center gap-3 border-b border-line/70 px-3 text-left transition-colors last:border-b-0 hover:bg-zebra',
                  on && 'bg-accent-soft',
                )}
              >
                <span
                  className={cn(
                    'grid size-6 shrink-0 place-items-center rounded-lg border-[1.5px]',
                    on ? 'border-accent bg-accent text-on-accent' : 'border-line-strong',
                  )}
                  aria-hidden
                >
                  {on && <Check size={15} strokeWidth={3} />}
                </span>
                <GearAvatar p={p} />
                <span className="min-w-0 flex-1 py-2">
                  <span className="block truncate text-[15px] font-semibold text-ink">{p.name}</span>
                  {p.role ? (
                    <span className="mt-0.5 block truncate text-[13px] text-muted">{p.role}</span>
                  ) : null}
                </span>
                {on && (
                  <span className="tnum shrink-0 text-[15px] font-semibold text-accent-text">
                    {qtyLabel(qty[p.id])}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        <div className="mt-3 text-[13px] font-semibold text-muted">Сколько</div>
        {chosen.length === 0 ? (
          <p className="mt-1 text-sm leading-snug text-muted">
            Пока никто не отмечен — количество появится здесь, как только выберете человека.
          </p>
        ) : (
          <div className="mt-1">
            {chosen.map((p) => (
              <SheetRow
                key={p.id}
                label={p.name}
                value={qtyLabel(qty[p.id])}
                onClick={() => {
                  setWho(p.id)
                  setLvl('qty')
                }}
              />
            ))}
            {chosen.length > 1 && (
              <SheetRow label="Всего" value={qtyLabel(total)} />
            )}
          </div>
        )}
      </ResponsiveSheet>

      {/* ─── второй уровень ─── */}
      {/* quiet: вещь ещё не заведена, промежуточный тост «сохранено» соврал бы */}
      <TextSheet
        open={open && lvl === 'name'}
        onOpenChange={(v) => !v && back()}
        onBack={back}
        title="Название"
        subtitle={sectionName}
        value={name}
        placeholder="Например, спальник"
        quiet
        onDone={(v) => setName(v)}
      />

      {whoPerson && (
        <NumberSheet
          open={open && lvl === 'qty'}
          onOpenChange={(v) => !v && back()}
          onBack={back}
          title={`Сколько везёт ${whoPerson.name}`}
          subtitle={name || 'Новая вещь'}
          value={qty[whoPerson.id] || 0}
          kind="qty"
          unit="шт."
          quiet
          hint={(v) =>
            v <= 0
              ? `Ноль ${MDASH} ${whoPerson.name} эту вещь не везёт`
              : `Всего по вещи ${qtyLabel(total)}`
          }
          onChange={(v) => setQtyFor(whoPerson.id, v)}
        />
      )}
    </>
  )
}

const MDASH = '—'
