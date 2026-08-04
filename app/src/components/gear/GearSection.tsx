import { useMemo, useState } from 'react'
import { Backpack, ChevronsDownUp, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import type { Gear, GearSection as GearSec, Person } from '@/lib/types'
import { useTrip, touch } from '@/store'
import {
  cantOf, crewLine, crewSegments, cycleStatus, myLine, qtyLabel,
  readyOf, readyOfGroup, statusOf, totalQty,
} from '@/lib/gearx'
import { orderedPeople } from '@/lib/people'
import {
  AddRow, Btn, EmptyState, Group, ItemRow, ResponsiveSheet, SectionHead, StatusDial, TextSheet,
  useIsDesktop,
} from '@/components/flops'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { GearAddSheet } from './GearAddSheet'
import { GearAvatar } from './GearAvatar'
import { GearCrewBar } from './GearCrewBar'
import { GearDeniedSheet } from './GearDeniedSheet'
import { GearItemSheet } from './GearItemSheet'
import { GearLegendSheet } from './GearLegendSheet'
import { GearMatrix } from './GearMatrix'
import { NBSP } from '@/format'

/**
 * Раздел «Сборы» (docs/v2-ux-redesign.md, раздел 8).
 *
 * Главное решение — два режима разного устройства, а не один список с разной начинкой:
 * личный режим человек проходит сверху вниз и отмечает (кружок, вещь, количество),
 * а в режиме «Все» владелец смотрит и распределяет (полоса экипажа и одна фраза).
 * Ряда из четырёх чипов «фото + имя + количество + значок», на который жаловался
 * заказчик, здесь нет ни в одном режиме: имена живут в карточке позиции.
 */

/** Значение вкладки «Все» — остальные вкладки это id человека. */
const ALL = 'all'

export function GearSection() {
  const { S, update, remove, perms } = useTrip()
  const desktop = useIsDesktop()
  /* по умолчанию человек попадает в свой список: он пришёл сюда отмечать, а не смотреть */
  const [mode, setMode] = useState<string>(() => perms.me || ALL)
  const [open, setOpen] = useState<Record<string, boolean>>(() => ({ [S.gearSections[0]?.i]: true }))
  const [sheet, setSheet] = useState<string | null>(null)
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

  const person = mode === ALL ? null : S.people.find((p) => p.id === mode) ?? null
  /** в личном режиме показываем только то, что человек везёт */
  const rowsOf = (secId: string) => {
    const rows = bySec[secId] ?? []
    return person ? rows.filter((g) => (g.o?.[person.id] || 0) > 0) : rows
  }

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

  const current = sheet ? S.gear.find((g) => g.i === sheet) : null
  const menuSec = menu ? sections.find((s) => s.i === menu) ?? null : null

  /* «Все» остаётся первой вкладкой, дальше люди в порядке читателя */
  const tabs = [
    { id: ALL, label: 'Все', person: null as Person | null },
    ...people.map((p) => ({
      id: p.id,
      label: `${p.name} ${readyOf(S, p.id).pct}${NBSP}%`,
      person: p,
    })),
  ]

  /* Тело вкладки собирается один раз: активна всегда ровно одна. */
  const body =
    person === null && desktop ? (
      <GearMatrix
        people={people}
        perms={perms}
        sections={sections}
        rowsOf={rowsOf}
        onOpen={(g) => setSheet(g.i)}
        onCycle={cycle}
        onAssign={assign}
        onDenied={(g, id) => {
          const p = S.people.find((x) => x.id === id)
          if (p) setDenied({ item: g, person: p })
        }}
        onQty={(g) => setSheet(g.i)}
      />
    ) : (
      sections.map((sec) => {
        const rows = rowsOf(sec.i)
        const r = readyOfGroup(S, sec.i, person ? person.id : null)
        return (
          <Group
            key={sec.i}
            title={sec.t}
            done={r.done}
            total={r.total}
            open={!!open[sec.i]}
            onToggle={() => setOpen((o) => ({ ...o, [sec.i]: !o[sec.i] }))}
            onMenu={perms.isEditor() ? () => setMenu(sec.i) : undefined}
          >
            {rows.length === 0 ? (
              <EmptyState
                icon={Backpack}
                title={person ? 'Здесь пусто' : 'Раздел пустой'}
                text={
                  person
                    ? 'Из этого раздела ты ничего не везёшь'
                    : 'Ни одной вещи не заведено'
                }
                action={{ label: 'Добавить вещь', onClick: () => setAddTo(sec.i) }}
              />
            ) : (
              <div role="list">
                {rows.map((g, idx) =>
                  person ? (
                    <MyRow
                      key={g.i}
                      item={g}
                      person={person}
                      zebra={idx % 2 === 1}
                      canMark={perms.canMark(person.id)}
                      people={S.people}
                      onOpen={() => setSheet(g.i)}
                      onCycle={() => cycle(g, person.id)}
                      onDenied={() => setDenied({ item: g, person })}
                      onDelete={perms.canDel(g) ? () => del(g) : undefined}
                    />
                  ) : (
                    <AllRow
                      key={g.i}
                      item={g}
                      people={S.people}
                      zebra={idx % 2 === 1}
                      onOpen={() => setSheet(g.i)}
                      onDelete={perms.canDel(g) ? () => del(g) : undefined}
                    />
                  ),
                )}
                <AddRow label="Добавить вещь" onClick={() => setAddTo(sec.i)} />
              </div>
            )}
          </Group>
        )
      })
    )

  return (
    <div className="flex flex-col gap-4">
      <SectionHead
        title="Сборы"
        hint="Тап по строке открывает карточку, тап по кружку меняет состояние"
        onHelp={() => setLegend(true)}
      />

      <Tabs value={mode} onValueChange={setMode} className="gap-4">
        <TabsList className="h-12! w-full justify-start gap-1 overflow-x-auto rounded-2xl border border-line bg-surface p-1">
          {tabs.map((t) => (
            <TabsTrigger
              key={t.id}
              value={t.id}
              className="h-10 flex-none gap-2 rounded-xl px-3 text-[15px] font-semibold whitespace-nowrap text-muted data-active:bg-accent-soft data-active:text-ink dark:data-active:border-transparent dark:data-active:bg-accent-soft"
            >
              {t.person && <GearAvatar p={t.person} size={24} />}
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {tabs.map((t) => (
          <TabsContent key={t.id} value={t.id} className="flex flex-col gap-4">
            {t.id === mode ? body : null}
          </TabsContent>
        ))}
      </Tabs>

      {current && (
        <GearItemSheet
          item={current}
          S={S}
          perms={perms}
          focus={person ? person.id : ''}
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
        preselect={person?.id}
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

/**
 * Строка личного режима (8.3): кружок, вещь, количество и одна фраза —
 * «не могу взять» → просьба → «упаковано · поручил Костя» → просто состояние.
 */
function MyRow({
  item, person, people, zebra, canMark, onOpen, onCycle, onDenied, onDelete,
}: {
  item: Gear
  person: Person
  people: Person[]
  zebra: boolean
  canMark: boolean
  onOpen: () => void
  onCycle: () => void
  onDenied: () => void
  onDelete?: () => void
}) {
  const cant = cantOf(item, person.id)
  return (
    <ItemRow
      dataHit={item.i}
      zebra={zebra}
      alarm={!!cant}
      onOpen={onOpen}
      onDelete={onDelete}
      lead={
        <StatusDial
          value={statusOf(item, person.id)}
          cant={!!cant}
          who={person.name}
          onCycle={canMark ? onCycle : undefined}
          onDenied={canMark ? undefined : onDenied}
        />
      }
      title={item.n}
      line2={myLine(item, person.id, people)}
      right={qtyLabel(item.o?.[person.id] || 0)}
    />
  )
}

/** Строка режима «Все» (8.3): полоса экипажа вместо чипов и фраза под ней. */
function AllRow({
  item, people, zebra, onOpen, onDelete,
}: {
  item: Gear
  people: Person[]
  zebra: boolean
  onOpen: () => void
  onDelete?: () => void
}) {
  const segs = crewSegments(item, people)
  return (
    <ItemRow
      dataHit={item.i}
      zebra={zebra}
      alarm={segs.some((s) => s.cant)}
      onOpen={onOpen}
      onDelete={onDelete}
      title={item.n}
      line2={<GearCrewBar segs={segs} />}
      line3={<span className="block text-[13px] leading-snug text-muted">{crewLine(segs)}</span>}
      right={qtyLabel(totalQty(item))}
    />
  )
}
