import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronsDownUp, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import type { BuySection as BuySec } from '@/lib/types'
import { useTrip, touch } from '@/store'
import { orderedPeople } from '@/lib/people'
import { visibleBlockId } from '@/lib/visible'
import { askedHere, useAddRequest } from '@/lib/addnew'
import { jumpToItem } from '@/lib/jump'
import {
  Btn, Group, ResponsiveSheet, SectionHead, TextSheet, newTableScroll, useIsDesktop,
} from '@/components/flops'
import { BUY_LEGEND } from './legend'
import { BuyTotals } from './BuyTotals'
import { BuyTable } from './BuyTable'
import { byOrd, type BuyItem } from './buylocal'

/**
 * Раздел «Закупка» — таблицей, как лист заказчика.
 *
 * Переделка 04.08.2026. Прежняя карточка позиции и «режим магазина» убраны целиком:
 * «мне не нужен поп-ап, в котором всё написано… это прямо вот здесь, в этой таблице
 * уже должно быть» и «не нужен режим магазина, он должен уже здесь работать».
 * Поле «Статус» ушло с экрана; что стало с его данными — написано в buylocal.tsx.
 *
 * Шторка осталась ровно одна и не про позицию, а про сам раздел: переименовать
 * и удалить. Заголовок раздела в `Group` — целиком одна кнопка (свернуть/раскрыть),
 * и вложить в неё поле ввода нельзя, не переделав общий компонент.
 */
export function BuySection() {
  const { S, update, remove, perms } = useTrip()
  /* ⛔ Раскрыты ВСЕ разделы (06.08.2026: «по умолчанию у тебя все списки должны
     быть раскрыты»). Свёрнута только подробность позиции — спрошено отдельно.
     Пустой объект = «всё раскрыто»; свёрнутые помечаются явным `true`. */
  const [closed, setClosed] = useState<Record<string, boolean>>({})
  /** корень раздела — по нему липкий «плюс» находит блок, который сейчас читают */
  const list = useRef<HTMLDivElement | null>(null)
  /** id только что добавленной строки: подсвечена и сразу открыта на правку */
  const [fresh, setFresh] = useState<string | null>(null)
  /** открытая шторка действий раздела и её второй уровень «переименовать» */
  const [menu, setMenu] = useState<string | null>(null)
  const [rename, setRename] = useState(false)
  /** блоки раздела прокручиваются вбок вместе: в бумажной таблице лист один */
  const scroll = useRef(newTableScroll())

  const bySec = useMemo(() => {
    const m: Record<string, BuyItem[]> = {}
    for (const p of S.buy as BuyItem[]) (m[p.sec] ||= []).push(p)
    for (const k of Object.keys(m)) m[k].sort(byOrd)
    return m
  }, [S.buy])

  /* Читатель видит свою колонку первой — порядок один и тот же во всех блоках. */
  const people = useMemo(() => orderedPeople(S.people, perms.me), [S.people, perms.me])

  const sorted = useMemo(
    () => [...S.buySections].sort((a, b) => a.ord - b.ord),
    [S.buySections],
  )
  const desktop = useIsDesktop()

  const patch = (id: string, f: (p: BuyItem) => void) =>
    update((s) => {
      const p = s.buy.find((x) => x.i === id)
      if (p) {
        f(p)
        touch(p)
      }
    })

  /**
   * Добавить позицию. `afterId` не передан — в конец блока; пустая строка —
   * в самое начало; id строки — сразу под ней.
   */
  const addItem = (secId: string, afterId?: string): string => {
    const id = 'p' + Date.now().toString(36)
    update((s) => {
      const list = s.buy.filter((x) => x.sec === secId).sort(byOrd)
      let ord = (list.length + 1) * 10
      if (afterId !== undefined) {
        /* У позиций из сида порядка нет вовсе, поэтому перед вставкой в середину
           пересчитываем его по всему блоку — иначе новая строка уедет в конец. */
        list.forEach((x, k) => {
          x.ord = (k + 1) * 10
          touch(x)
        })
        ord = (list.findIndex((x) => x.i === afterId) + 1) * 10 + 5
      }
      s.buy.push({
        i: id, sec: secId, n: '', q: 1, u: 'шт.', uid: 'sht',
        pr: 0, prf: 0, st: 'buy', c: '', who: '', by: perms.me || '',
        qby: perms.me || '', ord, ua: Date.now(),
      })
    })
    setFresh(id)
    return id
  }

  /* Просьба общего «плюса»: заводим покупку теми же руками, что и по кнопке
     раздела, раскрываем блок и уводим к строке (см. `lib/addnew.ts`). */
  const ask = useAddRequest('buy')
  const askRef = useRef(ask)
  useEffect(() => {
    if (ask === askRef.current) return
    askRef.current = ask
    const sid = askedHere('buy')
      ? visibleBlockId(list.current, sorted[0]?.i ?? '')
      : sorted[0]?.i ?? ''
    if (!sid) return
    setClosed((o) => ({ ...o, [sid]: false }))
    jumpToItem('buy', addItem(sid))
    /* Списки — из этого же рендера, на котором приехала заявка (см. «Сборы»). */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ask])

  /** Правка названия новой строки закончилась. Ничего не ввели — строки и не было. */
  const endFresh = (id: string, saved: boolean) => {
    setFresh(null)
    if (saved) return
    remove('buy', id)
    toast('Пустая строка не сохранилась')
  }

  const delItem = (p: BuyItem) => {
    remove('buy', p.i)
    toast(`«${p.n}» удалено`, {
      action: {
        label: 'Отменить',
        onClick: () =>
          update((s) => {
            if (s.del) delete s.del['buy:' + p.i]
            if (!s.buy.some((x) => x.i === p.i)) s.buy.push({ ...p, ua: Date.now() })
          }),
      },
    })
  }

  /* ─── действия над разделом (только редактору) ─── */

  const renameSec = (secId: string, t: string) =>
    update((s) => {
      const sec = s.buySections.find((x) => x.i === secId)
      if (sec) {
        sec.t = t
        sec.ua = Date.now()
      }
    })

  const delSec = (sec: BuySec) => {
    setMenu(null)
    remove('buySections', sec.i)
    toast(`Раздел «${sec.t}» удалён`, {
      action: {
        label: 'Отменить',
        onClick: () =>
          update((s) => {
            if (s.del) delete s.del['buySections:' + sec.i]
            if (!s.buySections.some((x) => x.i === sec.i))
              s.buySections.push({ ...sec, ua: Date.now() })
          }),
      },
    })
  }

  const menuSec = menu ? S.buySections.find((s) => s.i === menu) ?? null : null

  return (
    <div className="flex flex-col gap-4" ref={list}>
      <SectionHead
        title="Закупка"
        secId="buy"
        hint="Галочка слева — куплено. Без галочки «Берём» позиция в сумму не идёт"
        legend={BUY_LEGEND}
        /* Липкий «плюс» (06.08.2026). Позиция ложится в тот блок, который человек
           сейчас читает, а не всегда в первый. */
        action={
          perms.isEditor() || perms.me
            ? {
                label: 'Добавить покупку',
                onClick: () => {
                  const sid = visibleBlockId(list.current, sorted[0]?.i ?? '')
                  if (sid) addItem(sid)
                },
              }
            : undefined
        }
      />

      <BuyTotals S={S} />

      {sorted
        .map((sec) => {
          const rows = bySec[sec.i] ?? []
          return (
            <Group
              key={sec.i}
              data-block={sec.i}
              title={sec.t}
              done={rows.filter((p) => p.b).length}
              total={rows.length}
              open={closed[sec.i] !== true}
              onToggle={() => setClosed((o) => ({ ...o, [sec.i]: o[sec.i] !== true }))}
              onMenu={perms.isEditor() ? () => setMenu(sec.i) : undefined}
              /* Личный блок отличается пунктиром рамки; словами правило написано
                 в его подытоге — «в общий бюджет не входит». */
              className={sec.personal ? 'border-dashed border-line-strong' : undefined}
            >
              <BuyTable
                sec={sec}
                rows={rows}
                S={S}
                perms={perms}
                people={people}
                scroll={scroll}
                desktop={desktop}
                fresh={fresh}
                onPatch={patch}
                onDelete={delItem}
                onAdd={addItem}
                onFreshEnd={endFresh}
              />
            </Group>
          )
        })}

      {/* ⛔ Здесь стоял блок «Взаиморасчёты» (приехал из «Дороги» 05.08.2026).
          Убран 08.08.2026 по прямому слову заказчика: «Почему у тебя
          взаиморасчёты после еды, после закупки идут, а отдельно расчёты
          по логистике? У тебя всё в конце должно считаться». Теперь блок стоит
          ПОСЛЕ всех разделов — последним на листе (App.tsx). Экземпляр
          по-прежнему один (У-53). */}

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
                setClosed(Object.fromEntries(sorted.map((s) => [s.i, true])))
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
                Раздел удаляется, когда в нём не осталось ни одной позиции.
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
          subtitle="Закупка"
          value={menuSec.t}
          placeholder="Например, Продукты"
          onDone={(v) => v && renameSec(menuSec.i, v)}
        />
      )}
    </div>
  )
}
