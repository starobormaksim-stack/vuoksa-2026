import { Fragment, useEffect, useRef, useState, type RefObject } from 'react'
import { Check, ChevronDown, Plus, Trash2, Utensils } from 'lucide-react'
import { toast } from 'sonner'
import type { MenuDay, MenuDish } from '@/lib/types'
import { readTrip, touch, useTrip } from '@/store'
import {
  AddRow, EmptyState, InlineText, RowAction, RowActions, RowInsert, SectionHead, useIsDesktop,
} from '@/components/flops'
import { cn } from '@/lib/utils'

/**
 * Раздел «Меню».
 *
 * Эталон — лист «Меню» таблицы заказчика: день заголовком («10 АВГУСТА · ДЕНЬ 1 ·
 * обедо-ужин»), под ним пронумерованные блюда, у каждого название и «сколько»
 * текстом («1 уп. хлеба, 2 уп. паштета, 100 г салями»).
 *
 * ⚠️ Шторки отсюда убраны целиком (решение заказчика 04.08.2026: «мне не нужен
 * поп-ап, в котором всё написано; это прямо вот здесь, в этой таблице уже должно
 * быть»). Название дня, приём пищи, название блюда и «сколько» правятся прямо
 * в строке компонентами из flops/Inline.tsx; добавление и удаление — действия
 * самой строки. Файл DishSheet.tsx за ненадобностью удалён.
 *
 * Отметка «приготовили» стоит на блюде, а старое поле дня `done` из документов
 * первой версии держится с ними в согласии: день готов, когда готовы все блюда.
 * Выбрасывать его нельзя — оно есть в боевом документе.
 */
export function MenuSection() {
  const { S, update, perms } = useTrip()
  const desktop = useIsDesktop()
  const days = S.menu ?? []
  const canEdit = perms.isEditor()

  /* Десктоп: дни раскрыты все сразу. Мобайл: открыт первый. */
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const isOpen = (d: MenuDay, idx: number) =>
    d.i in open ? open[d.i] : desktop || idx === 0

  /**
   * Только что добавленная строка (день или блюдо): её поле открывается сразу
   * в правке и она обведена, чтобы было видно, куда вводить.
   */
  const [fresh, setFresh] = useState<string | null>(null)

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

  /** Новое блюдо встаёт ровно туда, куда показал человек, и сразу открывается в правке. */
  const addDish = (dayId: string, at: number) => {
    const id = 'ds' + Date.now().toString(36)
    patchDay(dayId, (d) => {
      d.dishes = d.dishes ?? []
      d.dishes.splice(at, 0, { i: id, n: '', q: '', done: false })
      syncDay(d)
    })
    setOpen((o) => ({ ...o, [dayId]: true }))
    setFresh(id)
  }

  const delDish = (dayId: string, id: string, dish: MenuDish) => {
    patchDay(dayId, (d) => {
      d.dishes = (d.dishes ?? []).filter((x) => x.i !== id)
      syncDay(d)
    })
    toast(`«${dish.n || 'Без названия'}» убрано из раскладки`, {
      action: { label: 'Отменить', onClick: () => undoDish(dayId, { ...dish, i: id }) },
    })
  }

  /**
   * Правка новой строки закончилась. Пустую строку, в которую так ничего и не
   * вписали, убираем: она никогда не была блюдом, а пустых строк в раскладке
   * заказчика нет. Всё, где есть хоть буква, остаётся.
   *
   * Состояние читаем через readTrip(), а не из замыкания: сохранение только что
   * прошло, и `days` этой отрисовки его ещё не видят — по ним строка выглядела бы
   * пустой и исчезла бы вместе с только что вписанным названием.
   */
  const finishFreshDish = (dayId: string, id: string) => {
    setFresh(null)
    const now = readTrip().S.menu?.find((x) => x.i === dayId)?.dishes?.find((x) => x.i === id)
    if (!now || now.n.trim() || now.q.trim()) return
    patchDay(dayId, (d) => {
      d.dishes = (d.dishes ?? []).filter((y) => y.i !== id)
      syncDay(d)
    })
  }

  const newDay = () => {
    const id = 'd' + Date.now().toString(36)
    update((s) => {
      s.menu = s.menu ?? []
      s.menu.push({ i: id, t: '', sub: '', done: false, dishes: [], ua: Date.now() })
    })
    setOpen((o) => ({ ...o, [id]: true }))
    setFresh(id)
  }

  /** Новый день без названия и без блюд — то же самое, что и пустая строка блюда. */
  const finishFreshDay = (id: string) => {
    setFresh(null)
    const now = readTrip().S.menu?.find((x) => x.i === id)
    if (!now || now.t.trim() || now.sub.trim() || (now.dishes?.length ?? 0) > 0) return
    update((s) => {
      s.menu = (s.menu ?? []).filter((x) => x.i !== id)
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <SectionHead
        title="Меню"
        secId="menu"
        hint="День готов, когда приготовлены все его блюда"
        action={canEdit ? { label: 'Добавить день', onClick: newDay } : undefined}
      />

      {days.length === 0 ? (
        <div className="rounded-xl border border-line bg-surface shadow-sm">
          <EmptyState
            icon={Utensils}
            title="Раскладки пока нет"
            text="В раскладке день за днём: что готовим и сколько брать продуктов"
            action={canEdit ? { label: 'Добавить день', onClick: newDay } : undefined}
          />
        </div>
      ) : (
        /* Десктоп: дни плиткой 3 в ряд — раскладка читается целиком, как на листе. */
        <div className="grid gap-4 lg:grid-cols-3 lg:items-start">
          {days.map((day, idx) => (
            <DayCard
              key={day.i}
              day={day}
              canEdit={canEdit}
              open={isOpen(day, idx)}
              onToggle={() => setOpen((o) => ({ ...o, [day.i]: !isOpen(day, idx) }))}
              fresh={fresh}
              onPatch={(f) => patchDay(day.i, f)}
              onFreshDayEnd={() => finishFreshDay(day.i)}
              onFreshDishEnd={(id) => finishFreshDish(day.i, id)}
              onAddDish={(at) => addDish(day.i, at)}
              onToggleDish={(id) => toggleDish(day.i, id)}
              onDelDish={(id, dish) => delDish(day.i, id, dish)}
            />
          ))}
        </div>
      )}
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

/**
 * «Правка новой строки закончилась» — но только если человек ушёл из неё совсем.
 *
 * В новой строке два поля подряд: название и «сколько». Переход из первого во
 * второе тоже закрывает правку, и без этой проверки пустая ещё строка исчезала бы
 * ровно в тот миг, когда человек тянется вписать в неё количество. Проверяем
 * следующим тиком: к этому времени фокус уже стоит там, куда его перевели.
 */
function endFreshWhenLeft(box: RefObject<HTMLElement | null>, done: () => void) {
  return () => {
    window.setTimeout(() => {
      if (box.current?.contains(document.activeElement)) return
      done()
    }, 0)
  }
}

/* ──────────────────────────────────────────────────────────────────────────
   День раскладки
   ────────────────────────────────────────────────────────────────────────── */

interface DayProps {
  day: MenuDay
  canEdit: boolean
  open: boolean
  onToggle: () => void
  fresh: string | null
  onPatch: (f: (d: MenuDay) => void) => void
  onFreshDayEnd: () => void
  onFreshDishEnd: (id: string) => void
  onAddDish: (at: number) => void
  onToggleDish: (id: string) => void
  onDelDish: (id: string, dish: MenuDish) => void
}

/**
 * Карточка дня. Заголовок — не кнопка целиком: название и приём пищи в нём
 * правятся на месте, а сворачивает день отдельный значок справа. Полоса под
 * заголовком показывает долю приготовленного — тот же приём, что в «Сборах».
 */
function DayCard({
  day, canEdit, open, onToggle, fresh, onPatch,
  onFreshDayEnd, onFreshDishEnd, onAddDish, onToggleDish, onDelDish,
}: DayProps) {
  const dishes = day.dishes ?? []
  const done = dishes.filter((x) => x.done).length
  const pct = dishes.length > 0 ? Math.round((done / dishes.length) * 100) : 0
  const isFresh = fresh === day.i
  const head = useRef<HTMLDivElement>(null)
  const endFresh = endFreshWhenLeft(head, onFreshDayEnd)

  return (
    <section className="overflow-hidden rounded-xl border border-line bg-surface">
      <div ref={head} className="relative flex min-h-14 items-center gap-2 py-1.5 pr-2 pl-4">
        <div className="min-w-0 flex-1">
          <InlineText
            value={day.t}
            onSave={(v) => onPatch((d) => { d.t = v })}
            onEditEnd={isFresh ? endFresh : undefined}
            autoEdit={isFresh}
            can={canEdit}
            label="Название дня"
            placeholder={canEdit ? '13 августа · день 4' : undefined}
            className="text-body font-[650] text-ink"
          />
          <InlineText
            value={day.sub}
            onSave={(v) => onPatch((d) => { d.sub = v })}
            onEditEnd={isFresh ? endFresh : undefined}
            can={canEdit}
            label="Приём пищи"
            placeholder={canEdit ? 'приём пищи' : undefined}
            className="text-note text-muted"
          />
        </div>

        {dishes.length > 0 && (
          <span className="tnum shrink-0 text-note font-semibold text-muted">
            {done} / {dishes.length}
          </span>
        )}

        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-label={open ? 'Свернуть день' : 'Развернуть день'}
          className="grid size-11 shrink-0 place-items-center rounded-md text-muted transition-colors hover:bg-zebra/70 active:scale-[0.98]"
        >
          <ChevronDown
            size={20}
            strokeWidth={1.75}
            aria-hidden
            className={cn('transition-transform', open && 'rotate-180')}
          />
        </button>

        {/* Полоса под заголовком: без блюд это просто линия, отделяющая заголовок
            от списка, с блюдами — она же доля приготовленного. */}
        <span className="absolute inset-x-0 bottom-0 h-0.5 bg-line" aria-hidden>
          {dishes.length > 0 && (
            <span className="block h-full bg-accent transition-[width]" style={{ width: `${pct}%` }} />
          )}
        </span>
      </div>

      {open &&
        (dishes.length === 0 ? (
          <EmptyState
            icon={Utensils}
            title="Блюд пока нет"
            text="В этот день пока ничего не готовим"
            action={canEdit ? { label: 'Добавить блюдо', onClick: () => onAddDish(0) } : undefined}
          />
        ) : (
          <div role="list">
            {dishes.map((dish, k) => {
              /* до миграции у блюда ещё нет i — считаем его тем же ключом, что и она */
              const id = dish.i ?? `${day.i}s${k}`
              return (
                <Fragment key={id}>
                  {canEdit && (
                    <RowInsert onInsert={() => onAddDish(k)} label="Вставить блюдо выше" />
                  )}
                  <DishRow
                    dish={dish}
                    id={id}
                    num={k + 1}
                    zebra={k % 2 === 1}
                    canEdit={canEdit}
                    fresh={fresh === id}
                    onFreshEnd={() => onFreshDishEnd(id)}
                    onPatch={(f) =>
                      onPatch((d) => {
                        const x = d.dishes?.find((y) => y.i === id)
                        if (x) f(x)
                      })
                    }
                    onToggle={() => onToggleDish(id)}
                    onAddBelow={() => onAddDish(k + 1)}
                    onDelete={() => onDelDish(id, dish)}
                  />
                </Fragment>
              )
            })}
            {canEdit && (
              <AddRow label="Добавить блюдо" onClick={() => onAddDish(dishes.length)} />
            )}
          </div>
        ))}
    </section>
  )
}

/* ──────────────────────────────────────────────────────────────────────────
   Блюдо
   ────────────────────────────────────────────────────────────────────────── */

interface DishProps {
  dish: MenuDish
  id: string
  num: number
  zebra: boolean
  canEdit: boolean
  fresh: boolean
  onFreshEnd: () => void
  onPatch: (f: (d: MenuDish) => void) => void
  onToggle: () => void
  onAddBelow: () => void
  onDelete: () => void
}

/**
 * Строка блюда: отметка «приготовили», номер как в таблице заказчика, название
 * и «сколько» — оба правятся на месте. «Сколько» набирается несколькими строками:
 * это длинный текст, а не число («0,5 кг помидоров, 0,5 кг огурцов, 1 уп. салата»).
 */
function DishRow({
  dish, id, num, zebra, canEdit, fresh, onFreshEnd, onPatch, onToggle, onAddBelow, onDelete,
}: DishProps) {
  const row = useRef<HTMLDivElement>(null)
  const endFresh = endFreshWhenLeft(row, onFreshEnd)

  return (
    <div
      ref={row}
      role="listitem"
      data-hit={id}
      className={cn(
        /* `group` — чтобы действия строки проявлялись при наведении на неё целиком. */
        'group relative flex items-start gap-1 border-t border-line/60 py-1.5 pr-1 pl-2 transition-colors',
        zebra ? 'bg-zebra' : 'bg-surface',
        fresh && 'ring-2 ring-accent ring-inset',
      )}
    >
      <DoneMark done={!!dish.done} can={canEdit} name={dish.n} onToggle={onToggle} />

      <span className="tnum w-4 shrink-0 pt-3 text-right text-micro text-muted" aria-hidden>
        {num}
      </span>

      <div className={cn('min-w-0 flex-1 py-1.5 pl-1', dish.done && 'opacity-70')}>
        <InlineText
          value={dish.n}
          onSave={(v) => onPatch((d) => { d.n = v })}
          onEditEnd={fresh ? endFresh : undefined}
          autoEdit={fresh}
          can={canEdit}
          label="Название блюда"
          placeholder={canEdit ? 'Например, уха' : undefined}
          className={cn('text-body font-semibold text-ink', dish.done && 'line-through')}
        />
        <InlineText
          value={dish.q}
          onSave={(v) => onPatch((d) => { d.q = v })}
          onEditEnd={fresh ? endFresh : undefined}
          can={canEdit}
          multiline
          label="Сколько брать продуктов"
          placeholder={canEdit ? 'сколько брать' : undefined}
          className="text-note text-muted"
        />
      </div>

      <RowActions>
        {canEdit ? (
          <RowAction icon={Plus} label="Вставить блюдо ниже" onClick={onAddBelow} />
        ) : null}
        {canEdit ? (
          <RowAction icon={Trash2} tone="danger" label="Удалить блюдо" onClick={onDelete} />
        ) : null}
      </RowActions>
    </div>
  )
}

/**
 * Отметка «приготовили». Права нет — это просто значок состояния, а не кнопка
 * (постулат 5): участник читает раскладку, но не ведёт её.
 */
function DoneMark({
  done, can, name, onToggle,
}: {
  done: boolean
  can: boolean
  name: string
  onToggle: () => void
}) {
  const dot = (
    <span
      className={cn(
        'grid size-6 place-items-center rounded-full border transition-colors',
        done ? 'border-accent-fill bg-accent-fill text-on-accent' : 'border-line-strong',
      )}
    >
      {done && <Check size={16} strokeWidth={1.75} aria-hidden />}
    </span>
  )

  if (!can)
    return (
      <span
        className="grid size-11 shrink-0 place-items-center"
        role="img"
        aria-label={done ? 'приготовили' : 'ещё не готовили'}
      >
        {dot}
      </span>
    )

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={done}
      aria-label={`${name || 'Блюдо'}: ${done ? 'приготовили' : 'ещё не готовили'}. Отметить`}
      className="grid size-11 shrink-0 place-items-center rounded-md transition-colors hover:bg-zebra/70 active:scale-[0.98]"
    >
      {dot}
    </button>
  )
}
