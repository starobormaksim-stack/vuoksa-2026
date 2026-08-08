import { useState } from 'react'
import {
  Car, Check, ChevronDown, Footprints, Palette, Plus, Repeat2, Sailboat, Trash2, X,
  type LucideIcon,
} from 'lucide-react'
import { toast } from 'sonner'
import type { LegMode, RoutePoint, State, Transport } from '@/lib/types'
import { update, touch, remove } from '@/store'
import { kmOf, kBackOf } from '@/lib/calc'
import { dg, kBackWord, kmLabel } from '@/components/road/roadx'
import { MDASH, NBSP } from '@/format'
import { cn } from '@/lib/utils'
import { InlineNum, InlineText, RowAction } from '@/components/flops'
import { MAP_TONES, TONE_NAMES, inkOn, normHex, toneOf, type MapTone } from './marks'

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
  if (t.kmSrc === 'auto' || t.kmSrc === 'manual') {
    /* Число в чипе — ИТОГ ветки, то есть уже с «×2». Молчать об этом нельзя:
       08.08.2026 заказчик прочитал в чипе 742 км там, где по точкам стояло
       371, и спросил «зачем это 742» (постулат 5). */
    const k = kBackOf(t, S)
    return k === 1 ? kmLabel(kmOf(t, S)) : `${kmLabel(kmOf(t, S))} ${MDASH} ${kBackWord(k)}`
  }
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
  /**
   * Раскрыты ли свойства активной ветки.
   *
   * ⛔ Свёрнуто ПО УМОЛЧАНИЮ. Заказчик 07.08.2026: «огромное количество проблем
   * с правой стороны, по умолчанию свёрнута должна быть вся эта информация»,
   * и в тот же разбор — «позорнейшее количество информации… почему-то такое
   * количество элементов. Оно не нужно». Свойства ветки — восемь органов
   * (название, расход, «×2», лишние километры, экипаж, цвет), и все они
   * стояли раскрытыми под картой всё время, хотя трогают их раз в поездку.
   *
   * Развернуть — шеврон в самой строке ветки: своего ряда орган не занимает
   * (постулат 7), а свёрнутое состояние оставляет видимый след, которым его
   * вернут (постулат 5, урок У-124).
   */
  const [open, setOpen] = useState(false)
  /**
   * Раскрыт ли перечень точек без ветки.
   *
   * ⛔ Заказчик 08.08.2026 про строку «Общие точки»: «откуда они взялись,
   * их нет в принципе и не надо… я их вообще не расставлял, я хочу их удалить.
   * Я должен иметь эту возможность сделать. Почему ты не даёшь, я не знаю».
   * Это точки старого документа, у которых не проставлен транспорт: чип их
   * СЧИТАЛ, но не показывал и удалить их было нечем — метки на карте у точки
   * без координат нет вовсе, а карточка открывается только тапом по метке.
   * Теперь чип раскрывается тем же шевроном, что и ветка, а внутри — сами
   * точки, каждую видно и каждую можно убрать (постулат 1).
   */
  const [openCommon, setOpenCommon] = useState(false)

  const list = branchesOf(S)
  const order = S.transport.map((t) => t.i)
  const common = S.route.filter((p) => !p.tr || !order.includes(p.tr))

  /** Убрать точку, оставив дорогу назад: `confirm()` в проекте нет (постулат 9). */
  const dropPoint = (p: RoutePoint) => {
    remove('route', p.i)
    toast(`«${p.n || 'Точка'}» убрана из маршрута`, {
      action: {
        label: 'Отменить',
        onClick: () =>
          update((s) => {
            if (s.del) delete s.del['route:' + p.i]
            /* Свежий `ua` обязателен: без него слияние сочтёт вернувшуюся
               позицию старее метки удаления у соседа и уберёт её снова. */
            if (!s.route.some((x) => x.i === p.i)) s.route.push({ ...p, ua: Date.now() })
          }),
      },
    })
  }

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

  /**
   * Убрать ветку целиком — то же удаление техники, что в «Дороге» (одна
   * строка `S.transport` и там и тут, постулат 3.5). Заказчик 08.08.2026:
   * «у тебя нет возможности удалить тот или иной участок логистики» — на карте
   * ветку было не убрать ничем, только её строку в «Дороге», о которой у карты
   * не написано. Точки ветки при этом не пропадают: они становятся «Точками
   * без транспорта», и их видно тем же списком. `confirm()` в проекте нет —
   * дорога назад лежит в самом сообщении (постулат 9).
   */
  const dropBranch = (t: Transport) => {
    remove('transport', t.i)
    onActive('')
    setOpen(false)
    toast(`«${t.n || 'Ветка'}» убрана — и с карты, и из «Дороги»`, {
      action: {
        label: 'Отменить',
        onClick: () =>
          update((s) => {
            if (s.del) delete s.del['transport:' + t.i]
            if (!s.transport.some((x) => x.i === t.i)) s.transport.push({ ...t, ua: Date.now() })
          }),
      },
    })
  }

  return (
    /* Полоса стоит ПОД картой (см. TripMap.tsx) — отсюда `border-t`. */
    <div className="shrink-0 border-t border-line px-3 py-2">
      {/* ── Ветки СТРОКАМИ, по одной в строке ──
          Заказчик 06.08.2026: «ни скролла, ни горизонтального… Сделай просто:
          первая строка — один транспорт, вторая — второй, в третьей строке —
          третий транспорт». Прокрутка вбок прятала половину веток за краем
          экрана: на 390 в полосу влезали две из четырёх, а остальные надо было
          искать пальцем. Строкам край экрана не мешает. */}
      <div className="flex flex-col gap-1.5">
        {common.length > 0 && (
          /* Название говорит, ЧТО это: «Общие точки» не объясняли ничего,
             и заказчик спросил, откуда они взялись. Это точки, которым
             не назначен транспорт. */
          <BranchChip
            tone={MAP_TONES[0]}
            name="Точки без транспорта"
            note={`${common.length}`}
            on={active === ''}
            onClick={() => onActive('')}
            /* Шеврон виден ВСЕГДА (заказчик 08.08.2026: «стрелочки должны быть
               всегда видны, а сейчас пока я не нажму — не появляется»), а не
               только у активной строки. Тап по шеврону неактивной строки сам
               делает её активной и сразу раскрывает. */
            open={canEdit ? active === '' && openCommon : undefined}
            onToggle={() => {
              if (active !== '') {
                onActive('')
                setOpenCommon(true)
              } else setOpenCommon((v) => !v)
            }}
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
              /* Шеврон стоит у КАЖДОЙ ветки, у кого есть право править
                 (постулат 6 — без права органа нет). Заказчик 08.08.2026:
                 «стрелочки должны быть всегда видны… я нажал один раз — она
                 выпала, и обратно вернулась, если я свернул». Тап по шеврону
                 неактивной ветки сам выбирает её и раскрывает свойства —
                 двух нажатий не требуется. Раскрытым при этом остаётся ровно
                 один блок: свойства рисуются только у активной ветки. */
              open={canEdit ? active === t.i && open : undefined}
              onToggle={() => {
                if (active !== t.i) {
                  onActive(t.i)
                  setOpen(true)
                } else setOpen((v) => !v)
              }}
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
              'flex min-h-11 w-full items-center gap-1.5 rounded-lg border border-dashed border-line-strong',
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

      {/* ── Точки без транспорта: перечнем, и каждую видно ──
          Единственное место, где такая точка вообще показана: метки на карте
          у неё нет. Правки полей здесь нет — только имя и «убрать»: всё
          остальное правится в карточке точки, когда точка встанет на карту
          (постулат 3.5 — второго списка точек не заводим). */}
      {active === '' && canEdit && openCommon && common.length > 0 && (
        <div className="mt-2 flex flex-col gap-1 border-t border-line pt-2">
          {common.map((p) => (
            <div key={p.i} className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-note text-ink">
                {p.n || 'Без названия'}
              </span>
              <button
                type="button"
                onClick={() => dropPoint(p)}
                aria-label={`Убрать точку «${p.n || 'Без названия'}» из маршрута`}
                title="Убрать точку"
                className="grid size-11 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-zebra hover:text-ink"
              >
                <Trash2 size={16} strokeWidth={1.75} aria-hidden />
              </button>
            </div>
          ))}
        </div>
      )}

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
      {activeT && canEdit && open && (
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
                  /* ⛔ Без `digits` поле округляет до целого (`digits = 0` по
                     умолчанию), и вписанные 2,5 л/ч превращались в 3 — заказчик
                     06.08.2026: «я прописываю там 2,5 л/ч, а у тебя почему-то
                     округляется до 3». В «Дороге» тот же расход всегда правился
                     через `dg(t.rate)`; здесь этой половины не хватало. */
                  digits={dg(activeT.rate)}
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
                        /* Та же пара, что у строки ветки выше: подсветка
                           `accent-soft`, текст прежний (замер 07.08.2026 —
                           графит на `accent-fill` давал 2,60 : 1). */
                        ? 'border-accent bg-accent-soft font-semibold text-ink'
                        : 'border-line text-muted hover:bg-zebra',
                    )}
                  >
                    {p.name}
                  </button>
                )
              })}
            </div>
          )}

          {/* ── Цвет ветки: шесть ярких наготове плюс своя палитра ──
              Заказчик 07.08.2026: «цвета маршрутов должны быть яркими, чтобы
              их было легко рассмотреть на карте. Брендовые цвета здесь
              не важны… чтобы ты предлагал яркие цвета для каждого маршрута…
              При этом возможность выбора: я нажимаю это в палитре, выбираю
              самостоятельно».
              ⛔ Оговорка постулата 10 расширена ровно на нитки, кружки точек
              и эти кружки выбора. Ни один орган интерфейса цвет отсюда
              не берёт. Палитра — родная браузерная (`input type="color"`),
              своего органа не выдумано (постулат 3) и шторки не заведено
              (постулат 2): на телефоне её рисует сама система. */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-note text-muted">Цвет ветки</span>
            {MAP_TONES.map((tone, i) => {
              /* Свой цвет старше готового тона — тогда ни один кружок
                 не отмечен, и это честно: выбран не они. */
              const on = !normHex(activeT.color) && (activeT.tone ?? -1) === i
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
                      /* Выбрали готовый — свой перестаёт действовать. Поле
                         не удаляем: слияние переносит его как обычное значение,
                         и пустая строка — законное «своего цвета нет». */
                      t.color = ''
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

            {/* Своя палитра. Подпись обязательна: цвет не остаётся безымянным
                пятном (WCAG 1.4.1), а сам кружок показывает выбранное. */}
            <label
              className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md px-2 text-note text-muted transition-colors hover:bg-zebra"
              title="Выбрать свой цвет ветки"
            >
              <span
                aria-hidden
                className={cn(
                  'grid size-6 place-items-center rounded-full border-2',
                  normHex(activeT.color) ? 'border-ink' : 'border-line-strong',
                )}
                style={
                  normHex(activeT.color)
                    ? { backgroundColor: normHex(activeT.color) as string, color: inkOn(normHex(activeT.color) as string) }
                    : undefined
                }
              >
                {normHex(activeT.color) ? (
                  <Check size={14} strokeWidth={2.5} />
                ) : (
                  <Palette size={14} strokeWidth={1.75} className="text-muted" />
                )}
              </span>
              Свой
              <input
                type="color"
                value={normHex(activeT.color) ?? toneOf(activeT, order.indexOf(activeT.i)).fill}
                aria-label="Свой цвет ветки маршрута"
                onChange={(e) =>
                  patch(activeT.i, (t) => {
                    t.color = e.target.value
                  })
                }
                /* Само поле не показываем: его вид задаёт система и он всюду
                   разный. Видимая часть — кружок слева, а `<label>` отдаёт
                   ему нажатие целиком, поэтому цель касания это вся строка. */
                className="sr-only"
              />
            </label>

            {/* Вернуть цвет по умолчанию. Кнопка появляется только когда
                возвращать есть что (постулат 6). */}
            {(normHex(activeT.color) || typeof activeT.tone === 'number') && (
              <button
                type="button"
                onClick={() =>
                  patch(activeT.i, (t) => {
                    t.color = ''
                    t.tone = undefined
                  })
                }
                className="flex min-h-11 items-center rounded-md px-2 text-note text-muted transition-colors hover:bg-zebra hover:text-ink"
              >
                Сбросить
              </button>
            )}
          </div>

          {/* ⛔ Здесь стояла строка «Новые точки на карте попадают в „…“. Расход,
              топливо и цена правятся в „Дороге“». Убрана 06.08.2026 по прямому
              слову заказчика: «эта информация не нужна. Вот эта вся описательная
              часть глупая, ненужная». Выбранная ветка и так подсвечена рамкой
              и стоит первой строкой над этим блоком — подсказка повторяла то,
              что видно (постулат 7: меньше деталей, а не больше). */}

          {/* Удаление — действие в самой строке (постулат 2), тем же органом,
              что у строк «Дороги». */}
          <div className="flex justify-end border-t border-line/50 pt-1">
            <RowAction
              icon={Trash2}
              tone="danger"
              label={`Убрать ветку «${activeT.n || 'без названия'}»`}
              onClick={() => dropBranch(activeT)}
            />
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Одна ветка в ряду: цвет, значок, название и её километры.
 *
 * ⚠️ Снаружи это `<div>`, а не `<button>`: у активной ветки внутри стоит второй
 * орган — шеврон свойств, — а кнопка внутри кнопки разметкой запрещена и
 * в Safari просто не нажимается. Рамку и заливку поэтому несёт обёртка,
 * а нажатия — две кнопки внутри неё.
 */
function BranchChip({
  tone, icon: Icon, name, note, on, onClick, open, onToggle,
}: {
  tone: MapTone
  icon?: LucideIcon
  name: string
  note: string
  on: boolean
  onClick: () => void
  /** `undefined` — шеврона нет вовсе; иначе раскрыты ли свойства ветки */
  open?: boolean
  onToggle?: () => void
}) {
  return (
    <div
      className={cn(
        /* Ветка занимает строку целиком: `w-full`, а не `shrink-0` — полоса
           больше не едет вбок (заказчик 06.08.2026). */
        'flex w-full items-center rounded-lg border transition-colors',
        /* ⛔ `bg-accent-soft`, а не `bg-accent-fill`. Заливка `accent-fill`
           (#A74612 в светлой, #DD9A4E в тёмной) во всём проекте идёт в паре
           с `text-on-accent`; здесь под ней стоял `text-ink`, и замер 07.08.2026
           дал 2,60 : 1 в светлой и 2,13 : 1 в тёмной при норме 4,5 : 1 —
           название выбранной ветки читалось хуже невыбранных. `accent-soft` —
           тот же приём, которым помечен активный раздел в `BottomNav`
           и своя колонка в `BuyTable`: подсветка фоном, текст прежний. */
        on ? 'border-accent bg-accent-soft' : 'border-line hover:bg-zebra',
      )}
    >
      <button
        type="button"
        aria-pressed={on}
        onClick={onClick}
        className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-lg px-3 text-left"
      >
        {/* Цвет не единственный признак: рядом всегда стоит название (WCAG 1.4.1). */}
        <span
          aria-hidden
          className="size-3 shrink-0 rounded-full"
          style={{ backgroundColor: tone.fill }}
        />
        {Icon && <Icon size={16} strokeWidth={1.75} aria-hidden className="shrink-0 text-muted" />}
        <span className="min-w-0">
          <span className="block truncate text-note leading-tight font-semibold text-ink">
            {name}
          </span>
          <span className="tnum block text-micro leading-tight text-muted">{note}</span>
        </span>
      </button>

      {open !== undefined && (
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-label={open ? `Свернуть настройки «${name}»` : `Настроить «${name}»`}
          title={open ? 'Свернуть настройки' : 'Настроить ветку'}
          className="grid size-11 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:text-ink"
        >
          <ChevronDown
            size={18}
            strokeWidth={1.75}
            aria-hidden
            className={cn('transition-transform', open && 'rotate-180')}
          />
        </button>
      )}
    </div>
  )
}
