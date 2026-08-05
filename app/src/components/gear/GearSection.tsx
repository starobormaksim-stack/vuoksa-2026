import { useEffect, useMemo, useRef, useState } from 'react'
import { Backpack, ChevronsDownUp, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import type { Gear, GearSection as GearSec } from '@/lib/types'
import { useTrip, touch } from '@/store'
import { readyOfGroup } from '@/lib/gearx'
import { orderedPeople } from '@/lib/people'
import { visibleBlockId } from '@/lib/visible'
import { askedHere, useAddRequest } from '@/lib/addnew'
import { jumpToItem } from '@/lib/jump'
import {
  AddRow, Btn, EmptyState, Group, ResponsiveSheet, SectionHead, TextSheet,
  newTableScroll, useIsDesktop, type TableScroll,
} from '@/components/flops'
import { GEAR_LEGEND } from './legend'
import { GearMatrix } from './GearMatrix'
import { GearStrip } from './GearStrip'

/**
 * Раздел «Сборы».
 *
 * Вид один — таблица «вещь × люди», как лист «Снаряжение» в таблице заказчика,
 * и одинаковый на всех ширинах: вбок листается сам блок, а не страница.
 * Вкладок по людям нет — всю раскладку заказчик хочет видеть сразу.
 *
 * Карточки позиции и мастера добавления здесь больше нет: всё, что в них было,
 * правится прямо в строке (решение заказчика 04.08.2026). Из шторок остались
 * две, и обе — не редакторы: легенда значков и действия над самим разделом
 * (заголовок группы — кнопка, вложить в неё правку названия нельзя).
 */

/** Частые единицы измерения — первыми в выборе при заведении вещи. */
const COMMON_UNITS = ['sht', 'para', 'up', 'kompl', 'nabor']

export function GearSection() {
  const { S, update, remove, perms } = useTrip()
  /* один общий сдвиг вбок на все блоки: лист в таблице заказчика один */
  const scroll = useRef<TableScroll>(newTableScroll())
  /** корень раздела — по нему липкий «плюс» находит блок, который сейчас читают */
  const list = useRef<HTMLDivElement | null>(null)
  const desktop = useIsDesktop()
  /* ⛔ Раскрыты ВСЕ разделы, а не один первый. Заказчик 06.08.2026: «по умолчанию
     у тебя все списки должны быть раскрыты, название разделов должно быть крупно
     написано… чтобы было очевидно». Свёрнутой остаётся подробность позиции —
     это спрошено отдельно и подтверждено им же (У-44). Пустой объект здесь значит
     «раскрыто»: свёрнутые помечаются явным `false`, поэтому новый раздел, заведённый
     после загрузки, тоже открыт. */
  const [closed, setClosed] = useState<Record<string, boolean>>({})
  /** открытая шторка действий раздела и её второй уровень «переименовать» */
  const [menu, setMenu] = useState<string | null>(null)
  const [rename, setRename] = useState(false)
  /** только что заведённая строка — она открыта в правке, чтобы было видно, куда вводить */
  const [fresh, setFresh] = useState('')

  /* Человек, пришедший по своей ссылке, видит себя первым во всех списках.
     Сам документ (S.people) при этом не переставляется. */
  const people = useMemo(() => orderedPeople(S.people, perms.me), [S.people, perms.me])

  const units = useMemo(() => {
    /* документ первой версии мог приехать вообще без справочника единиц */
    const all = S.units ?? []
    const named = new Map(all.map((u) => [u.i, u.t]))
    const common = COMMON_UNITS.map((i) => named.get(i)).filter((t): t is string => !!t)
    if (common.length > 0) return common
    /* справочник переписали своими руками — берём первые пять, какие есть */
    return [...all].sort((a, b) => a.ord - b.ord).slice(0, 5).map((u) => u.t)
  }, [S.units])

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

  /**
   * Завести вещь перед строкой номер `before` — «я не должен листать до самого
   * конца, чтобы добавить ещё одну вещь» (заказчик, 04.08.2026).
   *
   * В документах первой версии порядок у позиций сборов не проставлен вовсе
   * (`ord` нет ни у одной), поэтому вставка между строками сначала нумерует
   * раздел заново, а потом кладёт новую строку в промежуток.
   */
  const addAt = (secId: string, before: number): string => {
    const id = 'g' + Date.now().toString(36)
    update((s) => {
      const list = s.gear
        .filter((g) => g.sec === secId)
        .sort((a, b) => (a.ord ?? 0) - (b.ord ?? 0))
      list.forEach((g, i) => {
        const ord = (i + 1) * 10
        if (g.ord !== ord) {
          g.ord = ord
          touch(g)
        }
      })
      s.gear.push({
        i: id,
        sec: secId,
        n: '',
        o: {},
        c: '',
        by: perms.me || '',
        q: {},
        oby: {},
        s: {},
        as: perms.me || '',
        ord: (before + 1) * 10 - 5,
        ua: Date.now(),
      })
    })
    setFresh(id)
    return id
  }

  /* Просьба общего «плюса» из другого раздела: заводим вещь своими руками —
     теми же, что и по кнопке раздела, — раскрываем блок (он мог быть свёрнут,
     и новая строка просто не появилась бы на экране) и уводим к ней.
     ⚠️ Блок берётся видимый, только если человек читал «Сборы» в момент
     нажатия: иначе прокрутка ещё не доехала и `visibleBlockId` мерил бы
     не то место. */
  const ask = useAddRequest('gear')
  const askRef = useRef(ask)
  useEffect(() => {
    if (ask === askRef.current) return
    askRef.current = ask
    const sid = askedHere('gear')
      ? visibleBlockId(list.current, sections[0]?.i ?? '')
      : sections[0]?.i ?? ''
    if (!sid) return
    setClosed((o) => ({ ...o, [sid]: false }))
    jumpToItem('gear', addAt(sid, (bySec[sid] ?? []).length))
    /* Списки берутся из ЭТОГО рендера — того самого, на котором приехала заявка,
       поэтому они свежие, и остальным зависимостям здесь делать нечего. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ask])

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
    if (fresh === item.i) setFresh('')
    remove('gear', item.i)
    toast(`«${item.n || 'Без названия'}» удалено`, {
      action: { label: 'Отменить', onClick: () => undo(item) },
    })
  }

  const menuSec = menu ? sections.find((s) => s.i === menu) ?? null : null

  return (
    <div className="flex flex-col gap-4" ref={list}>
      <SectionHead
        title="Сборы"
        secId="gear"
        hint="Цифра — сколько штук везёт человек. «Всего» считается само"
        legend={GEAR_LEGEND}
        /* Липкий «плюс» — просьба заказчика 06.08.2026: «есть всегда при прокрутке…
           с правой стороны плюсик, оно как бы прилипает». Полоса раздела липкая
           сама по себе, поэтому кнопке довольно стоять в ней. Вещь ложится
           в тот подраздел, который человек сейчас читает (`visibleBlockId`),
           а не всегда в первый. */
        action={
          perms.isEditor() || perms.me
            ? {
                label: 'Добавить вещь',
                onClick: () => {
                  const sid = visibleBlockId(list.current, sections[0]?.i ?? '')
                  if (sid) addAt(sid, (bySec[sid] ?? []).length)
                },
              }
            : undefined
        }
      >
        {/* Кружок в чужой ячейке участнику не кнопка, а значок — и это надо
            прочитать словами, иначе тап «просто не работает» (постулаты 4 и 5).
            ⚠️ Сказано ОДНОЙ строкой: прежние три заказчик 05.08.2026 отнёс
            к «гигантскому количеству текста». */}
        {!perms.isEditor() && perms.mePerson && (
          <p className="mt-2 text-note leading-snug text-muted">
            Отмечать можно в своей колонке — «{perms.mePerson.name}»
          </p>
        )}
      </SectionHead>

      {sections.map((sec) => {
        const rows = bySec[sec.i] ?? []
        const r = readyOfGroup(S, sec.i, null)
        return (
          <Group
            key={sec.i}
            data-block={sec.i}
            title={sec.t}
            /* итог как в таблице заказчика: «собрано: 0 из 14» */
            badge={
              <span className="tnum shrink-0 text-note font-semibold text-muted">
                собрано: {r.done} из {r.total}
              </span>
            }
            open={closed[sec.i] !== true}
            onToggle={() => setClosed((o) => ({ ...o, [sec.i]: o[sec.i] !== true }))}
            onMenu={perms.isEditor() ? () => setMenu(sec.i) : undefined}
          >
            {rows.length === 0 ? (
              <EmptyState
                icon={Backpack}
                title="Раздел пустой"
                text="Ни одной вещи не заведено"
                action={{ label: 'Добавить вещь', onClick: () => addAt(sec.i, 0) }}
              />
            ) : (
              <>
                {/* ⛔ Две плотности одной логики, а не два продукта. На широком
                    экране остаётся матрица «вещь × люди» — именно её заказчик
                    прислал эталоном (его Excel 2024, лист «ВЕЩИ»: колонки Макс,
                    Костя, Миша, Жека и «Общее количество»). На телефоне она
                    требовала прокрутки вбок, и он назвал это «нереалистично» —
                    там лента. Модель, права и правка общие, разная только
                    расстановка. Рисуется ровно один вид: 96 позиций во второй
                    разметке — это лишняя работа на каждой перерисовке. */}
                {desktop ? (
                  <GearMatrix
                    rows={rows}
                    people={people}
                    perms={perms}
                    label={sec.t}
                    sync={scroll}
                    units={units}
                    fresh={fresh}
                    onFreshDone={() => setFresh('')}
                    patch={patch}
                    onDelete={del}
                    onInsert={(before) => addAt(sec.i, before)}
                  />
                ) : (
                  <GearStrip
                    rows={rows}
                    people={people}
                    perms={perms}
                    units={units}
                    fresh={fresh}
                    onFreshDone={() => setFresh('')}
                    patch={patch}
                    onDelete={del}
                    onInsert={(before) => addAt(sec.i, before)}
                  />
                )}
                <div className="border-t border-line">
                  <AddRow label="Добавить вещь" onClick={() => addAt(sec.i, rows.length)} />
                </div>
              </>
            )}
          </Group>
        )
      })}

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
              <Pencil size={20} strokeWidth={1.75} aria-hidden />
              Переименовать
            </Btn>
            <Btn
              tone="secondary"
              className="w-full justify-start"
              onClick={() => {
                setClosed(Object.fromEntries(sections.map((s) => [s.i, true])))
                setMenu(null)
              }}
            >
              <ChevronsDownUp size={20} strokeWidth={1.75} aria-hidden />
              Свернуть все
            </Btn>
            {/* Удаление живой строкой только у пустого раздела: занятый удалять нечем */}
            {(bySec[menuSec.i] ?? []).length === 0 ? (
              <Btn tone="danger" className="w-full justify-start" onClick={() => delSec(menuSec)}>
                <Trash2 size={20} strokeWidth={1.75} aria-hidden />
                Удалить раздел
              </Btn>
            ) : (
              <p className="mt-1 text-note leading-snug text-muted">
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
