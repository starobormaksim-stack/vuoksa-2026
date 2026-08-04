import { useMemo, useRef, useState } from 'react'
import { Backpack, ChevronsDownUp, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import type { Gear, GearSection as GearSec, Person } from '@/lib/types'
import { useTrip, touch } from '@/store'
import { cantOf, cycleStatus, qtyLabel, readyOfGroup } from '@/lib/gearx'
import { orderedPeople } from '@/lib/people'
import {
  AddRow, Btn, EmptyState, Group, ResponsiveSheet, SectionHead, TextSheet,
} from '@/components/flops'
import { GearAddSheet } from './GearAddSheet'
import { GearDeniedSheet } from './GearDeniedSheet'
import { GearItemSheet } from './GearItemSheet'
import { GearLegendSheet } from './GearLegendSheet'
import { GearMatrix, type MatrixScroll } from './GearMatrix'

/**
 * Раздел «Сборы» (docs/v2-ux-redesign.md, раздел 8).
 *
 * Вид один — матрица «вещь × люди», как лист «Снаряжение» в таблице заказчика.
 * Вкладок по людям нет: заказчик прямо сказал, что проваливаться в каждого
 * человека неудобно, а всю раскладку хочется видеть сразу.
 * Ряда из четырёх чипов «фото + имя + количество + значок», на который он жаловался,
 * здесь тоже нет: имена стоят в шапке колонок.
 */

/** Что открыто в карточке позиции: чья ячейка и надо ли сразу править количество. */
interface SheetAt {
  id: string
  who: string
  qty: boolean
}

export function GearSection() {
  const { S, update, remove, perms } = useTrip()
  /* один общий сдвиг вбок на все блоки: лист в таблице один */
  const scroll = useRef<MatrixScroll>({ nodes: new Set(), x: 0, busy: false })
  const [open, setOpen] = useState<Record<string, boolean>>(() => ({ [S.gearSections[0]?.i]: true }))
  const [sheet, setSheet] = useState<SheetAt | null>(null)
  const [addTo, setAddTo] = useState<string | null>(null)
  const [legend, setLegend] = useState(false)
  const [denied, setDenied] = useState<{ item: Gear; person: Person } | null>(null)
  /** открытая шторка действий раздела и её второй уровень «переименовать» */
  const [menu, setMenu] = useState<string | null>(null)
  const [rename, setRename] = useState(false)

  /* Человек, пришедший по своей ссылке, видит себя первым во всех списках.
     Сам документ (S.people) при этом не переставляется. */
  const people = useMemo(() => orderedPeople(S.people, perms.me), [S.people, perms.me])

  const bySec = useMemo(() => {
    const m: Record<string, Gear[]> = {}
    for (const g of S.gear) (m[g.sec] ||= []).push(g)
    for (const k of Object.keys(m)) m[k].sort((a, b) => (a.ord ?? 0) - (b.ord ?? 0))
    return m
  }, [S.gear])

  const sections = useMemo(
    () => [...S.gearSections].sort((a, b) => a.ord - b.ord),
    [S.gearSections],
  )

  const patch = (id: string, f: (g: Gear) => void) =>
    update((s) => {
      const g = s.gear.find((x) => x.i === id)
      if (g) {
        f(g)
        touch(g)
      }
    })

  /* Тап по кружку. Отметка «не могу взять» в круг не входит, поэтому снимается —
     и, как всякое разрушающее действие, возвращается кнопкой «Отменить». */
  const cycle = (item: Gear, personId: string) => {
    const cant = cantOf(item, personId)
    patch(item.i, (g) => {
      cycleStatus(g, personId)
    })
    if (cant) {
      toast('Отметка «не могу взять» снята', {
        action: {
          label: 'Отменить',
          onClick: () => patch(item.i, (g) => {
            g.q = g.q || {}
            g.q[personId] = cant
          }),
        },
      })
    }
  }

  /* Назначить человеку 1 шт. — пустая ячейка матрицы и кнопка в карточке. */
  const assign = (item: Gear, personId: string) => {
    patch(item.i, (g) => {
      g.o = g.o || {}
      g.oby = g.oby || {}
      g.o[personId] = 1
      g.oby[personId] = perms.me || ''
    })
    const p = S.people.find((x) => x.id === personId)
    if (p) toast(`${p.name} везёт «${item.n}» ${MDASH} ${qtyLabel(1)}`)
  }

  /* «Попросить» из объяснения отказа: задача уезжает в «Что не забыть» — это
     единственный список поручений в документе, отдельной сущности задач в модели нет. */
  const askMark = (item: Gear, personId: string) => {
    const p = S.people.find((x) => x.id === personId)
    if (!p) return
    update((s) => {
      const list = (s.ideas ||= [])
      list.push({
        i: 'q' + Date.now().toString(36),
        n: `Отметить «${item.n}» в сборах`,
        why: perms.mePerson ? `Просит ${perms.mePerson.name}` : 'Просьба из сборов',
        who: p.id,
        done: false,
        ua: Date.now(),
      })
    })
    toast(`${p.name} увидит просьбу отметить «${item.n}»`)
  }

  /**
   * Завести вещь сразу с раскладкой «кому сколько» — её собрал мастер добавления.
   * Пустая раскладка допустима: позиция остаётся ничьей, как было раньше.
   */
  const addItem = (secId: string, name: string, qty: Record<string, number>) => {
    const id = 'g' + Date.now().toString(36)
    const ids = Object.keys(qty).filter((k) => (qty[k] || 0) > 0)
    const o: Record<string, number> = {}
    const oby: Record<string, string> = {}
    for (const pid of ids) {
      o[pid] = qty[pid]
      oby[pid] = perms.me || ''
    }
    update((s) => {
      s.gear.push({
        i: id,
        sec: secId,
        n: name,
        o,
        c: '',
        by: perms.me || '',
        q: {},
        oby,
        s: {},
        as: perms.me || '',
        ord: (s.gear.length + 1) * 10,
        ua: Date.now(),
      })
    })
    const names = ids
      .map((pid) => S.people.find((p) => p.id === pid)?.name)
      .filter(Boolean)
      .join(', ')
    toast(names ? `«${name}» в списке ${MDASH} везёт ${names}` : `«${name}» в списке`)
  }

  /* ─── действия над разделом (только редактору) ─── */

  const renameSec = (secId: string, t: string) =>
    update((s) => {
      const sec = s.gearSections.find((x) => x.i === secId)
      if (sec) {
        sec.t = t
        sec.ua = Date.now()
      }
    })

  const delSec = (sec: GearSec) => {
    setMenu(null)
    remove('gearSections', sec.i)
    toast(`Раздел «${sec.t}» удалён`, {
      action: {
        label: 'Отменить',
        onClick: () =>
          update((s) => {
            if (s.del) delete s.del['gearSections:' + sec.i]
            if (!s.gearSections.some((x) => x.i === sec.i))
              s.gearSections.push({ ...sec, ua: Date.now() })
          }),
      },
    })
  }

  const del = (item: Gear) => {
    remove('gear', item.i)
    toast(`«${item.n}» удалено`, {
      action: { label: 'Отменить', onClick: () => undo(item) },
    })
  }

  const current = sheet ? S.gear.find((g) => g.i === sheet.id) : null
  const menuSec = menu ? sections.find((s) => s.i === menu) ?? null : null

  return (
    <div className="flex flex-col gap-4">
      <SectionHead
        title="Сборы"
        secId="gear"
        hint="Цифра — сколько штук везёт человек. «Всего» считается само"
        onHelp={() => setLegend(true)}
      />

      {sections.map((sec) => {
        const rows = bySec[sec.i] ?? []
        const r = readyOfGroup(S, sec.i, null)
        return (
          <Group
            key={sec.i}
            title={sec.t}
            /* итог как в таблице заказчика: «собрано: 0 из 14» */
            badge={
              <span className="tnum shrink-0 text-[13px] font-semibold text-muted">
                собрано: {r.done} из {r.total}
              </span>
            }
            open={!!open[sec.i]}
            onToggle={() => setOpen((o) => ({ ...o, [sec.i]: !o[sec.i] }))}
            onMenu={perms.isEditor() ? () => setMenu(sec.i) : undefined}
          >
            {rows.length === 0 ? (
              <EmptyState
                icon={Backpack}
                title="Раздел пустой"
                text="Ни одной вещи не заведено"
                action={{ label: 'Добавить вещь', onClick: () => setAddTo(sec.i) }}
              />
            ) : (
              <>
                <GearMatrix
                  rows={rows}
                  people={people}
                  perms={perms}
                  label={sec.t}
                  sync={scroll}
                  onOpen={(g) => setSheet({ id: g.i, who: '', qty: false })}
                  onCycle={cycle}
                  onAssign={assign}
                  onDenied={(g, id) => {
                    const p = S.people.find((x) => x.id === id)
                    if (p) setDenied({ item: g, person: p })
                  }}
                  onQty={(g, id) => setSheet({ id: g.i, who: id, qty: true })}
                />
                <div className="border-t border-line">
                  <AddRow label="Добавить вещь" onClick={() => setAddTo(sec.i)} />
                </div>
              </>
            )}
          </Group>
        )
      })}

      {current && sheet && (
        <GearItemSheet
          /* карточка заводится заново на каждое открытие: иначе на новой вещи
             остался бы второй уровень, открытый на прошлой */
          key={`${sheet.id}:${sheet.who}:${sheet.qty}`}
          item={current}
          S={S}
          perms={perms}
          focus={sheet.who}
          qtyFor={sheet.qty ? sheet.who : undefined}
          onPatch={(f) => patch(current.i, f)}
          onCycle={(id) => cycle(current, id)}
          onAskMark={(id) => askMark(current, id)}
          onDelete={() => del(current)}
          onClose={() => setSheet(null)}
        />
      )}

      {denied && (
        <GearDeniedSheet
          open
          onOpenChange={(v) => !v && setDenied(null)}
          personName={denied.person.name}
          itemName={denied.item.n}
          onAsk={() => askMark(denied.item, denied.person.id)}
        />
      )}

      <GearLegendSheet open={legend} onOpenChange={setLegend} />

      <GearAddSheet
        open={addTo !== null}
        onOpenChange={(v) => !v && setAddTo(null)}
        sectionName={S.gearSections.find((s) => s.i === addTo)?.t}
        people={people}
        preselect={perms.me || undefined}
        onAdd={(name, qty) => {
          if (addTo) addItem(addTo, name, qty)
        }}
      />

      {menuSec && (
        <ResponsiveSheet
          open={!rename}
          onOpenChange={(v) => !v && setMenu(null)}
          title="Действия раздела"
          subtitle={menuSec.t}
          footer={
            <Btn scale="lg" className="w-full" onClick={() => setMenu(null)}>
              Готово
            </Btn>
          }
        >
          <div className="flex flex-col gap-2">
            <Btn tone="secondary" className="w-full justify-start" onClick={() => setRename(true)}>
              <Pencil size={18} strokeWidth={1.5} aria-hidden />
              Переименовать
            </Btn>
            <Btn
              tone="secondary"
              className="w-full justify-start"
              onClick={() => {
                setOpen({})
                setMenu(null)
              }}
            >
              <ChevronsDownUp size={18} strokeWidth={1.5} aria-hidden />
              Свернуть все
            </Btn>
            {/* Удаление живой строкой только у пустого раздела: занятый удалять нечем (12.2) */}
            {(bySec[menuSec.i] ?? []).length === 0 ? (
              <Btn tone="danger" className="w-full justify-start" onClick={() => delSec(menuSec)}>
                <Trash2 size={18} strokeWidth={1.5} aria-hidden />
                Удалить раздел
              </Btn>
            ) : (
              <p className="mt-1 text-[13px] leading-snug text-muted">
                Раздел удаляется, когда в нём не осталось ни одной вещи.
              </p>
            )}
          </div>
        </ResponsiveSheet>
      )}

      {menuSec && (
        <TextSheet
          open={rename}
          onOpenChange={(v) => !v && setRename(false)}
          onBack={() => setRename(false)}
          title="Название раздела"
          subtitle="Сборы"
          value={menuSec.t}
          placeholder="Например, Общее снаряжение"
          onDone={(v) => v && renameSec(menuSec.i, v)}
        />
      )}
    </div>
  )

  /** Вернуть удалённую позицию (кнопка «Отменить» в тосте). */
  function undo(g: Gear) {
    update((s) => {
      if (s.del) delete s.del['gear:' + g.i]
      if (!s.gear.some((x) => x.i === g.i)) s.gear.push({ ...g, ua: Date.now() })
    })
  }
}

const MDASH = '—'
