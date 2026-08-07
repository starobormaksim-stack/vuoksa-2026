import { useEffect, useRef, useState, type RefObject } from 'react'
import { Check, Plus, Trash2, Utensils } from 'lucide-react'
import { toast } from 'sonner'
import type { MenuDay, MenuDish } from '@/lib/types'
import { readTrip, touch, useTrip } from '@/store'
import {
  AddRow, DataCell, DataHead, DataRow, DataTable, EmptyState, Group, InlineText,
  newTableScroll, RowAction, RowActions, SectionHead, StripField, StripRow, useIsDesktop,
} from '@/components/flops'
import { autoDayTitle } from '@/format'
import { cn } from '@/lib/utils'

/**
 * Раздел «Меню».
 *
 * Эталон — лист «Меню» таблицы заказчика: день заголовком («10 АВГУСТА · ДЕНЬ 1 ·
 * обедо-ужин»), под ним пронумерованные блюда, у каждого название и «сколько»
 * текстом («1 уп. хлеба, 2 уп. паштета, 100 г салями»).
 *
 * ⛔ Форма — та же, что у «Сборов», «Закупки» и «Маршрута» (урок У-54, слово
 * заказчика 05.08.2026: «слева столбец вещей, справа столбцы… чтобы единообразие
 * было»). День — раскрывающаяся группа `Group`, блюда — `DataTable` с липкой
 * колонкой названия и прокруткой вбок внутри блока. Прежние карточки дней
 * плиткой «3 в ряд» были пятой формой списка в сервисе и убраны: раскладка
 * из трёх узких столбцов не читается как таблица и ни на что в сервисе
 * не похожа.
 *
 * ⛔ Столбцов людей здесь НЕТ, и заводить их нельзя: заказчик 05.08.2026 на прямой
 * вопрос ответил, что отметка «кто готовит» и «кто несёт продукты» в раскладке
 * не нужна. Специфика раздела — своя колонка «Сколько брать»: в таблице заказчика
 * это отдельный столбец, а не приписка под названием.
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
 *
 * ⛔ На телефоне матрицы нет: блюда идут вертикальной лентой `StripRow`, как
 * «Сборы» и «Закупка» (решение заказчика 06.08.2026 — прокрутку вбок на телефоне
 * он назвал «нереалистичной»). На широком экране матрица остаётся. Модель данных,
 * права и способ правки у обоих видов общие, разная только расстановка; рисуется
 * ровно один вид, а не два спрятанных.
 */
export function MenuSection() {
  const { S, update, perms } = useTrip()
  const days = S.menu ?? []
  const canEdit = perms.isEditor()
  const desktop = useIsDesktop()

  /* ⛔ Дни СВЁРНУТЫ по умолчанию. Заказчик 08.08.2026: «у тебя есть меню —
     по умолчанию пускай будет свёрнуто, они развёрнуты… всё должно сворачиваться
     в простоту». Это отменяет прежнее «все списки раскрыты» (06.08.2026):
     тогда дней было мало, а раскладка на пять дней даёт полтора экрана
     заголовков и три экрана блюд, через которые надо листать до всего
     остального. Название дня, дата и «приготовлено: 3 из 7» видны и в свёрнутом
     виде — то, ради чего раскладку открывают чаще всего. */
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const isOpen = (d: MenuDay) => (d.i in open ? open[d.i] : false)

  /**
   * Только что добавленная строка (день или блюдо): её поле открывается сразу
   * в правке и она обведена, чтобы было видно, куда вводить.
   */
  const [fresh, setFresh] = useState<string | null>(null)

  /* Пролистав вбок один день, человек ждёт того же от соседних — как в «Сборах». */
  const scroll = useRef(newTableScroll())

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
      /* Дата дня берётся из дат поездки, а не вписывается руками (пункт 6 разбора).
         Дат нет вовсе — день заводится безымянным, как раньше. */
      const t = autoDayTitle(s.trip.start, s.menu.length)
      s.menu.push({ i: id, t, sub: '', done: false, dishes: [], ua: Date.now() })
    })
    setOpen((o) => ({ ...o, [id]: true }))
    setFresh(id)
  }

  /**
   * Убрать день целиком, со всеми его блюдами.
   *
   * ⛔ Заказчик 08.08.2026: «пункты меню… на 10 августа вообще полностью,
   * допустим, на целый день можно удалять — уже вообще всё удалить». Раньше
   * день уходил только сам собой: пустой и безымянный (`finishFreshDay`),
   * а день с блюдами не убирался вовсе — блюда приходилось сносить по одному,
   * и последний, уже пустой, день всё равно оставался на экране.
   * Возврат — кнопкой в сообщении: `confirm()` в проекте нет (постулат 9),
   * а разрушительное действие обязано иметь обратный ход.
   */
  const delDay = (day: MenuDay, idx: number) => {
    update((s) => {
      s.menu = (s.menu ?? []).filter((x) => x.i !== day.i)
    })
    toast(`День «${day.t || autoDayTitle(S.trip.start, idx) || 'без названия'}» убран`, {
      description:
        (day.dishes?.length ?? 0) > 0 ? `Вместе с ним ушли блюда: ${day.dishes.length}` : undefined,
      action: {
        label: 'Отменить',
        onClick: () =>
          update((s) => {
            s.menu = s.menu ?? []
            if (s.menu.some((x) => x.i === day.i)) return
            /* Свежая метка — иначе слияние сочтёт вернувшийся день старее
               метки удаления и уберёт его снова. Место в списке возвращаем
               то же, откуда он ушёл. */
            s.menu.splice(Math.min(idx, s.menu.length), 0, { ...day, ua: Date.now() })
          }),
      },
    })
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
        days.map((day, idx) => (
          <DayCard
            key={day.i}
            day={day}
            canEdit={canEdit}
            desktop={desktop}
            open={isOpen(day)}
            onToggle={() => setOpen((o) => ({ ...o, [day.i]: !isOpen(day) }))}
            fresh={fresh}
            sync={scroll}
            autoTitle={autoDayTitle(S.trip.start, idx)}
            onPatch={(f) => patchDay(day.i, f)}
            onFreshDayEnd={() => finishFreshDay(day.i)}
            onFreshDishEnd={(id) => finishFreshDish(day.i, id)}
            onAddDish={(at) => addDish(day.i, at)}
            onToggleDish={(id) => toggleDish(day.i, id)}
            onDelDish={(id, dish) => delDish(day.i, id, dish)}
            onDelDay={() => delDay(day, idx)}
          />
        ))
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

/**
 * То же самое для строки блюда, но искать её надо по метке `data-hit`, а не по ref.
 *
 * ⚠️ Причина ровно в переезде на матрицу: название и «сколько» лежат теперь
 * в РАЗНЫХ ячейках строки, и одним ref их не накрыть. Ref на первую ячейку
 * считал бы переход во вторую уходом — и новая, ещё пустая строка исчезала бы
 * ровно в тот миг, когда человек тянется вписать в неё количество.
 */
function endFreshWhenLeftRow(id: string, done: () => void) {
  return () => {
    window.setTimeout(() => {
      const active = document.activeElement
      if (active instanceof Element && active.closest(`[data-hit="${CSS.escape(id)}"]`)) return
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
  /** широкий экран — матрица блюд; узкий — вертикальная лента (решение 06.08.2026) */
  desktop: boolean
  open: boolean
  onToggle: () => void
  fresh: string | null
  /** сцепка прокрутки вбок со всеми остальными днями раздела */
  sync: RefObject<ReturnType<typeof newTableScroll>>
  /** название дня по датам поездки — подсказка в пустом поле (пункт 6 разбора) */
  autoTitle: string
  onPatch: (f: (d: MenuDay) => void) => void
  onFreshDayEnd: () => void
  onFreshDishEnd: (id: string) => void
  onAddDish: (at: number) => void
  onToggleDish: (id: string) => void
  onDelDish: (id: string, dish: MenuDish) => void
  /** убрать день целиком — действие живёт в его же заголовке */
  onDelDay: () => void
}

/**
 * День раскладки — группа той же формы, что раздел «Сборов»: название и приём
 * пищи правятся прямо в заголовке (`titleEdit`), полоса под ним показывает долю
 * приготовленного, тело — таблица блюд.
 *
 * ⛔ Своей вёрстки заголовка здесь больше нет: она повторяла `Group` руками
 * и разъезжалась с ним при каждой правке общего оформления (постулат 3).
 */
function DayCard({
  day, canEdit, desktop, open, onToggle, fresh, sync, autoTitle, onPatch,
  onFreshDayEnd, onFreshDishEnd, onAddDish, onToggleDish, onDelDish, onDelDay,
}: DayProps) {
  const dishes = day.dishes ?? []
  const done = dishes.filter((x) => x.done).length
  const isFresh = fresh === day.i
  const head = useRef<HTMLDivElement>(null)
  const endFresh = endFreshWhenLeft(head, onFreshDayEnd)

  /* Две доли рядом — значит наименьшая ширина сетки задаётся числом, иначе доля
     при вычислении «по содержимому» раздувается до max-content (урок У-74).
     Сумма минимумов мобильной раскладки: 9 + 9 + 4,5 + 6,5. */
  const cols =
    'minmax(var(--ncol),1fr) minmax(var(--qcol),1fr) var(--dcol) var(--acol)'

  return (
    <Group
      title={day.t || autoTitle || 'День без названия'}
      titleEdit={
        <div ref={head} className="min-w-0 flex-1">
          <InlineText
            value={day.t}
            onSave={(v) => onPatch((d) => { d.t = v })}
            onEditEnd={isFresh ? endFresh : undefined}
            autoEdit={isFresh}
            can={canEdit}
            label="Название дня"
            /* Подсказка — та самая дата, которая получится из дат поездки:
               человек видит, что вписывать её руками не нужно (пункт 6 разбора). */
            placeholder={canEdit ? autoTitle || '13 августа · день 4' : undefined}
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
      }
      done={done}
      total={dishes.length}
      /* Счётчик и «убрать день» стоят в заголовке рядом: заголовок — это и есть
         строка дня, а действие над строкой живёт в самой строке (постулат 1).
         ⚠️ `badge` рисуется ВНЕ кнопки сворачивания (см. `Group`), поэтому
         кнопка в кнопке здесь не возникает. */
      badge={
        dishes.length > 0 || canEdit ? (
          <span className="flex shrink-0 items-center gap-1">
            {dishes.length > 0 && (
              <span className="tnum text-note font-semibold text-muted">
                приготовлено: {done} из {dishes.length}
              </span>
            )}
            {canEdit && (
              <button
                type="button"
                onClick={onDelDay}
                aria-label={`Убрать день «${day.t || autoTitle || 'без названия'}» целиком`}
                title="Убрать день целиком"
                className="grid size-11 shrink-0 place-items-center rounded-md text-muted transition-colors hover:bg-zebra hover:text-danger"
              >
                <Trash2 size={18} strokeWidth={1.75} aria-hidden />
              </button>
            )}
          </span>
        ) : undefined
      }
      open={open}
      onToggle={onToggle}
    >
      {dishes.length === 0 ? (
        <EmptyState
          icon={Utensils}
          title="Блюд пока нет"
          text="В этот день пока ничего не готовим"
          action={canEdit ? { label: 'Добавить блюдо', onClick: () => onAddDish(0) } : undefined}
        />
      ) : (
        <>
          {desktop ? (
            <DataTable
              cols={cols}
              minW="29rem"
              label={`Раскладка: ${day.t || 'день без названия'}`}
              sync={sync}
              className={cn(
                '[--acol:6.5rem] [--dcol:4.5rem] [--ncol:9rem] [--qcol:9rem]',
                'lg:[--ncol:16rem] lg:[--qcol:20rem]',
              )}
            >
              <DataHead>
                <DataCell head sticky align="left">
                  Блюдо
                </DataCell>
                <DataCell head align="left">
                  Сколько брать
                </DataCell>
                <DataCell head>Готово</DataCell>
                <DataCell head className="px-1" />
              </DataHead>

              {dishes.map((dish, k) => {
                /* до миграции у блюда ещё нет i — считаем его тем же ключом, что и она */
                const id = dish.i ?? `${day.i}s${k}`
                return (
                  <DishRow
                    key={id}
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
                )
              })}
            </DataTable>
          ) : (
            <DishStrip
              dishes={dishes}
              dayId={day.i}
              canEdit={canEdit}
              fresh={fresh}
              onFreshEnd={onFreshDishEnd}
              onPatchDish={(id, f) =>
                onPatch((d) => {
                  const x = d.dishes?.find((y) => y.i === id)
                  if (x) f(x)
                })
              }
              onToggle={onToggleDish}
              onAddBelow={onAddDish}
              onDelete={onDelDish}
            />
          )}
          {canEdit && (
            <div className="border-t border-line">
              <AddRow label="Добавить блюдо" onClick={() => onAddDish(dishes.length)} />
            </div>
          )}
        </>
      )}
    </Group>
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
 * Строка блюда в матрице: слева закреплены номер и название, рядом «сколько
 * брать», справа отметка «приготовили» и действия строки.
 *
 * «Сколько» набирается несколькими строками: это длинный текст, а не число
 * («0,5 кг помидоров, 0,5 кг огурцов, 1 уп. салата»), — потому и стоит своей
 * колонкой, как в таблице заказчика.
 */
function DishRow({
  dish, id, num, zebra, canEdit, fresh, onFreshEnd, onPatch, onToggle, onAddBelow, onDelete,
}: DishProps) {
  const endFresh = endFreshWhenLeftRow(id, onFreshEnd)
  const bg = zebra ? 'zebra' : 'surface'

  return (
    <DataRow zebra={zebra} fresh={fresh} dataHit={id}>
      <DataCell sticky bg={bg} align="left">
        <span className={cn('flex w-full items-baseline gap-2', dish.done && 'opacity-70')}>
          <span className="tnum w-4 shrink-0 text-right text-micro text-muted" aria-hidden>
            {num}
          </span>
          <span className="min-w-0 flex-1">
            <InlineText
              value={dish.n}
              onSave={(v) => onPatch((d) => { d.n = v })}
              onEditEnd={fresh ? endFresh : undefined}
              autoEdit={fresh}
              can={canEdit}
              label="Название блюда"
              placeholder={canEdit ? 'Например, уха' : undefined}
              className={cn(
                'text-body leading-snug font-semibold text-ink',
                dish.done && 'line-through',
              )}
            />
          </span>
        </span>
      </DataCell>

      <DataCell align="left" className={cn(dish.done && 'opacity-70')}>
        <InlineText
          value={dish.q}
          onSave={(v) => onPatch((d) => { d.q = v })}
          onEditEnd={fresh ? endFresh : undefined}
          can={canEdit}
          multiline
          label="Сколько брать продуктов"
          placeholder={canEdit ? 'сколько брать' : undefined}
          className="text-note leading-snug text-muted"
        />
      </DataCell>

      <DataCell>
        <DoneMark done={!!dish.done} can={canEdit} name={dish.n} onToggle={onToggle} />
      </DataCell>

      <DataCell className="px-1">
        <RowActions>
          {canEdit ? (
            <RowAction icon={Plus} label="Вставить блюдо ниже" onClick={onAddBelow} />
          ) : null}
          {canEdit ? (
            <RowAction icon={Trash2} tone="danger" label="Удалить блюдо" onClick={onDelete} />
          ) : null}
        </RowActions>
      </DataCell>
    </DataRow>
  )
}

/* ──────────────────────────────────────────────────────────────────────────
   Блюда лентой — вид дня на телефоне
   ────────────────────────────────────────────────────────────────────────── */

interface StripProps {
  dishes: MenuDish[]
  /** нужен только для ключа блюда из документа v1, где у блюд нет своего i */
  dayId: string
  canEdit: boolean
  /** только что заведённое блюдо: раскрыто и открыто на правку названия */
  fresh: string | null
  onFreshEnd: (id: string) => void
  onPatchDish: (id: string, f: (d: MenuDish) => void) => void
  onToggle: (id: string) => void
  /** завести блюдо на этом месте: k + 1 — сразу под текущим */
  onAddBelow: (at: number) => void
  onDelete: (id: string, dish: MenuDish) => void
}

/**
 * Блюда дня вертикальной лентой — то же, что «Сборы» на телефоне.
 *
 * В свёрнутой полоске кружок готовности слева, название крупно и «сколько брать»
 * второй строкой: этого хватает, чтобы решить, раскрывать её или нет. Числа
 * справа НЕТ — у блюда его попросту не бывает: «сколько брать» здесь текст
 * («1 уп. хлеба, 2 уп. паштета, 100 г салями»), а не величина.
 *
 * ⛔ Ни одного нового способа правки: те же `InlineText`, тот же кружок
 * `DoneMark`, те же `RowAction`, что в матрице, — просто расставленные столбиком.
 * Заголовок дня остаётся общим у обоих видов и живёт в `Group`.
 */
function DishStrip({
  dishes, dayId, canEdit, fresh, onFreshEnd, onPatchDish, onToggle, onAddBelow, onDelete,
}: StripProps) {
  /** раскрытое блюдо; открыто всегда одно — лента остаётся лентой */
  const [openId, setOpenId] = useState('')

  return (
    <div role="list">
      {dishes.map((dish, k) => {
        /* до миграции у блюда ещё нет i — считаем его тем же ключом, что и она */
        const id = dish.i ?? `${dayId}s${k}`
        const isFresh = fresh === id
        const open = openId === id || isFresh
        const endFresh = endFreshWhenLeftRow(id, () => onFreshEnd(id))
        /* Раскрытой полоска остаётся и после того, как перестала быть новой:
           иначе подробность захлопывалась бы ровно в тот миг, когда человек
           дописал название и тянется вписать «сколько брать». */
        const endFreshKeepOpen = () => {
          setOpenId(id)
          endFresh()
        }

        return (
          <StripRow
            key={id}
            dataHit={id}
            zebra={k % 2 === 1}
            done={!!dish.done}
            open={open}
            onToggle={() => setOpenId(open ? '' : id)}
            lead={
              <DoneMark
                done={!!dish.done}
                can={canEdit}
                name={dish.n}
                onToggle={() => onToggle(id)}
              />
            }
            title={dish.n || 'Без названия'}
            /* Длинный список продуктов сам обрежется на второй строке
               (`line-clamp-2` в `StripRow`), целиком он читается в раскрытом. */
            sub={dish.q || undefined}
          >
            <StripField label="Название" wide>
              <InlineText
                value={dish.n}
                onSave={(v) => onPatchDish(id, (d) => { d.n = v })}
                onEditEnd={isFresh ? endFreshKeepOpen : undefined}
                autoEdit={isFresh}
                can={canEdit}
                label="Название блюда"
                /* ⚠️ У новой строки обязательности нет: она заводится пустой,
                   и требование «впиши название» заперло бы человека в поле,
                   из которого на телефоне нет выхода (Esc там не нажать).
                   Пустую новую строку раздел убирает сам. Тот же приём,
                   что в «Закупке» (`BuyStrip`, урок У-100). */
                required={!isFresh}
                placeholder={canEdit ? 'Например, уха' : undefined}
                className="text-body font-semibold text-ink"
              />
            </StripField>

            <StripField label="Сколько брать" wide>
              <InlineText
                value={dish.q}
                onSave={(v) => onPatchDish(id, (d) => { d.q = v })}
                onEditEnd={isFresh ? endFreshKeepOpen : undefined}
                can={canEdit}
                multiline
                label="Сколько брать продуктов"
                placeholder={canEdit ? 'сколько брать' : undefined}
                className="text-note leading-snug text-muted"
              />
            </StripField>

            {/* ⛔ Полки «Готово» здесь больше нет. Кружок отметки уже стоит
                в шапке полоски (`lead`), и второй такой же в раскрытии был
                двумя органами на одно значение — ровно то, что запрещает
                урок У-53. Орган остался один, в шапке. */}

            {canEdit ? (
              <div className="mt-2 flex justify-end border-t border-line/50 pt-2">
                <RowActions>
                  <RowAction
                    icon={Plus}
                    label="Вставить блюдо ниже"
                    onClick={() => onAddBelow(k + 1)}
                  />
                  <RowAction
                    icon={Trash2}
                    tone="danger"
                    label="Удалить блюдо"
                    onClick={() => onDelete(id, dish)}
                  />
                </RowActions>
              </div>
            ) : null}
          </StripRow>
        )
      })}
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
