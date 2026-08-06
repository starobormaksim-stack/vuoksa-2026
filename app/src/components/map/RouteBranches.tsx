import { useState } from 'react'
import { Car, Check, Footprints, Plus, Repeat2, Sailboat, X, type LucideIcon } from 'lucide-react'
import type { LegMode, State, Transport } from '@/lib/types'
import { update, touch } from '@/store'
import { kmOf, kBackOf } from '@/lib/calc'
import { kmLabel } from '@/components/road/roadx'
import { MDASH, NBSP } from '@/format'
import { cn } from '@/lib/utils'
import { InlineNum, InlineText } from '@/components/flops'
import { MAP_TONES, TONE_NAMES, toneOf, type MapTone } from './marks'

/**
 * Ветки маршрута — полоса над картой.
 *
 * ─── Откуда взялось ───
 * Заказчик 06.08.2026, вечер: «У нас условно есть карта, и в ней я сразу же
 * могу добавить вид. То есть там плюсики должны быть… Когда ты нажимаешь
 * на плюсики — возможность добавить транспорт и виды транспорта: автотранспорт,
 * морской транспорт, лодка, пешком. Каждому типу своя ветка маршрута
 * выстраивается своим цветом… У него есть начальная точка, все промежуточные
 * точки и финальная точка. Можно тут же сразу же отметить, в случае если
 * маршрут тем же самым возвращается, либо не отмечать… Здесь можно отметить
 * точки и условно даже добавить плюсики — например, ещё 30 км… У каждого
 * маршрута свой километраж, своя линия… Кто-то едет — то берётся из списка.»
 *
 * До этой полосы техника назначалась точке ПОСЛЕ, в её карточке, и «сначала
 * выбираю вид транспорта, потом расставляю точки» было невозможно вовсе.
 *
 * ─── Что здесь есть и чего здесь нет ───
 * Здесь: выбор активной ветки, заведение новой, её множитель «туда и обратно»,
 * её лишние километры, её экипаж, её цвет. Всё это — свойства НИТКИ НА КАРТЕ,
 * и другого места у них нет.
 *
 * ⛔ Здесь НЕ повторяется список техники из «Дороги» (постулат 3.5): расход,
 * топливо, цена и подпись строки расчёта правятся только там. Сюда попало
 * ровно то, что человек делает, глядя на карту.
 */

/** Значок ветки — тот же, что карта рисует в углу метки. */
const LEG_ICONS: Record<LegMode, LucideIcon> = {
  road: Car,
  water: Sailboat,
  walk: Footprints,
}

/** Что предлагает «плюс»: вид техники и чем по нему идут. */
interface AddOption {
  /** id вида из S.kinds; пусто — вида в справочнике нет (пешком) */
  kind: string
  t: string
  leg: LegMode
}

/**
 * Чем идут по этому виду техники. Справочник видов (`S.kinds`) хранит значок,
 * а не способ передвижения, — значок и есть единственный признак, который
 * в нём для этого годится. Парусник — по воде, всё остальное — по дороге.
 */
function legOfIcon(icon: string): LegMode {
  return icon === 'sailboat' ? 'water' : 'road'
}

/**
 * Что показать в «плюсе». Виды берутся из справочника заказчика (`S.kinds`)
 * и не выдумываются здесь: он завёл «Автомобиль», «Катер», «Лодочный мотор»,
 * «Фургон» и остальное сам. Инструмент (бензопила) отсеян — маршрута у него
 * нет, и заказчик сказал прямо: «Бензопила — какой смысл её указывать,
 * к точкам транспорта она отношения не имеет».
 *
 * «Пешком» дописано отдельной строкой: в справочнике видов его нет, потому что
 * бензина он не ест, а веткой на карте быть обязан (`LegMode` знает 'walk').
 */
function addOptions(S: State): AddOption[] {
  const out: AddOption[] = S.kinds
    .filter((k) => k.rateU !== 'fix')
    .map((k) => ({ kind: k.i, t: k.t, leg: legOfIcon(k.icon) }))
  out.push({ kind: '', t: 'Пешком', leg: 'walk' })
  return out
}

/**
 * Что написать под названием ветки.
 *
 * ⚠️ Просто `kmOf(t, S)` сюда не годится, и это не мелочь. Пока у ветки нет
 * своего источника пробега, `kmOf` честно отдаёт ОБЩИЙ пробег поездки — и тогда
 * у лодочного мотора под названием стояло бы «1 108 км», то есть километры
 * машины. Ровно такие числа заказчик и назвал бардаком. Пишем только то,
 * что относится к этой ветке, а когда сказать нечего — говорим это словами
 * (постулат 5), а не подсовываем чужую цифру.
 */
function branchNote(t: Transport, S: State, own: number): string {
  if (own === 0) return 'точек нет'
  if (t.kmSrc === 'auto' || t.kmSrc === 'manual') return kmLabel(kmOf(t, S))
  if ((t.kmAuto ?? 0) > 0) return `${kmLabel(t.kmAuto as number)} по карте`
  return 'пробег не посчитан'
}

/** Ветками на карте становится техника, у которой есть способ передвижения. */
function branchesOf(S: State): Transport[] {
  return S.transport.filter((t) => t.leg === 'road' || t.leg === 'water' || t.leg === 'walk')
}

interface Props {
  S: State
  canEdit: boolean
  /** id техники активной ветки; пусто — общая нитка */
  active: string
  onActive: (tr: string) => void
}

export function RouteBranches({ S, canEdit, active, onActive }: Props) {
  /** открыт ли выбор вида техники под «плюсом» */
  const [adding, setAdding] = useState(false)

  const list = branchesOf(S)
  const order = S.transport.map((t) => t.i)
  const common = S.route.filter((p) => !p.tr || !order.includes(p.tr))

  const patch = (id: string, f: (t: Transport) => void) =>
    update((s) => {
      const t = s.transport.find((x) => x.i === id)
      if (t) {
        f(t)
        touch(t)
      }
    })

  /** Завести ветку выбранного вида и сразу сделать её активной. */
  const add = (o: AddOption) => {
    const id = 'tr' + Date.now().toString(36)
    update((s) => {
      const kind = s.kinds.find((k) => k.i === o.kind)
      s.transport.push({
        i: id,
        n: o.t,
        kind: o.kind,
        kindT: '',
        fuel: s.fuelPrices[0]?.i ?? '',
        rate: 0,
        rateU: kind?.rateU ?? (o.leg === 'walk' ? 'fix' : 'l100km'),
        hours: 0,
        litres: 0,
        carry: false,
        owner: s.me || '',
        leg: o.leg,
        calcT: '',
        c: '',
        nt: {},
        ord: (s.transport.length + 1) * 10,
        by: s.me || '',
        as: '',
        ua: Date.now(),
      })
    })
    setAdding(false)
    onActive(id)
  }

  const activeT = list.find((t) => t.i === active) ?? null
  const activeIdx = activeT ? order.indexOf(activeT.i) : -1

  return (
    /* Полоса стоит ПОД картой (см. TripMap.tsx) — отсюда `border-t`. */
    <div className="shrink-0 border-t border-line px-3 py-2">
      {/* ── Ряд веток ──
          Прокрутка вбок живёт ВНУТРИ полосы: у страницы горизонтального
          скролла нет (постулат 8), а веток может быть сколько угодно. */}
      <div className="-mx-1 flex items-center gap-2 overflow-x-auto px-1 pb-0.5">
        {common.length > 0 && (
          <BranchChip
            tone={MAP_TONES[0]}
            name="Общие точки"
            note={`${common.length}`}
            on={active === ''}
            onClick={() => onActive('')}
          />
        )}

        {list.map((t) => {
          const idx = order.indexOf(t.i)
          const own = S.route.filter((p) => p.tr === t.i).length
          return (
            <BranchChip
              key={t.i}
              tone={toneOf(t, idx)}
              icon={LEG_ICONS[t.leg as LegMode]}
              name={t.n || 'Без названия'}
              note={branchNote(t, S, own)}
              on={active === t.i}
              onClick={() => onActive(t.i)}
            />
          )
        })}

        {canEdit && (
          <button
            type="button"
            onClick={() => setAdding((v) => !v)}
            aria-expanded={adding}
            aria-label="Добавить вид транспорта — у него будет своя ветка маршрута"
            className={cn(
              'flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg border border-dashed border-line-strong',
              'px-3 text-note font-semibold text-ink transition-colors hover:bg-zebra',
              adding && 'bg-zebra',
            )}
          >
            {adding ? (
              <X size={16} strokeWidth={1.75} aria-hidden />
            ) : (
              <Plus size={16} strokeWidth={1.75} aria-hidden />
            )}
            Транспорт
          </button>
        )}
      </div>

      {/* ── Выбор вида: списком прямо здесь, а не шторкой (постулат 2) ── */}
      {adding && canEdit && (
        <div className="mt-2 flex flex-wrap gap-2">
          {addOptions(S).map((o) => (
            <button
              key={o.kind || 'walk'}
              type="button"
              onClick={() => add(o)}
              className="flex min-h-11 items-center gap-1.5 rounded-lg border border-line px-3 text-note text-ink transition-colors hover:bg-zebra"
            >
              {o.leg === 'walk' && <Footprints size={16} strokeWidth={1.75} aria-hidden />}
              {o.t}
            </button>
          ))}
        </div>
      )}

      {/* ── Свойства активной ветки ──
          Всё, что заказчик просил «тут же сразу же»: удвоение маршрута,
          лишние километры, экипаж, цвет. */}
      {activeT && canEdit && (
        <div className="mt-2 flex flex-col gap-1.5 border-t border-line pt-2">
          {/* ── Название и расход ──
              Заказчик 06.08.2026, поздний вечер: «автотранспорт, названия
              автотранспорта, расход — сразу же можно ли указать здесь».
              ⚠️ Это НЕ второй список техники (постулат 3.5): здесь правится
              ровно одна выбранная ветка, а перечисление всей техники со всеми
              её полями по-прежнему живёт только в «Дороге». Поля те же самые,
              и правятся тем же органом, что там (`InlineText`, `InlineNum`), —
              своего ничего не выдумано (постулат 3). */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <InlineText
              value={activeT.n}
              onSave={(v) =>
                patch(activeT.i, (t) => {
                  t.n = v
                })
              }
              can
              label="Название транспорта"
              placeholder="Название"
              className="text-note font-semibold text-ink"
            />
            {/* Расход есть не у всякой ветки: у инструмента и у «Пешком»
                он не считается вовсе (`rateU === 'fix'`), и поля тогда нет —
                не положено, значит органа нет (постулат 6). */}
            {activeT.rateU !== 'fix' && (
              <span className="flex min-h-11 items-center gap-1.5 text-note text-muted">
                Расход
                <InlineNum
                  value={activeT.rate}
                  onSave={(v) =>
                    patch(activeT.i, (t) => {
                      t.rate = v
                    })
                  }
                  can
                  kind="plain"
                  label={`Расход «${activeT.n || 'ветка'}»`}
                  unit={activeT.nt?.rate?.u || (activeT.rateU === 'lh' ? 'л/ч' : 'л/100 км')}
                />
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            {/* «×2» — свой у КАЖДОЙ ветки (заказчик Г-4). Пока галочки не трогали,
                работает общий множитель поездки, и деньги не двигаются. */}
            <button
              type="button"
              role="switch"
              aria-checked={kBackOf(activeT, S) >= 2}
              onClick={() =>
                patch(activeT.i, (t) => {
                  t.kBack = kBackOf(activeT, S) >= 2 ? 1 : 2
                })
              }
              className="flex min-h-11 items-center gap-2 rounded-md pr-2 text-note text-ink transition-colors hover:bg-zebra"
            >
              <span
                aria-hidden
                className={cn(
                  'grid size-5 shrink-0 place-items-center rounded border',
                  kBackOf(activeT, S) >= 2
                    ? 'border-accent bg-accent text-brand-cream'
                    : 'border-line-strong',
                )}
              >
                {kBackOf(activeT, S) >= 2 && <Check size={14} strokeWidth={2.5} />}
              </span>
              <Repeat2 size={16} strokeWidth={1.75} aria-hidden className="shrink-0 text-muted" />
              Обратно тем же путём{NBSP}(×2)
            </button>

            {/* «Условно ещё 30 км» — прямая просьба заказчика. Это `kmLocal`:
                оно просто суммируется и на «×2» не множится. */}
            <span className="flex min-h-11 items-center gap-2 text-note text-muted">
              Ещё вне маршрута
              <InlineNum
                value={activeT.kmLocal ?? 0}
                onSave={(v) =>
                  patch(activeT.i, (t) => {
                    t.kmLocal = v
                    /* Пока у ветки нет своего источника пробега, лишние
                       километры некуда прибавить: `kmOf` отдаёт общее число
                       поездки. Молча ничего не переключаем (заказчик просил
                       прямо), но и вписанное не теряем — ставим «по карте»
                       только когда карта уже что-то посчитала. */
                    if (t.kmSrc !== 'auto' && t.kmSrc !== 'manual' && (t.kmAuto ?? 0) > 0) {
                      t.kmSrc = 'auto'
                    }
                  })
                }
                can
                label={`Лишние километры «${activeT.n || 'ветка'}»`}
                unit="км"
                step={5}
              />
            </span>
          </div>

          {/* Кто едет этой веткой — из команды поездки, а не новым списком. */}
          {S.people.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-note text-muted">Едут</span>
              {S.people.map((p) => {
                const on = (activeT.o?.[p.id] ?? 0) > 0
                return (
                  <button
                    key={p.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() =>
                      patch(activeT.i, (t) => {
                        const bag = { ...(t.o ?? {}) }
                        if (bag[p.id]) delete bag[p.id]
                        else bag[p.id] = 1
                        t.o = bag
                      })
                    }
                    className={cn(
                      'flex min-h-11 items-center rounded-lg border px-3 text-note transition-colors',
                      on
                        ? 'border-accent bg-accent-fill font-semibold text-ink'
                        : 'border-line text-muted hover:bg-zebra',
                    )}
                  >
                    {p.name}
                  </button>
                )
              })}
            </div>
          )}

          {/* Цвет ветки. Только брендовые тона (постулат 10) — своих цветов
              завести нельзя, и это правильно: чужой цвет на карте сливается
              с подложкой. Рисунок линии при этом остаётся своим, поэтому две
              ветки одного цвета всё равно различимы (WCAG 1.4.1). */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-note text-muted">Цвет ветки</span>
            {MAP_TONES.map((tone, i) => {
              const on = (activeT.tone ?? -1) === i
              return (
                <button
                  key={tone.fill}
                  type="button"
                  aria-pressed={on}
                  aria-label={`Цвет ветки ${MDASH} ${TONE_NAMES[i]}`}
                  title={TONE_NAMES[i]}
                  onClick={() =>
                    patch(activeT.i, (t) => {
                      t.tone = on ? undefined : i
                    })
                  }
                  className="grid size-11 place-items-center rounded-md transition-colors hover:bg-zebra"
                >
                  <span
                    className={cn(
                      'grid size-6 place-items-center rounded-full border-2',
                      on ? 'border-ink' : 'border-brand-cream',
                    )}
                    style={{ backgroundColor: tone.fill, color: tone.text }}
                  >
                    {on && <Check size={14} strokeWidth={2.5} aria-hidden />}
                  </span>
                </button>
              )
            })}
          </div>

          <p className="text-micro leading-snug text-muted">
            Новые точки на карте попадают в «{activeT.n || 'выбранную ветку'}»
            {activeIdx >= 0 ? '' : ''}. Расход, топливо и цена правятся в «Дороге».
          </p>
        </div>
      )}
    </div>
  )
}

/** Одна ветка в ряду: цвет, значок, название и её километры. */
function BranchChip({
  tone, icon: Icon, name, note, on, onClick,
}: {
  tone: MapTone
  icon?: LucideIcon
  name: string
  note: string
  on: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        'flex min-h-11 shrink-0 items-center gap-2 rounded-lg border px-3 text-left transition-colors',
        on ? 'border-accent bg-accent-fill' : 'border-line hover:bg-zebra',
      )}
    >
      {/* Цвет не единственный признак: рядом всегда стоит название (WCAG 1.4.1). */}
      <span
        aria-hidden
        className="size-3 shrink-0 rounded-full"
        style={{ backgroundColor: tone.fill }}
      />
      {Icon && <Icon size={16} strokeWidth={1.75} aria-hidden className="shrink-0 text-muted" />}
      <span className="min-w-0">
        <span className="block max-w-40 truncate text-note leading-tight font-semibold text-ink">
          {name}
        </span>
        <span className="tnum block text-micro leading-tight text-muted">{note}</span>
      </span>
    </button>
  )
}
