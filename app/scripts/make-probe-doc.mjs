/**
 * Проба листа без базы.
 *
 * Нужна, когда `rpc/trip_read` не отвечает данными (09.08.2026 — `402
 * exceed_egress_quota`, кончилась квота Supabase), а мерить раскладку надо
 * на настоящих данных, а не на заводском сиде.
 *
 * Кладёт документ из снимка в `app/public/__probe-doc.js` строкой
 * `window.__PINE_DOC__ = {…}`. Приложение считает такой документ офлайн-копией
 * и рисует лист целиком, не ходя в сеть вовсе (`store.ts` → `loadInitial`,
 * ветка «офлайн» в `App.tsx`).
 *
 * Как пользоваться:
 *   node app/scripts/make-probe-doc.mjs [путь к снимку]
 *   и временно вписать в `app/index.html` ПЕРЕД модулем `/src/main.tsx`:
 *     <script src="/__probe-doc.js"></script>
 *
 * ⛔ Оба следа убрать ДО сборки и коммита: иначе боевые данные уедут в `dist`
 * и в репозиторий. Проверять `grep -c "__probe-doc" app/dist/index.html` (ждём 0)
 * и `git status`.
 *
 * ⚠️ Прав редактора в офлайн-режиме нет, пока не выбран человек в карточке
 * «кто вы» (`OfflineWho`): до этого числа и названия рисуются текстом, а не
 * кнопками, и замер «органа нет» будет ложным.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const APP = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const ROOT = resolve(APP, '..')

const снимок = process.argv[2]
  ? resolve(process.cwd(), process.argv[2])
  : resolve(ROOT, 'backups/prod-2026-08-09-p31-start.json')

const сырое = JSON.parse(readFileSync(снимок, 'utf8'))
/* Снимок кладут по-разному: ответ PostgREST — массив, наш дамп — объект
   с ключом «0». Документ в обоих случаях лежит в поле `data`. */
const doc = сырое['0']?.data ?? (Array.isArray(сырое) ? сырое[0]?.data : сырое.data)
if (!doc?.trip || !Array.isArray(doc.people)) {
  console.error(`В снимке ${снимок} нет документа поездки`)
  process.exit(1)
}

const цель = resolve(APP, 'public/__probe-doc.js')
writeFileSync(цель, 'window.__PINE_DOC__ = ' + JSON.stringify(doc) + ';\n', 'utf8')

console.log(`Снимок: ${снимок}`)
console.log(`Положено: ${цель}`)
console.log(`Подразделы «Расходов»: ${doc.buySections.map((s) => s.t).join(' · ')}`)
console.log(`Подразделы «Взять с собой»: ${doc.gearSections.map((s) => s.t).join(' · ')}`)
console.log(`Люди: ${doc.people.map((p) => p.slug).join(', ')}`)
console.log('⛔ Не забыть убрать файл и тег из index.html до сборки и коммита.')
