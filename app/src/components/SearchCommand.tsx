import { useEffect, useMemo, useState } from 'react'
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
 *
 * Пункт 12 разбора 05.08.2026: «я нажимаю на поиск, и там какая-то херобора…
 * наверху всё перекошено, дизайн не единообразен, и размеры у тебя все везде
 * по-разному». Замер показал две разные беды, и чинятся они в разных местах:
 * кегли и высоты органа — в `ui/command.tsx` (урок У-71), а свалка из 217 строк
 * до единой буквы запроса — здесь. Пустой запрос теперь показывает, ЧТО и ГДЕ
 * ищется, а находки разложены по разделам с заголовками.
 */

/** Крупные разделы в том порядке, в каком они идут по странице. */
const GROUPS: { section: string; title: string }[] = [
  /* ⚠️ «Поездка» здесь появилась 06.08.2026 вместе с точками маршрута: раньше
     они искались в «Дороге», а с уходом ленты живут на карте. Без своей группы
     находка есть в индексе, но на экран не попадает вовсе — замер поймал это
     сразу после переезда. */
  { section: 'trip', title: 'Поездка' },
  { section: 'gear', title: 'Сборы' },
  { section: 'buy', title: 'Закупка' },
  { section: 'road', title: 'Дорога' },
  { section: 'menu', title: 'Меню' },
  { section: 'crew', title: 'Команда' },
]

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
  /* ⚠️ Точка маршрута ведёт в «Поездку», на карту, а не в «Дорогу»: ленты точек
     там больше нет (06.08.2026), прыгать не к чему. Показывает точку карта —
     открывает её карточку, а точку без координат отправляет в мастер
     «Разметить маршрут» (см. `askMapPoint` в lib/mapfocus.ts). */
  for (const r of S.route)
    out.push({
      key: 'route:' + r.i, section: 'trip', sectionTitle: 'Поездка · точка на карте',
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
      key: 'person:' + p.id, section: 'crew', sectionTitle: 'Команда',
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
  const [q, setQ] = useState('')

  /* Закрыли окно — запрос забыт. Иначе следующее открытие показывает прошлую
     находку, а человек читает это как «поиск застрял». */
  useEffect(() => {
    if (!open) setQ('')
  }, [open])

  const asked = q.trim().length > 0

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Поиск по листу"
      description="Ищем по названиям и примечаниям"
      className="sm:max-w-[560px]"
    >
      <CommandInput placeholder="Что ищем?" value={q} onValueChange={setQ} />
      {/* dvh, а не vh: на iOS и во встроенном браузере Телеграма `vh` считается
          по самому большому окну, и при видимых панелях низ списка уезжает за экран. */}
      <CommandList className="max-h-[60dvh]">
        {!asked ? (
          /* До первой буквы показывать все позиции листа бессмысленно: это
             простыня на две сотни строк, в которой ничего не найти глазами.
             Вместо неё — что именно ищется и сколько всего есть. */
          <div className="px-4 py-8 text-center">
            <div className="text-body font-semibold text-ink">Поиск по всему листу</div>
            <p className="mx-auto mt-1 max-w-80 text-note text-balance text-muted">
              Ищем по названиям и примечаниям в сборах, закупке, дороге, меню и команде.
              Всего позиций: {hits.length}
            </p>
          </div>
        ) : (
          <>
            <CommandEmpty>
              <div className="px-4 py-6 text-center">
                <div className="text-body font-semibold text-ink">Ничего не нашлось</div>
                <p className="mt-1 text-note text-muted">
                  Попробуйте другое слово — ищем по названиям и примечаниям
                </p>
              </div>
            </CommandEmpty>
            {GROUPS.map(({ section, title }) => {
              const list = hits.filter((h) => h.section === section)
              if (list.length === 0) return null
              return (
                <CommandGroup key={section} heading={title}>
                  {list.map((h) => (
                    <CommandItem
                      key={h.key}
                      value={`${h.title} ${h.note} ${h.sectionTitle}`}
                      onSelect={() => {
                        onJump(h.section, h.itemId)
                        onOpenChange(false)
                      }}
                      className="items-start"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-body font-semibold text-ink">
                          {h.title}
                        </span>
                        <span className="block truncate text-note text-muted">
                          {h.sectionTitle}
                          {h.note ? ` · ${h.note}` : ''}
                        </span>
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )
            })}
          </>
        )}
      </CommandList>
    </CommandDialog>
  )
}
