/**
 * Офлайн-заготовка ложится рядом с сайтом.
 *
 * Зачем это отдельным шагом. Боевой адрес собирает Cloudflare Pages сам:
 * корневая папка `app`, команда `npm run build`, каталог `dist`. Всё, чего нет
 * в `app/dist`, на сайт не попадает — а самодостаточный файл собирается
 * отдельной командой (`vite build --mode offline`) и ложится в `app/dist-offline`.
 * Поэтому «Забрать офлайн-копию» на боевом просило у сервера файл, которого там
 * не было, Cloudflare отвечал 200 и отдавал SPA-заглушку, и копия скачивалась
 * битой: внутри ссылки на `/assets/*.js`, которых у файла на диске нет.
 * Урок У-101.
 *
 * Имя латиницей намеренно: путь с кириллицей проходит через кодирование адреса
 * и настройки края, и проверить это можно только после выкладки. Здесь имя
 * должно совпадать с `OFFLINE_FILE` в `app/src/lib/offline.ts`.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const src = path.join(APP, 'dist-offline', 'index.html')
const dst = path.join(APP, 'dist', 'pine-offline.html')

if (!fs.existsSync(src)) {
  console.error('Нет собранной офлайн-версии: ' + src)
  process.exit(1)
}
const html = fs.readFileSync(src, 'utf8')
/* Самодостаточный файл не ссылается наружу вовсе. Если ссылки есть — собралось
   не то, и лучше упасть здесь, чем отдать человеку битую копию. */
if (/(src|href)="\.?\/assets\//.test(html)) {
  console.error('Офлайн-сборка ссылается на внешние файлы — это не самодостаточный файл')
  process.exit(1)
}
fs.mkdirSync(path.dirname(dst), { recursive: true })
fs.writeFileSync(dst, html)
console.log(`Офлайн-заготовка: ${path.relative(APP, dst)} — ${html.length} знаков`)
