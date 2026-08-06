import type { ReactNode } from 'react'
import { toast } from 'sonner'
import type { LegMode, RateUnitId, Rent, State, Transport } from '@/lib/types'
import { kmOf, litres, routeKm } from '@/lib/calc'
import { Btn, InlineNum, InlinePick, InlineText, StripField } from '@/components/flops'
import { Switch } from '@/components/ui/switch'
import { fmtNum, MDASH, NBSP } from '@/format'
import { fuelName, litresLabel, NO_FUEL, RATE_HINTS, RATE_TITLES } from './roadx'
import { patchRent, patchTransport } from './roadedit'

/**
 * Настройка позиции расчёта — то, что выбирается из готового списка.
 *
 * ─── Откуда это здесь ───
 * Прежде вид техники, топливо, хозяин, способ считать расход и участок пути
 * жили в шторке `TransportSheet.tsx` (пять вложенных `PickSheet`), а категория
 * аренды и «что входит в стоимость» — в `RentSheet.tsx`. Заказчик 06.08.2026:
 * «всё, что связано с настройками по конкретным позициям, выпадающим списком,
 * чтобы принцип был везде единообразен… эта система настроек должна быть спрятана
 * в выпадающем списке, но грамотно организованной».
 *
 * Поэтому обе шторки упразднены, а их содержимое стоит здесь — одним блоком,
 * который показывается и в раскрытой полоске ленты (390), и в панели под строкой
 * таблицы (1280). Один блок на оба вида: разойтись им нельзя, документ-то один.
 *
 * ⛔ Ничего нового не написано: полка — `flops/StripField`, выбор из списка —
 * `flops/InlinePick` (список раскрывается ПОД значением и толкает содержимое вниз,
 * а не всплывает поверх), переключатель — `ui/switch` (shadcn/Radix).
 */

/**
 * Заголовок группы полей внутри раскрытия позиции.
 *
 * Слово заказчика 06.08.2026: настройки позиции должны лежать в раскрытии
 * строки, «но грамотно организованной». Четырнадцать полок подряд — это свалка,
 * поэтому они собраны в группы: «Сколько и почём» · «Что за техника» (или
 * «Что за аренда») · «Кто платит» · подписи из листа (`DocNotes`, у него свой
 * заголовок — второго над ним не ставим).
 *
 * ⛔ Ничего нового не написано: вид заголовка тот же, что у разделителей ленты
 * расчёта (`Caption` в `RoadStrip`) — `text-micro font-bold tracking-wider
 * uppercase text-muted`. Отступы мельче: это подпись группы ВНУТРИ раскрытия,
 * а не разделитель ленты.
 */
export function SetupGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mt-3 border-t border-line pt-2 first:mt-0 first:border-t-0 first:pt-0">
      <div className="text-micro font-bold tracking-wider text-muted uppercase">{title}</div>
      {children}
    </div>
  )
}

/** Есть ли этот вид в справочнике: своё название нужно только тогда, когда нет. */
function kindOfKnown(t: Transport, S: State): boolean {
  return S.kinds.some((k) => k.i === t.kind)
}

/**
 * Техника: вид, топливо, хозяин, способ считать расход, участок пути, канистры
 * и своё название вида. Порядок тот же, что был в шторке, — человек, который
 * уже привык к нему за две недели, ничего не переучивает.
 *
 * Заголовок группы стоит здесь, а не у того, кто зовёт: блок один на оба вида
 * (лента на 390 и панель под строкой таблицы на 1280), и подпись у них обязана
 * быть одна и та же.
 */
export function TransportSetup({
  item, S, canEdit,
}: {
  item: Transport
  S: State
  canEdit: boolean
}) {
  const vol = litres(item, S)
  const onPatch = (f: (t: Transport) => void) => patchTransport(item.i, f)

  return (
    <SetupGroup title="Что за техника">
      <StripField label="Вид" wide>
        <InlinePick
          value={item.kind}
          can={canEdit}
          label={`${item.n || 'Техника'}: вид техники`}
          /* Вида нет в справочнике — показываем своё название из документа
             (`kindT`), ровно как это делала прежняя шторка через `kindName`.
             Пусто и там — тогда общее слово-подсказка. */
          freeText={item.kindT}
          placeholder="Своя техника"
          className="text-body text-ink"
          options={[...S.kinds]
            .sort((a, b) => a.ord - b.ord)
            .map((k) => ({
              id: k.i,
              title: k.t,
              /* У поезда и автобуса топлива нет вовсе, и молчать об этом нельзя:
                 человек завёл бы вид и не понял, почему в бюджете ноль. Деньги
                 за билет живут строкой в «Аренде», где есть цена и количество. */
              note: NO_FUEL.has(k.i)
                ? 'топлива нет — стоимость билетов заводится строкой в «Аренде»'
                : `расход считаем ${RATE_TITLES[k.rateU] ?? k.rateU}`,
            }))}
          onPick={(id) =>
            onPatch((t) => {
              t.kind = id
              const k = S.kinds.find((x) => x.i === id)
              /* Вид задаёт и то, как считается расход: у мотора это часы, у пилы — объём. */
              if (k) t.rateU = k.rateU
              /* У поезда и автобуса топлива нет. Числа прежнего вида надо обнулить:
                 иначе техника, у которой стояло «5 л», после смены вида молча
                 продолжила бы считать пять литров бензина вопреки подписи
                 «топлива нет» — а `litres()` при `fix` берёт ровно `t.litres`. */
              if (NO_FUEL.has(id)) {
                t.litres = 0
                t.rate = 0
                t.hours = 0
                t.carry = false
              }
            })
          }
        />
      </StripField>

      <StripField label="Топливо" wide>
        <InlinePick
          value={item.fuel}
          can={canEdit}
          label={`${item.n || 'Техника'}: топливо`}
          placeholder="не выбрано"
          className="text-body text-ink"
          options={[...S.fuelPrices]
            .sort((a, b) => a.ord - b.ord)
            .map((f) => ({
              id: f.i,
              title: f.n,
              note: f.price > 0 ? `${fmtNum(f.price, 1)}${NBSP}₽ за литр` : 'цена не вписана',
            }))}
          onPick={(id) =>
            onPatch((t) => {
              t.fuel = id
            })
          }
        />
      </StripField>

      <StripField label="Чья" wide>
        <InlinePick
          value={item.owner}
          can={canEdit}
          label={`${item.n || 'Техника'}: чья техника`}
          placeholder="Ничья"
          className="text-body text-ink"
          options={[
            { id: '', title: 'Ничья', note: 'техника общая — хозяин не назначен' },
            ...S.people.map((p) => ({ id: p.id, title: p.name, note: p.car || p.role })),
          ]}
          onPick={(id) =>
            onPatch((t) => {
              t.owner = id
            })
          }
        />
      </StripField>

      <StripField label="Расход считаем" wide>
        <InlinePick
          value={item.rateU}
          can={canEdit}
          label={`${item.n || 'Техника'}: как считаем расход`}
          className="text-body text-ink"
          options={S.rateUnits.map((u) => ({
            id: u.i,
            title: RATE_TITLES[u.i] ?? u.t,
            note: `${u.t} ${MDASH} ${RATE_HINTS[u.i] ?? ''}`,
          }))}
          onPick={(id) =>
            onPatch((t) => {
              t.rateU = id as RateUnitId
            })
          }
        />
      </StripField>

      <StripField label="Как идёт" wide>
        <InlinePick
          value={item.leg}
          can={canEdit}
          label={`${item.n || 'Техника'}: как идёт`}
          placeholder="не указано"
          className="text-body text-ink"
          options={[
            { id: 'road', title: 'По дороге', note: 'идёт своим ходом по трассе' },
            { id: 'water', title: 'По воде', note: 'работает на воде' },
            { id: 'walk', title: 'Пешком', note: 'несём с собой' },
          ]}
          onPick={(id) =>
            onPatch((t) => {
              t.leg = id as LegMode
            })
          }
        />
      </StripField>

      {/* Цель нажатия — вся полка, а не один переключатель: он ростом 18 px.
          Подпись связана с ним через `htmlFor`, поэтому нажатие в любом месте
          строки доходит до органа (приём из примеров shadcn к `Switch`). */}
      <StripField label="Везём в канистрах" htmlFor={canEdit ? `carry-${item.i}` : undefined}>
        {canEdit ? (
          <Switch
            id={`carry-${item.i}`}
            aria-label={`${item.n || 'Техника'}: везём топливо в канистрах`}
            checked={item.carry}
            onCheckedChange={(v) => {
              onPatch((t) => {
                t.carry = v
              })
              toast(
                v
                  ? `${litresLabel(vol)} ${fuelName(S, item.fuel)} едут в канистрах`
                  : `${item.n}: заправляемся на АЗС, канистры не нужны`,
              )
            }}
          />
        ) : (
          <span className="text-body text-ink">{item.carry ? 'да' : 'нет'}</span>
        )}
      </StripField>

      {item.kindT || !kindOfKnown(item, S) ? (
        <StripField label="Свой вид техники" wide>
          <InlineText
            value={item.kindT}
            onSave={(v) =>
              onPatch((t) => {
                t.kindT = v
              })
            }
            can={canEdit}
            label="Свой вид техники"
            placeholder="Например, снегоход"
            className="text-body text-ink"
          />
        </StripField>
      ) : null}

      <TransportOwnNote item={item} canEdit={canEdit} />
    </SetupGroup>
  )
}

/**
 * Своё примечание строки (`Transport.c`) — только когда под названием стоит
 * НЕ оно.
 *
 * ⚠️ Место описания под названием занято по правилу «показан один комментарий,
 * и правится ровно показанный»: если своего нет, туда встаёт комментарий,
 * стоящий у числа в документе (`nt.rate.c`, `nt.hours.c`, `nt.litres.c`).
 * В боевом листе так у ВСЕХ четырёх строк техники — значит без этой полки
 * `c` стало бы невидимым и неправимым, а поле в документе есть (постулат 4).
 * Как только своё примечание вписано, оно само встаёт под названием, и полка
 * исчезает — двух органов на одно значение не бывает.
 */
function TransportOwnNote({ item, canEdit }: { item: Transport; canEdit: boolean }) {
  const busy =
    !item.c && (!!item.nt?.rate?.c || !!item.nt?.hours?.c || !!item.nt?.litres?.c)
  if (!busy || !canEdit) return null
  return (
    <StripField label="Своё примечание" wide>
      <InlineText
        value=""
        onSave={(v) =>
          patchTransport(item.i, (t) => {
            t.c = v
          })
        }
        can={canEdit}
        multiline
        label="Своё примечание к технике"
        placeholder="Что важно помнить про эту технику"
        className="text-note leading-snug text-muted"
      />
    </StripField>
  )
}

/* ──────────────────────────────────────────────────────────────────────────
   Свой пробег единицы техники
   ────────────────────────────────────────────────────────────────────────── */

/**
 * Пробег ЭТОЙ единицы техники: своё число, местные разъезды и переключатель
 * «считать по карте».
 *
 * ─── Откуда ───
 * Заказчик 06.08.2026: «Каждая строка показывает свой пробег и свою сумму
 * итоговую по деньгам. Все!» и «Цифру написать проще человеку у каждого
 * автомобиля, у каждого автотранспорта или же просто транспорта, допустим
 * лодки. У всех будут свои переменные».
 *
 * ─── Три правила, которые нельзя нарушить ───
 * 1. Ручная цифра переживает перерасчёт по карте. «Точки никак не повлияют —
 *    как они были, так они будут»: `kmAuto` и `km` лежат в документе рядом
 *    и не затирают друг друга, а выбирает между ними `kmSrc`.
 * 2. Обратная дорога — множитель, а не вторая нитка точек. `kBack` общий,
 *    и правится он в строке «Пробег» над техникой (заказчик прямо отказался
 *    ставить точки на обратный путь).
 * 3. Молча ничего не переключается. Пока `kmSrc` пуст, техника считается
 *    общим пробегом поездки — и об этом здесь написано словами, а не оставлено
 *    на догадку по числу (постулат 5).
 *
 * ⛔ Ничего нового не написано: полка — `flops/StripField`, число —
 * `flops/InlineNum`, кнопка — `flops/Btn`. Блок один на оба вида (лента на 390
 * и панель под строкой матрицы на 1280) — разойтись им нельзя, документ один.
 */
export function TransportKm({
  item, S, canEdit,
}: {
  item: Transport
  S: State
  canEdit: boolean
}) {
  const dist = S.trip.dist
  const own = item.kmSrc === 'auto' || item.kmSrc === 'manual'
  const auto = item.kmAuto ?? 0
  const hand = item.km ?? 0
  const local = item.kmLocal ?? 0
  const base = own ? (item.kmSrc === 'auto' ? auto : hand) : 0
  const total = kmOf(item, S)
  const onPatch = (f: (t: Transport) => void) => patchTransport(item.i, f)

  /** Перевести технику на своё число: карта её больше не трогает. */
  const useHand = (v: number) => {
    const wasAuto = item.kmSrc === 'auto'
    onPatch((t) => {
      t.km = v
      t.kmSrc = 'manual'
    })
    if (wasAuto) {
      toast(`«${item.calcT || item.n || 'Техника'}»: в расчёт пошло своё число, а не километры с карты`)
    }
  }

  return (
    <SetupGroup title="Свой пробег">
      <StripField label="Расстояние в одну сторону" wide>
        <InlineNum
          value={own ? base : routeKm(S)}
          digits={0}
          kind="plain"
          unit="км"
          label={`Расстояние в одну сторону: ${item.n || 'техника'}`}
          can={canEdit}
          onSave={useHand}
          className="text-body font-semibold text-ink"
        />
        <p className="mt-0.5 text-note leading-snug text-muted">
          {own
            ? item.kmSrc === 'auto'
              ? 'Считается по своим точкам на карте'
              : 'Своё число: карта его не трогает'
            : `Пока идёт общий пробег поездки${NBSP}${MDASH} ${fmtNum(routeKm(S), 0)}${NBSP}км. Впишите число, и у этой техники будет свой`}
        </p>
      </StripField>

      <StripField label="Местные разъезды" wide>
        <InlineNum
          value={local}
          digits={0}
          kind="plain"
          unit="км"
          label={`Местные разъезды: ${item.n || 'техника'}`}
          can={canEdit}
          onSave={(v) =>
            onPatch((t) => {
              t.kmLocal = v
              /* Разъезды сами по себе пробега не заводят: без своего источника
                 техника считалась бы общим числом, и вписанное молча пропало бы. */
              if (t.kmSrc !== 'auto' && t.kmSrc !== 'manual') {
                t.km = t.km ?? 0
                t.kmSrc = 'manual'
              }
            })
          }
          className="text-body font-semibold text-ink"
        />
        <p className="mt-0.5 text-note leading-snug text-muted">
          Прибавляются к пробегу целиком, на концы пути не множатся
        </p>
      </StripField>

      {canEdit && auto > 0 ? (
        <StripField label="Километры с карты" wide>
          {item.kmSrc === 'auto' ? (
            <Btn
              tone="ghost"
              className="-ml-3"
              onClick={() => {
                onPatch((t) => {
                  t.kmSrc = 'manual'
                })
                toast(`Вернули своё число ${MDASH} ${fmtNum(hand, 0)}${NBSP}км`)
              }}
            >
              Вернуть своё число
            </Btn>
          ) : (
            <Btn
              tone="ghost"
              className="-ml-3"
              onClick={() => {
                onPatch((t) => {
                  t.kmSrc = 'auto'
                })
                toast(`В расчёт пошли километры с карты ${MDASH} ${fmtNum(auto, 0)}${NBSP}км`)
              }}
            >
              Считать по карте
            </Btn>
          )}
          <p className="mt-0.5 text-note leading-snug text-muted">
            {item.kmSrc === 'auto'
              ? `В расчёте карта${NBSP}${MDASH} ${fmtNum(auto, 0)}${NBSP}км. Своё ${MDASH} ${fmtNum(hand, 0)}${NBSP}км`
              : `По своим точкам на карте вышло ${fmtNum(auto, 0)}${NBSP}км`}
          </p>
        </StripField>
      ) : null}

      <StripField label="Пробег этой техники" wide>
        <span className="tnum block text-body font-semibold text-ink">
          {fmtNum(total, 0)}
          {NBSP}км
        </span>
        <p className="mt-0.5 text-note leading-snug text-muted">
          {own
            ? `${fmtNum(base, 0)}${NBSP}км ${MDASH} ${dist.kBack === 1 ? 'только туда' : `${dist.kBack} конца пути`}${local > 0 ? `, плюс ${fmtNum(local, 0)}${NBSP}км на месте` : ''}`
            : 'Общий пробег поездки: своей цифры у этой техники ещё нет'}
          {item.rateU === 'lh' ? '. В топливо идут моточасы, не километры' : ''}
        </p>
      </StripField>
    </SetupGroup>
  )
}

/* ──────────────────────────────────────────────────────────────────────────
   Аренда
   ────────────────────────────────────────────────────────────────────────── */

/**
 * Аренда: чем она является — категория, что входит в стоимость, предупреждение
 * и своё примечание. Одна группа на оба вида, как `TransportSetup` у техники.
 *
 * ⚠️ Предупреждение стоит внутри группы, а не отдельной полкой под названием:
 * в свёрнутой полоске его текст и так читается второй строкой (`RoadStrip`,
 * полоса тревоги), и второе место для того же значения было бы дублем.
 */
export function RentSetup({ item, S, canEdit }: { item: Rent; S: State; canEdit: boolean }) {
  return (
    <SetupGroup title="Что за аренда">
      <RentCatField item={item} S={S} canEdit={canEdit} />
      <RentBlocks item={item} canEdit={canEdit} />
      <RentWarnField item={item} canEdit={canEdit} />
      <RentOwnNote item={item} canEdit={canEdit} />
    </SetupGroup>
  )
}

/** Предупреждение строки аренды — «то, о чём легко забыть на месте». */
function RentWarnField({ item, canEdit }: { item: Rent; canEdit: boolean }) {
  if (!canEdit && !item.warn) return null
  return (
    <StripField label="Предупреждение" wide>
      <InlineText
        value={item.warn ?? ''}
        onSave={(v) =>
          patchRent(item.i, (r) => {
            r.warn = v
          })
        }
        can={canEdit}
        multiline
        label="Предупреждение"
        placeholder="То, о чём легко забыть на месте"
        className="text-body leading-snug font-semibold text-accent-text"
      />
    </StripField>
  )
}

/** За что берут цену: за сутки, за час, за штуку. */
export function RentUnitField({ item, canEdit }: { item: Rent; canEdit: boolean }) {
  return (
    <StripField label="Считаем в" wide>
      <InlineText
        value={item.unit}
        onSave={(v) =>
          patchRent(item.i, (r) => {
            r.unit = v
          })
        }
        can={canEdit}
        label="За что берут цену"
        placeholder="сут."
        className="text-body text-ink"
      />
      <p className="mt-0.5 text-note text-muted">За что берут цену: за сутки, за час, за штуку</p>
    </StripField>
  )
}

/** Категория аренды из справочника `S.rentCats`. */
function RentCatField({
  item, S, canEdit,
}: {
  item: Rent
  S: State
  canEdit: boolean
}) {
  return (
    <StripField label="Категория" wide>
      <InlinePick
        value={item.cat}
        can={canEdit}
        label={`${item.n || 'Аренда'}: категория`}
        placeholder="Другое"
        className="text-body text-ink"
        options={[...S.rentCats]
          .sort((a, b) => a.ord - b.ord)
          .map((c) => ({ id: c.i, title: c.t }))}
        onPick={(id) =>
          patchRent(item.i, (r) => {
            r.cat = id
          })
        }
      />
    </StripField>
  )
}

/**
 * Своё примечание строки аренды (`Rent.c`) — только когда под названием стоит
 * НЕ оно, а комментарий, стоящий у числа в документе. Зачем — см.
 * `TransportOwnNote` выше: в боевом листе так у обеих строк аренды.
 */
function RentOwnNote({ item, canEdit }: { item: Rent; canEdit: boolean }) {
  const busy = !item.c && (!!item.nt?.price?.c || !!item.nt?.qty?.c || !!item.nt?.count?.c)
  if (!busy || !canEdit) return null
  return (
    <StripField label="Своё примечание" wide>
      <InlineText
        value=""
        onSave={(v) =>
          patchRent(item.i, (r) => {
            r.c = v
          })
        }
        can={canEdit}
        multiline
        label="Своё примечание к аренде"
        placeholder="Что важно помнить про эту аренду"
        className="text-note leading-snug text-muted"
      />
    </StripField>
  )
}

/**
 * Текстовые блоки строки аренды — то, что в первой версии было отдельной
 * карточкой лодки: «в стоимость входят 4 жилета».
 */
function RentBlocks({ item, canEdit }: { item: Rent; canEdit: boolean }) {
  const blocks = item.blocks ?? []
  if (blocks.length === 0) return null
  return (
    <div className="mt-2 border-t border-line/50 pt-2">
      <div className="text-micro font-semibold text-muted">В стоимость входит</div>
      {blocks.map((b, idx) => (
        <div key={`${b.t}-${idx}`} className="mt-2">
          <InlineText
            value={b.t}
            onSave={(v) =>
              patchRent(item.i, (r) => {
                const list = r.blocks ?? []
                if (list[idx]) list[idx].t = v
              })
            }
            can={canEdit}
            label="Заголовок блока"
            className="text-body font-[650] text-ink"
          />
          <InlineText
            value={b.c}
            onSave={(v) =>
              patchRent(item.i, (r) => {
                const list = r.blocks ?? []
                if (list[idx]) list[idx].c = v
              })
            }
            can={canEdit}
            multiline
            label="Текст блока"
            className="text-note leading-snug text-muted"
          />
        </div>
      ))}
    </div>
  )
}
