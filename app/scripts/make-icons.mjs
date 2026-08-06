/**
 * Иконки для домашнего экрана — из эмблемы брендбука, а не из случайной картинки.
 *
 * Заказчик 06.08.2026: «чтобы там возникал именно логотип, а не какая-то рандомная
 * ёлка на острове, то есть чтобы иконка логотипа была органично вписана».
 *
 * Рисуем эмблему (`src/assets/emblem-light.svg`) на кремовом поле бренда и снимаем
 * настоящим браузером — так знак выходит ровно таким, каким его видно в шапке.
 * Три файла:
 *   icon-192.png, icon-512.png       — обычная иконка, знак во всё поле;
 *   icon-maskable-512.png            — для Android: система обрезает иконку под
 *                                      свою форму, поэтому знак ужат в безопасный
 *                                      круг (80 % поля), иначе срежет края.
 *
 * Запуск: node app/scripts/make-icons.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'file:///C:/Users/staro/AppData/Roaming/npm/node_modules/playwright/index.mjs'

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const emblem = fs.readFileSync(path.join(APP, 'src/assets/emblem-light.svg'), 'utf8')

/** Крем брендбука — тот же, что `background_color` манифеста. */
const CREAM = '#F9F3D4'

const page = (size, inset) => `<!doctype html><meta charset="utf-8">
<style>
  html,body{margin:0;padding:0}
  .plate{width:${size}px;height:${size}px;background:${CREAM};display:grid;place-items:center}
  .знак{width:${Math.round(size * inset)}px;height:${Math.round(size * inset)}px;display:block}
  .знак svg{width:100%;height:100%;display:block}
</style>
<div class="plate"><span class="знак">${emblem}</span></div>`

const browser = await chromium.launch()
const out = [
  ['icon-192.png', 192, 1],
  ['icon-512.png', 512, 1],
  ['icon-maskable-512.png', 512, 0.8],
]
for (const [name, size, inset] of out) {
  const ctx = await browser.newContext({ viewport: { width: size, height: size }, deviceScaleFactor: 1 })
  const p = await ctx.newPage()
  await p.setContent(page(size, inset))
  await p.waitForTimeout(200)
  const file = path.join(APP, 'public', name)
  await p.screenshot({ path: file, omitBackground: false })
  console.log(`${name} — ${fs.statSync(file).size} байт`)
  await ctx.close()
}
await browser.close()
