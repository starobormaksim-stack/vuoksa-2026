import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import type { Buy, BuyStatus, State } from '@/lib/types'
import type { Perms } from '@/lib/perm'
import { money } from '@/lib/calc'
import { buyLine, priceOf, statusName, statusOptions, sumOf, unitOf } from '@/lib/buyx'
import {
  Btn, NumberSheet, PickSheet, ResponsiveSheet, SheetRow, TextSheet,
  type PickOption,
} from '@/components/flops'
import { fmtNum, NBSP } from '@/format'

/**
 * Карточка позиции закупки (docs/v2-ux-redesign.md, 4.2 и 9.3).
 * Каждая строка внутри — кнопка, а не поле. Глубина ровно два уровня.
 * «Готово» ничего не сохраняет отдельно: правки применяются сразу.
 */

/** Что открыто вторым уровнем. */
type Level2 = null | 'qty' | 'price' | 'fact' | 'unit' | 'status' | 'who' | 'name' | 'note' | 'sec'

interface Props {
  item: Buy
  S: State
  perms: Perms
  personal: boolean
  onPatch: (f: (p: Buy) => void) => void
  onDelete: () => void
  onClose: () => void
}

export function BuyItemSheet({ item, S, perms, personal, onPatch, onDelete, onClose }: Props) {
  const [lvl, setLvl] = useState<Level2>(null)
  const back = () => setLvl(null)

  const sec = S.buySections.find((x) => x.i === item.sec)
  const unit = unitOf(item, S)
  const counted = item.st === 'buy'
  const who = S.people.find((p) => p.id === item.who)
  const qtyLocked = !perms.canEditQty(item)
  const assigner = S.people.find((p) => p.id === perms.assignerOf(item))

  const peopleOptions: PickOption[] = [
    { id: '', title: 'Никто', hint: 'позиция ничья — возьмёт, кто окажется в магазине' },
    ...S.people.map((p) => ({ id: p.id, title: p.name, hint: p.role })),
  ]

  return (
    <>
      <ResponsiveSheet
        open={lvl === null}
        onOpenChange={(v) => !v && onClose()}
        title={item.n}
        subtitle={sec?.t}
        footer={
          <Btn scale="lg" className="w-full" onClick={onClose}>
            Готово
          </Btn>
        }
      >
        {/* Плашка «сколько и откуда» — вместо формулы */}
        <div className="rounded-2xl bg-accent-soft p-4">
          <div className="tnum text-[28px] leading-none font-bold text-ink">
            {item.pr <= 0 && item.prf <= 0 ? '—' : money(sumOf(item), S.doc)}
          </div>
          <p className="mt-1.5 text-sm text-ink">{buyLine(item, S)}</p>
          {!counted && (
            <p className="mt-1 text-[13px] font-semibold text-accent-text">
              {/* Имя внутри статуса остаётся с большой буквы: «есть у Кости», не «у кости» */}
              В общую сумму не идёт: {lowerFirst(statusName(item.st, S.people))}
            </p>
          )}
        </div>

        {item.c ? <p className="mt-3 text-sm leading-snug text-muted">{item.c}</p> : null}

        <div className="mt-3">
          <SheetRow
            label="Сколько"
            value={`${fmtNum(item.q)}${NBSP}${unit}`}
            onClick={() => setLvl('qty')}
          />
          <SheetRow label="Единица" value={unit} onClick={() => setLvl('unit')} />
          <SheetRow
            label="Цена"
            value={item.pr > 0 ? money(item.pr, S.doc) : 'не вписана'}
            empty={item.pr <= 0}
            onClick={() => setLvl('price')}
          />
          <SheetRow
            label="Цена по факту"
            value={item.prf > 0 ? money(item.prf, S.doc) : 'не вписана'}
            empty={item.prf <= 0}
            onClick={() => setLvl('fact')}
          />
          <SheetRow
            label="Статус"
            value={statusName(item.st, S.people)}
            onClick={() => setLvl('status')}
          />
          <SheetRow
            label={personal ? 'Чьё' : 'Покупает'}
            value={who ? who.name : 'никто'}
            empty={!who}
            onClick={() => setLvl('who')}
          />
          <SheetRow label="Название" value={item.n} onClick={() => setLvl('name')} />
          <SheetRow
            label="Примечание"
            value={item.c || 'нет'}
            empty={!item.c}
            onClick={() => setLvl('note')}
          />
          <SheetRow label="Раздел" value={sec?.t ?? '—'} onClick={() => setLvl('sec')} />
        </div>

        {perms.canDel(item) && (
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
              Удалить позицию
            </Btn>
          </div>
        )}
      </ResponsiveSheet>

      {/* ─── второй уровень ─── */}
      <NumberSheet
        open={lvl === 'qty'}
        onOpenChange={(v) => !v && back()}
        onBack={back}
        title="Сколько"
        subtitle={`${item.n}, в ${unit}`}
        value={item.q}
        kind="qty"
        unit={unit}
        hint={(v) => (priceOf(item) > 0 ? `Выйдет ${money(v * priceOf(item), S.doc)}` : 'Цена ещё не вписана')}
        onChange={(v) => onPatch((p) => { p.q = v; p.qby = perms.me || p.qby })}
        ask={
          qtyLocked && assigner
            ? {
                assignerName: assigner.name,
                onAsk: (want, why) =>
                  onPatch((p) => {
                    p.qask = { by: perms.me, want, why, ua: Date.now() }
                  }),
              }
            : undefined
        }
      />
      <NumberSheet
        open={lvl === 'price'}
        onOpenChange={(v) => !v && back()}
        onBack={back}
        title="Цена"
        subtitle={`${item.n}, за 1${NBSP}${unit}`}
        value={item.pr}
        kind="price"
        unit="₽"
        hint={(v) => `За ${fmtNum(item.q)}${NBSP}${unit} выйдет ${money(v * item.q, S.doc)}`}
        onChange={(v) => onPatch((p) => { p.pr = v })}
      />
      <NumberSheet
        open={lvl === 'fact'}
        onOpenChange={(v) => !v && back()}
        onBack={back}
        title="Цена по факту"
        subtitle={`${item.n} ${MDASH} сколько вышло в магазине`}
        value={item.prf}
        kind="price"
        unit="₽"
        hint={(v) =>
          v > 0
            ? `Считаем по факту: ${money(v * item.q, S.doc)}`
            : 'Ноль — считаем по обычной цене'
        }
        onChange={(v) => onPatch((p) => { p.prf = v })}
      />
      <PickSheet
        open={lvl === 'unit'}
        onOpenChange={(v) => !v && back()}
        onBack={back}
        title="Единица"
        subtitle={item.n}
        value={item.uid}
        options={S.units.map((u) => ({ id: u.i, title: u.t, hint: u.full }))}
        onPick={(id) =>
          onPatch((p) => {
            p.uid = id
            p.u = S.units.find((u) => u.i === id)?.t ?? p.u
          })
        }
      />
      <PickSheet
        open={lvl === 'status'}
        onOpenChange={(v) => !v && back()}
        onBack={back}
        title="Статус"
        subtitle={item.n}
        value={item.st}
        options={statusOptions(item, S)}
        onPick={(id) => {
          onPatch((p) => { p.st = id as BuyStatus })
          const goes = id === 'buy'
          toast(
            `${item.n} ${MDASH} ${lowerFirst(statusName(id as BuyStatus, S.people))}${
              goes ? '' : ', в сумму не идёт'
            }`,
          )
        }}
      />
      <PickSheet
        open={lvl === 'who'}
        onOpenChange={(v) => !v && back()}
        onBack={back}
        title={personal ? 'Чьё' : 'Кто покупает'}
        subtitle={item.n}
        value={item.who}
        options={peopleOptions}
        onPick={(id) => {
          onPatch((p) => { p.who = id; p.as = perms.me || p.as })
          const n = S.people.find((p) => p.id === id)
          if (n) toast(`${item.n} покупает ${n.name}`)
        }}
      />
      <PickSheet
        open={lvl === 'sec'}
        onOpenChange={(v) => !v && back()}
        onBack={back}
        title="Раздел"
        subtitle={item.n}
        value={item.sec}
        options={S.buySections.map((s) => ({
          id: s.i,
          title: s.t,
          hint: s.personal ? 'личный раздел — в общий делёж не входит' : undefined,
        }))}
        onPick={(id) => onPatch((p) => { p.sec = id })}
      />
      <TextSheet
        open={lvl === 'name'}
        onOpenChange={(v) => !v && back()}
        onBack={back}
        title="Название"
        subtitle={sec?.t}
        value={item.n}
        onDone={(v) => v && onPatch((p) => { p.n = v })}
      />
      <TextSheet
        open={lvl === 'note'}
        onOpenChange={(v) => !v && back()}
        onBack={back}
        title="Примечание"
        subtitle={item.n}
        value={item.c}
        multiline
        placeholder="Что важно помнить про эту позицию"
        onDone={(v) => onPatch((p) => { p.c = v })}
      />
    </>
  )
}

const MDASH = '—'

/** Со строчной делаем только первую букву — имена внутри фразы не трогаем. */
function lowerFirst(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1)
}
