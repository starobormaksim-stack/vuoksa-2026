import { useState } from 'react'
import { Backpack, ChevronDown } from 'lucide-react'
import type { Gear, Person, State } from '@/lib/types'
import type { ReadyBreakdown } from '@/lib/gearx'
import {
  breakdownAll, breakdownOf, cantOf, isReady, qtyLabel, rankedPeople, statusOf,
} from '@/lib/gearx'
import { Btn, EmptyState, ItemRow, ResponsiveSheet, StatusDial } from '@/components/flops'
import { cn } from '@/lib/utils'

/**
 * Разбор готовности (пожелание заказчика: «видно, что осталось и у кого»).
 * Заголовок отвечает на вопрос «сколько», а корзины — на вопрос «что именно»:
 * четыре списка из breakdownOf. Полосы с процентом нет: заказчику нужны штуки.
 *
 * Только просмотр: отметки за других не ставятся, поэтому ни одной кнопки
 * действия внутри строк нет — статус показан значком, как в «Сборах».
 */

/** Строка разбора: вещь и человек, который её везёт. */
interface Line {
  g: Gear
  p: Person
}

interface Props {
  S: State
  /** чей разбор; null — по всей команде */
  personId: string | null
  onClose: () => void
}

export function ReadySheet({ S, personId, onClose }: Props) {
  const person = personId ? (S.people.find((p) => p.id === personId) ?? null) : null

  /* Разбор одного человека, либо сводный по команде в порядке «кто тормозит — выше». */
  const crew = personId ? null : breakdownAll(S)
  const b: ReadyBreakdown | null = person ? breakdownOf(S, person.id) : null

  const order = rankedPeople(S)
  const byId = new Map((crew?.people ?? []).map((r) => [r.person.id, r.b]))
  const lines = (pick: (x: ReadyBreakdown) => Gear[]): Line[] => {
    if (person && b) return pick(b).map((g) => ({ g, p: person }))
    return order.flatMap((p) => {
      const rb = byId.get(p.id)
      return rb ? pick(rb).map((g) => ({ g, p })) : []
    })
  }

  const total = b ? b.total : (crew?.total ?? 0)
  const doneN = b ? b.done.length : (crew?.total ?? 0) - (crew?.left ?? 0)

  const todo = lines((x) => x.todo)
  const inWork = lines((x) => x.inWork)
  const cant = lines((x) => x.cant)
  const done = lines((x) => x.done)

  return (
    <ResponsiveSheet
      open
      onOpenChange={(v) => !v && onClose()}
      title={person ? person.name : 'Что осталось собрать'}
      subtitle={`собрано ${doneN} из ${total}`}
      footer={
        <Btn scale="lg" className="w-full" onClick={onClose}>
          Готово
        </Btn>
      }
    >
      {total === 0 ? (
        <EmptyState
          icon={Backpack}
          title={person ? 'Пока ничего не поручено' : 'В сборах пусто'}
          text={
            person
              ? `${person.name} ещё ничего не везёт — раздайте вещи в разделе «Сборы»`
              : 'Добавьте вещи в раздел «Сборы» — и здесь появится разбор по людям'
          }
        />
      ) : (
        <>
          <Bucket S={S} title="Осталось взять" lines={todo} showName={!person} />
          <Bucket S={S} title="Собирает" lines={inWork} showName={!person} />
          <Bucket S={S} title="Не может взять" lines={cant} showName={!person} why />
          <Bucket S={S} title="Готово" lines={done} showName={!person} foldable />
        </>
      )}
    </ResponsiveSheet>
  )
}

/**
 * Корзина разбора. Пустая не рисуется вовсе — серых заглушек в v2 нет.
 * «Готово» складывается: список готового длинный, а смотрят в шторку ради несобранного.
 */
function Bucket({
  S,
  title,
  lines,
  showName,
  why,
  foldable,
}: {
  S: State
  title: string
  lines: Line[]
  /** в разборе по команде у каждой строки написано, чья она */
  showName: boolean
  /** дописывать причину отказа */
  why?: boolean
  foldable?: boolean
}) {
  const [open, setOpen] = useState(false)
  if (lines.length === 0) return null

  const body = (
    <div role="list" className="mt-1 overflow-hidden rounded-2xl border border-line">
      {lines.map(({ g, p }, i) => {
        const st = statusOf(g, p.id)
        return (
          <ItemRow
            key={`${g.i}-${p.id}`}
            zebra={i % 2 === 1}
            /* у собранного значок не рисуем треугольником, даже если отметка отказа осталась */
            lead={
              <StatusDial
                value={st}
                cant={!isReady(st) && !!cantOf(g, p.id)}
                who={p.name}
                size={32}
              />
            }
            title={g.n}
            line2={subLine(S, g, p, showName, why)}
            right={qtyLabel(g.o?.[p.id] || 0)}
          />
        )
      })}
    </div>
  )

  if (!foldable) {
    return (
      <div className="mt-4">
        <div className="flex min-h-9 items-center gap-2">
          <h4 className="text-[13px] font-semibold text-muted">{title}</h4>
          <span className="tnum text-[13px] font-semibold text-muted">{lines.length}</span>
        </div>
        {body}
      </div>
    )
  }

  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex min-h-11 w-full items-center gap-2 rounded-xl text-left"
      >
        <h4 className="text-[13px] font-semibold text-muted">{title}</h4>
        <span className="tnum flex-1 text-[13px] font-semibold text-muted">{lines.length}</span>
        <ChevronDown
          size={18}
          strokeWidth={1.5}
          aria-hidden
          className={cn('shrink-0 text-muted transition-transform', open && 'rotate-180')}
        />
      </button>
      {open && body}
    </div>
  )
}

/** Вторая строка: чья вещь, из какого раздела и почему не взята. */
function subLine(S: State, g: Gear, p: Person, showName: boolean, why?: boolean): string {
  const parts: string[] = []
  if (showName) parts.push(p.name)
  parts.push(S.gearSections.find((s) => s.i === g.sec)?.t ?? 'Без раздела')
  const cant = why ? cantOf(g, p.id) : null
  if (cant?.why) parts.push(cant.why)
  return parts.join(' · ')
}
