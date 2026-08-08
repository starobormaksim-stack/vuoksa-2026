import { useState } from 'react'
import { Check, CircleHelp, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import type { Idea } from '@/lib/types'
import { useTrip, touch } from '@/store'
import {
  AddRow, DataCell, DataRow, DataTable, EmptyState, InlineText, RowAction, RowActions, SectionHead,
} from '@/components/flops'
import { cn } from '@/lib/utils'

/**
 * Раздел «Вопросы» — что нужно уточнить до выезда.
 *
 * ─── Откуда он взялся ───
 * Стоял вторым блоком внутри «Дороги». Раздела «Дорога» с 09.08.2026 больше
 * нет: логистика, аренда и проживание стали подразделами «Расходов»
 * (`lib/spend.ts`, `road/SpendRoad.tsx`). Вопросы деньгами не являются
 * и в «Расходы» не идут, а бросить их вместе с разделом значило бы отнять
 * у человека дверь к своим данным (постулат 4). Поэтому — свой раздел,
 * последним в списке: ровно там, где заказчик назвал его 08.08.2026,
 * диктуя порядок разделов целиком.
 *
 * Вопросы заводит и правит каждый, кто в поездке, а не только редактор:
 * «что уточнить» — это не деньги и не расчёт.
 */
export function IdeasSection() {
  const { S, update, remove, perms } = useTrip()
  const canEdit = perms.isEditor()
  /** вопросы заводит и правит каждый, кто в поездке, — не только редактор */
  const canAsk = canEdit || !!perms.me

  /** id только что добавленной строки — она открывается сразу в правке названия */
  const [fresh, setFresh] = useState<string | null>(null)

  const ideas = S.ideas ?? []

  const patchIdea = (id: string, f: (i: Idea) => void) =>
    update((s) => {
      const it = (s.ideas ?? []).find((x) => x.i === id)
      if (it) {
        f(it)
        touch(it)
      }
    })

  /** Вернуть удалённое: снимаем метку удаления и кладём позицию обратно. */
  const restore = (item: Idea) =>
    update((s) => {
      if (s.del) delete s.del['ideas:' + item.i]
      if (!s.ideas) s.ideas = []
      if (!s.ideas.some((x) => x.i === item.i)) s.ideas.push({ ...item, ua: Date.now() })
    })

  /** Убрать с возможностью вернуть — подтверждений в интерфейсе нет (правило 9). */
  const drop = (item: Idea) => {
    remove('ideas', item.i)
    toast(`«${item.n || 'Без названия'}» убран`, {
      action: { label: 'Вернуть', onClick: () => restore(item) },
    })
  }

  const addIdea = () => {
    const id = 'q' + Date.now().toString(36)
    update((s) => {
      if (!s.ideas) s.ideas = []
      s.ideas.push({ i: id, n: '', why: '', who: '', done: false, ua: Date.now() })
    })
    setFresh(id)
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Общего «плюса» с рядом «вещь · покупка · топливо · аренда» здесь нет:
          в «Вопросах» ничего из этого не заводится (постулат 6 — не положено,
          кнопки нет). Своё действие раздела — «Добавить вопрос». */}
      <SectionHead
        title="Вопросы"
        secId="ideas"
        hint="Что уточнить до выезда"
        noAdd
        action={canAsk ? { label: 'Добавить вопрос', onClick: addIdea } : undefined}
      />

      {ideas.length === 0 ? (
        <EmptyState
          icon={CircleHelp}
          title="Вопросов нет"
          text="Здесь живёт то, что нужно уточнить до выезда"
          action={canAsk ? { label: 'Добавить вопрос', onClick: addIdea } : undefined}
        />
      ) : (
        <div className="overflow-clip rounded-2xl border border-line bg-surface">
          <DataTable cols={IDEA_COLS} minW={IDEA_COLS_MIN} label="Вопросы: что уточнить до выезда">
            {/* Полоса строк шириной со свои колонки, а не с экран (см. «Логистика»). */}
            <div role="rowgroup" className="w-full">
              <DataRow zebra>
                <DataCell sticky bg="zebra" align="left" head>
                  Вопрос
                </DataCell>
                <DataCell head align="left">
                  На ком
                </DataCell>
                <DataCell head>Решён</DataCell>
              </DataRow>

              {ideas.map((q, idx) => (
                <DataRow key={q.i} zebra={idx % 2 === 1} dataHit={q.i} fresh={fresh === q.i}>
                  <DataCell sticky bg={idx % 2 === 1 ? 'zebra' : 'surface'} align="left">
                    <span className="flex w-full items-start gap-1">
                      <span className="min-w-0 flex-1">
                        <InlineText
                          value={q.n}
                          onSave={(v) =>
                            patchIdea(q.i, (x) => {
                              x.n = v
                            })
                          }
                          can={canAsk}
                          required
                          autoEdit={fresh === q.i}
                          onEditEnd={() => setFresh(null)}
                          label="Вопрос"
                          placeholder="Что уточнить"
                          className={cn(
                            'text-body leading-snug font-medium text-ink',
                            q.done && 'line-through',
                          )}
                        />
                        {canAsk || q.why ? (
                          <InlineText
                            value={q.why}
                            onSave={(v) =>
                              patchIdea(q.i, (x) => {
                                x.why = v
                              })
                            }
                            can={canAsk}
                            multiline
                            label="Почему это важно"
                            placeholder="Почему важно"
                            className="text-note leading-snug text-muted"
                          />
                        ) : null}
                      </span>
                      <RowActions>
                        {canEdit ? (
                          <RowAction
                            icon={Trash2}
                            tone="danger"
                            label={`Убрать вопрос «${q.n}»`}
                            onClick={() => drop(q)}
                          />
                        ) : null}
                      </RowActions>
                    </span>
                  </DataCell>

                  <DataCell align="left">
                    <InlineText
                      value={q.who}
                      onSave={(v) =>
                        patchIdea(q.i, (x) => {
                          x.who = v
                        })
                      }
                      can={canAsk}
                      label="На ком вопрос"
                      placeholder="Ни на ком"
                      className="text-note text-muted"
                    />
                  </DataCell>

                  <DataCell>
                    {canAsk ? (
                      <button
                        type="button"
                        aria-label={`${q.n}: ${q.done ? 'решён' : 'не решён'}. Отметить`}
                        aria-pressed={q.done}
                        onClick={() =>
                          patchIdea(q.i, (x) => {
                            x.done = !x.done
                          })
                        }
                        className="grid size-11 place-items-center rounded-md transition-colors hover:bg-zebra active:scale-95"
                      >
                        <Dot done={q.done} />
                      </button>
                    ) : (
                      <Dot done={q.done} />
                    )}
                  </DataCell>
                </DataRow>
              ))}
            </div>
          </DataTable>
          {canAsk && <AddRow label="Добавить вопрос" onClick={addIdea} />}
        </div>
      )}
    </div>
  )
}

/**
 * Вопрос · на ком · решён. Первая колонка липкая, как и в расчёте, и тянется
 * не одна: иначе «на ком» и «решён» уезжают в крайний правый угол (см. COLS
 * в `road/RoadCalc.tsx`).
 */
const IDEA_COLS = 'minmax(12rem,1fr) minmax(8rem,0.35fr) 4rem'

/** Сумма минимумов IDEA_COLS: 12 + 8 + 4. Зачем — см. `minW` в DataTable. */
const IDEA_COLS_MIN = '24rem'

/** Кружок «вопрос решён»: 24 px внутри цели касания 44 px. */
function Dot({ done }: { done: boolean }) {
  return (
    <span
      className={cn(
        'grid size-6 place-items-center rounded-full border-[1.5px]',
        done ? 'border-accent bg-accent text-on-accent' : 'border-line-strong',
      )}
      aria-hidden
    >
      {done && <Check size={16} strokeWidth={1.75} />}
    </span>
  )
}
