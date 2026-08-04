import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { toast } from 'sonner'
import type { Gear, Person, State } from '@/lib/types'
import type { Perms } from '@/lib/perm'
import { touch, update } from '@/store'
import {
  breakdownAll, cantOf, cycleMark, missingOf, qtyLabel, rankedPeople, restLineAll, statusOf,
} from '@/lib/gearx'
import { StatusDial } from '@/components/flops'
import { cn } from '@/lib/utils'

/**
 * Сколько ОСТАЛОСЬ собрать — и что именно.
 *
 * Заказчик 04.08.2026 забраковал строку «Собрано 0 из 216»: ему нужно не сколько
 * сделано, а сколько осталось. Тап раскрывает список несобранного прямо здесь,
 * и отметить собранное можно в этом же списке — шторки нет (постулат 2).
 *
 * Отметки живут там же, где у «Сборов», — в `S.gear[].s`, и меняются тем же
 * `cycleMark` из `lib/gearx.ts`. ⚠️ Круг обязан быть ОДИН на весь сервис: до
 * 04.08.2026 здесь ходил круг из четырёх состояний, а в таблице сборов — из пяти
 * (с «не могу взять»), и один и тот же кружок вёл себя в двух местах по-разному.
 * Собранным считается «упаковано» и «в машине», поэтому доведённая до них строка
 * уходит из списка.
 */

/** Строка списка: вещь и человек, который её везёт. */
interface Line {
  g: Gear
  p: Person
}

export function ReadyLeft({ S, perms }: { S: State; perms: Perms }) {
  const [open, setOpen] = useState(false)
  const crew = breakdownAll(S)

  /* Порядок тот же, что в разборе сборов: кто тормозит — выше. */
  const byId = new Map(crew.people.map((r) => [r.person.id, r.b]))
  const lines: Line[] = rankedPeople(S).flatMap((p) => {
    const b = byId.get(p.id)
    return b ? missingOf(b).map((g) => ({ g, p })) : []
  })

  /* Тап по кружку — то же действие, что в «Сборах»: круг состояний. Отметка
     «не могу взять» в круг не входит и снимается, поэтому её можно вернуть. */
  const cycle = ({ g: item, p }: Line) => {
    const cant = cantOf(item, p.id)
    let сталОтказом = false
    update((s) => {
      const g = s.gear.find((x) => x.i === item.i)
      if (g) {
        сталОтказом = cycleMark(g, p.id) === 'cant'
        touch(g)
      }
    })
    /* Отказ снят кругом — даём вернуть причину: она написана человеком,
       и потерять её молча нельзя. Если круг, наоборот, ПОСТАВИЛ отказ,
       говорить «отметка снята» было бы неправдой. */
    if (cant && !сталОтказом) {
      toast('Отметка «не могу взять» снята', {
        action: {
          label: 'Отменить',
          onClick: () =>
            update((s) => {
              const g = s.gear.find((x) => x.i === item.i)
              if (g) {
                g.q = g.q || {}
                g.q[p.id] = cant
                touch(g)
              }
            }),
        },
      })
    }
  }

  const head = (
    <span className="min-w-0 flex-1">
      <span className="block text-head leading-snug font-[650] text-ink text-pretty">
        {restLineAll(crew)}
      </span>
      <span className="mt-0.5 block text-note text-muted">
        Собранное — это «упаковано» или «в машине»
      </span>
    </span>
  )

  return (
    <section className="overflow-hidden rounded-xl border border-line bg-surface shadow-sm">
      {/* Раскрывать нечего — строка остаётся текстом, а не мёртвой кнопкой (постулат 5). */}
      {lines.length === 0 ? (
        <div className="flex min-h-14 items-center px-4 py-3">{head}</div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-zebra/70"
        >
          {head}
          <ChevronDown
            size={20}
            strokeWidth={1.75}
            aria-hidden
            className={cn('shrink-0 text-muted transition-transform', open && 'rotate-180')}
          />
        </button>
      )}

      {open && lines.length > 0 && (
        <div role="list" className="max-h-[32rem] overflow-y-auto border-t border-line">
          {lines.map((line, i) => {
            const { g, p } = line
            const st = statusOf(g, p.id)
            const cant = cantOf(g, p.id)
            const can = perms.canMark(p.id)
            return (
              <div
                key={`${g.i}-${p.id}`}
                role="listitem"
                className={cn(
                  'flex min-h-14 items-center gap-3 px-3 py-1.5',
                  i % 2 === 1 && 'bg-zebra/60',
                )}
              >
                <StatusDial
                  value={st}
                  cant={!!cant}
                  who={p.name}
                  size={44}
                  onCycle={can ? () => cycle(line) : undefined}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-body font-semibold text-ink">{g.n}</span>
                  <span className="block truncate text-note text-muted">{subLine(S, line)}</span>
                </span>
                <span className="tnum shrink-0 text-note text-muted">
                  {qtyLabel(g.o?.[p.id] || 0)}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

/** Вторая строка: чья вещь, из какого раздела и почему не взята. */
function subLine(S: State, { g, p }: Line): string {
  const parts: string[] = [p.name]
  parts.push(S.gearSections.find((s) => s.i === g.sec)?.t ?? 'Без раздела')
  const cant = cantOf(g, p.id)
  if (cant?.why) parts.push(cant.why)
  return parts.join(' · ')
}
