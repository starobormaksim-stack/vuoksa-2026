import type { State } from '@/lib/types'
import { readyOf } from '@/lib/gearx'

/**
 * «Кто уже собрался» (docs/v2-ux-redesign.md, 6.3) — блок новый.
 * Владельцу нужно одним взглядом понять, кто тормозит: раньше за этим
 * приходилось идти в «Экипаж» и считать глазами.
 */
export function CrewReady({ S }: { S: State }) {
  if (S.people.length === 0) return null

  return (
    <section className="rounded-2xl border border-line bg-surface p-4 shadow-sm">
      <h3 className="text-[15px] font-[650] text-ink">Кто уже собрался</h3>
      <ul className="mt-2">
        {S.people.map((p) => {
          const r = readyOf(S, p.id)
          return (
            <li key={p.id} className="flex min-h-12 items-center gap-3">
              <span className="grid size-8 shrink-0 place-items-center overflow-hidden rounded-lg bg-zebra text-[13px] font-bold text-muted">
                {p.photo ? (
                  <img src={p.photo} alt="" className="size-full object-cover" />
                ) : (
                  p.ini || p.name.slice(0, 1)
                )}
              </span>
              <span className="w-16 shrink-0 truncate text-[15px] font-semibold text-ink">{p.name}</span>
              <span
                className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-zebra"
                role="img"
                aria-label={`${p.name}: собрано ${r.done} из ${r.total}`}
              >
                <span className="block h-full rounded-full bg-accent" style={{ width: `${r.pct}%` }} />
              </span>
              <span className="tnum w-11 shrink-0 text-right text-[14px] font-semibold text-muted">
                {r.pct} %
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
