import { useEffect, useState } from 'react'
import { Trash2, TriangleAlert } from 'lucide-react'
import { toast } from 'sonner'
import type { Gear, Person, QtyAsk, State } from '@/lib/types'
import type { Perms } from '@/lib/perm'
import {
  cantOf, holders, holdersLine, qtyLabel, ST_NAME, statusOf, totalQty,
} from '@/lib/gearx'
import { orderedPeople } from '@/lib/people'
import {
  AddRow, Btn, NumberSheet, PickSheet, ResponsiveSheet, SheetRow, StatusDial, TextSheet,
} from '@/components/flops'
import { GearAvatar } from './GearAvatar'
import { GearDeniedSheet } from './GearDeniedSheet'

/**
 * Карточка позиции сборов (docs/v2-ux-redesign.md, 8.5 и 4.2).
 * Здесь появляются имена, которых нет в свёрнутой строке: блок «Кто везёт» —
 * четыре строки по 64 px вместо четырёх чипов. Каждая строка внутри — кнопка,
 * а не поле; глубина ровно два уровня.
 */

/** Что открыто вторым уровнем. */
type Level2 = null | 'qty' | 'add' | 'denied' | 'cant' | 'name' | 'note' | 'sec'

interface Props {
  item: Gear
  S: State
  perms: Perms
  /** чей это экран: ячейка человека в матрице, иначе я сам */
  focus: string
  /** открыть сразу правку количества этого человека — долгое нажатие по ячейке матрицы */
  qtyFor?: string
  onPatch: (f: (g: Gear) => void) => void
  /** смена состояния по кругу — правило живёт в разделе, чтобы не разъехалось со строкой */
  onCycle: (personId: string) => void
  /** «Попросить» отметить: ставит задачу хозяину списка */
  onAskMark: (personId: string) => void
  onDelete: () => void
  onClose: () => void
}

export function GearItemSheet({
  item, S, perms, focus, qtyFor, onPatch, onCycle, onAskMark, onDelete, onClose,
}: Props) {
  const [lvl, setLvl] = useState<Level2>(qtyFor ? 'qty' : null)
  /** человек, к которому относится второй уровень («сколько везёт», отказ, «не могу взять») */
  const [who, setWho] = useState(qtyFor ?? '')
  const back = () => setLvl(null)

  const sec = S.gearSections.find((x) => x.i === item.sec)
  /* читатель видит себя первым — и среди тех, кто везёт, и в списке «кто ещё повезёт» */
  const people = orderedPeople(S.people, perms.me)
  const crew = holders(item, people)
  const free = people.filter((p) => (item.o?.[p.id] || 0) <= 0)
  const whoPerson = S.people.find((p) => p.id === who) ?? null
  /* кому адресована кнопка «Не могу взять»: человек открытой вкладки, иначе я сам */
  const target = S.people.find((p) => p.id === (focus || perms.me)) ?? null
  const targetCant = target ? cantOf(item, target.id) : null

  const assigner = who ? S.people.find((p) => p.id === perms.assignerOf(item, who)) ?? null : null
  const qtyLocked = !!who && !!perms.me && !perms.canEditQty(item, who)

  const openQty = (personId: string) => {
    setWho(personId)
    setLvl('qty')
  }
  const openDenied = (personId: string) => {
    setWho(personId)
    setLvl('denied')
  }

  return (
    <>
      <ResponsiveSheet
        open={lvl === null}
        onOpenChange={(v) => !v && onClose()}
        title={item.n}
        subtitle={`${sec?.t ?? 'Без раздела'} · ${holdersLine(item, S.people)}`}
        footer={
          <Btn scale="lg" className="w-full" onClick={onClose}>
            Готово
          </Btn>
        }
      >
        {item.c ? <p className="text-sm leading-snug text-ink">{item.c}</p> : null}

        <div className="mt-3 text-[13px] font-semibold text-muted">Кто везёт и сколько</div>
        {/* Заказчик не находил, где правятся заведённые количества, — говорим об этом прямо */}
        <p className="mt-0.5 text-[13px] leading-snug text-muted">
          Тап по количеству меняет его, тап по кружку — состояние сборов.
        </p>
        <div className="mt-1 overflow-hidden rounded-2xl border border-line">
          {crew.length === 0 ? (
            <p className="px-3 py-4 text-sm text-muted">
              Эту вещь пока никто не везёт — назначьте, кто её возьмёт
            </p>
          ) : (
            crew.map((p) => (
              <CrewRow
                key={p.id}
                p={p}
                item={item}
                canMark={perms.canMark(p.id)}
                onQty={() => openQty(p.id)}
                onCycle={() => onCycle(p.id)}
                onDenied={() => openDenied(p.id)}
              />
            ))
          )}
          {free.length > 0 && (
            <AddRow label="Добавить, кто ещё повезёт" onClick={() => setLvl('add')} />
          )}
        </div>

        <div className="mt-3">
          <SheetRow label="Всего по вещи" value={qtyLabel(totalQty(item))} />
          <SheetRow label="Название" value={item.n} onClick={() => setLvl('name')} />
          <SheetRow
            label="Примечание"
            value={item.c || 'нет'}
            empty={!item.c}
            onClick={() => setLvl('note')}
          />
          <SheetRow label="Раздел" value={sec?.t ?? '—'} onClick={() => setLvl('sec')} />
        </div>

        <div className="mt-6 flex flex-col gap-2 border-t border-line pt-4">
          {target && perms.canMark(target.id) && (
            <Btn
              tone="danger"
              className="w-full"
              onClick={() => {
                setWho(target.id)
                setLvl('cant')
              }}
            >
              <TriangleAlert size={18} strokeWidth={1.5} aria-hidden />
              {targetCant
                ? 'Отметка «не могу взять»'
                : target.id === perms.me || !perms.me
                  ? 'Не могу взять'
                  : `${target.name} не может взять`}
            </Btn>
          )}
          {/* Удаление недоступно по правам → строки нет вовсе, а не серой (12.2) */}
          {perms.canDel(item) && (
            <Btn
              tone="danger"
              className="w-full"
              onClick={() => {
                onDelete()
                onClose()
              }}
            >
              <Trash2 size={18} strokeWidth={1.5} aria-hidden />
              Удалить из списка
            </Btn>
          )}
        </div>
      </ResponsiveSheet>

      {/* ─── второй уровень ─── */}
      {whoPerson && (
        <NumberSheet
          open={lvl === 'qty'}
          onOpenChange={(v) => !v && back()}
          onBack={back}
          title={who === perms.me ? 'Сколько везёшь' : `Сколько везёт ${whoPerson.name}`}
          subtitle={item.n}
          value={item.o?.[who] || 0}
          kind="qty"
          unit="шт."
          hint={(v) =>
            v <= 0
              ? `Ноль ${MDASH} ${whoPerson.name} эту вещь не везёт`
              : `Всего по вещи ${qtyLabel(totalQty(item))}`
          }
          onChange={(v) =>
            onPatch((g) => {
              g.o = g.o || {}
              g.oby = g.oby || {}
              if (v > 0) {
                g.o[who] = v
                g.oby[who] = perms.me || g.oby[who] || ''
              } else {
                /* ноль — человек вещь не везёт: убираем и его отметки, иначе они «висят» */
                delete g.o[who]
                delete g.oby[who]
                if (g.s) delete g.s[who]
                if (g.q) delete g.q[who]
              }
            })
          }
          ask={
            qtyLocked && assigner
              ? {
                  assignerName: assigner.name,
                  onAsk: (want, why) =>
                    onPatch((g) => {
                      g.q = g.q || {}
                      g.q[perms.me] = { kind: 'qty', want, why, ua: Date.now() }
                    }),
                }
              : undefined
          }
        />
      )}

      <PickSheet
        open={lvl === 'add'}
        onOpenChange={(v) => !v && back()}
        onBack={back}
        title="Кто ещё повезёт"
        subtitle={item.n}
        value=""
        options={free.map((p) => ({
          id: p.id,
          title: p.name,
          hint: p.role,
          lead: <GearAvatar p={p} />,
        }))}
        onPick={(id) => {
          onPatch((g) => {
            g.o = g.o || {}
            g.oby = g.oby || {}
            g.o[id] = 1
            g.oby[id] = perms.me || ''
          })
          const p = S.people.find((x) => x.id === id)
          if (p) toast(`${p.name} везёт «${item.n}» ${MDASH} ${qtyLabel(1)}`)
        }}
      />

      {whoPerson && (
        <CantSheet
          open={lvl === 'cant'}
          onOpenChange={(v) => !v && back()}
          onBack={back}
          itemName={item.n}
          person={whoPerson}
          me={perms.me}
          current={cantOf(item, who)}
          onSet={(why) =>
            onPatch((g) => {
              g.q = g.q || {}
              g.q[who] = { kind: 'cant', why, ua: Date.now() }
            })
          }
          onClear={() =>
            onPatch((g) => {
              if (g.q) delete g.q[who]
            })
          }
        />
      )}

      {whoPerson && (
        <GearDeniedSheet
          open={lvl === 'denied'}
          onOpenChange={(v) => !v && back()}
          onBack={back}
          personName={whoPerson.name}
          itemName={item.n}
          onAsk={() => onAskMark(who)}
        />
      )}

      <TextSheet
        open={lvl === 'name'}
        onOpenChange={(v) => !v && back()}
        onBack={back}
        title="Название"
        subtitle={sec?.t}
        value={item.n}
        onDone={(v) => v && onPatch((g) => { g.n = v })}
      />
      <TextSheet
        open={lvl === 'note'}
        onOpenChange={(v) => !v && back()}
        onBack={back}
        title="Примечание"
        subtitle={item.n}
        value={item.c}
        multiline
        placeholder="Что важно помнить про эту вещь"
        onDone={(v) => onPatch((g) => { g.c = v })}
      />
      <PickSheet
        open={lvl === 'sec'}
        onOpenChange={(v) => !v && back()}
        onBack={back}
        title="Раздел"
        subtitle={item.n}
        value={item.sec}
        options={[...S.gearSections]
          .sort((a, b) => a.ord - b.ord)
          .map((s) => ({ id: s.i, title: s.t }))}
        onPick={(id) => onPatch((g) => { g.sec = id })}
      />
    </>
  )
}

const MDASH = '—'

/** Строка человека в блоке «Кто везёт»: аватар, имя, количество-кнопка, кружок статуса. */
function CrewRow({
  p, item, canMark, onQty, onCycle, onDenied,
}: {
  p: Person
  item: Gear
  canMark: boolean
  onQty: () => void
  onCycle: () => void
  onDenied: () => void
}) {
  const qty = item.o?.[p.id] || 0
  const cant = cantOf(item, p.id)
  const line = cant
    ? cant.why
      ? `не могу взять: ${cant.why}`
      : 'не могу взять'
    : ST_NAME[statusOf(item, p.id)]

  return (
    <div className="flex min-h-16 items-center gap-3 border-b border-line/70 px-3 last:border-b-0">
      <GearAvatar p={p} />
      <span className="min-w-0 flex-1 py-2">
        <span className="block truncate text-[15px] font-semibold text-ink">{p.name}</span>
        <span className="mt-0.5 block truncate text-[13px] text-muted">{line}</span>
      </span>
      <button
        type="button"
        onClick={onQty}
        aria-label={`Сколько везёт ${p.name}: ${qtyLabel(qty)}. Изменить`}
        className="tnum h-11 shrink-0 rounded-xl border border-line-strong px-3 text-[15px] font-semibold text-ink transition-colors hover:bg-zebra"
      >
        {qtyLabel(qty)}
      </button>
      <StatusDial
        value={statusOf(item, p.id)}
        cant={!!cant}
        who={p.name}
        onCycle={canMark ? onCycle : undefined}
        onDenied={canMark ? undefined : onDenied}
      />
    </div>
  )
}

/**
 * «Не могу взять» — сценарий 3 из 12.2: действие положено, но нужна причина.
 * Вещь остаётся в списке с пометкой, чтобы владелец увидел и передал другому.
 */
function CantSheet({
  open, onOpenChange, onBack, itemName, person, me, current, onSet, onClear,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onBack?: () => void
  itemName: string
  person: Person
  me: string
  current: QtyAsk | null
  onSet: (why: string) => void
  onClear: () => void
}) {
  const [why, setWhy] = useState(current?.why ?? '')
  useEffect(() => {
    if (open) setWhy(current?.why ?? '')
    /* current намеренно не в зависимостях: черновик берётся ровно при открытии */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const mine = !me || person.id === me
  const save = () => {
    onSet(why.trim())
    onOpenChange(false)
    toast(`«${itemName}» ${MDASH} ${mine ? 'не могу взять' : `${person.name} не может взять`}`, {
      action: { label: 'Отменить', onClick: onClear },
    })
  }

  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={(v) => !v && onOpenChange(false)}
      onBack={onBack}
      title={mine ? 'Не могу взять' : `${person.name} не может взять`}
      subtitle={itemName}
      footer={
        <Btn scale="lg" className="w-full" onClick={save}>
          {current ? 'Сохранить причину' : 'Отметить'}
        </Btn>
      }
    >
      <label className="block">
        <span className="text-[13px] font-semibold text-muted">Почему</span>
        <textarea
          rows={3}
          value={why}
          onChange={(e) => setWhy(e.target.value)}
          placeholder="Палатки у меня нет"
          aria-label="Почему не могу взять"
          className="mt-1 w-full rounded-xl border border-line-strong bg-surface px-3 py-3 text-[16px] text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
        />
      </label>
      <p className="mt-2 text-[13px] leading-snug text-muted">
        Вещь останется в списке с пометкой: владелец увидит причину и передаст её другому.
      </p>
      {current && (
        <Btn
          tone="secondary"
          className="mt-3 w-full"
          onClick={() => {
            onClear()
            onOpenChange(false)
            toast('Отметка «не могу взять» снята')
          }}
        >
          Убрать отметку
        </Btn>
      )}
    </ResponsiveSheet>
  )
}
