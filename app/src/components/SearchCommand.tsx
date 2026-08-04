import { useMemo } from 'react'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import type { State } from '@/lib/types'
import type { MenuDay } from '@/lib/types'

/**
 * Поиск по всему листу (docs/v2-ux-redesign.md, 14).
 * Механика v1 сохранена: находка знает свой раздел, тап открывает раздел
 * и подсвечивает строку по атрибуту data-hit.
 */

export interface Hit {
  key: string
  section: string
  sectionTitle: string
  title: string
  note: string
  itemId: string
}

/** Собрать индекс поиска по всем коллекциям документа. */
export function buildHits(S: State): Hit[] {
  const out: Hit[] = []
  const gsec = new Map(S.gearSections.map((s) => [s.i, s.t]))
  const bsec = new Map(S.buySections.map((s) => [s.i, s.t]))

  for (const g of S.gear)
    out.push({
      key: 'gear:' + g.i, section: 'gear', sectionTitle: 'Сборы · ' + (gsec.get(g.sec) ?? ''),
      title: g.n, note: g.c, itemId: g.i,
    })
  for (const p of S.buy)
    out.push({
      key: 'buy:' + p.i, section: 'buy', sectionTitle: 'Закупка · ' + (bsec.get(p.sec) ?? ''),
      title: p.n, note: p.c, itemId: p.i,
    })
  for (const r of S.route)
    out.push({
      key: 'route:' + r.i, section: 'road', sectionTitle: 'Дорога · маршрут',
      title: r.n, note: r.c, itemId: r.i,
    })
  for (const t of S.transport)
    out.push({
      key: 'tr:' + t.i, section: 'road', sectionTitle: 'Дорога · техника',
      title: t.n, note: t.calcT, itemId: t.i,
    })
  for (const r of S.rent)
    out.push({
      key: 'rent:' + r.i, section: 'road', sectionTitle: 'Дорога · аренда',
      title: r.n, note: r.calcT, itemId: r.i,
    })
  for (const q of S.ideas ?? [])
    out.push({
      key: 'idea:' + q.i, section: 'road', sectionTitle: 'Дорога · что уточнить',
      title: q.n, note: q.why, itemId: q.i,
    })
  for (const d of (S.menu ?? []) as MenuDay[])
    for (const dish of d.dishes ?? [])
      out.push({
        key: 'dish:' + d.i + ':' + (dish.i ?? dish.n), section: 'menu',
        sectionTitle: 'Меню · ' + d.t, title: dish.n, note: dish.q, itemId: dish.i ?? '',
      })
  for (const p of S.people)
    out.push({
      key: 'person:' + p.id, section: 'crew', sectionTitle: 'Экипаж',
      title: p.name, note: p.role, itemId: p.id,
    })
  return out
}

export function SearchCommand({
  S,
  open,
  onOpenChange,
  onJump,
}: {
  S: State
  open: boolean
  onOpenChange: (v: boolean) => void
  onJump: (section: string, itemId: string) => void
}) {
  const hits = useMemo(() => buildHits(S), [S])

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Поиск по листу"
      description="Ищем по названиям и примечаниям"
    >
      <CommandInput placeholder="Что ищем?" />
      <CommandList className="max-h-[60vh]">
        <CommandEmpty>
          <div className="px-4 py-6 text-center">
            <div className="text-base font-[650] text-ink">Ничего не нашлось</div>
            <p className="mt-1 text-sm text-muted">
              Попробуйте другое слово — ищем по названиям и примечаниям
            </p>
          </div>
        </CommandEmpty>
        <CommandGroup>
          {hits.map((h) => (
            <CommandItem
              key={h.key}
              value={`${h.title} ${h.note} ${h.sectionTitle}`}
              onSelect={() => {
                onJump(h.section, h.itemId)
                onOpenChange(false)
              }}
              className="min-h-14 items-start gap-1"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-semibold text-ink">{h.title}</span>
                <span className="block truncate text-[13px] text-muted">
                  {h.sectionTitle}
                  {h.note ? ` · ${h.note}` : ''}
                </span>
              </span>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}
