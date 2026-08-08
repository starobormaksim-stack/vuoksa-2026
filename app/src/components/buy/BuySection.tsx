import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronsDownUp, Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import type { BuySection as BuySec } from '@/lib/types'
import { useTrip, touch } from '@/store'
import { orderedPeople } from '@/lib/people'
import { visibleBlockId } from '@/lib/visible'
import { askedHere, useAddRequest } from '@/lib/addnew'
import { useFold, useUnfoldRequest } from '@/foldpref'
import { jumpToItem } from '@/lib/jump'
import {
  Btn, Group, ResponsiveSheet, SectionHead, TextSheet, newTableScroll, useIsDesktop,
} from '@/components/flops'
import { BUY_LEGEND } from './legend'
import { BuyTotals } from './BuyTotals'
import { BuyTable } from './BuyTable'
import { byOrd, secSum, type BuyItem } from './buylocal'
import { money } from '@/lib/calc'

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
  /* ⛔ По умолчанию статьи СВЁРНУТЫ, раскрытое помнит браузер (заказчик
     08.08.2026: «по умолчанию все должно быть скрыто, свернуто… при
     перезагрузке остаются в том виде, в котором я их оставил»). Прежнее
     «все списки раскрыты» (06.08.2026) отменено — см. `foldpref.ts`. */
  const fold = useFold('buy')
  /** корень раздела — по нему липкий «плюс» находит блок, который сейчас читают */
  const list = useRef<HTMLDivElement | null>(null)
  /** id только что добавленной строки: подсвечена и сразу открыта на правку */
  const [fresh, setFresh] = useState<string | null>(null)
  /** открытая шторка действий раздела и её второй уровень «переименовать» */
  const [menu, setMenu] = useState<string | null>(null)
  const [rename, setRename] = useState(false)
  /* Только что заведённая статья: окно названия открыто сразу, и закрытие
     не проваливается в «Действия раздела» (см. «Сборы»). */
  const [newSec, setNewSec] = useState(false)
  const endRename = () => {
    setRename(false)
    if (newSec) {
      setNewSec(false)
      setMenu(null)
    }
  }
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
    fold.show(sid)
    jumpToItem('buy', addItem(sid))
    /* Списки — из этого же рендера, на котором приехала заявка (см. «Сборы»). */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ask])

  /* Прыжок из поиска в свёрнутую статью: сначала раскрыть её (foldpref.ts). */
  const uf = useUnfoldRequest('buy')
  const ufRef = useRef(uf.n)
  useEffect(() => {
    if (uf.n === ufRef.current) return
    ufRef.current = uf.n
    const p = (S.buy as BuyItem[]).find((x) => x.i === uf.item)
    if (p) fold.show(p.sec)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uf])

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

  /* Завести статью. Заказчик 08.08.2026: «я должен иметь возможность… создать
     раздел, подраздел, строку» — создать статью было нечем (только
     переименовать и удалить). Название сразу на правке тем же TextSheet,
     что и «Переименовать» (постулат 3). */
  const addSec = () => {
    const id = 'bs' + Date.now().toString(36)
    update((s) => {
      s.buySections.push({
        i: id,
        t: 'Новый раздел',
        personal: false,
        ord: Math.max(0, ...s.buySections.map((x) => x.ord)) + 10,
        by: perms.me || '',
        ua: Date.now(),
      })
    })
    fold.show(id)
    setMenu(id)
    setNewSec(true)
    setRename(true)
  }

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
        title="Расходы"
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

      {/* ⛔ Здесь стоял «Общий счёт» (BuyTotals). Перенесён ПОД список 09.08.2026
          по слову заказчика с нажимом: «по десять раз я тебе сказал, что нужно
          это делать в конце: сначала список, потом в конце уже разблюдовка». */}

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
              /* Свёрнутая статья обязана говорить свою сумму (шаг 1 разбора
                 «единой таблицы расходов»): число то же, что «Сумма, факт»
                 в подытоге блока (`secSum`), — из него складываются 26 005 ₽.
                 Раскрытой статье числа в шапке не нужно: оно уже стоит
                 в подытоге ниже, а одно число дважды на экране не живёт. */
              badge={
                !fold.isOpen(sec.i) && rows.length > 0 ? (
                  <span className="tnum shrink-0 text-note font-semibold text-ink">
                    {money(secSum(rows), S.doc)}
                  </span>
                ) : undefined
              }
              open={fold.isOpen(sec.i)}
              onToggle={() => fold.toggle(sec.i)}
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

      {/* Пунктирная строка — как «+ Транспорт» у веток карты (постулат 6:
          без права раздела кнопки нет). */}
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

      {/* «Общий счёт» — в самом конце раздела: сначала список, потом разблюдовка
          (заказчик, 08.08.2026). */}
      <BuyTotals S={S} />

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
                Раздел удаляется, когда в нём не осталось ни одной позиции.
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
          subtitle="Расходы"
          value={menuSec.t}
          placeholder="Например, Продукты"
          onDone={(v) => v && renameSec(menuSec.i, v)}
        />
      )}
    </div>
  )
}
