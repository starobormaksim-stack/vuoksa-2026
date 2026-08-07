import { useState, type ReactNode } from 'react'
import { Trash2, TriangleAlert } from 'lucide-react'
import { toast } from 'sonner'
import type { Rent, State, Transport } from '@/lib/types'
import { calcAll, fuelCost, kmOf, litres, money, rentSum, routeKm } from '@/lib/calc'
import {
  AddRow, InlineNum, InlineText, numText, RowAction, RowActions, StripField, StripRow,
} from '@/components/flops'
import { touch, update } from '@/store'
import { NBSP, plural } from '@/format'
import {
  DASH, dg, fuelName, kBackWord, kmLabel, litresLabel, refuelLitres, rentCatName, rentPer,
  rentQtyLabel, transportSub,
} from './roadx'
import { noteBag, patchFuel, patchRent, patchTransport } from './roadedit'
import { Calc, Result, Title } from './cells'
import { DocNotes } from './DocNotes'
import { RentSetup, RentUnitField, SetupGroup, TransportKm, TransportSetup } from './RoadSetup'
import { spendSplit } from '@/lib/settle'
import { SpendShareEdit, SpendSplitLine } from './SpendShare'

/**
 * «Расчёт дороги» лентой — вид на телефоне.
 *
 * ─── Зачем ───
 * Матрица расчёта на 390 была шире экрана вдвое: сумма минимумов её колонок —
 * 49 rem, то есть 784 px. Расход, цена литра, километраж и итог физически лежали
 * за правым краем. Заказчик 06.08.2026: «про бензин я вижу, что у тебя все
 * настройки при скроллинге вправо возникают. Это не сильно очевидно, и было бы
 * логичнее сделать всё, что связано с настройками по конкретным позициям,
 * выпадающим списком, чтобы принцип был везде единообразен».
 *
 * ⛔ Ничего нового не написано: плашка — `flops/StripRow`, полки подробности —
 * `StripField`, образцы расстановки — `gear/GearStrip` и `buy/BuyStrip`, ячейки
 * названия и посчитанного числа — общие с матрицей (`cells.tsx`). Настройка
 * позиции — общий с матрицей `RoadSetup.tsx`: те же поля стоят в панели под
 * строкой таблицы на 1280.
 *
 * ⛔ Своей арифметики здесь нет: считает `lib/calc.ts`, здесь только показ
 * и правка исходных чисел. Контрольные цифры (330 км · 21 385 / 26 005 / 47 390 /
 * 11 848 ₽ · 2 канистры) обязаны совпадать со вторым видом до знака.
 */

interface Props {
  S: State
  canEdit: boolean
  /** можно ли убрать эту позицию: редактор — любую, автор — свою */
  canDel: (item: { by?: string }) => boolean
  onAddTransport: () => void
  onAddRent: () => void
  onDelTransport: (t: Transport) => void
  onDelRent: (r: Rent) => void
  /** id только что добавленной строки — она раскрыта и открыта на правке названия */
  fresh: string | null
  onFreshEnd: () => void
}

export function RoadStrip({
  S, canEdit, canDel, onAddTransport, onAddRent, onDelTransport, onDelRent, fresh, onFreshEnd,
}: Props) {
  /** раскрытая позиция; открыта всегда одна — лента остаётся лентой */
  const [openId, setOpenId] = useState('')

  const c = calcAll(S)
  const km = routeKm(S)
  const dist = S.trip.dist
  const dnt = dist.nt ?? {}
  const baseKm = dist.src === 'auto' ? dist.auto : dist.manual
  const people = S.people.length
  const canVol = S.doc?.canVol > 0 ? S.doc.canVol : 20

  /** Полоска чередования: считаем только по строкам данных, разделители не в счёт. */
  let z = 0
  const stripe = () => z++ % 2 === 1

  const isOpen = (id: string) => openId === id || fresh === id
  const toggle = (id: string) => setOpenId(isOpen(id) ? '' : id)

  /** Подпись числа пробега из документа: правим только своё поле. */
  const noteDist = (key: string, part: 't' | 'c', v: string) =>
    update((s) => {
      const d = s.trip.dist
      d.nt = noteBag(d.nt, key)
      d.nt[key][part] = v
    })

  /* ─────────── пробег ─────────── */

  const kmRow = (
    <StripRow
      key="d-km"
      zebra={stripe()}
      open={isOpen('road-km')}
      onToggle={() => toggle('road-km')}
      title="Пробег"
      sub={`${kmLabel(baseKm)} ${kBackWord(dist.kBack)}, ${kmLabel(dist.local)} на месте`}
      right={kmLabel(km)}
    >
      <StripField
        wide
        label={
          <Title
            title={dnt.manual?.t || 'Расстояние в одну сторону'}
            onTitle={(v) => noteDist('manual', 't', v)}
            text={dnt.manual?.c ?? ''}
            onText={(v) => noteDist('manual', 'c', v)}
            can={canEdit}
          />
        }
      >
        <InlineNum
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
          className="text-body font-semibold text-ink"
        />
      </StripField>

      <StripField
        wide
        label={
          <Title
            title={dnt.kBack?.t || 'Сколько концов пути'}
            onTitle={(v) => noteDist('kBack', 't', v)}
            text={dnt.kBack?.c ?? ''}
            onText={(v) => noteDist('kBack', 'c', v)}
            can={canEdit}
          />
        }
      >
        <InlineNum
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
          className="text-body font-semibold text-ink"
        />
      </StripField>

      <StripField
        wide
        label={
          <Title
            title={dnt.local?.t || 'Местные разъезды'}
            onTitle={(v) => noteDist('local', 't', v)}
            text={dnt.local?.c ?? ''}
            onText={(v) => noteDist('local', 'c', v)}
            can={canEdit}
          />
        }
      >
        <InlineNum
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
          className="text-body font-semibold text-ink"
        />
      </StripField>

      {/* ⚠️ Это ОБЩИЙ пробег, и он запасной: у каждой единицы техники теперь
          свой (calc.kmOf, группа «Свой пробег» в раскрытии её строки). Общее
          число идёт только той технике, которая своей цифры ещё не получила —
          и молчать об этом нельзя, иначе человек правил бы его и не понимал,
          почему в машине ничего не поменялось. */}
      <StripField label="Технике без своей цифры">
        <Result>{kmLabel(km)}</Result>
      </StripField>
    </StripRow>
  )

  /* ─────────── топливо и техника ─────────── */

  const fuels = [...S.fuelPrices].sort((a, b) => a.ord - b.ord)
  /* Топливо без цены и без техники не рисуем: строка «Дизель — 0 ₽» ничего
     не сообщает. Из документа оно при этом никуда не девается. */
  const shownFuels = fuels.filter((f) => f.price > 0 || S.transport.some((t) => t.fuel === f.i))

  const fuelRows: ReactNode[] = []

  for (const f of shownFuels) {
    const mine = [...S.transport].filter((t) => t.fuel === f.i).sort((a, b) => a.ord - b.ord)
    const need = mine.reduce((sum, t) => sum + litres(t, S), 0)
    const priceUnit = f.nt?.price?.u || f.u || '₽/л'
    const priceTitle = f.nt?.price?.t || `Цена ${f.n}`

    fuelRows.push(
      <StripRow
        key={'f-' + f.i}
        zebra={stripe()}
        open={isOpen('fuel-' + f.i)}
        onToggle={() => toggle('fuel-' + f.i)}
        title={priceTitle}
        sub={need > 0 ? `Нужно ${litresLabel(need)}` : 'Топливу техники не назначено'}
        right={numText(f.price, dg(f.price))}
        rightHint={priceUnit}
      >
        <StripField label="Название" wide>
          <Title
            title={priceTitle}
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
        </StripField>

        <StripField label="Цена">
          <InlineNum
            value={f.price}
            digits={dg(f.price)}
            kind="plain"
            unit={priceUnit}
            label={priceTitle}
            can={canEdit}
            onSave={(v) =>
              patchFuel(f.i, (x) => {
                x.price = v
              })
            }
            className="text-body font-semibold text-ink"
          />
        </StripField>
      </StripRow>,
    )

    for (const t of mine) {
      const vol = litres(t, S)
      /* Комментарий строки: свой, а если его нет — тот, что стоит у числа
         в документе. Правится ровно тот, который показан. */
      const ck = t.c
        ? ''
        : t.nt?.rate?.c
          ? 'rate'
          : t.nt?.hours?.c
            ? 'hours'
            : t.nt?.litres?.c
              ? 'litres'
              : ''
      const name = t.calcT || (t.n ? `Бензин ${fuelName(S, t.fuel)} ${DASH} ${t.n}` : '')

      fuelRows.push(
        <StripRow
          key={'t-' + t.i}
          dataHit={t.i}
          zebra={stripe()}
          open={isOpen(t.i)}
          onToggle={() => toggle(t.i)}
          title={name || 'Без названия'}
          sub={transportSub(t, S)}
          right={money(fuelCost(t, S), S.doc)}
          rightHint={litresLabel(vol)}
        >
          <StripField label="Название" wide>
            <Title
              title={name}
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
          </StripField>

          <SetupGroup title="Сколько и почём">
            {t.rateU === 'lh' ? (
              <StripField label="Моточасы">
                <InlineNum
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
                  className="text-body font-semibold text-ink"
                />
              </StripField>
            ) : t.rateU === 'fix' ? null : (
              /* Пробег у каждой единицы техники СВОЙ (calc.kmOf) — заказчик
                 06.08.2026: «Каждая строка показывает свой пробег и свою сумму
                 итоговую по деньгам». Правится он ниже, в группе «Свой пробег»;
                 здесь — то число, которое сейчас идёт в литры. */
              <StripField label="Километры">
                <Calc>{kmLabel(kmOf(t, S))}</Calc>
              </StripField>
            )}

            {t.rateU === 'fix' ? null : (
              <StripField label="Расход">
                <InlineNum
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
                  className="text-body font-semibold text-ink"
                />
              </StripField>
            )}

            <StripField label="Литры">
              {t.rateU === 'fix' ? (
                <InlineNum
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
                  className="text-body font-semibold text-ink"
                />
              ) : (
                <Calc>{litresLabel(vol)}</Calc>
              )}
            </StripField>

            {/* Цена общая для всего топлива этой группы: правка здесь меняет её
                и в строке цены, и у соседней техники на том же бензине. */}
            <StripField label="Цена топлива">
              <InlineNum
                value={f.price}
                digits={dg(f.price)}
                kind="plain"
                unit={priceUnit}
                label={`${priceTitle} — общая для всей техники на этом топливе`}
                can={canEdit}
                onSave={(v) =>
                  patchFuel(f.i, (x) => {
                    x.price = v
                  })
                }
                className="text-body font-semibold text-ink"
              />
            </StripField>
          </SetupGroup>

          {/* Пила и прочая техника с готовым объёмом топлива километров
              не наматывает — полки о пробеге ей не нужны. */}
          {t.rateU === 'fix' ? null : <TransportKm item={t} S={S} canEdit={canEdit} />}

          <TransportSetup item={t} S={S} canEdit={canEdit} />

          {/* Кто выложил деньги за это топливо и между кем оно делится —
              прямо здесь, без шторки (постулат 2). Пустое = как было. */}
          <SetupGroup title="Кто платит">
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
            {/* «То же самое касается бензина» (08.08.2026). */}
            <SpendSplitLine
              split={spendSplit(fuelCost(t, S), t.payer ?? t.owner, t.sp, S)}
              S={S}
              className="mt-1"
            />
          </SetupGroup>

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

          {canDel(t) ? (
            <div className="mt-2 flex justify-end border-t border-line/50 pt-2">
              <RowActions>
                <RowAction
                  icon={Trash2}
                  tone="danger"
                  label={`Убрать «${t.n || 'без названия'}»`}
                  onClick={() => onDelTransport(t)}
                />
              </RowActions>
            </div>
          ) : null}
        </StripRow>,
      )
    }
  }

  /* ─────────── аренда и парковка ─────────── */

  const rent = [...S.rent].sort((a, b) => a.ord - b.ord)
  const rentRows: ReactNode[] = []

  if (rent.length === 0) {
    rentRows.push(
      <StripRow
        key="r-none"
        zebra={stripe()}
        disclose={false}
        open={false}
        onToggle={() => {}}
        title="Ничего не арендуем"
        sub="Ни лодки, ни парковки, ни домика"
      >
        {null}
      </StripRow>,
    )
  }

  for (const r of rent) {
    const ck = r.c
      ? ''
      : r.nt?.price?.c
        ? 'price'
        : r.nt?.qty?.c
          ? 'qty'
          : r.nt?.count?.c
            ? 'count'
            : ''

    rentRows.push(
      <StripRow
        key={'r-' + r.i}
        dataHit={r.i}
        zebra={stripe()}
        alarm={!!r.warn}
        open={isOpen(r.i)}
        onToggle={() => toggle(r.i)}
        title={r.calcT || r.n || 'Без названия'}
        /* ⚠️ Предупреждение читается БЕЗ раскрытия. Прежде о нём говорила одна
           полоса тревоги слева, а сам текст лежал внутри: на телефоне человек
           видел, что что-то не так, но не знал что. Теперь сама фраза стоит
           второй строкой полоски — как «не может взять» в «Сборах». Целиком
           (в несколько строк) она по-прежнему читается в раскрытии. */
        sub={
          r.warn ? (
            <span className="font-semibold text-accent-text">
              <TriangleAlert
                size={14}
                strokeWidth={1.75}
                aria-hidden
                className="mr-1 inline align-[-2px]"
              />
              {r.warn}
            </span>
          ) : (
            `${rentCatName(r, S)} · ${rentQtyLabel(r)} × ${numText(r.count)}${NBSP}шт.`
          )
        }
        right={money(rentSum(r), S.doc)}
        rightHint={`${money(r.price, S.doc)} ${rentPer(r)}`}
      >
        <StripField label="Название" wide>
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
            can={canEdit}
          />
        </StripField>

        <SetupGroup title="Сколько и почём">
          <RentUnitField item={r} canEdit={canEdit} />

          <StripField label="Сколько">
            <InlineNum
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
              className="text-body font-semibold text-ink"
            />
          </StripField>

          <StripField label="Штук">
            <InlineNum
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
              className="text-body font-semibold text-ink"
            />
          </StripField>

          <StripField label="Цена">
            <InlineNum
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
              className="text-body font-semibold text-ink"
            />
          </StripField>
        </SetupGroup>

        <RentSetup item={r} S={S} canEdit={canEdit} />

        <SetupGroup title="Кто платит">
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
          <SpendSplitLine split={spendSplit(rentSum(r), r.payer, r.sp, S)} S={S} className="mt-1" />
        </SetupGroup>

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

        {canDel(r) ? (
          <div className="mt-2 flex justify-end border-t border-line/50 pt-2">
            <RowActions>
              <RowAction
                icon={Trash2}
                tone="danger"
                label={`Убрать «${r.n || 'без названия'}»`}
                onClick={() => onDelRent(r)}
              />
            </RowActions>
          </div>
        ) : null}
      </StripRow>,
    )
  }

  /* ─────────── канистры ─────────── */

  /* Строки блока — из документа (canRows), плюс топливо, которое везут с собой,
     а строки для него в документе ещё нет. */
  const canFuels = [
    ...new Set([
      ...[...S.canRows].sort((a, b) => a.ord - b.ord).map((r) => r.fuel),
      ...c.cans.map((x) => x.fuel),
    ]),
  ]

  const canRows = canFuels.map((fuelId) => {
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

    const litresWord = carried
      ? `${litresLabel(carried.litres)} везём с собой`
      : azs > 0
        ? `${litresLabel(azs)} заливаем на АЗС`
        : 'Ни канистр, ни заправки'

    return (
      <StripRow
        key={'c-' + fuelId}
        zebra={stripe()}
        open={isOpen('can-' + fuelId)}
        onToggle={() => toggle('can-' + fuelId)}
        title={row?.t || `${fuelName(S, fuelId)} ${DASH} везём с собой`}
        sub={litresWord}
        right={
          carried
            ? `${numText(carried.cans)}${NBSP}${plural(carried.cans, 'канистра', 'канистры', 'канистр')}`
            : DASH
        }
      >
        <StripField label="Название" wide>
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
        </StripField>

        {carried ? (
          <StripField label="Объём канистры — общий">
            <InlineNum
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
              className="text-body font-semibold text-ink"
            />
          </StripField>
        ) : null}

        <StripField label="Литров">
          <Calc>{carried ? litresLabel(carried.litres) : azs > 0 ? litresLabel(azs) : DASH}</Calc>
        </StripField>

        <StripField label="Канистр">
          {carried ? (
            <Result>
              {`${numText(carried.cans)}${NBSP}${plural(carried.cans, 'канистра', 'канистры', 'канистр')}`}
            </Result>
          ) : (
            <Calc>{DASH}</Calc>
          )}
        </StripField>
      </StripRow>
    )
  })

  /* ─────────── итоги ─────────── */

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

  const sumRows = totals.map((t) => {
    const shown = S.tileLabels?.[t.slot]?.trim() || t.label
    /* Сюда приходит тап по плитке с обложки: там та же сумма без объяснения,
       здесь — с разбором, откуда она взялась (`trip/MoneyTiles.tsx`, У-98). */
    const hit = 'sum-' + t.slot
    if (!canEdit) {
      return (
        <StripRow
          key={hit}
          dataHit={hit}
          zebra={stripe()}
          disclose={false}
          open={false}
          onToggle={() => {}}
          title={shown}
          sub={t.text}
          right={money(t.sum, S.doc)}
        >
          {null}
        </StripRow>
      )
    }
    return (
      <StripRow
        key={hit}
        dataHit={hit}
        zebra={stripe()}
        open={isOpen(hit)}
        onToggle={() => toggle(hit)}
        title={shown}
        sub={t.text}
        right={money(t.sum, S.doc)}
      >
        <StripField label="Как называется в листе" wide>
          <InlineText
            value={shown}
            onSave={(v) =>
              update((s) => {
                /* Форму хранения не меняем: слияние отдаёт tileLabels целиком,
                   и подмена массива словарём стёрла бы подписи первой версии. */
                const bag = [...(s.tileLabels ?? [])]
                while (bag.length < 4) bag.push('')
                bag[t.slot] = v === t.label ? '' : v
                s.tileLabels = bag
              })
            }
            can
            label="Название строки итога"
            placeholder={t.label}
            className="text-body font-[650] text-ink"
          />
        </StripField>
      </StripRow>
    )
  })

  /* ─────────── показ ─────────── */

  return (
    <div>
      <div role="list" aria-label="Пробег">
        {kmRow}
      </div>

      <Caption>Топливо и техника</Caption>
      <div role="list" aria-label="Топливо и техника">
        {fuelRows}
      </div>
      {canEdit && (
        <div className="border-t border-line">
          <AddRow label="Добавить технику" onClick={onAddTransport} />
        </div>
      )}

      <Caption>Аренда и парковка</Caption>
      <div role="list" aria-label="Аренда и парковка">
        {rentRows}
      </div>
      {canEdit && (
        <div className="border-t border-line">
          <AddRow label="Добавить аренду" onClick={onAddRent} />
        </div>
      )}

      {canRows.length > 0 && (
        <>
          <Caption>Канистры</Caption>
          <div role="list" aria-label="Канистры">
            {canRows}
          </div>
        </>
      )}

      <Caption>Итоги поездки</Caption>
      <div role="list" aria-label="Итоги поездки">
        {sumRows}
        {c.personal > 0 ? (
          <StripRow
            key="sum-personal"
            zebra={stripe()}
            disclose={false}
            open={false}
            onToggle={() => {}}
            title="Личное"
            sub="Свои покупки, в общий делёж не входят"
            right={money(c.personal, S.doc)}
          >
            {null}
          </StripRow>
        ) : null}
      </div>
    </div>
  )
}

/**
 * Разделитель ленты — имя группы расчёта.
 *
 * Оформлен ровно как шапка группы в матрице (`DataCell head`): «ТОПЛИВО
 * И ТЕХНИКА», «АРЕНДА И ПАРКОВКА», «КАНИСТРЫ», «ИТОГИ ПОЕЗДКИ» — те же слова
 * и тот же вид, что на листе заказчика.
 */
function Caption({ children }: { children: ReactNode }) {
  return (
    <div className="border-y border-line bg-zebra px-4 py-2 text-micro font-bold tracking-wider text-muted uppercase">
      {children}
    </div>
  )
}
