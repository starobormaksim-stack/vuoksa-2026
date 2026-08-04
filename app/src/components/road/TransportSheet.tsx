import { useState, type ReactNode } from 'react'
import { Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import type { LegMode, RateUnitId, State, Transport } from '@/lib/types'
import { fuelPriceOf, litres, money, routeKm } from '@/lib/calc'
import {
  Btn, EditNum, NumberSheet, PickSheet, ResponsiveSheet, ResultNum, SheetRow, TextSheet,
  type PickOption,
} from '@/components/flops'
import { Switch } from '@/components/ui/switch'
import { fmtNum, NBSP } from '@/format'
import {
  fuelName, kindName, kmLabel, legName, litreWord, litresLabel,
  RATE_HINTS, RATE_TITLES, transportSub,
} from './roadx'

/**
 * Карточка единицы техники (docs/v2-ux-redesign.md, 10.4).
 *
 * Формула бензина разобрана на нумерованные ступени: человек читает сверху вниз
 * как рассказ и видит, где вмешаться. Ни одного знака операции на экране,
 * ни одного поля ввода в самой карточке — числа правит NumberSheet.
 *
 * Подписи из данных (nt.<поле>.t / .u / .c) не теряются: `.t` становится
 * заголовком экрана правки, `.u` — единицей у числа, `.c` — пояснением под ступенью.
 */

/** Что открыто вторым уровнем. */
type Level2 =
  | null | 'rate' | 'hours' | 'litres' | 'price'
  | 'name' | 'kind' | 'kindT' | 'fuel' | 'owner' | 'rateU' | 'leg' | 'calcT' | 'note'

interface Props {
  item: Transport
  S: State
  /** правка разрешена: владелец и редактор */
  canEdit: boolean
  canDelete: boolean
  onPatch: (f: (t: Transport) => void) => void
  /** цена топлива живёт в справочнике, а не в технике */
  onFuelPrice: (fuelId: string, v: number) => void
  onDelete: () => void
  onClose: () => void
}

/** Одна ступень разбора: номер, о чём она и что в ней стоит. */
interface StepDef {
  title: string
  body: ReactNode
  note?: string
}

export function TransportSheet({
  item, S, canEdit, canDelete, onPatch, onFuelPrice, onDelete, onClose,
}: Props) {
  const [lvl, setLvl] = useState<Level2>(null)
  const back = () => setLvl(null)
  const go = (l: Level2) => (canEdit ? () => setLvl(l) : undefined)

  const nt = (k: string) => item.nt?.[k]
  const fuel = S.fuelPrices.find((f) => f.i === item.fuel)
  const price = fuelPriceOf(S, item.fuel)
  const vol = litres(item, S)
  const sum = vol * price
  const fuelNt = fuel?.nt?.price

  /* ── ступени: их состав зависит от того, как считается расход ── */
  const steps: StepDef[] = []
  if (item.rateU === 'lh') {
    steps.push({
      title: 'Работает',
      body: (
        <Line>
          <EditNum onClick={go('hours')} label="Сколько часов работает">
            {fmtNum(item.hours, 1)}
          </EditNum>{' '}
          часов
        </Line>
      ),
      note: nt('hours')?.c,
    })
    steps.push({
      title: 'Тратит',
      body: (
        <Line>
          <EditNum onClick={go('rate')} label="Расход в час">
            {fmtNum(item.rate, 1)}
          </EditNum>{' '}
          л в час
        </Line>
      ),
      note: nt('rate')?.c,
    })
    steps.push({
      title: 'Значит уйдёт',
      body: <ResultNum>{`${fmtNum(vol, 1)}${NBSP}${litreWord(vol)}`}</ResultNum>,
    })
  } else if (item.rateU === 'fix') {
    steps.push({
      title: 'Заливаем разом',
      body: (
        <Line>
          <EditNum onClick={go('litres')} label="Сколько литров заливаем">
            {fmtNum(item.litres, 1)}
          </EditNum>{' '}
          {litreWord(item.litres)}
        </Line>
      ),
      note: nt('litres')?.c,
    })
  } else {
    steps.push({
      title: 'Проезжаем',
      body: <ResultNum>{kmLabel(routeKm(S))}</ResultNum>,
      note: 'Пробег общий на всю поездку — он правится в блоке «Сколько едем».',
    })
    steps.push({
      title: 'Тратит',
      body: (
        <Line>
          <EditNum onClick={go('rate')} label="Расход на 100 км">
            {fmtNum(item.rate, 1)}
          </EditNum>{' '}
          л на каждые 100 км
        </Line>
      ),
      note: nt('rate')?.c,
    })
    steps.push({
      title: 'Значит уйдёт',
      body: <ResultNum>{`${fmtNum(vol, 1)}${NBSP}${litreWord(vol)}`}</ResultNum>,
    })
  }
  steps.push({
    title: `По цене ${fuelName(S, item.fuel)}`,
    body: (
      <Line>
        <EditNum onClick={go('price')} label={`Цена ${fuelName(S, item.fuel)}`}>
          {`${fmtNum(price, 1)}${NBSP}₽`}
        </EditNum>{' '}
        за литр
      </Line>
    ),
    note: fuelNt?.c,
  })

  const ntList = Object.entries(item.nt ?? {}).filter(([, n]) => n && n.t)

  const peopleOptions: PickOption[] = [
    { id: '', title: 'Ничья', hint: 'техника общая — хозяин не назначен' },
    ...S.people.map((p) => ({ id: p.id, title: p.name, hint: p.car || p.role })),
  ]

  return (
    <>
      <ResponsiveSheet
        open={lvl === null}
        onOpenChange={(v) => !v && onClose()}
        title={item.n}
        subtitle={transportSub(item, S)}
        footer={
          <Btn scale="lg" className="w-full" onClick={onClose}>
            Готово
          </Btn>
        }
      >
        <div className="rounded-2xl border border-line bg-bg p-3">
          {steps.map((s, idx) => (
            <div key={s.title} className="flex gap-3 py-1.5">
              <span
                aria-hidden
                className="tnum mt-1 grid size-6 shrink-0 place-items-center rounded-full border border-accent text-[13px] font-bold text-accent-text"
              >
                {idx + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-semibold text-muted">{s.title}</div>
                <div className="mt-0.5">{s.body}</div>
                {s.note ? (
                  <p className="mt-1 text-[13px] leading-snug text-muted">{s.note}</p>
                ) : null}
              </div>
            </div>
          ))}

          <div className="mt-2 flex items-center gap-3 rounded-xl bg-accent-soft px-3 py-3">
            <span className="flex-1 text-[15px] font-[650] text-ink">Итого</span>
            <span className="tnum text-2xl font-bold text-ink">{money(sum, S.doc)}</span>
          </div>
        </div>

        {item.c ? <p className="mt-3 text-sm leading-snug text-muted">{item.c}</p> : null}

        <div className="mt-3">
          <SheetRow label="Название" value={item.n} onClick={go('name')} />
          <SheetRow label="Вид" value={kindName(item, S)} onClick={go('kind')} />
          {item.kindT ? (
            <SheetRow label="Свой вид" value={item.kindT} onClick={go('kindT')} />
          ) : null}
          <SheetRow label="Топливо" value={fuelName(S, item.fuel)} onClick={go('fuel')} />
          <SheetRow
            label="Чья"
            value={S.people.find((p) => p.id === item.owner)?.name ?? 'ничья'}
            empty={!item.owner}
            onClick={go('owner')}
          />
          <SheetRow
            label="Расход считаем"
            value={RATE_TITLES[item.rateU] ?? item.rateU}
            hint={RATE_HINTS[item.rateU]}
            onClick={go('rateU')}
          />
          <SheetRow
            label="Как идёт"
            value={legName(item.leg)}
            empty={!item.leg}
            onClick={go('leg')}
          />

          {canEdit ? (
            <div className="flex min-h-14 items-center gap-3 border-b border-line/70 px-1">
              <label
                htmlFor={`carry-${item.i}`}
                className="min-w-0 flex-1 py-2 text-[15px] font-medium text-muted"
              >
                Везём в канистрах
              </label>
              <Switch
                id={`carry-${item.i}`}
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
            </div>
          ) : (
            <SheetRow label="Везём в канистрах" value={item.carry ? 'да' : 'нет'} />
          )}

          <SheetRow
            label="Подпись в расчёте"
            value={item.calcT || 'собирается сама'}
            empty={!item.calcT}
            onClick={go('calcT')}
          />
          <SheetRow
            label="Примечание"
            value={item.c || 'нет'}
            empty={!item.c}
            onClick={go('note')}
          />
        </div>

        {/* Подписи полей из документа: заголовок и единица каждого числа.
            Экраны правки видит только редактор — здесь они остаются на виду у всех. */}
        {ntList.length > 0 && (
          <div className="mt-4 rounded-xl border border-line bg-bg p-3">
            <div className="text-[13px] font-semibold text-muted">Как подписано в документе</div>
            <ul className="mt-1">
              {ntList.map(([key, note]) => (
                <li key={key} className="text-[13px] leading-snug text-muted">
                  {note.t}
                  {note.u ? ` · ${note.u}` : ''}
                </li>
              ))}
            </ul>
          </div>
        )}

        {canDelete && (
          <div className="mt-6 border-t border-line pt-4">
            <Btn
              tone="danger"
              className="w-full"
              onClick={() => {
                onDelete()
                onClose()
              }}
            >
              <Trash2 size={18} strokeWidth={1.5} aria-hidden />
              Убрать технику
            </Btn>
          </div>
        )}
      </ResponsiveSheet>

      {/* ─── второй уровень ─── */}
      <NumberSheet
        open={lvl === 'rate'}
        onOpenChange={(v) => !v && back()}
        onBack={back}
        title={nt('rate')?.t || 'Расход'}
        subtitle={item.rateU === 'lh' ? 'Литров в час' : 'Литров на 100 км'}
        value={item.rate}
        kind={item.rateU === 'lh' ? 'lh' : 'l100'}
        unit={nt('rate')?.u || (item.rateU === 'lh' ? 'л/ч' : 'л/100 км')}
        hint={(v) =>
          item.rateU === 'lh'
            ? `Выйдет ${litresLabel(v * item.hours)}`
            : `Выйдет ${litresLabel((routeKm(S) * v) / 100)}`
        }
        onChange={(v) =>
          onPatch((t) => {
            t.rate = v
          })
        }
      />
      <NumberSheet
        open={lvl === 'hours'}
        onOpenChange={(v) => !v && back()}
        onBack={back}
        title={nt('hours')?.t || 'Моточасы'}
        subtitle={item.n}
        value={item.hours}
        kind="hours"
        unit={nt('hours')?.u || 'ч'}
        hint={(v) => `Выйдет ${litresLabel(v * item.rate)}`}
        onChange={(v) =>
          onPatch((t) => {
            t.hours = v
          })
        }
      />
      <NumberSheet
        open={lvl === 'litres'}
        onOpenChange={(v) => !v && back()}
        onBack={back}
        title={nt('litres')?.t || 'Сколько литров'}
        subtitle={item.n}
        value={item.litres}
        kind="litres"
        unit={nt('litres')?.u || 'л'}
        hint={(v) => `Выйдет ${money(v * price, S.doc)}`}
        onChange={(v) =>
          onPatch((t) => {
            t.litres = v
          })
        }
      />
      <NumberSheet
        open={lvl === 'price'}
        onOpenChange={(v) => !v && back()}
        onBack={back}
        title={fuelNt?.t || `Цена ${fuelName(S, item.fuel)}`}
        subtitle={fuelNt?.c}
        value={price}
        kind="fuelPrice"
        unit={fuelNt?.u || fuel?.u || '₽/л'}
        hint={(v) => `За ${litresLabel(vol)} выйдет ${money(vol * v, S.doc)}`}
        onChange={(v) => onFuelPrice(item.fuel, v)}
      />

      <TextSheet
        open={lvl === 'name'}
        onOpenChange={(v) => !v && back()}
        onBack={back}
        title="Название"
        subtitle={kindName(item, S)}
        value={item.n}
        onDone={(v) =>
          v &&
          onPatch((t) => {
            t.n = v
          })
        }
      />
      <PickSheet
        open={lvl === 'kind'}
        onOpenChange={(v) => !v && back()}
        onBack={back}
        title="Вид техники"
        subtitle={item.n}
        value={item.kind}
        options={[...S.kinds]
          .sort((a, b) => a.ord - b.ord)
          .map((k) => ({
            id: k.i,
            title: k.t,
            hint: `расход считаем ${RATE_TITLES[k.rateU] ?? k.rateU}`,
          }))}
        onPick={(id) =>
          onPatch((t) => {
            t.kind = id
            const k = S.kinds.find((x) => x.i === id)
            /* Вид задаёт и то, как считается расход: у мотора это часы, у пилы — объём. */
            if (k) t.rateU = k.rateU
          })
        }
      />
      <TextSheet
        open={lvl === 'kindT'}
        onOpenChange={(v) => !v && back()}
        onBack={back}
        title="Свой вид"
        subtitle={item.n}
        value={item.kindT}
        placeholder="Например, снегоход"
        onDone={(v) =>
          onPatch((t) => {
            t.kindT = v
          })
        }
      />
      <PickSheet
        open={lvl === 'fuel'}
        onOpenChange={(v) => !v && back()}
        onBack={back}
        title="Топливо"
        subtitle={item.n}
        value={item.fuel}
        options={[...S.fuelPrices]
          .sort((a, b) => a.ord - b.ord)
          .map((f) => ({
            id: f.i,
            title: f.n,
            hint: f.price > 0 ? `${fmtNum(f.price, 1)}${NBSP}₽ за литр` : 'цена не вписана',
          }))}
        onPick={(id) =>
          onPatch((t) => {
            t.fuel = id
          })
        }
      />
      <PickSheet
        open={lvl === 'owner'}
        onOpenChange={(v) => !v && back()}
        onBack={back}
        title="Чья техника"
        subtitle={item.n}
        value={item.owner}
        options={peopleOptions}
        onPick={(id) =>
          onPatch((t) => {
            t.owner = id
          })
        }
      />
      <PickSheet
        open={lvl === 'rateU'}
        onOpenChange={(v) => !v && back()}
        onBack={back}
        title="Как считаем расход"
        subtitle={item.n}
        value={item.rateU}
        options={S.rateUnits.map((u) => ({
          id: u.i,
          title: RATE_TITLES[u.i] ?? u.t,
          hint: `${u.t} — ${RATE_HINTS[u.i] ?? ''}`,
        }))}
        onPick={(id) =>
          onPatch((t) => {
            t.rateU = id as RateUnitId
          })
        }
      />
      <PickSheet
        open={lvl === 'leg'}
        onOpenChange={(v) => !v && back()}
        onBack={back}
        title="Как идёт"
        subtitle={item.n}
        value={item.leg}
        options={[
          { id: 'road', title: 'По дороге', hint: 'идёт своим ходом по трассе' },
          { id: 'water', title: 'По воде', hint: 'работает на воде' },
          { id: 'walk', title: 'Пешком', hint: 'несём с собой' },
        ]}
        onPick={(id) =>
          onPatch((t) => {
            t.leg = id as LegMode
          })
        }
      />
      <TextSheet
        open={lvl === 'calcT'}
        onOpenChange={(v) => !v && back()}
        onBack={back}
        title="Подпись в расчёте"
        subtitle="Так строка называется в общем расчёте"
        value={item.calcT}
        placeholder={`Бензин ${fuelName(S, item.fuel)} — ${item.n}`}
        onDone={(v) =>
          onPatch((t) => {
            t.calcT = v
          })
        }
      />
      <TextSheet
        open={lvl === 'note'}
        onOpenChange={(v) => !v && back()}
        onBack={back}
        title="Примечание"
        subtitle={item.n}
        value={item.c}
        multiline
        placeholder="Что важно помнить про эту технику"
        onDone={(v) =>
          onPatch((t) => {
            t.c = v
          })
        }
      />
    </>
  )
}

/** Строка живой фразы внутри ступени: 17 px, число внутри — кнопка. */
function Line({ children }: { children: ReactNode }) {
  return <span className="text-[17px] leading-snug text-ink">{children}</span>
}
