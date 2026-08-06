/**
 * Иконки для домашнего экрана — из эмблемы брендбука, а не из случайной картинки.
 *
 * Заказчик 06.08.2026: «чтобы там возникал именно логотип, а не какая-то рандомная
 * ёлка на острове, то есть чтобы иконка логотипа была органично вписана».
 *
 * Рисуем эмблему (`src/assets/emblem-light.svg`) на кремовом поле бренда и снимаем
 * настоящим браузером — так знак выходит ровно таким, каким его видно в шапке.
 * Файлы:
 *   icon-192.png, icon-512.png       — обычная иконка, знак во всё поле;
 *   icon-maskable-512.png            — для Android: система обрезает иконку под
 *                                      свою форму, поэтому знак ужат в безопасный
 *                                      круг (80 % поля), иначе срежет края.
 *   apple-touch-icon.png             — 180×180, размер iPhone. ⛔ Именно это имя
 *                                      и именно в корне: Safari ищет такой файл
 *                                      САМ, даже когда разметку прочитать не смог
 *                                      (Apple, Configuring Web Applications).
 *   apple-touch-icon-precomposed.png — то же изображение под старым именем: iOS
 *                                      до 7 искала сначала его.
 *   apple-touch-icon-152.png, -167.png — размеры iPad и iPad Pro.
 *
 * ⛔ Почему не хватало одного `icon-192.png` (06.08.2026, У-107): 192 нет
 * в списке Apple вовсе — она ждёт 152, 167 и 180. Значок на домашнем экране
 * у заказчика пропал начисто, и единственное, что могло его дать, была эта
 * одинокая ссылка без атрибута `sizes`. Теперь размер есть точный, а корневой
 * файл работает и вовсе без разметки.
 *
 * Запуск: node app/scripts/make-icons.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'file:///C:/Users/staro/AppData/Roaming/npm/node_modules/playwright/index.mjs'

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const emblem = fs.readFileSync(path.join(APP, 'src/assets/emblem-light.svg'), 'utf8')

/**
 * Поле вокруг знака — хвоя брендбука.
 *
 * Заказчик 06.08.2026: «чтобы всё, что за пределами окантовки круглой, было
 * в её же цвете: зелёный. Внутри — как есть». Телефон обрезает иконку своей
 * формой (скруглённый квадрат на iPhone, круг на Android), и кремовые углы
 * читались как рамка вокруг знака. Теперь угол в цвет самой окантовки —
 * знак кажется вписанным, а не наклеенным.
 */
const ХВОЯ = '#2B391A'

const page = (size, inset) => `<!doctype html><meta charset="utf-8">
<style>
  html,body{margin:0;padding:0}
  .plate{width:${size}px;height:${size}px;background:${ХВОЯ};display:grid;place-items:center}
  .знак{width:${Math.round(size * inset)}px;height:${Math.round(size * inset)}px;display:block}
  .знак svg{width:100%;height:100%;display:block}
</style>
<div class="plate"><span class="знак">${emblem}</span></div>`

const browser = await chromium.launch()
const out = [
  ['icon-192.png', 192, 1],
  ['icon-512.png', 512, 1],
  ['icon-maskable-512.png', 512, 0.8],
  /* Размеры Apple. Поле остаётся хвойным во всю площадь: iPhone скругляет угол
     сам, и знак не должен подходить к краю вплотную — отсюда 0,86. */
  ['apple-touch-icon.png', 180, 0.86],
  ['apple-touch-icon-precomposed.png', 180, 0.86],
  ['apple-touch-icon-167.png', 167, 0.86],
  ['apple-touch-icon-152.png', 152, 0.86],
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
