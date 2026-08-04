import { useState } from 'react'
import { toast } from 'sonner'
import type { LegMode, Notes, RateUnitId, State, Transport } from '@/lib/types'
import { litres } from '@/lib/calc'
import {
  Btn, InlineText, PickSheet, ResponsiveSheet, SheetRow, type PickOption,
} from '@/components/flops'
import { Switch } from '@/components/ui/switch'
import { fmtNum, MDASH, NBSP } from '@/format'
import {
  fuelName, kindName, legName, litresLabel, RATE_HINTS, RATE_TITLES, transportSub,
} from './roadx'

/**
 * Карточка техники — только выбор из списков и подписи.
 *
 * ⚠️ Числа отсюда ушли: расход, моточасы, литры и цена топлива правятся прямо
 * в строке таблицы «Расчёт дороги» (заказчик 04.08.2026: «мне не нужен поп-ап,
 * в котором всё написано; это прямо вот здесь, в этой таблице уже должно быть»).
 * Ушёл и разбор формулы живой фразой: он пересказывал то же самое третий раз.
 *
 * Осталось то, что выбирается из готового списка и в узкую ячейку таблицы
 * не помещается: вид техники, топливо, хозяин, способ считать расход, участок
 * пути. Плюс подписи чисел из документа заказчика (nt.<поле>) — их видно
 * и правится всё, что видно.
 */

/** Что открыто вторым уровнем. */
type Level2 = null | 'kind' | 'fuel' | 'owner' | 'rateU' | 'leg'

interface Props {
  item: Transport
  S: State
  /** правка разрешена: владелец и редактор */
  canEdit: boolean
  onPatch: (f: (t: Transport) => void) => void
  onClose: () => void
}

export function TransportSheet({ item, S, canEdit, onPatch, onClose }: Props) {
  const [lvl, setLvl] = useState<Level2>(null)
  const back = () => setLvl(null)
  const go = (l: Level2) => (canEdit ? () => setLvl(l) : undefined)
  const vol = litres(item, S)

  const peopleOptions: PickOption[] = [
    { id: '', title: 'Ничья', hint: 'техника общая — хозяин не назначен' },
    ...S.people.map((p) => ({ id: p.id, title: p.name, hint: p.car || p.role })),
  ]

  return (
    <>
      <ResponsiveSheet
        open={lvl === null}
        onOpenChange={(v) => !v && onClose()}
        title={item.n || 'Техника'}
        subtitle={transportSub(item, S)}
        footer={
          <Btn scale="lg" className="w-full" onClick={onClose}>
            Готово
          </Btn>
        }
      >
        <div className="border-b border-line pb-3">
          <div className="text-note font-semibold text-muted">Название техники</div>
          <InlineText
            value={item.n}
            onSave={(v) =>
              onPatch((t) => {
                t.n = v
              })
            }
            can={canEdit}
            required
            label="Название техники"
            placeholder="Например, Chevrolet Aveo"
            className="text-body font-[650] text-ink"
          />
        </div>

        <div className="mt-1">
          <SheetRow label="Вид" value={kindName(item, S)} onClick={go('kind')} />
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
          <SheetRow label="Как идёт" value={legName(item.leg)} empty={!item.leg} onClick={go('leg')} />

          {canEdit ? (
            <div className="flex min-h-14 items-center gap-3 border-b border-line px-1">
              <label
                htmlFor={`carry-${item.i}`}
                className="min-w-0 flex-1 py-2 text-body font-medium text-muted"
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
        </div>

        {item.kindT || !kindOfKnown(item, S) ? (
          <div className="mt-3">
            <div className="text-note font-semibold text-muted">Свой вид техники</div>
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
          </div>
        ) : null}

        <div className="mt-3">
          <div className="text-note font-semibold text-muted">Примечание</div>
          <InlineText
            value={item.c}
            onSave={(v) =>
              onPatch((t) => {
                t.c = v
              })
            }
            can={canEdit}
            multiline
            label="Примечание"
            placeholder="Что важно помнить про эту технику"
            className="text-body leading-snug text-ink"
          />
        </div>

        <DocNotes
          nt={item.nt}
          can={canEdit}
          onSave={(key, part, v) =>
            onPatch((t) => {
              if (!t.nt) t.nt = {}
              if (!t.nt[key]) t.nt[key] = { t: '' }
              t.nt[key][part] = v
            })
          }
        />
      </ResponsiveSheet>

      {/* ─── второй уровень: выбор из списка ─── */}
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
          hint: `${u.t} ${MDASH} ${RATE_HINTS[u.i] ?? ''}`,
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
    </>
  )
}

/** Есть ли этот вид в справочнике: своё название нужно только тогда, когда нет. */
function kindOfKnown(t: Transport, S: State): boolean {
  return S.kinds.some((k) => k.i === t.kind)
}

/**
 * Подписи чисел из документа заказчика: заголовок, единица и пояснение.
 * В таблице у числа стоит имя столбца, а своя подпись строки живёт здесь —
 * и правится, как всё остальное.
 */
export function DocNotes({
  nt, can, onSave,
}: {
  nt: Notes | undefined
  can: boolean
  onSave: (key: string, part: 't' | 'u' | 'c', v: string) => void
}) {
  const list = Object.entries(nt ?? {})
  if (list.length === 0) return null
  return (
    <div className="mt-4 rounded-xl border border-line bg-bg p-3">
      <div className="text-note font-semibold text-muted">Как подписано в документе</div>
      {list.map(([key, n]) => (
        <div key={key} className="mt-2">
          <InlineText
            value={n.t}
            onSave={(v) => onSave(key, 't', v)}
            can={can}
            label="Подпись числа"
            placeholder="Подпись"
            className="text-body leading-snug text-ink"
          />
          <InlineText
            value={n.u ?? ''}
            onSave={(v) => onSave(key, 'u', v)}
            can={can}
            label="Единица измерения"
            placeholder="Единица"
            className="text-note text-muted"
          />
          <InlineText
            value={n.c ?? ''}
            onSave={(v) => onSave(key, 'c', v)}
            can={can}
            multiline
            label="Пояснение"
            placeholder="Пояснение"
            className="text-note leading-snug text-muted"
          />
        </div>
      ))}
    </div>
  )
}
