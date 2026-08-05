import { useState } from 'react'
import { Check, CircleHelp, MapPinned, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import type { Idea, Rent, Transport } from '@/lib/types'
import { useTrip, touch } from '@/store'
import {
  AddRow, Btn, DataCell, DataRow, DataTable, EmptyState, Group, InlineText,
  RowAction, RowActions, SectionHead,
} from '@/components/flops'
import { MDASH, plural } from '@/format'
import { cn } from '@/lib/utils'
import { RouteBoard } from '@/components/map/RouteBoard'
import { RoadCalc } from './RoadCalc'
import { TransportSheet } from './TransportSheet'
import { RentSheet } from './RentSheet'
import { calcLegsByMap } from './legs'
import { kmLabel } from './roadx'

/**
 * Раздел «Дорога» — лист «Логистика» из таблицы заказчика.
 *
 * Что здесь есть и в каком порядке:
 *   маршрут — сам, а не ссылка на него (RouteBoard: лента точек и карта);
 *   «Расчёт дороги» — ОДНА таблица: пробег, топливо и техника, аренда,
 *     канистры и итоги поездки;
 *   «Вопросы» — что уточнить до выезда.
 *
 * Чего здесь больше нет и почему (заказчик, 04.08.2026):
 *   карточки «Исходные данные» — «очень сложно, очень много лишнего,
 *     повторяющаяся информация»: одно и то же число стояло и там, и в расчёте.
 *     Теперь оно одно, в своей строке расчёта, и правится прямо в ней;
 *   отдельного блока «Канистры» — он свернулся в ту же таблицу;
 *   шторок с числами (NumberSheet) — «мне не нужен поп-ап, в котором всё
 *     написано; это прямо вот здесь, в этой таблице уже должно быть».
 *
 * Сюда же переехали расчёты с обложки поездки: транспорт, продукты, общий
 * бюджет и «с каждого» стоят последней группой таблицы — «сами расчёты должны
 * быть внизу, в разделе другом».
 *
 * Считает по-прежнему lib/calc.ts. Контрольные цифры (330 км · 21 385 / 26 005 /
 * 47 390 / 11 848 ₽ · 2 канистры) обязаны сходиться с таблицей заказчика.
 */
export function RoadSection() {
  const { S, update, remove, perms } = useTrip()
  const canEdit = perms.isEditor()
  /** вопросы заводит и правит каждый, кто в поездке, — не только редактор */
  const canAsk = canEdit || !!perms.me

  const [open, setOpen] = useState<Record<string, boolean>>({ ideas: false })
  /** карточка выбора: вид, топливо, чья техника */
  const [trSheet, setTrSheet] = useState<string | null>(null)
  const [rnSheet, setRnSheet] = useState<string | null>(null)
  /** id только что добавленной строки — она открывается сразу в правке названия */
  const [fresh, setFresh] = useState<string | null>(null)
  /** идёт запрос к маршрутизатору */
  const [mapBusy, setMapBusy] = useState(false)

  const dist = S.trip.dist
  const ideas = S.ideas ?? []

  /* ─────────── правки ─────────── */

  const patchIdea = (id: string, f: (i: Idea) => void) =>
    update((s) => {
      const it = (s.ideas ?? []).find((x) => x.i === id)
      if (it) {
        f(it)
        touch(it)
      }
    })

  /** Вернуть удалённое: снимаем метку удаления и кладём позицию обратно. */
  const restore = (kind: string, item: { i: string }) =>
    update((s) => {
      if (s.del) delete s.del[`${kind}:${item.i}`]
      const list = (s as unknown as Record<string, { i: string; ua?: number }[]>)[kind]
      if (Array.isArray(list) && !list.some((x) => x.i === item.i)) {
        list.push({ ...item, ua: Date.now() })
      }
    })

  /** Убрать с возможностью вернуть — подтверждений в интерфейсе нет (правило 9). */
  const drop = (kind: string, item: { i: string; n: string }, word: string) => {
    remove(kind, item.i)
    toast(`«${item.n || 'Без названия'}» ${word}`, {
      action: { label: 'Вернуть', onClick: () => restore(kind, item) },
    })
  }

  /* ─────────── километры по карте ─────────── */

  /**
   * Считать пробег по карте. Зовётся только руками человека — молча на карту
   * расчёт не переключается никогда, иначе пробег схлопнулся бы до тех
   * километров, которые успели посчитаться.
   */
  const setAuto = (km: number) => {
    update((s) => {
      s.trip.dist.src = 'auto'
    })
    toast(`В расчёт пошли километры с карты ${MDASH} ${kmLabel(km)}`, {
      action: {
        label: 'Отменить',
        onClick: () =>
          update((s) => {
            s.trip.dist.src = 'manual'
          }),
      },
    })
  }

  const useManual = () => {
    update((s) => {
      s.trip.dist.src = 'manual'
    })
    toast(`Вернули своё число ${MDASH} ${kmLabel(S.trip.dist.manual)}`)
  }

  const runMapCalc = async () => {
    setMapBusy(true)
    const r = await calcLegsByMap()
    setMapBusy(false)
    if (!r.ok) {
      toast(
        r.why === 'few'
          ? 'На карте меньше двух точек — считать нечего. Поставьте точки на карте маршрута'
          : 'Карта не ответила: похоже, нет сети. Расстояние можно вписать руками',
      )
      return
    }
    toast(
      `По дорогам вышло ${kmLabel(r.km)} ${MDASH} ${r.legs} ${plural(r.legs, 'участок', 'участка', 'участков')}`,
      { action: { label: 'Считать по карте', onClick: () => setAuto(r.km) } },
    )
  }

  /* ─────────── добавление ─────────── */

  const addTransport = () => {
    const id = 'tr' + Date.now().toString(36)
    update((s) => {
      const kind = s.kinds.find((k) => k.i === 'car') ?? s.kinds[0]
      s.transport.push({
        i: id, n: '', kind: kind?.i ?? '', kindT: '', fuel: s.fuelPrices[0]?.i ?? '',
        rate: 0, rateU: kind?.rateU ?? 'l100km', hours: 0, litres: 0, carry: false,
        owner: perms.me || '', leg: 'road', calcT: '', c: '', nt: {},
        ord: (s.transport.length + 1) * 10, by: perms.me || '', as: '', ua: Date.now(),
      })
    })
    setFresh(id)
  }

  const addRent = () => {
    const id = 'rn' + Date.now().toString(36)
    update((s) => {
      s.rent.push({
        i: id, n: '', cat: s.rentCats[0]?.i ?? 'other', price: 0, unit: 'сут.', qty: 1, count: 1,
        calcT: '', c: '', blocks: [], warn: '', nt: {},
        ord: (s.rent.length + 1) * 10, by: perms.me || '', as: '', ua: Date.now(),
      })
    })
    setFresh(id)
  }

  const addIdea = () => {
    const id = 'q' + Date.now().toString(36)
    update((s) => {
      if (!s.ideas) s.ideas = []
      s.ideas.push({ i: id, n: '', why: '', who: '', done: false, ua: Date.now() })
    })
    setFresh(id)
  }

  const curTr = trSheet ? S.transport.find((t) => t.i === trSheet) : null
  const curRn = rnSheet ? S.rent.find((r) => r.i === rnSheet) : null

  /* ─────────── полоса «посчитать по карте» ─────────── */

  const mapStrip = (
    <div className="border-b border-line bg-zebra/40 px-4 py-3">
      {canEdit && (
        <div className="flex flex-wrap items-center gap-2">
          <Btn tone="secondary" disabled={mapBusy} onClick={() => void runMapCalc()}>
            <MapPinned size={18} strokeWidth={1.75} aria-hidden />
            {mapBusy ? 'Считаем по карте…' : 'Посчитать по карте'}
          </Btn>
          {dist.auto > 0 &&
            (dist.src === 'auto' ? (
              <Btn tone="ghost" onClick={useManual}>
                Вернуть своё число
              </Btn>
            ) : (
              <Btn tone="ghost" onClick={() => setAuto(dist.auto)}>
                Считать по карте
              </Btn>
            ))}
        </div>
      )}
      {/* Одна короткая строка вместо трёх длинных объяснений: заказчик
          05.08.2026 — «гигантское количество текста… это лишнее». Какое
          число идёт в расчёт — критическая деталь, она остаётся. */}
      <p className={cn('text-note leading-snug text-muted', canEdit && 'mt-2')}>
        {dist.src === 'auto'
          ? `В расчёте карта · ${kmLabel(dist.auto)}. Своё — ${kmLabel(dist.manual)}`
          : dist.auto > 0
            ? `В расчёте своё число. По карте — ${kmLabel(dist.auto)}`
            : 'Считается по дорогам между точками маршрута'}
      </p>
    </div>
  )

  return (
    <div className="flex flex-col gap-6">
      <SectionHead
        title="Дорога"
        secId="road"
        hint="Итоги справа считаются сами — правятся только исходные числа"
      />

      <RouteBoard S={S} perms={perms} />

      <RoadCalc
        S={S}
        canEdit={canEdit}
        canDel={perms.canDel}
        onAddTransport={addTransport}
        onAddRent={addRent}
        onDelTransport={(t: Transport) => drop('transport', t, 'убрана')}
        onDelRent={(r: Rent) => drop('rent', r, 'убрана')}
        onSetupTransport={setTrSheet}
        onSetupRent={setRnSheet}
        fresh={fresh}
        onFreshEnd={() => setFresh(null)}
        mapStrip={mapStrip}
      />

      {/* ─── Вопросы ─── */}
      <Group
        title="Вопросы"
        done={ideas.filter((i) => i.done).length}
        total={ideas.length}
        open={!!open.ideas}
        onToggle={() => setOpen((o) => ({ ...o, ideas: !o.ideas }))}
      >
        {ideas.length === 0 ? (
          <EmptyState
            icon={CircleHelp}
            title="Вопросов нет"
            text="Здесь живёт то, что нужно уточнить до выезда"
            action={canAsk ? { label: 'Добавить вопрос', onClick: addIdea } : undefined}
          />
        ) : (
          <>
            <DataTable
              cols={IDEA_COLS}
              minW={IDEA_COLS_MIN}
              label="Вопросы: что уточнить до выезда"
            >
              {/* Полоса строк шириной со свои колонки, а не с экран (см. «Расчёт дороги»). */}
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
                              onClick={() => drop('ideas', q, 'убран')}
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
          </>
        )}
      </Group>

      {/* ─────────── карточки выбора ─────────── */}

      {curTr && (
        <TransportSheet
          item={curTr}
          S={S}
          canEdit={canEdit}
          onPatch={(f) =>
            update((s) => {
              const t = s.transport.find((x) => x.i === curTr.i)
              if (t) {
                f(t)
                touch(t)
              }
            })
          }
          onClose={() => setTrSheet(null)}
        />
      )}

      {curRn && (
        <RentSheet
          item={curRn}
          S={S}
          canEdit={canEdit}
          onPatch={(f) =>
            update((s) => {
              const r = s.rent.find((x) => x.i === curRn.i)
              if (r) {
                f(r)
                touch(r)
              }
            })
          }
          onClose={() => setRnSheet(null)}
        />
      )}
    </div>
  )
}

/**
 * Вопрос · на ком · решён. Первая колонка липкая, как и в расчёте, и тянется
 * не одна: иначе «на ком» и «решён» уезжают в крайний правый угол (см. COLS
 * в `RoadCalc.tsx`).
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
