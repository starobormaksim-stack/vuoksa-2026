import { useEffect, useMemo, useState } from 'react'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import type { State } from '@/lib/types'
import type { MenuDay } from '@/lib/types'
import { fmtNum, MDASH, NBSP } from '@/format'
import { planSumOf, sumOf, unitOf } from '@/lib/buyx'
import { money } from '@/lib/calc'
import { BuyBox } from '@/components/flops'
import { update, useTrip } from '@/store'

/**
 * Поиск по всему листу (docs/v2-ux-redesign.md, 14).
 * Механика v1 сохранена: находка знает свой раздел, тап открывает раздел
 * и подсвечивает строку по атрибуту data-hit.
 *
 * Пункт 12 разбора 05.08.2026: «я нажимаю на поиск, и там какая-то херобора…
 * наверху всё перекошено, дизайн не единообразен, и размеры у тебя все везде
 * по-разному». Замер показал две разные беды, и чинятся они в разных местах:
 * кегли и высоты органа — в `ui/command.tsx` (урок У-71), а свалка из 217 строк
 * до единой буквы запроса — здесь. Пустой запрос теперь показывает, ЧТО и ГДЕ
 * ищется, а находки разложены по разделам с заголовками.
 */

/** Крупные разделы в том порядке, в каком они идут по странице. */
const GROUPS: { section: string; title: string }[] = [
  /* ⚠️ «Поездка» здесь появилась 06.08.2026 вместе с точками маршрута: раньше
     они искались в «Дороге», а с уходом ленты живут на карте. Без своей группы
     находка есть в индексе, но на экран не попадает вовсе — замер поймал это
     сразу после переезда. */
  { section: 'trip', title: 'Поездка' },
  { section: 'gear', title: 'Сборы' },
  { section: 'buy', title: 'Закупка' },
  { section: 'road', title: 'Дорога' },
  { section: 'menu', title: 'Меню' },
  { section: 'crew', title: 'Команда' },
]

export interface Hit {
  key: string
  section: string
  sectionTitle: string
  title: string
  note: string
  itemId: string
  /**
   * ─── Только у позиций «Закупки» ───
   * Заказчик 08.08.2026: «когда я вбиваю в поиск какой-либо товар… мне даже
   * не обязательно смотреть на статью, где находится этот товар. Там указано
   * количество или вес, единица измерения — 1 упаковка или 3,5 кг. Можно
   * галочкой тоже отметить уже прям в поиске… В первую очередь количество
   * должно быть понятно: сколько чего брать? Я бы фиксировал то, что я хочу,
   * потому что сейчас в магазин сходить и попробовать это сделать».
   *
   * То есть находка в «Закупке» — это не ссылка на строку, а сама строка:
   * человек стоит у полки и отмечает купленное, не выходя из поиска.
   */
  /** «3 упаковки», «3,5 кг» — сколько брать и в чём меряем */
  qty?: string
  /** «270 ₽» — стоимость всего количества, а не за единицу */
  cost?: string
  /** отмечено ли «куплено»; `undefined` — галочки у находки нет вовсе */
  bought?: boolean
}

/* ─────────── отбор находок ───────────
 *
 * ⛔ Свой отбор, а не нечёткий поиск cmdk. Заказчик 08.08.2026: «поиск работает
 * не очень правильно… я написал, допустим, слово „сов“ — и мне выдаёт кучу слов…
 * он всё равно ищет огромное количество ненужного материала». Причина
 * измерима: cmdk (`command-score`) считает находкой любую строку, где буквы
 * запроса встречаются ПО ПОРЯДКУ вразбивку, — «сов» ловил «Спальник новый»
 * и «Соль, вода», а искали «Совок». Плюс в ключ отбора шли примечание
 * и название раздела, то есть слово находилось там, где человек его не видит.
 *
 * Правило простое и предсказуемое: ищем целый кусок слова, сначала в названии.
 */

/** Свести к сравнимому виду: регистр и «ё» мешать не должны. */
function norm(s: string): string {
  return (s || '').toLowerCase().replace(/ё/g, 'е')
}

/** Ранги совпадения, от самого точного к самому дальнему. */
const R_START = 4 /* название начинается с запроса: «Сов» → «Совок» */
const R_WORD = 3 /* с запроса начинается слово названия: «сгущ» → «Молоко сгущённое» */
const R_INSIDE = 2 /* запрос внутри слова названия: «гущ» → «Сгущёнка» */
const R_NOTE = 1 /* запроса в названии нет вовсе, он нашёлся в примечании */

/** Ранг одного слова запроса по одной находке. 0 — не нашлось нигде. */
function rankWord(title: string, note: string, w: string): number {
  if (title.startsWith(w)) return R_START
  if (new RegExp(`(^|[^\\p{L}\\p{N}])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'u').test(title)) {
    return R_WORD
  }
  if (title.includes(w)) return R_INSIDE
  if (note.includes(w)) return R_NOTE
  return 0
}

/**
 * Ранг находки по всему запросу: найтись обязаны ВСЕ слова, а ранг берётся
 * по самому слабому из них — иначе одно точное слово вытаскивало бы находку,
 * где второе слово запроса стоит только в примечании.
 */
function rankHit(h: Hit, words: string[]): number {
  const title = norm(h.title)
  const note = norm(h.note)
  let worst = R_START
  for (const w of words) {
    const r = rankWord(title, note, w)
    if (r === 0) return 0
    if (r < worst) worst = r
  }
  return worst
}

/**
 * Сколько находок показываем. Больше двух десятков строк человек глазами
 * не разбирает, а именно на это он и жаловался. Срезанное не замалчивается —
 * под списком стоит строка о том, что находок больше (постулат 5).
 */
const LIMIT = 20

/**
 * Отобрать находки: только лучший встретившийся уровень точности.
 *
 * Нашлось хоть что-то по началу слова — дальние совпадения (кусок внутри
 * слова, примечание) не показываются вовсе. Это и есть «не выдавать кучу»:
 * пока есть точное, приблизительное человеку не нужно.
 */
export function pickHits(hits: Hit[], q: string): { list: Hit[]; total: number } {
  const words = norm(q).split(/\s+/).filter(Boolean)
  if (words.length === 0) return { list: [], total: 0 }
  const scored: { h: Hit; r: number }[] = []
  let best = 0
  for (const h of hits) {
    const r = rankHit(h, words)
    if (r > 0) {
      scored.push({ h, r })
      if (r > best) best = r
    }
  }
  const kept = scored.filter((x) => x.r === best)
  return { list: kept.slice(0, LIMIT).map((x) => x.h), total: kept.length }
}

/** Собрать индекс поиска по всем коллекциям документа. */
export function buildHits(S: State): Hit[] {
  const out: Hit[] = []
  const gsec = new Map(S.gearSections.map((s) => [s.i, s.t]))
  const bsec = new Map(S.buySections.map((s) => [s.i, s.t]))

  for (const g of S.gear)
    out.push({
      key: 'gear:' + g.i, section: 'gear', sectionTitle: 'Сборы · ' + (gsec.get(g.sec) ?? ''),
      title: g.n, note: g.c, itemId: g.i,
    })
  for (const p of S.buy) {
    /* Стоимость показываем ту же, что и свёрнутая строка «Закупки»: факт, если
       он вписан, иначе план (`buy/BuyStrip.tsx`). Двух разных чисел для одной
       позиции на экране быть не должно. */
    const cost = p.prf > 0 ? sumOf(p) : planSumOf(p)
    out.push({
      key: 'buy:' + p.i, section: 'buy', sectionTitle: 'Закупка · ' + (bsec.get(p.sec) ?? ''),
      title: p.n, note: p.c, itemId: p.i,
      qty: `${fmtNum(p.q)}${NBSP}${unitOf(p, S)}`,
      cost: money(cost, S.doc),
      bought: !!p.b,
    })
  }
  /* ⚠️ Точка маршрута ведёт в «Поездку», на карту, а не в «Дорогу»: ленты точек
     там больше нет (06.08.2026), прыгать не к чему. Показывает точку карта —
     открывает её карточку, а точку без координат отправляет в мастер
     «Разметить маршрут» (см. `askMapPoint` в lib/mapfocus.ts). */
  for (const r of S.route)
    out.push({
      key: 'route:' + r.i, section: 'trip', sectionTitle: 'Поездка · точка на карте',
      title: r.n, note: r.c, itemId: r.i,
    })
  for (const t of S.transport)
    out.push({
      key: 'tr:' + t.i, section: 'road', sectionTitle: 'Дорога · техника',
      title: t.n, note: t.calcT, itemId: t.i,
    })
  for (const r of S.rent)
    out.push({
      key: 'rent:' + r.i, section: 'road', sectionTitle: 'Дорога · аренда',
      title: r.n, note: r.calcT, itemId: r.i,
    })
  for (const q of S.ideas ?? [])
    out.push({
      key: 'idea:' + q.i, section: 'road', sectionTitle: 'Дорога · что уточнить',
      title: q.n, note: q.why, itemId: q.i,
    })
  for (const d of (S.menu ?? []) as MenuDay[])
    for (const dish of d.dishes ?? [])
      out.push({
        key: 'dish:' + d.i + ':' + (dish.i ?? dish.n), section: 'menu',
        sectionTitle: 'Меню · ' + d.t, title: dish.n, note: dish.q, itemId: dish.i ?? '',
      })
  for (const p of S.people)
    out.push({
      key: 'person:' + p.id, section: 'crew', sectionTitle: 'Команда',
      title: p.name, note: p.role, itemId: p.id,
    })
  return out
}

export function SearchCommand({
  S,
  open,
  onOpenChange,
  onJump,
}: {
  S: State
  open: boolean
  onOpenChange: (v: boolean) => void
  onJump: (section: string, itemId: string) => void
}) {
  const hits = useMemo(() => buildHits(S), [S])
  const [q, setQ] = useState('')
  /* Право отмечать «куплено» — то же самое, что в самом разделе «Закупка».
     Нет права — галочка рисуется значком без кнопки (постулат 6, `BuyBox`). */
  const { perms } = useTrip()
  const canEdit = perms.isEditor()

  /* Закрыли окно — запрос забыт. Иначе следующее открытие показывает прошлую
     находку, а человек читает это как «поиск застрял». */
  useEffect(() => {
    if (!open) setQ('')
  }, [open])

  const asked = q.trim().length > 0
  const found = useMemo(() => (asked ? pickHits(hits, q) : { list: [], total: 0 }), [hits, q, asked])

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Поиск по листу"
      description="Ищем по названиям"
      className="sm:max-w-[560px]"
      /* Отбор наш (`pickHits`), а не нечёткий счёт cmdk — иначе он отсеет
         и переставит уже отобранное по своим правилам. */
      shouldFilter={false}
    >
      <CommandInput placeholder="Что ищем?" value={q} onValueChange={setQ} />
      {/* ⛔ До первой буквы списка нет ВОВСЕ: ни перечня позиций, ни рассказа
          о том, где мы ищем. Заказчик 08.08.2026: «мало того, что он
          отображается просто отвратительно… опять огромный объём информации.
          „Ищем по названиям, примечаниям“ — не нужна эта информация».
          Окно в этот момент — одно поле ввода, и больше ничего.
          dvh, а не vh: на iOS и во встроенном браузере Телеграма `vh` считается
          по самому большому окну, и при видимых панелях низ списка уезжает
          за экран. */}
      {asked && (
        <CommandList className="max-h-[60dvh]">
          <CommandEmpty>Ничего не нашлось</CommandEmpty>
          {GROUPS.map(({ section, title }) => {
            const list = found.list.filter((h) => h.section === section)
            if (list.length === 0) return null
            return (
              <CommandGroup key={section} heading={title}>
                {list.map((h) => (
                  <CommandItem
                    key={h.key}
                    value={h.key}
                    onSelect={() => {
                      onJump(h.section, h.itemId)
                      onOpenChange(false)
                    }}
                  >
                    {/* ⛔ Галочка отмечает КУПЛЕНО, не выходя из поиска, поэтому
                        нажатие по ней не должно доходить до самой находки:
                        иначе один и тот же тап и отметит товар, и закроет окно,
                        уведя человека в раздел. У полки это ровно то, чего он
                        просил не делать. */}
                    {h.bought !== undefined && (
                      /* `-my-2` съедает вертикальные отступы строки целиком:
                         цель касания галочки 44 px остаётся, а строка находки
                         с галочкой становится той же высоты (44), что и без
                         неё, — иначе список шёл ступеньками 52 / 44. */
                      <span
                        className="-my-2 shrink-0"
                        onClick={(e) => e.stopPropagation()}
                        onPointerDown={(e) => e.stopPropagation()}
                      >
                        <BuyBox
                          on={h.bought}
                          can={canEdit}
                          label={`${h.title || 'Позиция'}: ${h.bought ? 'куплено' : 'ещё не куплено'}`}
                          onToggle={() => update((s) => {
                            const p = s.buy.find((x) => x.i === h.itemId)
                            if (p) p.b = !p.b
                          })}
                        />
                      </span>
                    )}
                    {/* Одна строка на находку: название и где оно лежит.
                        Примечание отсюда убрано — оно длиннее самой находки
                        и превращало список в простыню. */}
                    <span className="min-w-0 flex-1 truncate text-body text-ink">{h.title}</span>
                    {/* ⛔ У позиции «Закупки» вместо раздела стоят количество
                        и стоимость: «мне даже не обязательно смотреть на статью,
                        где находится этот товар… в первую очередь количество
                        должно быть понятно: сколько чего брать». Раздел там —
                        сведение, которое у полки не нужно, а место занимает. */}
                    {h.qty ? (
                      <>
                        <span className="tnum shrink-0 text-note text-muted">{h.qty}</span>
                        <span className="tnum shrink-0 text-note font-semibold text-ink">{h.cost}</span>
                      </>
                    ) : (
                      <span className="shrink-0 text-micro text-muted">{h.sectionTitle}</span>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            )
          })}
          {/* Срезанное не замалчиваем (постулат 5), но говорим одной строкой. */}
          {found.total > found.list.length && (
            <p className="px-3 py-2 text-micro text-muted">
              Показаны первые <span className="tnum">{found.list.length}</span> из{' '}
              <span className="tnum">{found.total}</span> {MDASH} уточните слово
            </p>
          )}
        </CommandList>
      )}
    </CommandDialog>
  )
}
