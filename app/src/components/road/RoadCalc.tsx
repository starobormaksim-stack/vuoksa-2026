import { Fragment, useState, type ReactNode } from 'react'
import { ChevronDown, Settings2, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import type { Rent, State, Transport } from '@/lib/types'
import { cn } from '@/lib/utils'
import { calcAll, fuelCost, kmOf, litres, money, rentSum, routeKm } from '@/lib/calc'
import {
  AddRow, DataCell, DataRow, DataTable, InlineNum, RowAction, RowActions, useIsDesktop,
} from '@/components/flops'
import { touch, update } from '@/store'
import { plural } from '@/format'
import {
  DASH, dg, fuelName, kBackWord, kmLabel, litresLabel, litresTotal, refuelLitres,
} from './roadx'
import { noteBag, patchFuel, patchRent, patchTransport } from './roadedit'
import { Calc, Result, Static, Title } from './cells'
import { DocNotes } from './DocNotes'
import { RentSetup, RentUnitField, SetupGroup, TransportKm, TransportSetup } from './RoadSetup'
import { RoadStrip } from './RoadStrip'
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
 * (Inline.tsx), шторок в расчёте нет вовсе.
 *
 * ─── Две плотности одной логики ───
 * На широком экране остаётся матрица: столбцы у каждой группы свои — ровно как
 * на листе заказчика, где «ИСХОДНЫЕ ДАННЫЕ», «РАСЧЁТ ТОПЛИВА» и «СКОЛЬКО НУЖНО
 * КАНИСТР» подписаны каждый по-своему. Поэтому шапка не общая: имена столбцов
 * стоят в строке-заголовке группы.
 *
 * На телефоне — вертикальная лента (`RoadStrip.tsx`): сумма минимумов колонок
 * матрицы 49 rem, то есть 784 px при экране 390, и половина чисел физически
 * лежала за правым краем. Заказчик 06.08.2026: «про бензин я вижу, что у тебя
 * все настройки при скроллинге вправо возникают».
 *
 * ─── Настройка позиции ───
 * Шторки `TransportSheet` и `RentSheet` упразднены 06.08.2026 на обеих ширинах.
 * Их содержимое живёт в `RoadSetup.tsx` и показывается одинаково: в раскрытой
 * полоске ленты и в панели ПОД строкой таблицы (кнопка ⚙). Никаких оверлеев:
 * «мне не нужны поп-апы, особенно в мобильной версии и на десктопе».
 *
 * Считает не эта таблица, а lib/calc.ts: здесь только показ и правка исходных
 * чисел. Своей арифметики нет нигде, кроме деления итога на людей, — иначе
 * контрольные цифры (330 км · 21 385 / 26 005 / 47 390 / 11 848 ₽) разошлись бы
 * между экранами.
 */

/**
 * Ширины колонок. Тянутся ВСЕ, каждая от своего минимума: числа в таблице стоят
 * друг под другом, а лишняя ширина расходится по всем колонкам, а не достаётся
 * одной первой. Суммарный минимум шире 390 px — но на 390 матрицы больше нет,
 * там лента.
 *
 * ⛔ Прежде тянулась только первая (`minmax(11rem,1.6fr) 9rem …`), и на 1280
 * она забирала 607 px из 1215: название стояло у левого края, а все числа
 * жались к правому. Заказчик 05.08.2026: «расчёт у тебя тоже растянутый…
 * в логистике с правой стороны просто присобачено в крайне правый угол,
 * притом у тебя пространства хватает».
 */
const COLS =
  'minmax(11rem,1.6fr) minmax(9rem,1fr) minmax(8.5rem,1fr) ' +
  'minmax(6rem,0.7fr) minmax(7rem,0.8fr) minmax(7.5rem,0.9fr)'

/** Сумма минимумов COLS: 11 + 9 + 8,5 + 6 + 7 + 7,5. Зачем — см. `minW` в DataTable. */
const COLS_MIN = '49rem'

/** Одна строка таблицы: липкая ячейка и пять числовых. */
interface Line {
  key: string
  /** заголовок группы: слева название группы, справа — имена её столбцов */
  head?: boolean
  /**
   * Ключ заголовка, под которым идёт строка. Проставляется одним проходом
   * перед отрисовкой (см. `GROUP_SHUT`), руками его не задают.
   */
  grp?: string
  /** что показать справа в свёрнутом заголовке: итог группы одним числом */
  sum?: ReactNode
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
  /**
   * Панель настройки ПОД строкой: вид техники, топливо, хозяин, категория аренды
   * и подписи чисел из документа. Раскрывается кнопкой ⚙ в самой строке и толкает
   * таблицу вниз — не всплывает поверх (постулат 2).
   */
  panel?: ReactNode
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
  /** id только что добавленной строки — она открывается сразу в правке названия */
  fresh: string | null
  onFreshEnd: () => void
  /** полоса «посчитать по карте»: она про расстояние, поэтому стоит над таблицей */
  mapStrip: ReactNode
}

export function RoadCalc({
  S, canEdit, canDel, onAddTransport, onAddRent, onDelTransport, onDelRent,
  fresh, onFreshEnd, mapStrip,
}: Props) {
  const desktop = useIsDesktop()
  /** у какой позиции раскрыта панель настройки (только в матрице) */
  const [setupAt, setSetupAt] = useState('')

  const c = calcAll(S)
  const km = routeKm(S)

  return (
    /* `overflow-clip`, а не `hidden`: `hidden` делает блок прокручиваемым,
       и липкая шапка таблицы внутри перестаёт прилипать (см. `DataTable`). */
    <section className="overflow-clip rounded-xl border border-line bg-surface shadow-sm">
      <div className="border-b border-line px-4 py-3">
        <h3 className="text-head font-[650] text-ink">Расчёт дороги</h3>
        <p className="tnum mt-0.5 text-note text-muted">
          {`Пробег ${kmLabel(km)} · ${litresLabel(litresTotal(S))} топлива · ${money(c.transport, S.doc)}`}
        </p>
      </div>

      {mapStrip}

      {/* ⛔ Рисуется ровно ОДИН вид, а не два спрятанных: строк расчёта немного,
          но у каждой раскрытой полоски внутри полтора десятка органов правки. */}
      {desktop ? (
        <>
          <Matrix
            S={S}
            c={c}
            km={km}
            canEdit={canEdit}
            canDel={canDel}
            onDelTransport={onDelTransport}
            onDelRent={onDelRent}
            fresh={fresh}
            onFreshEnd={onFreshEnd}
            setupAt={setupAt}
            onSetup={(id) => setSetupAt(setupAt === id ? '' : id)}
          />
          {canEdit && (
            <div className="border-t border-line">
              <AddRow label="Добавить технику" onClick={onAddTransport} />
              <AddRow label="Добавить аренду" onClick={onAddRent} />
            </div>
          )}
        </>
      ) : (
        <RoadStrip
          S={S}
          canEdit={canEdit}
          canDel={canDel}
          onAddTransport={onAddTransport}
          onAddRent={onAddRent}
          onDelTransport={onDelTransport}
          onDelRent={onDelRent}
          fresh={fresh}
          onFreshEnd={onFreshEnd}
        />
      )}
    </section>
  )
}

/* ──────────────────────────────────────────────────────────────────────────
   Матрица — вид расчёта на широком экране
   ────────────────────────────────────────────────────────────────────────── */

/** Какие группы расчёта свёрнуты, пока человек не сказал иначе. */
const GROUP_SHUT = ['h-km', 'h-can']

function Matrix({
  S, c, km, canEdit, canDel, onDelTransport, onDelRent, fresh, onFreshEnd, setupAt, onSetup,
}: {
  S: State
  c: ReturnType<typeof calcAll>
  km: number
  canEdit: boolean
  canDel: (item: { by?: string }) => boolean
  onDelTransport: (t: Transport) => void
  onDelRent: (r: Rent) => void
  fresh: string | null
  onFreshEnd: () => void
  setupAt: string
  onSetup: (id: string) => void
}) {
  const dist = S.trip.dist
  const dnt = dist.nt ?? {}
  const baseKm = dist.src === 'auto' ? dist.auto : dist.manual
  const people = S.people.length
  const canVol = S.doc?.canVol > 0 ? S.doc.canVol : 20

  /**
   * Свёрнутые группы расчёта.
   *
   * ⛔ Заказчик 08.08.2026 про «Дорогу»: «парковка автомобиля тоже
   * не сворачивается, аренда лодки „Ладога“ тоже не сворачивается… всё должно
   * сворачиваться в простоту». На телефоне расчёт давно лента полосок
   * (`RoadStrip`), где каждая строка складывается; на широком экране он был
   * плоской простынёй в четыре десятка строк без единого способа её укоротить.
   *
   * По умолчанию свёрнуто ровно то, что смотрят раз в поездку: числа пробега
   * и канистры. «Топливо и техника», «Аренда и парковка» и «Итоги» открыты —
   * туда ведут переход из поиска и плитки сумм с обложки, а свёрнутая группа
   * не отрисована вовсе, и прыжок пришёл бы в пустоту.
   */
  const [shut, setShut] = useState<Record<string, boolean>>({})
  const isShut = (key: string) => (key in shut ? shut[key] : GROUP_SHUT.includes(key))

  /** Подпись числа пробега из документа: правим только своё поле. */
  const noteDist = (key: string, part: 't' | 'c', v: string) =>
    update((s) => {
      const d = s.trip.dist
      d.nt = noteBag(d.nt, key)
      d.nt[key][part] = v
    })

  /* ─────────── строки ─────────── */

  const lines: Line[] = []

  /* ── Пробег ── */

  /* У каждого заголовка — итог его группы (`sum`): свёрнутая группа обязана
     говорить главное число, иначе сворачивание прячет смысл (постулат 5). */
  lines.push({
    key: 'h-km',
    head: true,
    title: 'Пробег',
    sum: kmLabel(km),
    cells: ['Сколько', '', '', '', 'Итого'],
  })

  lines.push({
    key: 'd-manual',
    title: (
      <Title
        title={dnt.manual?.t || 'Расстояние в одну сторону'}
        onTitle={(v) => noteDist('manual', 't', v)}
        text={dnt.manual?.c ?? ''}
        onText={(v) => noteDist('manual', 'c', v)}
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
        onTitle={(v) => noteDist('kBack', 't', v)}
        text={dnt.kBack?.c ?? ''}
        onText={(v) => noteDist('kBack', 'c', v)}
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
        onTitle={(v) => noteDist('local', 't', v)}
        text={dnt.local?.c ?? ''}
        onText={(v) => noteDist('local', 'c', v)}
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
        title="Технике без своей цифры"
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
    sum: money(c.fuel, S.doc),
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
            patchFuel(f.i, (x) => {
              x.nt = noteBag(x.nt, 'price')
              x.nt.price.t = v
            })
          }
          text={f.nt?.price?.c ?? ''}
          onText={(v) =>
            patchFuel(f.i, (x) => {
              x.nt = noteBag(x.nt, 'price')
              x.nt.price.c = v
            })
          }
          extra={f.c}
          onExtra={(v) =>
            patchFuel(f.i, (x) => {
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
            patchFuel(f.i, (x) => {
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
              patchTransport(t.i, (x) => {
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
              patchTransport(t.i, (x) => {
                x.n = v
              })
            }
            text={t.c || (ck ? (t.nt[ck].c ?? '') : '')}
            onText={(v) =>
              patchTransport(t.i, (x) => {
                if (ck) {
                  x.nt = noteBag(x.nt, ck)
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
              patchTransport(t.i, (x) => {
                x.payer = id
              })
            }
            onSp={(ids) =>
              patchTransport(t.i, (x) => {
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
                patchTransport(t.i, (x) => {
                  x.hours = v
                })
              }
            />
          ) : t.rateU === 'fix' ? (
            <Calc key="a">{DASH}</Calc>
          ) : (
            /* Свой пробег этой единицы техники, calc.kmOf */
            <Calc key="a">{kmLabel(kmOf(t, S))}</Calc>
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
                patchTransport(t.i, (x) => {
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
                patchTransport(t.i, (x) => {
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
              patchFuel(f.i, (x) => {
                x.price = v
              })
            }
          />,
          <Result key="s">{money(fuelCost(t, S), S.doc)}</Result>,
        ],
        actions: (
          <RowActions>
            {/* Настройку открывает и участник: за ней поля документа, которые
                он вправе читать (постулат 4). Править их он всё равно не может —
                органы внутри стоят с `can={canEdit}` и рисуются текстом.
                Действия строки (убрать) остаются по правам. */}
            <RowAction
              key="s"
              icon={Settings2}
              label={`${t.n || 'без названия'}: вид, топливо, чья, как считаем расход`}
              onClick={() => onSetup(t.i)}
            />
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
        panel:
          setupAt === t.i ? (
            <>
              {t.rateU === 'fix' ? null : <TransportKm item={t} S={S} canEdit={canEdit} />}
              <TransportSetup item={t} S={S} canEdit={canEdit} />
              <DocNotes
                nt={t.nt}
                can={canEdit}
                onSave={(key, part, v) =>
                  patchTransport(t.i, (x) => {
                    x.nt = noteBag(x.nt, key)
                    x.nt[key][part] = v
                  })
                }
              />
            </>
          ) : null,
      })
    }
  }

  /* ── Аренда и парковка ── */

  lines.push({
    key: 'h-rent',
    head: true,
    title: 'Аренда и парковка',
    sum: money(c.rent, S.doc),
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
            patchRent(r.i, (x) => {
              if (!x.n.trim()) x.n = v
              x.calcT = v
            })
          }
          required
          autoEdit={fresh === r.i}
          onEditEnd={onFreshEnd}
          second={r.n && r.n !== r.calcT ? r.n : ''}
          onSecond={(v) =>
            patchRent(r.i, (x) => {
              x.n = v
            })
          }
          text={r.c || (ck ? (r.nt[ck].c ?? '') : '')}
          onText={(v) =>
            patchRent(r.i, (x) => {
              if (ck) {
                x.nt = noteBag(x.nt, ck)
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
            patchRent(r.i, (x) => {
              x.payer = id
            })
          }
          onSp={(ids) =>
            patchRent(r.i, (x) => {
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
            patchRent(r.i, (x) => {
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
            patchRent(r.i, (x) => {
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
            patchRent(r.i, (x) => {
              x.price = v
            })
          }
        />,
        <Result key="s">{money(rentSum(r), S.doc)}</Result>,
      ],
      actions: (
        <RowActions>
          {/* Та же причина, что у техники выше: смотреть поля позиции может
              каждый, править — по правам. */}
          <RowAction
            key="s"
            icon={Settings2}
            label={`${r.n || 'без названия'}: категория и что входит в стоимость`}
            onClick={() => onSetup(r.i)}
          />
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
      panel:
        setupAt === r.i ? (
          <>
            {/* Числа аренды (сколько, штук, цена) стоят столбцами самой таблицы,
                поэтому в панели от группы «Сколько и почём» остаётся единица. */}
            <SetupGroup title="Сколько и почём">
              <RentUnitField item={r} canEdit={canEdit} />
            </SetupGroup>
            <RentSetup item={r} S={S} canEdit={canEdit} />
            <DocNotes
              nt={r.nt}
              can={canEdit}
              onSave={(key, part, v) =>
                patchRent(r.i, (x) => {
                  x.nt = noteBag(x.nt, key)
                  x.nt[key][part] = v
                })
              }
            />
          </>
        ) : null,
    })
  }

  /* ── Канистры ── */

  lines.push({
    key: 'h-can',
    head: true,
    title: 'Канистры',
    sum: `${c.cans.reduce((n, x) => n + x.cans, 0)} шт.`,
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
    sum: money(c.total, S.doc),
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
      /* Сюда приходит тап по плитке с обложки: там та же сумма без объяснения,
         здесь — с разбором, откуда она взялась (`trip/MoneyTiles.tsx`). */
      hit: 'sum-' + t.slot,
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

  /* Каждая строка знает свой заголовок: группа — это всё, что идёт до
     следующего `head`. Один проход вместо ручной пометки в двух десятках мест. */
  let grp = ''
  for (const l of lines) {
    if (l.head) grp = l.key
    else l.grp = grp
  }

  /* Только что заведённая строка раскрывает свою группу сама: её заводили,
     чтобы в неё вписать, и появиться в свёрнутом блоке — молчаливый отказ. */
  const freshGrp = fresh ? lines.find((l) => l.hit === fresh)?.grp : undefined
  const hidden = (l: Line) => !!l.grp && l.grp !== freshGrp && isShut(l.grp)

  let z = 0
  const rows = lines.filter((l) => !hidden(l)).map((l) => {
    const zebra = !l.head && !l.total && z++ % 2 === 1
    const bg = l.head || l.total ? 'zebra' : zebra ? 'zebra' : 'surface'
    return (
      <Fragment key={l.key}>
        <DataRow zebra={l.head || l.total || zebra} fresh={l.fresh} dataHit={l.hit}>
          <DataCell sticky bg={bg} align="left" head={l.head}>
            {/* ⚠️ Строка переносится, а текст держит наименьшую ширину: липкая
                колонка на 390 всего 176 px, и две кнопки действий (90 px) съедали
                у «Платит» всё, кроме 45 px — «Скинулись поровну» превращалось
                в «Ски…» (У-81). Пусть кнопки уедут под текст, но кто платит
                будет написан целиком. На 1280 колонка 328 px, места хватает
                обоим — там перенос не случается. */}
            <span className="flex w-full flex-wrap items-start gap-1">
              <span className="min-w-0 flex-1 basis-40">
                {l.head ? (
                  /* Заголовок группы — кнопка: он и называет блок, и складывает
                     его. Своего ряда орган не занимает (постулат 7), приём тот же,
                     что у шеврона ветки в `map/RouteBranches`. */
                  <button
                    type="button"
                    onClick={() => setShut((o) => ({ ...o, [l.key]: !isShut(l.key) }))}
                    aria-expanded={!isShut(l.key)}
                    className="-my-1 flex min-h-11 w-full items-center gap-2 rounded-md text-left transition-colors hover:bg-line/40"
                  >
                    <ChevronDown
                      size={16}
                      strokeWidth={1.75}
                      aria-hidden
                      className={cn(
                        'shrink-0 text-muted transition-transform',
                        isShut(l.key) && '-rotate-90',
                      )}
                    />
                    <span className="text-micro font-bold tracking-wider text-muted uppercase">
                      {l.title}
                    </span>
                  </button>
                ) : (
                  l.title
                )}
                {l.share}
              </span>
              {l.actions}
            </span>
          </DataCell>
          {l.cells.map((cell, i) => {
            /* Свёрнутая группа показывает не имена своих столбцов, а свой итог:
               имена без строк ничего не значат, а число — значит. */
            const shutHead = l.head && isShut(l.key)
            const last = i === l.cells.length - 1
            return (
              <DataCell key={i} align="right" head={l.head}>
                {l.head ? (
                  <span
                    className={cn(
                      'text-micro text-muted',
                      shutHead && last && 'tnum font-semibold text-ink',
                    )}
                  >
                    {shutHead ? (last ? l.sum : '') : cell}
                  </span>
                ) : (
                  cell
                )}
              </DataCell>
            )
          })}
        </DataRow>

        {/* Панель настройки — строка-вставка во всю ширину сетки. Оверлея нет:
            таблица просто едет вниз, как раскрытая полоска в ленте. */}
        {l.panel ? (
          <DataRow zebra>
            <DataCell align="left" className="col-span-full px-4 py-3">
              {/* ⚠️ `w-full` обязателен: у ячейки `align="left"` стоит
                  `items-start`, и без явной ширины полки настройки сжались бы
                  по содержимому вместо того, чтобы занять строку. */}
              {/* Потолок ширины — чтобы список выбора не растягивался на весь
                  экран: строка в 1200 px читается хуже, чем в 768 (мера, а не
                  вкус: та же плотность, что у полок в ленте). */}
              <div className="w-full max-w-3xl">{l.panel}</div>
            </DataCell>
          </DataRow>
        ) : null}
      </Fragment>
    )
  })

  return (
    <DataTable
      cols={COLS}
      minW={COLS_MIN}
      label="Расчёт дороги: пробег, топливо, аренда, канистры и итоги"
    >
      {/* Полоса строк шириной со свои колонки, а не с экран: иначе зебра
          и липкая граница обрываются там, где кончается видимая часть,
          и таблица при прокрутке вбок выглядит порванной. ⛔ Ширина берётся
          от сетки (`w-full`), а не от содержимого (`w-max`): с долевыми
          колонками содержимое раздувало полосу за край блока. */}
      <div role="rowgroup" className="w-full">
        {rows}
      </div>
    </DataTable>
  )
}
