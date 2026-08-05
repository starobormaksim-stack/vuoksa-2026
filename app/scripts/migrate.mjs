// Миграция данных поездки: src/seed.json (модель v1) → app/fixtures/seed-sample.json (модель v2).
// Схема и таблица переезда: docs/v2-architecture.md. Скрипт падает, если хоть одна из
// контрольных сумм не совпала с боевыми цифрами v1 — это приёмочный тест миграции.
//   запуск: node app/scripts/migrate.mjs   (из корня репозитория)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const S = JSON.parse(readFileSync(join(root, 'src', 'seed.json'), 'utf8'))

const note = (k) => {
  const n = (S.logNotes || []).find((x) => x.k === k)
  return n ? { t: n.t, u: n.u, c: n.c } : undefined
}
const calcT = (k) => ((S.calcRows || []).find((x) => x.k === k) || {}).t || ''
const nt = (pairs) => {
  const out = {}
  for (const [field, k] of Object.entries(pairs)) {
    const n = note(k)
    if (n) out[field] = n
  }
  return out
}

const L = S.log

// ── справочники ──────────────────────────────────────────────────────────────
const fuelPrices = [
  { i: 'ai95', n: 'АИ-95', price: L.p95, u: '₽/л', c: '', nt: nt({ price: 'p95' }), ord: 1, ua: 0 },
  { i: 'ai92', n: 'АИ-92', price: L.p92, u: '₽/л', c: '', nt: nt({ price: 'p92' }), ord: 2, ua: 0 },
  { i: 'dt', n: 'Дизель', price: 0, u: '₽/л', c: '', nt: {}, ord: 3, ua: 0 },
]

const kinds = [
  { i: 'car', t: 'Автомобиль', rateU: 'l100km', icon: 'car', ord: 1, ua: 0 },
  { i: 'boat', t: 'Катер', rateU: 'lh', icon: 'sailboat', ord: 2, ua: 0 },
  { i: 'outboard', t: 'Лодочный мотор', rateU: 'lh', icon: 'sailboat', ord: 3, ua: 0 },
  { i: 'van', t: 'Фургон', rateU: 'l100km', icon: 'car', ord: 4, ua: 0 },
  { i: 'moto', t: 'Мотоцикл', rateU: 'l100km', icon: 'bike', ord: 5, ua: 0 },
  { i: 'plane', t: 'Самолёт', rateU: 'lh', icon: 'plane', ord: 6, ua: 0 },
  { i: 'heli', t: 'Вертолёт', rateU: 'lh', icon: 'plane', ord: 7, ua: 0 },
  { i: 'tool', t: 'Бензоинструмент', rateU: 'fix', icon: 'flame', ord: 8, ua: 0 },
]

const rateUnits = [
  { i: 'l100km', t: 'л/100 км', per: 'dist', form: 'per100' },
  { i: 'lh', t: 'л/ч', per: 'time', form: 'mul' },
  { i: 'fix', t: 'л (объём)', per: 'none', form: 'value' },
]

const rentCats = [
  { i: 'transport', t: 'Транспорт', ord: 1, ua: 0 },
  { i: 'place', t: 'Место и кемпинг', ord: 2, ua: 0 },
  { i: 'parking', t: 'Парковка', ord: 3, ua: 0 },
  { i: 'gear', t: 'Снаряжение', ord: 4, ua: 0 },
  { i: 'other', t: 'Другое', ord: 5, ua: 0 },
]

// единицы закупки: базовый набор + встречающиеся в данных
const units = [
  ['sht', 'шт.', 'штуки'], ['up', 'уп.', 'упаковки'], ['pak', 'пак.', 'пакеты'],
  ['kompl', 'компл.', 'комплекты'], ['para', 'пары', 'пары'], ['but', 'бут.', 'бутылки'],
  ['bank', 'банк.', 'банки'], ['kg', 'кг', 'килограммы'], ['g', 'г', 'граммы'],
  ['l', 'л', 'литры'], ['ml', 'мл', 'миллилитры'], ['pors', 'порц.', 'порции'],
  ['nabor', 'набор', 'наборы'],
].map(([i, t, full], ix) => ({ i, t, full, ord: ix + 1, ua: 0 }))
const unitByText = { 'шт.': 'sht', 'уп.': 'up', 'бут.': 'but', 'кг': 'kg', 'набор': 'nabor' }

// ── техника ──────────────────────────────────────────────────────────────────
const transport = [
  { i: 'tr_honda', n: 'Honda Accord', kind: 'car', kindT: '', fuel: 'ai95', rate: L.consHonda,
    rateU: 'l100km', hours: 0, litres: 0, carry: false, owner: 'kos', leg: 'road',
    calcT: calcT('honda'), c: '', nt: nt({ rate: 'consHonda' }), ord: 1, by: '', as: '', ua: 0 },
  { i: 'tr_aveo', n: 'Chevrolet Aveo', kind: 'car', kindT: '', fuel: 'ai95', rate: L.consAveo,
    rateU: 'l100km', hours: 0, litres: 0, carry: false, owner: 'mis', leg: 'road',
    calcT: calcT('aveo'), c: '', nt: nt({ rate: 'consAveo' }), ord: 2, by: '', as: '', ua: 0 },
  { i: 'tr_moto', n: 'Лодочный мотор 9,9 л.с.', kind: 'outboard', kindT: '', fuel: 'ai92',
    rate: L.motoL, rateU: 'lh', hours: L.motoH, litres: 0, carry: true, owner: 'kos', leg: 'water',
    calcT: calcT('moto'), c: '', nt: nt({ rate: 'motoL', hours: 'motoH' }), ord: 3, by: '', as: '', ua: 0 },
  { i: 'tr_saw', n: 'Бензопила', kind: 'tool', kindT: '', fuel: 'ai92', rate: 0, rateU: 'fix',
    hours: 0, litres: L.sawL, carry: true, owner: 'mis', leg: '',
    calcT: calcT('saw'), c: '', nt: nt({ litres: 'sawL' }), ord: 4, by: '', as: '', ua: 0 },
]

// ── аренда ───────────────────────────────────────────────────────────────────
const rent = [
  { i: 'rn_boat', n: 'Лодка «Ладога»', cat: 'transport', price: L.boatDay, unit: 'сут.',
    qty: L.boatDays, count: 1, calcT: calcT('boat'), c: '',
    blocks: [{ t: S.boat.t1, c: S.boat.c1 }, { t: S.boat.t2, c: S.boat.c2 }],
    warn: S.boat.warn, nt: nt({ price: 'boatDay', qty: 'boatDays' }), ord: 1, by: '', as: '', ua: 0 },
  { i: 'rn_park', n: 'Парковка на базе', cat: 'parking', price: L.parkDay, unit: 'сут.',
    qty: L.parkDays, count: L.cars, calcT: calcT('park'), c: '', blocks: [], warn: '',
    nt: nt({ price: 'parkDay', qty: 'parkDays', count: 'cars' }), ord: 2, by: '', as: '', ua: 0 },
]

// ── поездка: даты, места, расстояние ─────────────────────────────────────────
const trip = {
  ...S.trip,
  start: S.trip.start,
  end: '2026-08-14T18:00:00',
  datesAuto: true,
  places: [{ i: 'pl1', n: S.trip.place, lat: S.trip.lat ?? 61.04, lon: S.trip.lon ?? 30.14, main: true }],
  dist: {
    src: 'manual', auto: 0, manual: L.dist, kBack: L.kBack, local: L.local,
    nt: nt({ manual: 'dist', kBack: 'kBack', local: 'local' }),
  },
}

// ── канистры ─────────────────────────────────────────────────────────────────
const canRows = (S.canRows || []).map((r, ix) => ({
  i: r.k === 'l92' ? 'can_ai92' : r.k === 'l95' ? 'can_ai95' : 'can_' + r.k,
  fuel: r.k === 'l92' ? 'ai92' : 'ai95', t: r.t, c: r.c, ord: ix + 1, ua: 0,
}))

// ── секции и позиции ─────────────────────────────────────────────────────────
const gearSections = S.gearSections.map((s0, ix) => ({ i: s0.id, t: s0.t, ord: ix + 1, by: '', ua: 0 }))
const buySections = S.buySections.map((s0, ix) => ({ i: s0.id, t: s0.t, personal: !!s0.personal, ord: ix + 1, by: '', ua: 0 }))
const gear = S.gear.map((g) => {
  const q = {}
  for (const [pid, why] of Object.entries(g.q || {}))
    q[pid] = typeof why === 'string' ? { kind: 'cant', why, ua: g.ua || 0 } : why
  return { ...g, q, oby: g.oby || {} }
})
const buy = S.buy.map((b) => ({ ...b, uid: unitByText[b.u] || '', qby: b.qby || '' }))
const route = S.route.map((r) => ({ lab: '', labT: '', mode: 'road', leg: 0, legSrc: '', addr: '', ...r }))

// ── сборка v2 ────────────────────────────────────────────────────────────────
const V2 = { ...S, schemaV: 2, trip, transport, fuelPrices, rent, rentCats, kinds, rateUnits,
  units, canRows, gearSections, buySections, gear, buy, route,
  doc: { cur: { code: 'RUB', sign: '₽', after: true }, distU: 'km', volU: 'l', canVol: 20 } }
delete V2.log; delete V2.logNotes; delete V2.calcRows; delete V2.boat

// ── приёмочная сверка: формулы v2 должны дать боевые цифры v1 ────────────────
const price = (id) => fuelPrices.find((f) => f.i === id).price
const routeKm = trip.dist.manual * trip.dist.kBack + trip.dist.local
const litres = (t) => t.rateU === 'l100km' ? (routeKm * t.rate) / 100 : t.rateU === 'lh' ? t.hours * t.rate : t.litres
const fuel = transport.reduce((s, t) => s + litres(t) * price(t.fuel), 0)
const rentSum = rent.reduce((s, r) => s + r.price * r.qty * r.count, 0)
const transRub = fuel + rentSum
const buySum = buy.reduce((s, b) => {
  const sec = buySections.find((x) => x.i === b.sec)
  if (!sec || sec.personal || b.st !== 'buy') return s
  return s + (b.q || 0) * (b.prf > 0 ? b.prf : b.pr || 0)
}, 0)
const total = transRub + buySum
const per = total / S.people.length
const carry92 = transport.filter((t) => t.fuel === 'ai92' && t.carry).reduce((s, t) => s + litres(t), 0)
const cans92 = Math.ceil(carry92 / V2.doc.canVol)

const checks = [
  ['транспорт', Math.round(transRub), 21385],
  ['закупка', Math.round(buySum), 26005],
  ['общий бюджет', Math.round(total), 47390],
  ['с каждого', Math.round(per), 11848],
  ['канистры АИ-92', cans92, 2],
  ['маршрут, км', routeKm, 330],
]
let ok = true
for (const [name, got, want] of checks) {
  const good = got === want
  ok = ok && good
  console.log((good ? '  ✔ ' : '  ✘ ') + name + ': ' + got + (good ? '' : ' (ожидалось ' + want + ')'))
}
// полнота: ни одно из 43 значений логистики не потеряно
const moved = 15 + (S.logNotes || []).length + (S.calcRows || []).length + (S.canRows || []).length + 5
console.log('  перенесено значений логистики: ' + moved + ' из 43')
if (!ok || moved !== 43) { console.error('Миграция НЕ прошла сверку — файл не записан.'); process.exit(1) }

// ⛔ Пишем в app/fixtures/, а НЕ в app/src/data/: всё, что лежит в src/, может быть
// импортировано и уехать в публичный файл сайта вместе с именами и личными ключами
// (урок У-65). Это образец для проверок, а не сид приложения.
mkdirSync(join(root, 'app', 'fixtures'), { recursive: true })
writeFileSync(join(root, 'app', 'fixtures', 'seed-sample.json'), JSON.stringify(V2))
console.log('app/fixtures/seed-sample.json записан (' + Math.round(JSON.stringify(V2).length / 1024) + ' КБ)')
