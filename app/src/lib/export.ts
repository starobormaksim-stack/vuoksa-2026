/**
 * Выгрузка поездки в книгу Excel.
 *
 * Здесь только сборка листов из документа `S` — сам формат файла пишет `lib/xlsx.ts`.
 * Разделы книги повторяют разделы сервиса и таблицу заказчика: Сводка · Погода ·
 * Дорога · Закупка · Снаряжение · Аптечка · Меню · Маршрут · Не забыть.
 *
 * Три правила, которые здесь важнее красоты:
 *
 * 1. Ничего из документа не теряется. Если у позиции есть комментарий, отметка
 *    «не может взять» или своё название раздела — оно попадает в книгу. Выгрузка,
 *    которая роняет данные, хуже, чем её отсутствие: человек унесёт её в лес
 *    и там обнаружит, что половины нет.
 * 2. Смотрят с телефона. Колонок мало, название всегда слева и широкое, шапка
 *    и первые столбцы закреплены — таблица листается вбок без потери строки.
 * 3. Считаем тем же ядром, что и экран (`lib/calc.ts`). Никаких «почти таких же»
 *    формул: разойдись они хоть на рубль — верить нельзя ни экрану, ни файлу.
 */

import type { Gear, Notes, State } from './types.ts'
import { buildXlsx, firstHeadRow, type Cell, type Row, type Sheet } from './xlsx.ts'
import { calcAll, fuelPriceOf, litres, rentSum } from './calc.ts'
import { cantOf, isReady, qtyAskOf, statusOf } from './gearx.ts'
import { statusName, unitOf } from './buyx.ts'
import { permName } from './perm.ts'
import { titleOf } from './sectitles.ts'

/* ─────────── короткие помощники ─────────── */

const head = (v: string): Cell => ({ v, s: 'head' })
const sect = (v: string): Cell => ({ v, s: 'section' })
const note = (v: string): Cell => ({ v, s: 'note' })
const title = (v: string): Cell => ({ v, s: 'title' })
const total = (v: string | number): Cell => ({ v, s: 'total' })
const rub = (v: number): Cell => ({ v, s: 'money' })
const rubTotal = (v: number): Cell => ({ v, s: 'totalMoney' })
const qty = (v: number): Cell => ({ v, s: 'qty' })

/** Пустая строка-отбивка между блоками. */
const gap: Row = []

/** Строка шапки из готовых названий колонок. */
function headRow(...names: string[]): Row {
  return names.map(head)
}

/** Сортировка по полю `ord`, устойчивая к его отсутствию. */
function byOrd<T extends { ord?: number }>(list: T[]): T[] {
  return [...list].sort((a, b) => (a.ord ?? 0) - (b.ord ?? 0))
}

/**
 * Строки «исходных данных» из подписей `nt`.
 *
 * В документе у чисел есть собственные подписи: что это за число, в чём измеряется
 * и откуда взялось (`{t, u, c}`). На экране они показаны, значит обязаны быть
 * и в книге — иначе «10,5» в столбце превращается в загадку.
 */
function noteRows(obj: Record<string, unknown>, nt: Notes | undefined, width: number): Row[] {
  if (!nt) return []
  const out: Row[] = []
  for (const key of Object.keys(nt)) {
    const n = nt[key]
    const raw = obj[key]
    if (typeof raw !== 'number' && typeof raw !== 'string') continue
    const row: Row = [n.t || key, typeof raw === 'number' ? qty(raw) : raw, n.u || '']
    while (row.length < width - 1) row.push(null)
    row.push(n.c || '')
    out.push(row)
  }
  return out
}

/* ─────────── Сводка ─────────── */

/** Адрес точки приезда словами; пусто — его ещё не заводили. */
function destAddr(S: State): string {
  const list = S.trip.places ?? []
  const main = list.find((p) => p.main) ?? list[0]
  const addr = main?.addr?.trim() ?? ''
  return addr ? `Приезд: ${addr}` : ''
}

function sheetSummary(S: State): Sheet {
  const c = calcAll(S)
  const rows: Row[] = [
    [title(S.trip.title || 'Поездка')],
    [note(S.trip.sub || '')],
    [note([S.trip.dates, S.trip.route].filter(Boolean).join(' · '))],
    /* Адрес точки приезда — пункт 6 разбора: заводится один раз на карте
       и появляется везде, где о поездке рассказывают. Выгрузка — как раз такое
       место: её открывают в дороге, когда сети уже нет. Пусто — строки нет. */
    [note(destAddr(S))],
    gap,
    [sect('КЛЮЧЕВЫЕ ЦИФРЫ')],
    headRow('Наименование', 'Значение', 'Ед.', 'Комментарий'),
    ['Дорога всего', qty(c.km), 'км', 'Туда и обратно плюс местные разъезды'],
    ['Топливо', rub(c.fuel), '₽', 'Считается по расходу техники и цене литра'],
    ['Аренда и парковка', rub(c.rent), '₽', ''],
    ['Транспорт, лодка, парковка', rub(c.transport), '₽', 'Топливо плюс аренда'],
    ['Закупка', rub(c.buy), '₽', '«Купить» попадает в сумму, остальное — нет'],
    [total('Всего'), rubTotal(c.total), total('₽'), total('')],
    [
      `С каждого (÷ ${S.people.length || 1})`,
      rub(c.perPerson),
      '₽',
      'Общий счёт, поделённый на всех',
    ],
  ]

  if (c.personal > 0) {
    rows.push(['Личное', rub(c.personal), '₽', 'Каждый закупает сам — в общий делёж не входит'])
  }
  for (const can of c.cans) {
    rows.push([
      `Канистры · ${can.name}`,
      qty(can.cans),
      'шт.',
      `Везём с собой ${can.litres.toFixed(1).replace('.', ',')} л`,
    ])
  }

  rows.push(gap)
  rows.push([sect('ЭКИПАЖ')])
  rows.push(headRow('Имя', 'Машина', 'Права', 'Что на нём'))
  for (const p of S.people) {
    rows.push([p.name, p.car || '', permName(p.perm), p.role || p.desc || ''])
  }

  if (S.trip.note) {
    rows.push(gap)
    rows.push([note(S.trip.note)])
  }

  rows.push(gap)
  rows.push([sect('КАК ПОЛЬЗОВАТЬСЯ')])
  rows.push(headRow('Колонка', 'Что означает', '', ''))
  rows.push(['«V»', 'Отмечено в сервисе как собранное или сделанное', '', ''])
  rows.push(['«Статус»', '«Купить» попадает в сумму. «Есть у …» и «Не берём» — нет', '', ''])
  rows.push(['«Всего»', 'Сумма по всем участникам в строке снаряжения', '', ''])
  rows.push([
    note('Это снимок листа на день выгрузки. Правки в этом файле в общий лист не возвращаются.'),
  ])

  return { name: 'Сводка', widths: [40, 16, 10, 52], rows, freezeRows: 6, freezeCols: 1 }
}

/* ─────────── Погода ─────────── */

interface WeatherDay {
  d?: string
  wd?: string
  day?: number
  night?: number
  prec?: string
  wind?: string
  means?: string
}
interface DaylightRow {
  t?: string
  v?: string
  c?: string
}

function sheetWeather(S: State): Sheet | null {
  const w = S.weather as
    | { updated?: string; days?: WeatherDay[]; daylight?: DaylightRow[]; concl?: string[]; src?: string }
    | undefined
  const days = w?.days ?? []
  if (!Array.isArray(days) || days.length === 0) return null

  const rows: Row[] = [
    [title('Погода')],
    [note(w?.updated ? `Данные на ${w.updated}` : '')],
    gap,
    [sect('ПРОГНОЗ ПО ДНЯМ')],
    headRow('Дата', 'День', 'Днём, °C', 'Ночью, °C', 'Осадки', 'Ветер', 'Что это значит для нас'),
  ]
  for (const d of days) {
    rows.push([
      d.d || '',
      d.wd || '',
      typeof d.day === 'number' ? qty(d.day) : '',
      typeof d.night === 'number' ? qty(d.night) : '',
      d.prec || '',
      d.wind || '',
      d.means || '',
    ])
  }

  const daylight = w?.daylight ?? []
  if (Array.isArray(daylight) && daylight.length) {
    rows.push(gap)
    rows.push([sect('СВЕТОВОЙ ДЕНЬ И ВОДА')])
    rows.push(headRow('Параметр', 'Значение', '', '', '', '', 'Комментарий'))
    for (const r of daylight) rows.push([r.t || '', r.v || '', null, null, null, null, r.c || ''])
  }

  const concl = w?.concl ?? []
  if (Array.isArray(concl) && concl.length) {
    rows.push(gap)
    rows.push([sect('ВЫВОДЫ ДЛЯ СБОРОВ')])
    for (const line of concl) rows.push([note(String(line))])
  }
  if (w?.src) {
    rows.push(gap)
    rows.push([note(String(w.src))])
  }

  return {
    name: 'Погода',
    widths: [10, 8, 12, 12, 26, 12, 56],
    rows,
    freezeRows: 5,
    freezeCols: 1,
  }
}

/* ─────────── Дорога ─────────── */

function sheetRoad(S: State): Sheet {
  const c = calcAll(S)
  const W = 6

  const rows: Row[] = [
    [title(titleOf(S, 'road', 'Дорога'))],
    [note('Топливо, аренда и канистры. Синие цифры сервиса здесь просто числа.')],
    gap,
    [sect('ИСХОДНЫЕ ДАННЫЕ')],
    headRow('Параметр', 'Значение', 'Ед.', '', '', 'Комментарий / источник'),
  ]

  rows.push(...noteRows(S.trip.dist as unknown as Record<string, unknown>, S.trip.dist.nt, W))
  for (const f of byOrd(S.fuelPrices)) {
    rows.push(...noteRows(f as unknown as Record<string, unknown>, f.nt, W))
  }
  for (const t of byOrd(S.transport)) {
    rows.push(...noteRows(t as unknown as Record<string, unknown>, t.nt, W))
  }
  for (const r of byOrd(S.rent)) {
    rows.push(...noteRows(r as unknown as Record<string, unknown>, r.nt, W))
  }
  rows.push(['Человек в поездке', qty(S.people.length), 'чел.', null, null, ''])
  rows.push(['Объём канистры', qty(S.doc?.canVol || 20), 'л', null, null, ''])

  rows.push(gap)
  rows.push([sect('РАСЧЁТ ТОПЛИВА И РАСХОДОВ')])
  rows.push(headRow('Статья', 'Километры / часы', 'Литры', 'Цена, ₽', 'Сумма, ₽', 'Комментарий'))

  for (const t of byOrd(S.transport)) {
    const l = litres(t, S)
    const price = fuelPriceOf(S, t.fuel)
    const base =
      t.rateU === 'lh' ? qty(t.hours) : t.rateU === 'fix' ? ('—' as const) : qty(c.km)
    rows.push([
      t.calcT || t.n,
      base,
      qty(l),
      rub(price),
      rub(l * price),
      [t.c, t.carry ? 'везём с собой в канистрах' : ''].filter(Boolean).join(' · '),
    ])
  }
  for (const r of byOrd(S.rent)) {
    const cat = S.rentCats.find((x) => x.i === r.cat)
    rows.push([
      r.calcT || r.n,
      qty(r.qty),
      '—',
      rub(r.price),
      rub(rentSum(r)),
      [
        r.count > 1 ? `${r.count} шт. × ${r.qty} ${r.unit || ''}`.trim() : '',
        cat ? cat.t : '',
        r.c,
        r.warn,
      ]
        .filter(Boolean)
        .join(' · '),
    ])
  }
  rows.push([total('Итого транспорт, лодка, парковка'), null, null, null, rubTotal(c.transport), null])
  rows.push([
    'На каждого',
    null,
    null,
    null,
    rub(S.people.length ? c.transport / S.people.length : 0),
    '',
  ])

  rows.push(gap)
  rows.push([sect('СКОЛЬКО НУЖНО КАНИСТР')])
  rows.push(
    headRow('Топливо', 'Литров', `Канистр по ${S.doc?.canVol || 20} л`, '', '', 'Что делать'),
  )
  for (const row of byOrd(S.canRows)) {
    const fuel = S.fuelPrices.find((f) => f.i === row.fuel)
    const info = c.cans.find((x) => x.fuel === row.fuel)
    rows.push([
      row.t || (fuel ? fuel.n : row.fuel),
      info ? qty(info.litres) : '—',
      info ? qty(info.cans) : '—',
      null,
      null,
      row.c || '',
    ])
  }

  return {
    name: 'Дорога',
    widths: [46, 16, 12, 14, 14, 52],
    rows,
    freezeRows: firstHeadRow(rows),
    freezeCols: 1,
  }
}

/* ─────────── Закупка ─────────── */

function sheetBuy(S: State): Sheet {
  const rows: Row[] = [
    [title(titleOf(S, 'buy', 'Закупка'))],
    [note('«Купить» попадает в общую сумму. «Есть у …», «Под вопросом» и «Не берём» — нет.')],
  ]

  let grand = 0
  for (const sec of byOrd(S.buySections)) {
    const items = byOrd(S.buy.filter((p) => p.sec === sec.i))
    if (!items.length) continue
    rows.push(gap)
    rows.push([sect(sec.t.toUpperCase() + (sec.personal ? ' · ЛИЧНОЕ, В ОБЩИЙ СЧЁТ НЕ ВХОДИТ' : ''))])
    rows.push(
      headRow('V', 'Наименование', 'Кол-во', 'Ед.', 'Цена, ₽', 'Сумма, ₽', 'Статус', 'Комментарий'),
    )
    let sum = 0
    for (const p of items) {
      const price = p.prf > 0 ? p.prf : p.pr
      const line = p.q * price
      if (p.st === 'buy') sum += line
      const who = p.who ? S.people.find((x) => x.id === p.who) : null
      rows.push([
        p.b ? 'V' : '',
        p.n,
        qty(p.q),
        unitOf(p, S),
        price > 0 ? rub(price) : '—',
        p.st === 'buy' && price > 0 ? rub(line) : '—',
        statusName(p.st, S.people),
        [
          p.c,
          p.prf > 0 && p.pr > 0 && p.pr !== p.prf ? `цена по факту, было ${p.pr}` : '',
          who ? `покупает ${who.name}` : '',
        ]
          .filter(Boolean)
          .join(' · '),
      ])
    }
    rows.push([null, total(`Подытог · ${sec.t}`), null, null, null, rubTotal(sum), null, null])
    if (!sec.personal) grand += sum
  }

  rows.push(gap)
  rows.push([null, total('ИТОГО ЗАКУПКА'), null, null, null, rubTotal(grand), null, null])

  return {
    name: 'Закупка',
    widths: [4, 42, 9, 8, 12, 14, 20, 48],
    rows,
    freezeRows: firstHeadRow(rows),
    freezeCols: 2,
  }
}

/* ─────────── Снаряжение и Аптечка ─────────── */

/** Раздел сборов «Аптечка» — у него в книге свой лист, как в таблице заказчика. */
function isFirstAid(secId: string, secTitle: string): boolean {
  return secId === 'apt' || /^аптечк/i.test(secTitle.trim())
}

/** Комментарий позиции сборов вместе с отметками «не может взять» и просьбами. */
function gearComment(g: Gear, S: State): string {
  const parts: string[] = []
  if (g.c) parts.push(g.c)
  for (const p of S.people) {
    const cant = cantOf(g, p.id)
    if (cant) parts.push(`${p.name} не может взять${cant.why ? `: ${cant.why}` : ''}`)
    const ask = qtyAskOf(g, p.id)
    if (ask) parts.push(`${p.name} просит ${ask.want ?? 0} шт.${ask.why ? `: ${ask.why}` : ''}`)
  }
  return parts.join(' · ')
}

function gearSheet(S: State, name: string, secIds: string[], sheetTitle: string, hint: string): Sheet | null {
  const sections = byOrd(S.gearSections).filter((s) => secIds.includes(s.i))
  if (!sections.length) return null

  const people = S.people
  const rows: Row[] = [[title(sheetTitle)], [note(hint)]]

  for (const sec of sections) {
    const items = byOrd(S.gear.filter((g) => g.sec === sec.i))
    if (!items.length) continue
    rows.push(gap)
    rows.push([sect(sec.t.toUpperCase())])
    rows.push(headRow('V', 'Наименование', ...people.map((p) => p.name), 'Всего', 'Комментарий'))
    let ready = 0
    for (const g of items) {
      const counts = people.map((p) => g.o?.[p.id] || 0)
      const sum = counts.reduce((a, b) => a + b, 0)
      const holders = people.filter((p) => (g.o?.[p.id] || 0) > 0)
      const done = holders.length > 0 && holders.every((p) => isReady(statusOf(g, p.id)))
      if (done) ready++
      rows.push([
        done ? 'V' : '',
        g.n,
        ...counts.map((n) => (n > 0 ? qty(n) : '')),
        sum > 0 ? qty(sum) : '',
        gearComment(g, S),
      ])
    }
    rows.push([
      null,
      total('Позиций в блоке'),
      ...people.map(() => null),
      total(items.length),
      total(`${ready} из ${items.length} собрано`),
    ])
  }

  const widths = [4, 42, ...people.map(() => 10), 10, 52]
  return { name, widths, rows, freezeRows: firstHeadRow(rows), freezeCols: 2 }
}

/* ─────────── Меню ─────────── */

function sheetMenu(S: State): Sheet | null {
  const days = S.menu ?? []
  if (!days.length) return null

  const rows: Row[] = [
    [title(titleOf(S, 'menu', 'Меню'))],
    [note('Раскладка по дням. Количества сверены со списком закупки.')],
  ]
  for (const d of byOrd(days)) {
    rows.push(gap)
    rows.push([sect([d.t, d.sub].filter(Boolean).join(' · ').toUpperCase())])
    rows.push(headRow('V', '№', 'Блюдо', 'Сколько'))
    d.dishes.forEach((dish, i) => {
      rows.push([dish.done || d.done ? 'V' : '', qty(i + 1), dish.n, dish.q])
    })
  }

  return { name: 'Меню', widths: [4, 6, 46, 56], rows, freezeRows: firstHeadRow(rows), freezeCols: 3 }
}

/* ─────────── Маршрут ─────────── */

/** Координаты точки одной строкой — на случай, когда карты под рукой нет. */
function coords(lat?: number, lon?: number): string {
  if (typeof lat !== 'number' || typeof lon !== 'number') return ''
  return `${lat.toFixed(5)}, ${lon.toFixed(5)}`
}

function sheetRoute(S: State): Sheet | null {
  if (!S.route.length) return null
  const rows: Row[] = [
    [title('Маршрут')],
    [note('Время ориентировочное — от него удобно плясать, а не следовать буквально.')],
    gap,
    headRow('V', 'Точка', 'Время', 'Км от прошлой', 'Адрес или координаты', 'Комментарий'),
  ]
  for (const p of byOrd(S.route)) {
    rows.push([
      p.done ? 'V' : '',
      p.n,
      p.time || '',
      p.leg > 0 ? qty(p.leg) : '',
      p.addr || coords(p.lat, p.lon),
      [p.c, p.labT].filter(Boolean).join(' · '),
    ])
  }
  return {
    name: 'Маршрут',
    widths: [4, 52, 10, 14, 38, 52],
    rows,
    freezeRows: firstHeadRow(rows),
    freezeCols: 2,
  }
}

/* ─────────── Не забыть ─────────── */

function sheetIdeas(S: State): Sheet | null {
  const ideas = S.ideas ?? []
  if (!ideas.length) return null
  const rows: Row[] = [
    [title('Не забыть')],
    [note('Открытые вопросы по поездке. Дописывайте свои строки снизу.')],
    gap,
    headRow('V', 'Что уточнить или сделать', 'Почему это важно', 'На ком'),
  ]
  for (const q of ideas) {
    rows.push([q.done ? 'V' : '', q.n, q.why || '', q.who || ''])
  }
  return {
    name: 'Не забыть',
    widths: [4, 52, 56, 18],
    rows,
    freezeRows: firstHeadRow(rows),
    freezeCols: 2,
  }
}

/* ─────────── книга целиком ─────────── */

/** Листы книги в том порядке, в каком их читают. */
export function tripSheets(S: State): Sheet[] {
  const aid = byOrd(S.gearSections)
    .filter((s) => isFirstAid(s.i, s.t))
    .map((s) => s.i)
  const rest = byOrd(S.gearSections)
    .filter((s) => !isFirstAid(s.i, s.t))
    .map((s) => s.i)

  const sheets: (Sheet | null)[] = [
    sheetSummary(S),
    sheetWeather(S),
    sheetRoad(S),
    sheetBuy(S),
    gearSheet(
      S,
      'Снаряжение',
      rest,
      titleOf(S, 'gear', 'Снаряжение'),
      'Цифра — сколько штук везёт этот человек. «Всего» — сумма по строке.',
    ),
    gearSheet(
      S,
      'Аптечка',
      aid,
      'Аптечка',
      'Собирается в одну коробку и живёт в лагере на видном месте.',
    ),
    sheetMenu(S),
    sheetRoute(S),
    sheetIdeas(S),
  ]
  return sheets.filter((s): s is Sheet => s !== null)
}

/** Дата для имени файла: «04.08.2026». */
function stamp(now: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(now.getDate())}.${p(now.getMonth() + 1)}.${now.getFullYear()}`
}

/** Имя файла из названия поездки и сегодняшней даты. */
export function tripFileName(S: State, now: Date = new Date()): string {
  const name = (S.trip.title || 'Поездка').replace(/[\\/:*?"<>|]/g, ' ').trim()
  return `${name} · ${stamp(now)}.xlsx`
}

/** Собрать книгу байтами — этим же путём ходят проверки в Node. */
export function tripWorkbook(S: State): Uint8Array<ArrayBuffer> {
  return buildXlsx(tripSheets(S))
}
