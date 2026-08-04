import { useEffect, useState } from 'react'
import { Check, Utensils } from 'lucide-react'
import { toast } from 'sonner'
import type { MenuDay, MenuDish } from '@/lib/types'
import { useTrip, touch } from '@/store'
import {
  AddRow, EmptyState, Group, ItemRow, SectionHead, TextSheet, useIsDesktop,
} from '@/components/flops'
import { DishSheet } from './DishSheet'
import { cn } from '@/lib/utils'

/**
 * Раздел «Меню» (docs/v2-ux-redesign.md, раздел 11).
 *
 * Главная правка против v1: галочка «приготовили» переехала с дня целиком на блюдо,
 * а день считается готовым, когда готовы все его блюда. Только так счётчик «0 / 9»
 * в заголовке дня становится осмысленным.
 *
 * «Сколько» — вторая строка, а не колонка справа: количества здесь текстовые и длинные
 * («1 уп. хлеба, 2 уп. паштета, 100 г салями»), в колонку они не влезают.
 */
export function MenuSection() {
  const { S, update, perms } = useTrip()
  const desktop = useIsDesktop()
  const days = S.menu ?? []
  const canEdit = perms.isEditor()

  /* Десктоп: дни раскрыты все сразу (11.4). Мобайл: открыт первый. */
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const isOpen = (d: MenuDay, idx: number) =>
    d.i in open ? open[d.i] : desktop || idx === 0

  const [sheet, setSheet] = useState<{ day: string; dish: string } | null>(null)
  const [addTo, setAddTo] = useState<string | null>(null)
  const [addDay, setAddDay] = useState(false)

  /**
   * Разовая миграция при первом чтении раздела, без потери данных:
   *   1) блюдам раздаются собственные i — в документах v1 их не было, а держать
   *      строку списка не на чем;
   *   2) если у дня стоит старое done:true, а у блюд отметки нет — проставляем её
   *      всем блюдам этого дня.
   */
  useEffect(() => {
    const need = (S.menu ?? []).some(
      (d) => d.dishes?.some((x) => !x.i || (d.done && x.done === undefined)),
    )
    if (!need) return
    update((s) => {
      for (const d of s.menu ?? []) {
        d.dishes?.forEach((dish, k) => {
          if (!dish.i) dish.i = `${d.i}s${k}`
          if (d.done && dish.done === undefined) dish.done = true
        })
        touch(d)
      }
    })
  }, [S.menu, update])

  const patchDay = (dayId: string, f: (d: MenuDay) => void) =>
    update((s) => {
      const d = s.menu?.find((x) => x.i === dayId)
      if (d) {
        f(d)
        touch(d)
      }
    })

  /** День готов, когда готовы все его блюда. Старое поле дня остаётся в документе. */
  const syncDay = (d: MenuDay) => {
    d.done = (d.dishes?.length ?? 0) > 0 && d.dishes.every((x) => !!x.done)
  }

  const toggleDish = (dayId: string, id: string) =>
    patchDay(dayId, (d) => {
      const x = d.dishes?.find((y) => y.i === id)
      if (!x) return
      x.done = !x.done
      syncDay(d)
    })

  const addDish = (dayId: string, name: string) => {
    const id = 'ds' + Date.now().toString(36)
    patchDay(dayId, (d) => {
      d.dishes = d.dishes ?? []
      d.dishes.push({ i: id, n: name, q: '', done: false })
      syncDay(d)
    })
    toast(`«${name}» в раскладке`)
    setSheet({ day: dayId, dish: id })
  }

  const delDish = (dayId: string, id: string, dish: MenuDish) => {
    patchDay(dayId, (d) => {
      d.dishes = (d.dishes ?? []).filter((x) => x.i !== id)
      syncDay(d)
    })
    toast(`«${dish.n}» убрано из раскладки`, {
      action: { label: 'Отменить', onClick: () => undoDish(dayId, { ...dish, i: id }) },
    })
  }

  const newDay = (title: string) => {
    const id = 'd' + Date.now().toString(36)
    update((s) => {
      s.menu = s.menu ?? []
      s.menu.push({ i: id, t: title, sub: '', done: false, dishes: [], ua: Date.now() })
    })
    setOpen((o) => ({ ...o, [id]: true }))
    setAddTo(id)
  }

  const curDay = sheet ? days.find((d) => d.i === sheet.day) : null
  const curDish = curDay?.dishes?.find((x) => x.i === sheet?.dish)

  return (
    <div className="flex flex-col gap-4">
      <SectionHead
        title="Меню"
        hint="Тап по строке открывает блюдо, тап по галочке отмечает приготовленное"
        action={canEdit ? { label: 'Добавить день', onClick: () => setAddDay(true) } : undefined}
      />

      {days.length === 0 ? (
        <div className="rounded-2xl border border-line bg-surface shadow-sm">
          <EmptyState
            icon={Utensils}
            title="Раскладки пока нет"
            text="Соберите меню по дням: что готовим и сколько продуктов брать"
            action={canEdit ? { label: 'Добавить день', onClick: () => setAddDay(true) } : undefined}
          />
        </div>
      ) : (
        /* Десктоп: дни плиткой 3 в ряд — единственный раздел, где плитка уместна (11.4) */
        <div className="grid gap-4 lg:grid-cols-3 lg:items-start">
          {days.map((day, idx) => {
            const dishes = day.dishes ?? []
            const done = dishes.filter((x) => x.done).length
            return (
              <Group
                key={day.i}
                title={day.sub ? `${day.t} · ${day.sub}` : day.t}
                done={done}
                total={dishes.length}
                open={isOpen(day, idx)}
                onToggle={() => setOpen((o) => ({ ...o, [day.i]: !isOpen(day, idx) }))}
              >
                {dishes.length === 0 ? (
                  <EmptyState
                    icon={Utensils}
                    title="Блюд пока нет"
                    text="Добавьте, что готовим в этот день"
                    action={canEdit ? { label: 'Добавить блюдо', onClick: () => setAddTo(day.i) } : undefined}
                  />
                ) : (
                  <div role="list">
                    {dishes.map((dish, k) => {
                      /* до миграции у блюда ещё нет i — считаем его тем же ключом, что и она */
                      const id = dish.i ?? `${day.i}s${k}`
                      return (
                        <ItemRow
                          key={id}
                          dataHit={id}
                          zebra={k % 2 === 1}
                          done={!!dish.done}
                          onOpen={() => setSheet({ day: day.i, dish: id })}
                          onDelete={canEdit ? () => delDish(day.i, id, dish) : undefined}
                          lead={
                            <button
                              type="button"
                              aria-label={`${dish.n}: ${dish.done ? 'приготовили' : 'ещё не готовили'}. Отметить`}
                              onClick={(e) => {
                                e.stopPropagation()
                                toggleDish(day.i, id)
                              }}
                              className="grid size-11 place-items-center rounded-xl transition-colors hover:bg-zebra"
                            >
                              <span
                                className={cn(
                                  'grid size-6 place-items-center rounded-lg border-[1.5px]',
                                  dish.done
                                    ? 'border-accent bg-accent text-on-accent'
                                    : 'border-line-strong',
                                )}
                              >
                                {dish.done && <Check size={16} strokeWidth={3} aria-hidden />}
                              </span>
                            </button>
                          }
                          title={dish.n}
                          line2={dish.q ? <span className="line-clamp-2">{dish.q}</span> : undefined}
                        />
                      )
                    })}
                    {canEdit && (
                      <AddRow label="Добавить блюдо" onClick={() => setAddTo(day.i)} />
                    )}
                  </div>
                )}
              </Group>
            )
          })}
        </div>
      )}

      {sheet && curDay && curDish && (
        <DishSheet
          day={curDay}
          dish={curDish}
          canEdit={canEdit}
          onPatch={(f) =>
            patchDay(curDay.i, (d) => {
              const x = d.dishes?.find((y) => y.i === curDish.i)
              if (x) f(x)
            })
          }
          onPatchDay={(f) => patchDay(curDay.i, f)}
          onDelete={() => delDish(curDay.i, sheet.dish, curDish)}
          onClose={() => setSheet(null)}
        />
      )}

      <TextSheet
        open={addTo !== null}
        onOpenChange={(v) => !v && setAddTo(null)}
        title="Что готовим"
        subtitle={days.find((d) => d.i === addTo)?.t}
        value=""
        placeholder="Например, уха"
        onDone={(v) => {
          if (v && addTo) addDish(addTo, v)
          setAddTo(null)
        }}
      />

      <TextSheet
        open={addDay}
        onOpenChange={setAddDay}
        title="Новый день"
        subtitle="Как он называется в раскладке"
        value=""
        placeholder="13 августа · день 4"
        onDone={(v) => {
          if (v) newDay(v)
          setAddDay(false)
        }}
      />
    </div>
  )

  /** Вернуть удалённое блюдо (кнопка «Отменить» в тосте). */
  function undoDish(dayId: string, dish: MenuDish) {
    patchDay(dayId, (d) => {
      d.dishes = d.dishes ?? []
      if (!d.dishes.some((x) => x.i === dish.i)) d.dishes.push({ ...dish })
      syncDay(d)
    })
  }
}
