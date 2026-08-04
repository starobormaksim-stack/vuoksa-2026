#!/usr/bin/env node
/**
 * Сверка расчётного ядра v2 с контрольными цифрами
 * (docs/v2-architecture.md, раздел 2.2).
 *
 * Запуск из app/:  node scripts/check-sums.mjs
 * Импортирует src/lib/calc.ts напрямую — Node 23.6+ снимает типы сам.
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { calcAll, money } from '../src/lib/calc.ts'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const S = JSON.parse(readFileSync(join(root, 'src', 'data', 'seed-v2.json'), 'utf8'))

const r = calcAll(S)
const ai92 = r.cans.find((c) => c.fuel === 'ai92')

/** Проверки: [название, ожидалось, получилось (с округлением до рубля)] */
const checks = [
  ['Километраж, км', 330, Math.round(r.km)],
  ['Транспорт, ₽', 21385, Math.round(r.transport)],
  ['Закупка, ₽', 26005, Math.round(r.buy)],
  ['Итого, ₽', 47390, Math.round(r.total)],
  ['С каждого, ₽', 11848, Math.round(r.perPerson)],
  ['Канистры АИ-92, шт.', 2, ai92 ? ai92.cans : NaN],
]

const W = [26, 12, 12, 6]
const row = (a, b, c, d) =>
  String(a).padEnd(W[0]) + String(b).padStart(W[1]) + String(c).padStart(W[2]) + String(d).padStart(W[3])

console.log(row('Проверка', 'Ожидалось', 'Получилось', ''))
console.log('-'.repeat(W.reduce((s, w) => s + w, 0)))

let fails = 0
for (const [name, want, got] of checks) {
  const ok = want === got
  if (!ok) fails++
  console.log(row(name, want, got, ok ? 'OK' : 'FAIL'))
}

console.log('-'.repeat(W.reduce((s, w) => s + w, 0)))
console.log(
  `Точные значения: топливо ${r.fuel} · аренда ${r.rent} · транспорт ${r.transport}` +
    ` · личное ${r.personal} · итого ${r.total} · с каждого ${r.perPerson.toFixed(2)}`
)
console.log(`money(): итого → «${money(r.total, S.doc)}», с каждого → «${money(r.perPerson, S.doc)}»`)

if (fails > 0) {
  console.error(`\nРасхождений: ${fails}`)
  process.exit(1)
}
console.log('\nВсе контрольные цифры сходятся.')
