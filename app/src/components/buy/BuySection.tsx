import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronsDownUp, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import type { BuySection as BuySec } from '@/lib/types'
import { useTrip, touch } from '@/store'
import { orderedPeople } from '@/lib/people'
import { visibleBlockId } from '@/lib/visible'
import { askedHere, useAddRequest } from '@/lib/addnew'
import { useFold, useUnfoldRequest } from '@/foldpref'
import { jumpToItem } from '@/lib/jump'
import {
  Btn, ConfirmButton, Group, InsertHere, ResponsiveSheet, SectionHead, TextSheet,
  newTableScroll, useIsDesktop,
} from '@/components/flops'
import { SpendRoad, SpendTotals } from '@/components/road/SpendRoad'
import { BUY_LEGEND } from './legend'
import { BuyTotals } from './BuyTotals'
import { BuyTable } from './BuyTable'
import { byOrd, secSum, type BuyItem } from './buylocal'
import { money } from '@/lib/calc'
import { plural } from '@/format'

/**
 * Раздел «Расходы» — всё, что касается денег поездки.
 *
 * ─── Подразделы (заказчик, 09.08.2026) ───
 * «Логистика должна быть одним из подразделов внутри расходов, но ты этого
 * не сделал… я тебе говорил, вот, и не доделал до сих пор»; «ты проживание
 * фиксируешь тоже как подраздел внутри расходов, потому что это расходы
 * в том числе»; «а вот меню идёт отдельно»; «уже по итогу всех этих
 * подразделов, по итогу всего раздела расходов там будет условно как раз
 * этот расчёт и фиксироваться».
 *
 * Отсюда порядок: статьи закупки · «Аренда» · «Логистика» · «Проживание» ·
 * итог по закупке · итоги поездки · взаиморасчёты (последние — сразу за
 * разделом, `LAST_MONEY_SECTION` в `sections.ts`). Форма у всех подразделов
 * одна: заголовок с суммой, тап складывает, внутри липкая колонка названий
 * и свои колонки (постулат 3.5).
 *
 * ⛔ Свёртка у ВСЕХ подразделов — одна память (`useFold('buy')`), и `fold`
 * уезжает в `SpendRoad` пропом. Второй экземпляр на том же ключе затирал бы
 * раскрытое (`foldpref.ts` читает хранилище один раз и пишет карту целиком).
 *
 * ─── Таблица закупки ───
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
     не проваливается в «Действия подраздела» (см. «Сборы»). */
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

  /**
   * Завести подраздел. Заказчик 08.08.2026: «я должен иметь возможность… создать
   * раздел, подраздел, строку» — создать статью было нечем (только
   * переименовать и удалить). Название сразу на правке тем же TextSheet,
   * что и «Переименовать» (постулат 3).
   *
   * `afterId` не передан — в конец (кнопка справа от слова «Расходы»);
   * id статьи — сразу под ней (плюс в промежутке, `InsertHere`).
   */
  const addSec = (afterId?: string) => {
    const id = 'bs' + Date.now().toString(36)
    update((s) => {
      const secs = [...s.buySections].sort((a, b) => a.ord - b.ord)
      let ord = Math.max(0, ...secs.map((x) => x.ord)) + 10
      if (afterId !== undefined) {
        /* Порядок у статей из сида идёт с шагом, который не обязан быть ровным:
           перед вставкой в середину пересчитываем его целиком, иначе новая
           статья уедет в конец (тем же приёмом, что `addItem`). */
        secs.forEach((x, k) => {
          x.ord = (k + 1) * 10
          x.ua = Date.now()
        })
        ord = (secs.findIndex((x) => x.i === afterId) + 1) * 10 + 5
      }
      s.buySections.push({
        i: id,
        t: 'Новый подраздел',
        personal: false,
        ord,
        by: perms.me || '',
        ua: Date.now(),
      })
    })
    fold.show(id)
    setMenu(id)
    setNewSec(true)
    setRename(true)
  }

  /**
   * Убрать статью вместе с тем, что в ней лежит.
   *
   * Прежде удалялась только ПУСТАЯ, а занятой сервис отвечал строкой
   * «Раздел удаляется, когда в нём не осталось ни одной позиции». Заказчик
   * 09.08.2026: «я захотел по какому-нибудь подразделу удалить, там не знаю,
   * напитки горячие. Я этого не могу сделать: есть переименовать и свернуть
   * всё, а я вообще-то удалить хочу». Объяснение вместо действия — молчаливый
   * отказ (постулаты 5 и 6).
   *
   * ⛔ Позиции уходят вместе со статьёй, иначе они остались бы в документе
   * с ссылкой на несуществующую статью — то есть пропали бы с экрана,
   * оставаясь в данных. Возврат поднимает и статью, и все её позиции разом.
   */
  const delSec = (sec: BuySec) => {
    setMenu(null)
    const items = bySec[sec.i] ?? []
    items.forEach((p) => remove('buy', p.i))
    remove('buySections', sec.i)
    const хвост = items.length
      ? ` — вместе с ${items.length} ${plural(items.length, 'позицией', 'позициями', 'позициями')}`
      : ''
    toast(`Убрали подраздел «${sec.t}»${хвост}`, {
      action: {
        label: 'Вернуть',
        onClick: () =>
          update((s) => {
            if (s.del) delete s.del['buySections:' + sec.i]
            if (!s.buySections.some((x) => x.i === sec.i))
              s.buySections.push({ ...sec, ua: Date.now() })
            for (const p of items) {
              if (s.del) delete s.del['buy:' + p.i]
              if (!s.buy.some((x) => x.i === p.i)) s.buy.push({ ...p, ua: Date.now() })
            }
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
        /* ⛔ Кнопка справа от названия заводит ПОДРАЗДЕЛ, а не строку. Заказчик
           09.08.2026: «когда я добавляю вещь, я добавляю внутри подраздела…
           а с правой стороны от слова „Расходы“ я добавляю подразделы, и они
           пустые возникают, которые нужно заполнить»; «я понял, что ты
           добавляешь именно строки, а я этого не просил». Покупка заводится
           там, где живёт, — внутри своей статьи («Добавить позицию» и плюс
           у строки в `BuyTable`) либо видом «Покупка» у общего плюса. */
        action={
          perms.isEditor()
            ? { label: 'Добавить подраздел', onClick: () => addSec() }
            : undefined
        }
      />

      {/* ⛔ Здесь стоял «Общий счёт» (BuyTotals). Перенесён ПОД список 09.08.2026
          по слову заказчика с нажимом: «по десять раз я тебе сказал, что нужно
          это делать в конце: сначала список, потом в конце уже разблюдовка». */}

      {sorted
        .map((sec, k) => {
          const rows = bySec[sec.i] ?? []
          return (
            <Fragment key={sec.i}>
            <Group
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
            {/* Плюс в промежутке — вставить статью ИМЕННО СЮДА. Стоит только
                МЕЖДУ статьями: за последней его нет, там прежняя пунктирная
                строка и попадала «между существующими списками» — закупкой
                и «Арендой» (09.08.2026). В конец заводит кнопка у названия. */}
            {perms.isEditor() && k < sorted.length - 1 && (
              <InsertHere
                label={`Вставить подраздел после «${sec.t}»`}
                onClick={() => addSec(sec.i)}
              />
            )}
            </Fragment>
          )
        })}

      {/* «Аренда» · «Логистика» · «Проживание» — той же формой, что статьи
          закупки. Строки лежат в своих коллекциях, экран их только показывает
          (`lib/spend.ts`, постулат 4). */}
      <SpendRoad fold={fold} />

      {/* Разблюдовка — в конце, после всех списков: «сначала список, потом
          в конце уже разблюдовка» (заказчик, 08.08.2026). */}
      <BuyTotals S={S} />
      <SpendTotals fold={fold} />

      {/* ⛔ Здесь стоял блок «Взаиморасчёты» (приехал из «Дороги» 05.08.2026).
          Он и сейчас не здесь, а сразу ЗА разделом (`LAST_MONEY_SECTION`
          в `sections.ts`, рисует App.tsx): «уже по итогу всех этих подразделов,
          по итогу всего раздела расходов там будет условно как раз этот расчёт»
          (09.08.2026). Экземпляр по-прежнему один (У-53). */}

      {menuSec && (
        <ResponsiveSheet
          open={!rename}
          onOpenChange={(v) => !v && setMenu(null)}
          title="Действия подраздела"
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
            {/* Спрашивает вторым шагом на месте: попапов нет (У-158, `ConfirmButton`).
                Счёт того, что уйдёт вместе со статьёй, стоит прямо в вопросе. */}
            <ConfirmButton
              icon={Trash2}
              label="Удалить подраздел"
              ask={
                (bySec[menuSec.i] ?? []).length
                  ? `Удалить вместе с ${(bySec[menuSec.i] ?? []).length} ${plural(
                      (bySec[menuSec.i] ?? []).length,
                      'позицией',
                      'позициями',
                      'позициями',
                    )}?`
                  : 'Удалить подраздел?'
              }
              onConfirm={() => delSec(menuSec)}
            />
          </div>
        </ResponsiveSheet>
      )}

      {menuSec && (
        <TextSheet
          open={rename}
          onOpenChange={(v) => !v && endRename()}
          onBack={endRename}
          title="Название подраздела"
          subtitle="Расходы"
          value={menuSec.t}
          placeholder="Например, Продукты"
          onDone={(v) => v && renameSec(menuSec.i, v)}
        />
      )}
    </div>
  )
}
