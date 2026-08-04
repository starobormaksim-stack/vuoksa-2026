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
import { shares, wholeSettle } from '../src/lib/settle.ts'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const S = JSON.parse(readFileSync(join(root, 'src', 'data', 'seed-v2.json'), 'utf8'))

const r = calcAll(S)
const ai92 = r.cans.find((c) => c.fuel === 'ai92')

/* Взаиморасчёты: деньги не имеют права появиться или исчезнуть в зачёте.
   Копейки складываются в двоичных дробях, поэтому сверяем до копейки, а не «===». */
const st = shares(S)
const kop = (n) => Math.round(n * 100) / 100

/* И то же самое ЦЕЛЫМИ рублями — ровно так, как эти числа попадают на экран.
   Заказчик складывает столбец глазами, значит проверять надо показанное,
   а не только посчитанное: копейки однажды дали ему лишний рубль (У-63). */
const w = wholeSettle(st)
const показБаланс = w.rows.reduce((s, x) => s + x.balance, 0)
const показУплачено = w.rows.reduce((s, x) => s + x.paid, 0)
/* Связность: у КАЖДОГО показанный итог обязан равняться показанным
   «выложил минус доля», иначе на экране три числа спорят друг с другом. */
const связныхСтрок = w.rows.filter((x) => x.balance === x.paid - x.share).length

/** Проверки: [название, ожидалось, получилось (с округлением до рубля)] */
const checks = [
  ['Километраж, км', 330, Math.round(r.km)],
  ['Транспорт, ₽', 21385, Math.round(r.transport)],
  ['Закупка, ₽', 26005, Math.round(r.buy)],
  ['Итого, ₽', 47390, Math.round(r.total)],
  ['С каждого, ₽', 11848, Math.round(r.perPerson)],
  ['Канистры АИ-92, шт.', 2, ai92 ? ai92.cans : NaN],
  /* ── Взаиморасчёты (settle.ts). Шесть строк выше не трогаются. ── */
  ['Σ уплачено = итого, ₽', 47390, Math.round(st.paid)],
  ['Σ доля = итого, ₽', 47390, Math.round(st.share)],
  ['Σ баланс = 0, ₽', 0, kop(st.drift)],
  /* ── То же на ЭКРАНЕ, целыми рублями (У-63) ── */
  ['Σ уплачено на экране, ₽', 47390, показУплачено],
  ['Σ баланс на экране, ₽', 0, показБаланс],
  ['Строк, где итог = выложил − доля', S.people.length, связныхСтрок],
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
console.log(
  'Взаиморасчёты: ' +
    st.rows
      .map((x) => `${x.name} уплатил ${Math.round(x.paid)} / доля ${Math.round(x.share)} / баланс ${Math.round(x.balance)}`)
      .join(' · ')
)
console.log(
  'Переводы: ' +
    (st.moves.length
      ? st.moves.map((m) => `${m.fromName} → ${m.toName} ${Math.round(m.sum)} ₽`).join(' · ')
      : 'все в расчёте')
)

if (fails > 0) {
  console.error(`\nРасхождений: ${fails}`)
  process.exit(1)
}
console.log('\nВсе контрольные цифры сходятся.')
