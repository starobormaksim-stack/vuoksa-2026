import { useEffect, useMemo, useRef, useState } from 'react'
import { Backpack, ChevronsDownUp, Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import type { Gear, GearSection as GearSec } from '@/lib/types'
import { useTrip, touch } from '@/store'
import { readyOfGroup } from '@/lib/gearx'
import { orderedPeople } from '@/lib/people'
import { visibleBlockId } from '@/lib/visible'
import { askedHere, useAddRequest } from '@/lib/addnew'
import { useFold, useUnfoldRequest } from '@/foldpref'
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
  /* ⛔ По умолчанию группы СВЁРНУТЫ, раскрытое помнит браузер. Заказчик
     08.08.2026: «по умолчанию все должно быть скрыто, свернуто… но если я их
     раскрываю, то при перезагрузке страницы они остаются в том виде, в котором
     я их оставил». Прежнее «все списки должны быть раскрыты» (06.08.2026)
     отменено этим словом — подробнее в `foldpref.ts`. */
  const fold = useFold('gear')
  /** открытая шторка действий раздела и её второй уровень «переименовать» */
  const [menu, setMenu] = useState<string | null>(null)
  const [rename, setRename] = useState(false)
  /* Только что заведённый раздел: окно названия открыто сразу, и закрытие
     не проваливается в «Действия раздела» — человек заводил раздел,
     а не открывал меню. */
  const [newSec, setNewSec] = useState(false)
  const endRename = () => {
    setRename(false)
    if (newSec) {
      setNewSec(false)
      setMenu(null)
    }
  }
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
    fold.show(sid)
    jumpToItem('gear', addAt(sid, (bySec[sid] ?? []).length))
    /* Списки берутся из ЭТОГО рендера — того самого, на котором приехала заявка,
       поэтому они свежие, и остальным зависимостям здесь делать нечего. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ask])

  /* Прыжок из поиска: строка внутри свёрнутой группы не отрисована, поэтому
     App перед прыжком просит раскрыть группу этой вещи (см. foldpref.ts). */
  const uf = useUnfoldRequest('gear')
  const ufRef = useRef(uf.n)
  useEffect(() => {
    if (uf.n === ufRef.current) return
    ufRef.current = uf.n
    const g = S.gear.find((x) => x.i === uf.item)
    if (g) fold.show(g.sec)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uf])

  /* ─── действия над разделом (только редактору) ─── */

  const renameSec = (secId: string, t: string) =>
    update((s) => {
      const sec = s.gearSections.find((x) => x.i === secId)
      if (sec) {
        sec.t = t
        sec.ua = Date.now()
      }
    })

  /* Завести раздел. Заказчик 08.08.2026: «я должен иметь возможность удалить
     как раздел, как создать раздел, подраздел, строку» — до этого раздел
     можно было только переименовать и удалить, а создать было нечем.
     Название сразу открывается на правку тем же TextSheet, что
     и «Переименовать»: своего органа не выдумано (постулат 3). */
  const addSec = () => {
    const id = 'gs' + Date.now().toString(36)
    update((s) => {
      s.gearSections.push({
        i: id,
        t: 'Новый раздел',
        ord: Math.max(0, ...s.gearSections.map((x) => x.ord)) + 10,
        by: perms.me || '',
        ua: Date.now(),
      })
    })
    fold.show(id)
    setMenu(id)
    setNewSec(true)
    setRename(true)
  }

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
        title="Взять с собой"
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
            /* Итог как в таблице заказчика: «собрано: 0 из 14».
               ⚠️ На 390 слово «собрано:» отнимает ~64 px и не оставляет места
               органам шапки (разбор 08.08.2026). Решение заказчика 09.08.2026:
               на телефоне коротко «0 из 14», полная фраза — на компьютере.
               Голосом раздел читается одинаково на обеих ширинах: слово
               остаётся в разметке для чтения с экрана. */
            badge={
              <span className="tnum shrink-0 text-note font-semibold text-muted">
                <span className="sr-only">собрано: </span>
                <span aria-hidden className="hidden sm:inline">
                  собрано:{' '}
                </span>
                {r.done} из {r.total}
              </span>
            }
            open={fold.isOpen(sec.i)}
            onToggle={() => fold.toggle(sec.i)}
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

      {/* Пунктирная строка — как «+ Транспорт» у веток карты: заведение нового
          стоит там, где кончается существующее. Без права раздела кнопки нет
          (постулат 6). */}
      {perms.isEditor() && (
        <button
          type="button"
          onClick={addSec}
          className="flex min-h-11 w-full items-center justify-center gap-1.5 rounded-2xl border border-dashed border-line-strong px-3 text-note font-semibold text-ink transition-colors hover:bg-zebra"
        >
          <Plus size={16} strokeWidth={1.75} aria-hidden />
          Добавить раздел
        </button>
      )}

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
                fold.shutAll()
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
          onOpenChange={(v) => !v && endRename()}
          onBack={endRename}
          title="Название раздела"
          subtitle="Взять с собой"
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
