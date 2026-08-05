import { useRef, useState } from 'react'
import { Route, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import type { Person, RoutePoint } from '@/lib/types'
import type { Perms } from '@/lib/perm'
import {
  AddRow, EmptyState, InlineText, PersonHead, RowAction, RowActions, StripField, StripRow,
} from '@/components/flops'
import { remove, touch, update } from '@/store'
import { cn } from '@/lib/utils'
import { pointMeta } from './roadx'
import { Dot, PlaceRow, Rider, useRouteFocus } from './RouteTiming'

/**
 * «Дорога · Маршрут» лентой — вид раздела на телефоне.
 *
 * Последний список, остававшийся матрицей на 390. Колонка точки там шириной
 * 13 rem, и название вставало в ней по два-три слова: «Сбор у Кости: /
 * Санкт-Петербург, / Суздальский пр., 95». Заказчик 06.08.2026 показывал именно
 * этот раздел: «с телефона вообще нереалистично сделана мобильная версия».
 *
 * ⛔ Ничего нового не придумано: плашка — `flops/StripRow`, поля подробности —
 * `StripField`, образцы расстановки — `gear/GearStrip` и `buy/BuyStrip`. Кружок
 * этапа (`Dot`), отметка «едет» (`Rider`) и строка места (`PlaceRow`) взяты
 * из матрицы (`RouteTiming`) прямо теми же функциями: два вида одного раздела
 * обязаны показывать одно и то же одинаково.
 *
 * В полоске — **название слева и время справа**: время и есть то главное число,
 * ради которого человек листает маршрут (у «Сборов» на этом месте количество,
 * у «Закупки» цена). Вторая строка полоски — метка этапа, способ передвижения
 * и длина перегона; по ней видно, раскрывать ли (NN/g, progressive disclosure).
 *
 * ⛔ На широком экране остаётся матрица со столбцами людей, и прокрутку блока
 * в `map/RouteBoard.tsx` трогать нельзя: на ней держатся наведение с карты
 * и липкая шапка (`DataTable.inScroller`, урок У-91).
 */

interface Props {
  points: RoutePoint[]
  people: Person[]
  perms: Perms
  canEdit: boolean
  /** отметить этап пройденным */
  onToggle: (id: string) => void
  /** открыть карточку точки: метка, чем добираемся, расстояние */
  onOpen: (id: string) => void
  onAdd: () => void
  /** какую точку подсветить: по её метке только что тапнули на карте */
  activeId?: string | null
  /** метка времени просьбы: по одной метке можно тапнуть дважды подряд */
  activeAt?: number
}

export function RouteStrip({
  points, people, perms, canEdit, onToggle, onOpen, onAdd, activeId, activeAt,
}: Props) {
  const box = useRef<HTMLDivElement | null>(null)
  /** раскрытая точка; открыта всегда одна — лента остаётся лентой */
  const [openId, setOpenId] = useState('')

  useRouteFocus(box, activeId, activeAt)

  const patch = (id: string, f: (p: RoutePoint) => void) =>
    update((s) => {
      const p = s.route.find((x) => x.i === id)
      if (p) {
        f(p)
        touch(p)
      }
    })

  const drop = (p: RoutePoint) => {
    remove('route', p.i)
    toast(`«${p.n || 'Точка'}» убрана`)
  }

  if (points.length === 0) {
    return (
      <EmptyState
        icon={Route}
        title="Маршрута пока нет"
        text="Место, где мы окажемся по пути"
        action={canEdit ? { label: 'Добавить точку', onClick: onAdd } : undefined}
      />
    )
  }

  return (
    <div ref={box}>
      <div role="list">
        {points.map((p, idx) => {
          const meta = pointMeta(p)
          /* Тап по метке на карте раскрывает точку здесь: подсветкой полоски
             ответить нечем — в ленте она уже во всю ширину. */
          const open = openId === p.i || (!!activeId && activeId === p.i)
          const riders = people.filter((who) => !!p.o?.[who.id]).map((who) => who.name)

          return (
            <StripRow
              key={p.i}
              dataHit={p.i}
              zebra={idx % 2 === 1}
              done={p.done}
              open={open}
              onToggle={() => setOpenId(open ? '' : p.i)}
              title={
                <span className={cn(p.done && 'line-through')}>{p.n || 'Без названия'}</span>
              }
              sub={
                [meta, riders.length > 0 ? `едут: ${riders.join(', ')}` : '', p.c]
                  .filter(Boolean)
                  .join(' · ') || undefined
              }
              right={p.time || undefined}
              rightHint={p.done ? 'пройдено' : undefined}
            >
              <StripField label="Название точки" wide>
                <InlineText
                  value={p.n}
                  onSave={(v) => patch(p.i, (x) => { x.n = v })}
                  can={canEdit}
                  required
                  label="Название точки"
                  placeholder="Например, Приозерск: закупка"
                  className="text-body font-semibold text-ink"
                />
              </StripField>

              <StripField label="Время">
                <InlineText
                  value={p.time}
                  onSave={(v) => patch(p.i, (x) => { x.time = v })}
                  can={canEdit}
                  label="Время"
                  placeholder="··:··"
                  className="tnum text-body font-bold text-accent-text"
                />
              </StripField>

              {/* Метка этапа, способ передвижения и длина перегона выбираются
                  из списков — они живут в карточке точки, и второго органа
                  для них заводить нельзя (У-53). Здесь — то же значение
                  и та же карточка, только цель нажатия во всю строку. */}
              <StripField label="Метка, путь, расстояние">
                {canEdit ? (
                  <button
                    type="button"
                    onClick={() => onOpen(p.i)}
                    aria-label={`${p.n || 'Точка'}: метка, чем добираемся, расстояние. Изменить`}
                    className="grid min-h-11 min-w-11 place-items-center rounded-md px-2 transition-colors hover:bg-zebra/70 active:bg-zebra"
                  >
                    <span className="editable text-body text-ink">{meta || 'не указано'}</span>
                  </button>
                ) : (
                  <span className="text-body text-ink">{meta || '—'}</span>
                )}
              </StripField>

              <StripField label="Описание" wide>
                <InlineText
                  value={p.c}
                  onSave={(v) => patch(p.i, (x) => { x.c = v })}
                  can={canEdit}
                  multiline
                  label="Описание точки"
                  placeholder="Что здесь важно не забыть"
                  className="text-note leading-snug text-muted"
                />
              </StripField>

              <StripField label="Место" wide>
                <PlaceRow
                  point={p}
                  canEdit={canEdit}
                  onAddr={(v) => patch(p.i, (x) => { x.addr = v })}
                />
              </StripField>

              <StripField label="Пройдено">
                {canEdit ? (
                  <button
                    type="button"
                    onClick={() => onToggle(p.i)}
                    aria-label={`${p.n || 'Точка'}: ${p.done ? 'этап пройден' : 'этап впереди'}. Отметить`}
                    aria-pressed={p.done}
                    className="grid size-11 place-items-center rounded-xl transition-colors hover:bg-zebra"
                  >
                    <Dot done={p.done} />
                  </button>
                ) : (
                  <span className="grid size-11 place-items-center">
                    <Dot done={p.done} />
                  </span>
                )}
              </StripField>

              {/* «Кто именно едет этой точкой» — ответ заказчика 05.08.2026
                  на вопрос, хватает ли привязки точки к технике. Поле `o`
                  то же самое, что в матрице, и орган тот же. */}
              <div className="mt-2 border-t border-line/50 pt-2">
                <div className="text-micro font-semibold text-muted">Кто едет</div>
                {people.map((who) => (
                  <div
                    key={who.id}
                    className="flex min-h-14 items-center gap-3 border-b border-line/50 py-1 last:border-b-0"
                  >
                    <PersonHead
                      name={who.name}
                      photo={who.photo}
                      ini={who.ini}
                      mine={who.id === perms.me}
                      size={32}
                    />
                    <span className="min-w-0 flex-1 truncate text-body text-ink">{who.name}</span>
                    <Rider
                      on={!!p.o?.[who.id]}
                      /* Отметиться может и участник без права правки точки:
                         это его собственная отметка, за других он не отмечает. */
                      can={perms.canMark(who.id)}
                      label={`${who.name} едет точкой «${p.n || 'без названия'}»`}
                      onSet={(v) =>
                        patch(p.i, (x) => {
                          const o = { ...(x.o || {}) }
                          if (v) o[who.id] = 1
                          else delete o[who.id]
                          x.o = o
                        })
                      }
                    />
                  </div>
                ))}
              </div>

              {canEdit ? (
                <div className="mt-2 flex justify-end border-t border-line/50 pt-2">
                  <RowActions>
                    <RowAction
                      icon={Trash2}
                      tone="danger"
                      label={`Убрать точку «${p.n || 'без названия'}»`}
                      onClick={() => drop(p)}
                    />
                  </RowActions>
                </div>
              ) : null}
            </StripRow>
          )
        })}
      </div>

      {canEdit && <AddRow label="Добавить точку" onClick={onAdd} />}
    </div>
  )
}
