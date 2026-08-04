/**
 * Раскладка второй версии по корню репозитория для GitHub Pages.
 *
 * Что делает словами: берёт УЖЕ СОБРАННЫЕ файлы из app/dist и app/dist-offline
 * и кладёт онлайн-версию в корень (Pages отдаёт именно его), а офлайн-файл —
 * рядом под именем «Вуокса-2026.html», чтобы владелец скачивал копию одной кнопкой.
 *
 * Первая версия НЕ пропадает: её собранные файлы переезжают в v1/ и остаются
 * доступными по адресу …/vuoksa-2026/v1/. Исходники v1 (src/ + build.js) не трогаются.
 *
 * Сборку script намеренно не запускает — её делает npm, чтобы ошибки сборки
 * были видны как ошибки сборки:
 *
 *   npm --prefix app run build
 *   npm --prefix app run build:offline
 *   node publish-v2.mjs            (или --dry, чтобы только посмотреть)
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.dirname(fileURLToPath(import.meta.url))
const APP = path.join(ROOT, 'app')
const DRY = process.argv.includes('--dry')

const say = (s) => console.log(s)
const rel = (p) => path.relative(ROOT, p).replace(/\\/g, '/')

function copy(from, to) {
  say(`  ${rel(from)} → ${rel(to)}`)
  if (DRY) return
  fs.mkdirSync(path.dirname(to), { recursive: true })
  fs.copyFileSync(from, to)
}

function copyDir(from, to) {
  if (!fs.existsSync(from)) return
  for (const name of fs.readdirSync(from)) {
    const src = path.join(from, name)
    const dst = path.join(to, name)
    if (fs.statSync(src).isDirectory()) copyDir(src, dst)
    else copy(src, dst)
  }
}

const dist = path.join(APP, 'dist')
const offline = path.join(APP, 'dist-offline', 'index.html')
if (!fs.existsSync(path.join(dist, 'index.html')) || !fs.existsSync(offline)) {
  console.error('Нет собранных файлов. Сначала: npm --prefix app run build && npm --prefix app run build:offline')
  process.exit(1)
}

/* ── 1. Спрятать первую версию, пока её не затёрли ── */
const V1 = path.join(ROOT, 'v1')
say('Первая версия переезжает в v1/:')
for (const f of ['index.html', 'Вуокса-2026.html']) {
  const src = path.join(ROOT, f)
  const dst = path.join(V1, f)
  if (fs.existsSync(src) && !fs.existsSync(dst)) copy(src, dst)
}

/* ── 2. Онлайн-версия в корень ── */
say('\nОнлайн-версия в корень:')
/* старые собранные файлы предыдущей публикации убираем, иначе assets/ копится */
const assets = path.join(ROOT, 'assets')
if (fs.existsSync(assets)) {
  say(`  чистим ${rel(assets)}`)
  if (!DRY) fs.rmSync(assets, { recursive: true, force: true })
}
copyDir(dist, ROOT)

/* ── 3. Офлайн-файл рядом ── */
say('\nОфлайн-файл в корень:')
copy(offline, path.join(ROOT, 'Вуокса-2026.html'))

say('\nГотово. Дальше: git add -A && git commit && git push')
