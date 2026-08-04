import type { ReactNode } from 'react'
import { Settings2, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import type { Notes, Rent, State, Transport } from '@/lib/types'
import { calcAll, fuelCost, litres, money, rentSum, routeKm } from '@/lib/calc'
import {
  AddRow, DataCell, DataRow, DataTable, InlineNum, InlineText, RowAction, RowActions,
} from '@/components/flops'
import { touch, update } from '@/store'
import { plural } from '@/format'
import { cn } from '@/lib/utils'
import {
  DASH, dg, fuelName, kBackWord, kmLabel, litresLabel, litresTotal, refuelLitres,
} from './roadx'
import { SpendShareEdit } from './SpendShare'

/**
 * «Расчёт дороги» — ОДНА таблица на весь лист «Логистика» заказчика.
 *
 * Прежде их было три: «Исходные данные», «Расчёт» и «Канистры», и одно и то же
 * число стояло в двух из них сразу. Заказчик 04.08.2026: «очень сложно, очень
 * много лишнего, повторяющаяся информация… вся информация по бензину АИ-95:
 * сколько потребуется, какая стоимость, сколько проехать — он автоматически
 * считает и справа показывает в одной строке».
 *
 * Поэтому строка одна на статью, и в ней сразу всё: название, описание, сколько
 * ехать, расход, литры, цена — а справа посчитанный итог. Правится всё на месте
 * (Inline.tsx), шторок в таблице нет.
 *
 * Столбцы у каждой группы свои — ровно как на листе заказчика, где «ИСХОДНЫЕ
 * ДАННЫЕ», «РАСЧЁТ ТОПЛИВА» и «СКОЛЬКО НУЖНО КАНИСТР» подписаны каждый по-своему.
 * Поэтому шапка не общая: имена столбцов стоят в строке-заголовке группы.
 *
 * Считает не эта таблица, а lib/calc.ts: здесь только показ и правка исходных
 * чисел. Своей арифметики нет нигде, кроме деления итога на людей, — иначе
 * контрольные цифры (330 км · 21 385 / 26 005 / 47 390 / 11 848 ₽) разошлись бы
 * между экранами.
 */

/**
 * Ширины колонок. Первая липкая и тянется, остальные фиксированы: числа в
 * таблице должны стоять друг под другом. Суммарно шире 390 px — таблица
 * прокручивается вбок ВНУТРИ блока, страница не двигается (постулат 7).
 */
const COLS = 'minmax(11rem,1.6fr) 9rem 8.5rem 6rem 7rem 7.5rem'

/** Одна строка таблицы: липкая ячейка и пять числовых. */
interface Line {
  key: string
  /** заголовок группы: слева название группы, справа — имена её столбцов */
  head?: boolean
  /** итог группы: плотнее и крупнее */
  total?: boolean
  title: ReactNode
  /** «кто платит и на кого делится» — под названием, в той же липкой колонке */
  share?: ReactNode
  cells: [ReactNode, ReactNode, ReactNode, ReactNode, ReactNode]
  actions?: ReactNode
  /** только что добавленная строка */
  fresh?: boolean
  /** якорь для перехода из поиска по листу */
  hit?: string
}

interface Props {
  S: State
  canEdit: boolean
  /** можно ли убрать эту позицию: редактор — любую, автор — свою */
  canDel: (item: { by?: string }) => boolean
  onAddTransport: () => void
  onAddRent: () => void
  onDelTransport: (t: Transport) => void
  onDelRent: (r: Rent) => void
  /** карточка выбора: вид, топливо, чья техника, как считаем расход */
  onSetupTransport: (id: string) => void
  onSetupRent: (id: string) => void
  /** id только что добавленной строки — она открывается сразу в правке названия */
  fresh: string | null
  onFreshEnd: () => void
  /** полоса «посчитать по карте»: она про расстояние, поэтому стоит над таблицей */
  mapStrip: ReactNode
}

export function RoadCalc({
  S, canEdit, canDel, onAddTransport, onAddRent, onDelTransport, onDelRent,
  onSetupTransport, onSetupRent, fresh, onFreshEnd, mapStrip,
}: Props) {
  const c = calcAll(S)
  const km = routeKm(S)
  const dist = S.trip.dist
  const dnt = dist.nt ?? {}
  const baseKm = dist.src === 'auto' ? dist.auto : dist.manual
  const people = S.people.length
  const canVol = S.doc?.canVol > 0 ? S.doc.canVol : 20

  /* ─────────── правки ─────────── */

  const patchTr = (id: string, f: (t: Transport) => void) =>
    update((s) => {
      const t = s.transport.find((x) => x.i === id)
      if (t) {
        f(t)
        touch(t)
      }
    })

  const patchRn = (id: string, f: (r: Rent) => void) =>
    update((s) => {
      const r = s.rent.find((x) => x.i === id)
      if (r) {
        f(r)
        touch(r)
      }
    })

  /** Подпись числа из документа: правим только своё поле, соседние не трогаем. */
  const note = (bag: Notes | undefined, key: string): Notes => {
    const nt = bag ?? {}
    if (!nt[key]) nt[key] = { t: '' }
    return nt
  }

  const setFuel = (id: string, f: (x: { price: number; c: string; nt: Notes }) => void) =>
    update((s) => {
      const fu = s.fuelPrices.find((x) => x.i === id)
      if (fu) {
        f(fu)
        touch(fu)
      }
    })

  /* ─────────── строки ─────────── */

  const lines: Line[] = []

  /* ── Пробег ── */

  lines.push({
    key: 'h-km',
    head: true,
    title: 'Пробег',
    cells: ['Сколько', '', '', '', 'Итого'],
  })

  lines.push({
    key: 'd-manual',
    title: (
      <Title
        title={dnt.manual?.t || 'Расстояние в одну сторону'}
        onTitle={(v) =>
          update((s) => {
            const d = s.trip.dist
            d.nt = note(d.nt, 'manual')
            d.nt.manual.t = v
          })
        }
        text={dnt.manual?.c ?? ''}
        onText={(v) =>
          update((s) => {
            const d = s.trip.dist
            d.nt = note(d.nt, 'manual')
            d.nt.manual.c = v
          })
        }
        can={canEdit}
      />
    ),
    cells: [
      <InlineNum
        key="v"
        value={baseKm}
        digits={dg(baseKm)}
        kind="plain"
        unit={dnt.manual?.u || 'км'}
        label={dnt.manual?.t || 'Расстояние в одну сторону'}
        can={canEdit}
        onSave={(v) => {
          const wasAuto = dist.src === 'auto'
          update((s) => {
            s.trip.dist.manual = v
            s.trip.dist.src = 'manual'
          })
          /* Молчаливых подмен не бывает: расчёт только что шёл по карте. */
          if (wasAuto) toast('В расчёт пошло своё число, а не километры с карты')
        }}
      />,
      '',
      '',
      '',
      '',
    ],
  })

  lines.push({
    key: 'd-kback',
    title: (
      <Title
        title={dnt.kBack?.t || 'Сколько концов пути'}
        onTitle={(v) =>
          update((s) => {
            const d = s.trip.dist
            d.nt = note(d.nt, 'kBack')
            d.nt.kBack.t = v
          })
        }
        text={dnt.kBack?.c ?? ''}
        onText={(v) =>
          update((s) => {
            const d = s.trip.dist
            d.nt = note(d.nt, 'kBack')
            d.nt.kBack.c = v
          })
        }
        can={canEdit}
      />
    ),
    cells: [
      <InlineNum
        key="v"
        value={dist.kBack}
        digits={dg(dist.kBack)}
        min={1}
        max={9}
        unit={dnt.kBack?.u || '×'}
        label={dnt.kBack?.t || 'Сколько концов пути'}
        can={canEdit}
        onSave={(v) =>
          update((s) => {
            s.trip.dist.kBack = v
          })
        }
      />,
      '',
      '',
      '',
      '',
    ],
  })

  lines.push({
    key: 'd-local',
    title: (
      <Title
        title={dnt.local?.t || 'Местные разъезды'}
        onTitle={(v) =>
          update((s) => {
            const d = s.trip.dist
            d.nt = note(d.nt, 'local')
            d.nt.local.t = v
          })
        }
        text={dnt.local?.c ?? ''}
        onText={(v) =>
          update((s) => {
            const d = s.trip.dist
            d.nt = note(d.nt, 'local')
            d.nt.local.c = v
          })
        }
        can={canEdit}
      />
    ),
    cells: [
      <InlineNum
        key="v"
        value={dist.local}
        digits={dg(dist.local)}
        kind="plain"
        unit={dnt.local?.u || 'км'}
        label={dnt.local?.t || 'Местные разъезды'}
        can={canEdit}
        onSave={(v) =>
          update((s) => {
            s.trip.dist.local = v
          })
        }
      />,
      '',
      '',
      '',
      '',
    ],
  })

  lines.push({
    key: 'd-total',
    total: true,
    title: (
      <Static
        title="Пробег на поездку"
        text={`${kmLabel(baseKm)} ${kBackWord(dist.kBack)}, ${kmLabel(dist.local)} на месте`}
      />
    ),
    cells: ['', '', '', '', <Result key="v">{kmLabel(km)}</Result>],
  })

  /* ── Топливо и техника ── */

  lines.push({
    key: 'h-fuel',
    head: true,
    title: 'Топливо и техника',
    cells: ['Километры / часы', 'Расход', 'Литры', 'Цена', 'Итого'],
  })

  const fuels = [...S.fuelPrices].sort((a, b) => a.ord - b.ord)
  const shownFuels = fuels.filter(
    (f) => f.price > 0 || S.transport.some((t) => t.fuel === f.i),
  )
  /* Топливо без цены и без техники не рисуем: строка «Дизель — 0 ₽» ничего
     не сообщает. Из документа оно при этом никуда не девается. */

  for (const f of shownFuels) {
    const mine = [...S.transport].filter((t) => t.fuel === f.i).sort((a, b) => a.ord - b.ord)
    const need = mine.reduce((sum, t) => sum + litres(t, S), 0)

    lines.push({
      key: 'f-' + f.i,
      title: (
        <Title
          title={f.nt?.price?.t || `Цена ${f.n}`}
          onTitle={(v) =>
            setFuel(f.i, (x) => {
              x.nt = note(x.nt, 'price')
              x.nt.price.t = v
            })
          }
          text={f.nt?.price?.c ?? ''}
          onText={(v) =>
            setFuel(f.i, (x) => {
              x.nt = note(x.nt, 'price')
              x.nt.price.c = v
            })
          }
          extra={f.c}
          onExtra={(v) =>
            setFuel(f.i, (x) => {
              x.c = v
            })
          }
          can={canEdit}
          strong
        />
      ),
      cells: [
        '',
        '',
        need > 0 ? <Calc key="l">{litresLabel(need)}</Calc> : '',
        <InlineNum
          key="p"
          value={f.price}
          digits={dg(f.price)}
          kind="plain"
          unit={f.nt?.price?.u || f.u || '₽/л'}
          label={f.nt?.price?.t || `Цена ${f.n}`}
          can={canEdit}
          onSave={(v) =>
            setFuel(f.i, (x) => {
              x.price = v
            })
          }
        />,
        '',
      ],
    })

    for (const t of mine) {
      const vol = litres(t, S)
      /* Комментарий строки: свой, а если его нет — тот, что стоит у числа
         в документе. Правится ровно тот, который показан. */
      const ck = t.c ? '' : t.nt?.rate?.c ? 'rate' : t.nt?.hours?.c ? 'hours' : t.nt?.litres?.c ? 'litres' : ''
      lines.push({
        key: 't-' + t.i,
        hit: t.i,
        fresh: fresh === t.i,
        title: (
          <Title
            title={t.calcT || (t.n ? `Бензин ${fuelName(S, t.fuel)} ${DASH} ${t.n}` : '')}
            onTitle={(v) =>
              patchTr(t.i, (x) => {
                /* Только что заведённая строка ещё безымянна: первое имя
                   становится и названием техники, и подписью в расчёте. */
                if (!x.n.trim()) x.n = v
                x.calcT = v
              })
            }
            required
            autoEdit={fresh === t.i}
            onEditEnd={onFreshEnd}
            second={t.n && t.n !== t.calcT ? t.n : ''}
            onSecond={(v) =>
              patchTr(t.i, (x) => {
                x.n = v
              })
            }
            text={t.c || (ck ? (t.nt[ck].c ?? '') : '')}
            onText={(v) =>
              patchTr(t.i, (x) => {
                if (ck) {
                  x.nt = note(x.nt, ck)
                  x.nt[ck].c = v
                } else {
                  x.c = v
                }
              })
            }
            can={canEdit}
          />
        ),
        /* Кто выложил деньги за это топливо и между кем оно делится —
           прямо в строке, без шторки (постулат 2). Пустое = как было. */
        share: (
          <SpendShareEdit
            S={S}
            can={canEdit}
            payer={t.payer}
            sp={t.sp}
            fallback={t.owner}
            what={t.calcT || t.n || 'Топливо'}
            onPayer={(id) =>
              patchTr(t.i, (x) => {
                x.payer = id
              })
            }
            onSp={(ids) =>
              patchTr(t.i, (x) => {
                x.sp = ids
              })
            }
          />
        ),
        cells: [
          t.rateU === 'lh' ? (
            <InlineNum
              key="a"
              value={t.hours}
              digits={dg(t.hours)}
              unit={t.nt?.hours?.u || 'ч'}
              label={t.nt?.hours?.t || `Моточасы: ${t.n}`}
              can={canEdit}
              onSave={(v) =>
                patchTr(t.i, (x) => {
                  x.hours = v
                })
              }
            />
          ) : t.rateU === 'fix' ? (
            <Calc key="a">{DASH}</Calc>
          ) : (
            <Calc key="a">{kmLabel(km)}</Calc>
          ),
          t.rateU === 'fix' ? (
            <Calc key="r">{DASH}</Calc>
          ) : (
            <InlineNum
              key="r"
              value={t.rate}
              digits={dg(t.rate)}
              kind="plain"
              unit={t.nt?.rate?.u || (t.rateU === 'lh' ? 'л/ч' : 'л/100 км')}
              label={t.nt?.rate?.t || `Расход: ${t.n}`}
              can={canEdit}
              onSave={(v) =>
                patchTr(t.i, (x) => {
                  x.rate = v
                })
              }
            />
          ),
          t.rateU === 'fix' ? (
            <InlineNum
              key="l"
              value={t.litres}
              digits={dg(t.litres)}
              kind="plain"
              unit={t.nt?.litres?.u || 'л'}
              label={t.nt?.litres?.t || `Сколько литров: ${t.n}`}
              can={canEdit}
              onSave={(v) =>
                patchTr(t.i, (x) => {
                  x.litres = v
                })
              }
            />
          ) : (
            <Calc key="l">{litresLabel(vol)}</Calc>
          ),
          /* Цена общая для всего топлива этой группы: правка здесь меняет её
             и в строке цены, и у соседней техники на том же бензине. */
          <InlineNum
            key="p"
            value={f.price}
            digits={dg(f.price)}
            kind="plain"
            unit={f.nt?.price?.u || f.u || '₽/л'}
            label={`${f.nt?.price?.t || `Цена ${f.n}`} — общая для всей техники на этом топливе`}
            can={canEdit}
            onSave={(v) =>
              setFuel(f.i, (x) => {
                x.price = v
              })
            }
          />,
          <Result key="s">{money(fuelCost(t, S), S.doc)}</Result>,
        ],
        actions: (
          <RowActions>
            {canEdit ? (
              <RowAction
                key="s"
                icon={Settings2}
                label={`${t.n}: вид, топливо, чья, как считаем расход`}
                onClick={() => onSetupTransport(t.i)}
              />
            ) : null}
            {canDel(t) ? (
              <RowAction
                key="d"
                icon={Trash2}
                tone="danger"
                label={`Убрать «${t.n}»`}
                onClick={() => onDelTransport(t)}
              />
            ) : null}
          </RowActions>
        ),
      })
    }
  }

  /* ── Аренда и парковка ── */

  lines.push({
    key: 'h-rent',
    head: true,
    title: 'Аренда и парковка',
    cells: ['Сколько', 'Штук', '', 'Цена', 'Итого'],
  })

  const rent = [...S.rent].sort((a, b) => a.ord - b.ord)
  if (rent.length === 0) {
    lines.push({
      key: 'r-none',
      title: <Static title="Ничего не арендуем" text="Ни лодки, ни парковки, ни домика" />,
      cells: ['', '', '', '', ''],
    })
  }

  for (const r of rent) {
    const ck = r.c ? '' : r.nt?.price?.c ? 'price' : r.nt?.qty?.c ? 'qty' : r.nt?.count?.c ? 'count' : ''
    lines.push({
      key: 'r-' + r.i,
      hit: r.i,
      fresh: fresh === r.i,
      title: (
        <Title
          title={r.calcT || r.n}
          onTitle={(v) =>
            patchRn(r.i, (x) => {
              if (!x.n.trim()) x.n = v
              x.calcT = v
            })
          }
          required
          autoEdit={fresh === r.i}
          onEditEnd={onFreshEnd}
          second={r.n && r.n !== r.calcT ? r.n : ''}
          onSecond={(v) =>
            patchRn(r.i, (x) => {
              x.n = v
            })
          }
          text={r.c || (ck ? (r.nt[ck].c ?? '') : '')}
          onText={(v) =>
            patchRn(r.i, (x) => {
              if (ck) {
                x.nt = note(x.nt, ck)
                x.nt[ck].c = v
              } else {
                x.c = v
              }
            })
          }
          warn={r.warn}
          can={canEdit}
        />
      ),
      share: (
        <SpendShareEdit
          S={S}
          can={canEdit}
          payer={r.payer}
          sp={r.sp}
          what={r.calcT || r.n || 'Аренда'}
          onPayer={(id) =>
            patchRn(r.i, (x) => {
              x.payer = id
            })
          }
          onSp={(ids) =>
            patchRn(r.i, (x) => {
              x.sp = ids
            })
          }
        />
      ),
      cells: [
        <InlineNum
          key="q"
          value={r.qty}
          digits={r.unit === 'сут.' ? 0 : dg(r.qty)}
          min={1}
          unit={r.nt?.qty?.u || r.unit || 'шт.'}
          label={r.nt?.qty?.t || `Сколько берём: ${r.n}`}
          can={canEdit}
          onSave={(v) =>
            patchRn(r.i, (x) => {
              x.qty = v
            })
          }
        />,
        <InlineNum
          key="c"
          value={r.count}
          digits={0}
          min={1}
          unit={r.nt?.count?.u || 'шт.'}
          label={r.nt?.count?.t || `Сколько штук: ${r.n}`}
          can={canEdit}
          onSave={(v) =>
            patchRn(r.i, (x) => {
              x.count = v
            })
          }
        />,
        <Calc key="l">{DASH}</Calc>,
        <InlineNum
          key="p"
          value={r.price}
          digits={dg(r.price)}
          kind="plain"
          unit={r.nt?.price?.u || '₽'}
          label={r.nt?.price?.t || `Цена: ${r.n}`}
          can={canEdit}
          onSave={(v) =>
            patchRn(r.i, (x) => {
              x.price = v
            })
          }
        />,
        <Result key="s">{money(rentSum(r), S.doc)}</Result>,
      ],
      actions: (
        <RowActions>
          {canEdit ? (
            <RowAction
              key="s"
              icon={Settings2}
              label={`${r.n}: категория и что входит в стоимость`}
              onClick={() => onSetupRent(r.i)}
            />
          ) : null}
          {canDel(r) ? (
            <RowAction
              key="d"
              icon={Trash2}
              tone="danger"
              label={`Убрать «${r.n}»`}
              onClick={() => onDelRent(r)}
            />
          ) : null}
        </RowActions>
      ),
    })
  }

  /* ── Канистры ── */

  lines.push({
    key: 'h-can',
    head: true,
    title: 'Канистры',
    cells: ['', 'В канистре', 'Литров', '', 'Канистр'],
  })

  /* Строки блока — из документа (canRows), плюс топливо, которое везут с собой,
     а строки для него в документе ещё нет. */
  const canFuels = [
    ...new Set([
      ...[...S.canRows].sort((a, b) => a.ord - b.ord).map((r) => r.fuel),
      ...c.cans.map((x) => x.fuel),
    ]),
  ]

  for (const fuelId of canFuels) {
    const row = S.canRows.find((r) => r.fuel === fuelId)
    const carried = c.cans.find((x) => x.fuel === fuelId)
    const azs = refuelLitres(S, fuelId)
    const saveRow = (f: (r: { t: string; c: string }) => void) =>
      update((s) => {
        let r = s.canRows.find((x) => x.fuel === fuelId)
        if (!r) {
          r = {
            i: 'can_' + fuelId,
            fuel: fuelId,
            t: '',
            c: '',
            ord: (s.canRows.length + 1) * 10,
            ua: Date.now(),
          }
          s.canRows.push(r)
        }
        f(r)
        touch(r)
      })

    lines.push({
      key: 'c-' + fuelId,
      title: (
        <Title
          title={row?.t || `${fuelName(S, fuelId)} ${DASH} везём с собой`}
          onTitle={(v) =>
            saveRow((r) => {
              r.t = v
            })
          }
          text={row?.c ?? ''}
          onText={(v) =>
            saveRow((r) => {
              r.c = v
            })
          }
          can={canEdit}
        />
      ),
      cells: [
        '',
        carried ? (
          <InlineNum
            key="v"
            value={canVol}
            digits={0}
            kind="plain"
            unit="л"
            min={1}
            label="Сколько литров в одной канистре"
            can={canEdit}
            onSave={(v) =>
              update((s) => {
                s.doc.canVol = v
              })
            }
          />
        ) : (
          ''
        ),
        <Calc key="l">{carried ? litresLabel(carried.litres) : azs > 0 ? litresLabel(azs) : DASH}</Calc>,
        '',
        carried ? (
          <Result key="n">
            {`${carried.cans} ${plural(carried.cans, 'канистра', 'канистры', 'канистр')}`}
          </Result>
        ) : (
          <Calc key="n">{DASH}</Calc>
        ),
      ],
    })
  }

  /* ── Итоги ── */

  lines.push({
    key: 'h-sum',
    head: true,
    title: 'Итоги поездки',
    cells: ['', '', '', '', 'Итого'],
  })

  const perHead = people > 0 ? c.transport / people : 0
  const heads = plural(people, 'человека', 'человек', 'человек')

  const totals: { slot: 0 | 1 | 2 | 3; label: string; text: string; sum: number }[] = [
    {
      slot: 0,
      label: 'Дорога и аренда',
      text: `Бензин ${money(c.fuel, S.doc)}, аренда ${money(c.rent, S.doc)}, с каждого ${money(perHead, S.doc)}`,
      sum: c.transport,
    },
    {
      slot: 1,
      label: 'Продукты',
      text: 'То, что помечено «купить» в разделе «Закупка»',
      sum: c.buy,
    },
    { slot: 2, label: 'Общий бюджет', text: 'Дорога и продукты вместе', sum: c.total },
    {
      slot: 3,
      label: 'С каждого',
      text: people > 0 ? `Делим на ${people} ${heads}` : 'В команде пока никого',
      sum: c.perPerson,
    },
  ]

  for (const t of totals) {
    lines.push({
      key: 'sum-' + t.slot,
      total: true,
      title: (
        <Title
          title={S.tileLabels?.[t.slot]?.trim() || t.label}
          onTitle={(v) =>
            update((s) => {
              /* Форму хранения не меняем: слияние отдаёт tileLabels целиком,
                 и подмена массива словарём стёрла бы подписи первой версии. */
              const bag = [...(s.tileLabels ?? [])]
              while (bag.length < 4) bag.push('')
              bag[t.slot] = v === t.label ? '' : v
              s.tileLabels = bag
            })
          }
          text={t.text}
          can={canEdit}
          strong
        />
      ),
      cells: ['', '', '', '', <Result key="s">{money(t.sum, S.doc)}</Result>],
    })
  }

  if (c.personal > 0) {
    lines.push({
      key: 'sum-personal',
      title: <Static title="Личное" text="Свои покупки, в общий делёж не входят" />,
      cells: ['', '', '', '', <Calc key="s">{money(c.personal, S.doc)}</Calc>],
    })
  }

  /* ─────────── показ ─────────── */

  let z = 0
  const rows = lines.map((l) => {
    const zebra = !l.head && !l.total && z++ % 2 === 1
    const bg = l.head || l.total ? 'zebra' : zebra ? 'zebra' : 'surface'
    return (
      <DataRow key={l.key} zebra={l.head || l.total || zebra} fresh={l.fresh} dataHit={l.hit}>
        <DataCell sticky bg={bg} align="left" head={l.head}>
          <span className="flex w-full items-start gap-1">
            <span className="min-w-0 flex-1">
              {l.head ? (
                <span className="text-micro font-bold tracking-wider text-muted uppercase">
                  {l.title}
                </span>
              ) : (
                l.title
              )}
              {l.share}
            </span>
            {l.actions}
          </span>
        </DataCell>
        {l.cells.map((cell, i) => (
          <DataCell key={i} align="right" head={l.head}>
            {l.head ? <span className="text-micro text-muted">{cell}</span> : cell}
          </DataCell>
        ))}
      </DataRow>
    )
  })

  return (
    <section className="overflow-hidden rounded-xl border border-line bg-surface shadow-sm">
      <div className="border-b border-line px-4 py-3">
        <h3 className="text-head font-[650] text-ink">Расчёт дороги</h3>
        <p className="tnum mt-0.5 text-note text-muted">
          {`Пробег ${kmLabel(km)} · ${litresLabel(litresTotal(S))} топлива · ${money(c.transport, S.doc)}`}
        </p>
      </div>

      {mapStrip}

      <DataTable cols={COLS} label="Расчёт дороги: пробег, топливо, аренда, канистры и итоги">
        {/* Полоса строк шириной со свои колонки, а не с экран: иначе зебра
            и липкая граница обрываются там, где кончается видимая часть,
            и таблица при прокрутке вбок выглядит порванной. */}
        <div role="rowgroup" className="w-max min-w-full">
          {rows}
        </div>
      </DataTable>

      {canEdit && (
        <div className="border-t border-line">
          <AddRow label="Добавить технику" onClick={onAddTransport} />
          <AddRow label="Добавить аренду" onClick={onAddRent} />
        </div>
      )}
    </section>
  )
}

/* ──────────────────────────────────────────────────────────────────────────
   Ячейки
   ────────────────────────────────────────────────────────────────────────── */

/**
 * Липкая ячейка статьи: название, второе имя (как техника зовётся сама),
 * описание и предупреждение. Всё правится на месте — у того, у кого есть право.
 */
function Title({
  title, onTitle, second, onSecond, text, onText, extra, onExtra, warn, can,
  required, autoEdit, onEditEnd, strong,
}: {
  title: string
  onTitle: (v: string) => void
  second?: string
  onSecond?: (v: string) => void
  text?: string
  onText?: (v: string) => void
  /** второй комментарий — он есть только у топлива и только если заполнен */
  extra?: string
  onExtra?: (v: string) => void
  warn?: string
  can: boolean
  required?: boolean
  autoEdit?: boolean
  onEditEnd?: () => void
  strong?: boolean
}) {
  return (
    <span className="block">
      <InlineText
        value={title}
        onSave={onTitle}
        can={can}
        label={title || 'Название строки'}
        required={required}
        placeholder="Название"
        autoEdit={autoEdit}
        onEditEnd={onEditEnd}
        className={cn('text-body leading-snug text-ink', strong ? 'font-[650]' : 'font-medium')}
      />
      {second && onSecond ? (
        <InlineText
          value={second}
          onSave={onSecond}
          can={can}
          label="Как эта позиция называется сама"
          className="text-micro text-muted"
        />
      ) : null}
      {/* Пустая строка описания у того, кто править не может, — пустое место
          на экране. Ему её просто нет. */}
      {onText && (can || text) ? (
        <InlineText
          value={text ?? ''}
          onSave={onText}
          can={can}
          multiline
          label="Описание строки"
          placeholder="Описание"
          className="text-note leading-snug text-muted"
        />
      ) : text ? (
        <span className="block text-note leading-snug text-muted">{text}</span>
      ) : null}
      {extra && onExtra ? (
        <InlineText
          value={extra}
          onSave={onExtra}
          can={can}
          multiline
          label="Ещё комментарий"
          className="text-note leading-snug text-muted"
        />
      ) : null}
      {warn ? (
        <span className="mt-0.5 block text-note leading-snug font-semibold text-accent-text">
          {warn}
        </span>
      ) : null}
    </span>
  )
}

/** Строка, которую нельзя переименовать: это не данные, а подпись самого расчёта. */
function Static({ title, text }: { title: string; text?: string }) {
  return (
    <span className="block">
      <span className="block text-body leading-snug font-[650] text-ink">{title}</span>
      {text ? <span className="block text-note leading-snug text-muted">{text}</span> : null}
    </span>
  )
}

/** Посчитанное число: правке не подлежит, поэтому и намёка на неё нет. */
function Calc({ children }: { children: ReactNode }) {
  return <span className="tnum text-note text-muted">{children}</span>
}

/** Итог строки — самое крупное число в ней. */
function Result({ children }: { children: ReactNode }) {
  return <span className="tnum text-body font-bold text-ink">{children}</span>
}
