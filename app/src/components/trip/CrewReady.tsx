import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import type { State } from '@/lib/types'
import { breakdownOf, rankedPeople, restLineOf } from '@/lib/gearx'
import { toneOf } from '@/lib/people'
import { PersonMark, toneStyle } from '@/components/flops'
import { ReadySheet } from './ReadySheet'

/**
 * «Кто уже собрался» (docs/v2-ux-redesign.md, 6.3) — блок новый.
 * Владельцу нужно одним взглядом понять, кто тормозит: раньше за этим
 * приходилось идти в «Команду» и считать глазами.
 *
 * Порядок: читатель первым, дальше — по возрастанию готовности (rankedPeople),
 * поэтому несобравшиеся оказываются наверху. Личный цвет участника — насыщенность
 * янтаря и форма метки (lib/people.ts): новых оттенков бренд не допускает.
 * Тап по строке открывает разбор: что осталось именно у этого человека.
 */
export function CrewReady({ S }: { S: State }) {
  const [who, setWho] = useState('')
  if (S.people.length === 0) return null

  return (
    <section className="rounded-2xl border border-line bg-surface p-4 shadow-sm">
      <h3 className="text-[15px] font-[650] text-ink">Кто уже собрался</h3>
      <p className="mt-0.5 text-[13px] text-muted">Кто ещё не собрался — выше</p>
      <ul className="mt-2">
        {rankedPeople(S).map((p) => {
          const b = breakdownOf(S, p.id)
          const tone = toneOf(S.people, p.id)
          return (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => setWho(p.id)}
                aria-label={`${p.name}: собрано ${b.done.length} из ${b.total}. Открыть разбор`}
                className="flex min-h-14 w-full items-center gap-3 rounded-xl px-1 text-left transition-colors hover:bg-zebra"
              >
                <span className="grid size-8 shrink-0 place-items-center overflow-hidden rounded-lg bg-zebra text-[13px] font-bold text-muted">
                  {p.photo ? (
                    <img src={p.photo} alt="" className="size-full object-cover" />
                  ) : (
                    p.ini || p.name.slice(0, 1)
                  )}
                </span>

                <span className="min-w-0 flex-1 py-2">
                  <span className="flex items-center gap-2">
                    <PersonMark tone={tone} size={10} />
                    <span className="shrink-0 truncate text-[15px] font-semibold text-ink">
                      {p.name}
                    </span>
                    <span className="min-w-0 truncate text-[13px] text-muted">{restLineOf(b)}</span>
                  </span>
                  <span
                    className="mt-1.5 block h-2 overflow-hidden rounded-full bg-zebra"
                    aria-hidden
                  >
                    <span
                      className="block h-full rounded-full"
                      style={{ ...toneStyle(tone), width: `${b.pct}%` }}
                    />
                  </span>
                </span>

                <span className="tnum w-11 shrink-0 text-right text-[14px] font-semibold text-muted">
                  {b.pct} %
                </span>
                <ChevronRight size={18} strokeWidth={1.5} aria-hidden className="shrink-0 text-muted" />
              </button>
            </li>
          )
        })}
      </ul>

      {who && <ReadySheet S={S} personId={who} onClose={() => setWho('')} />}
    </section>
  )
}
