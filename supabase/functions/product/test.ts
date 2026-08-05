/**
 * Проверка разбора карточки товара — та же функция, что работает у посредника.
 *
 * Запуск (Node 22+ читает TypeScript сам):
 *   node --experimental-strip-types supabase/functions/product/test.ts
 *   node --experimental-strip-types supabase/functions/product/test.ts --live
 *
 * Без `--live` гоняются образцы разметки, которые точно ведут себя одинаково
 * и завтра, и через год. С `--live` дополнительно берутся настоящие страницы —
 * это уже не проверка, а разведка: сегодня магазин отдал карточку, завтра
 * перестал, и это его право (⛔ заслоны не обходим).
 */

import { absoluteImg, parsePrice, parseProduct } from './parse.ts'

let bad = 0

function eq(what: string, got: unknown, want: unknown): void {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) bad++
  console.log(`${ok ? '  ok' : 'ПЛОХО'}  ${what}: ${JSON.stringify(got)}${ok ? '' : ` ≠ ${JSON.stringify(want)}`}`)
}

/* ── цена ── */
console.log('\nЦена из строки')
eq('300.00', parsePrice('300.00'), 300)
eq('1 299,00 ₽', parsePrice('1 299,00 ₽'), 1299)
eq('1 299 ₽ (неразрывные пробелы)', parsePrice('1 299 ₽'), 1299)
eq('1,299.00', parsePrice('1,299.00'), 1299)
eq('от 1 990 ₽', parsePrice('от 1 990 ₽'), 1990)
eq('1,29', parsePrice('1,29'), 1.29)
eq('пусто', parsePrice(''), 0)
eq('нет цифр', parsePrice('цена по запросу'), 0)
eq('артикул на 12 знаков', parsePrice('123456789012'), 0)

/* ── schema.org/Product ── */
console.log('\nschema.org/Product')
const ld = `<!doctype html><html><head><title>Магазин</title>
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"Product","name":"Газовый баллон Kovea 220",
 "image":["https://shop.ru/img/1.jpg"],
 "offers":{"@type":"Offer","price":"300.00","priceCurrency":"RUB"}}
</script></head><body></body></html>`
eq('название', parseProduct(ld).title, 'Газовый баллон Kovea 220')
eq('фото', parseProduct(ld).img, 'https://shop.ru/img/1.jpg')
eq('цена', parseProduct(ld).price, 300)
eq('валюта', parseProduct(ld).currency, 'RUB')

/* ── Open Graph ── */
console.log('\nOpen Graph')
const og = `<html><head>
<meta content="Спальник Splav 200" property="og:title">
<meta property="og:image" content="//cdn.shop.ru/a.jpg">
<meta property="product:price:amount" content="4 990,00">
<title>Спальник — магазин</title></head></html>`
const ogCard = parseProduct(og)
eq('название (атрибуты в обратном порядке)', ogCard.title, 'Спальник Splav 200')
eq('цена', ogCard.price, 4990)
eq('фото без схемы → полный адрес', absoluteImg(ogCard.img, 'https://shop.ru/p/1'), 'https://cdn.shop.ru/a.jpg')

/* ── микроразметка ── */
console.log('\nМикроразметка и запасные пути')
const micro = `<html><head><title>Котелок 2 л &mdash; «Сплав»</title></head>
<body><span itemprop="price" content="1290"></span></body></html>`
eq('название из <title> с сущностями', parseProduct(micro).title, 'Котелок 2 л — «Сплав»')
eq('цена из itemprop', parseProduct(micro).price, 1290)

const empty = parseProduct('<html><head></head><body>ничего</body></html>')
eq('пустая страница: название', empty.title, '')
eq('пустая страница: цена', empty.price, 0)

const broken = `<html><head>
<script type="application/ld+json">{сломанный json</script>
<meta property="og:title" content="Термос 1 л">
</head></html>`
eq('сломанный JSON-LD не мешает Open Graph', parseProduct(broken).title, 'Термос 1 л')

console.log('\nАдрес фотографии')
eq('javascript: отбрасывается', absoluteImg('javascript:alert(1)', 'https://shop.ru/p'), '')
eq('относительный', absoluteImg('/img/a.jpg', 'https://shop.ru/p/1'), 'https://shop.ru/img/a.jpg')
eq('пусто', absoluteImg('', 'https://shop.ru/p'), '')

/* ── настоящие страницы ── */
if (process.argv.includes('--live')) {
  const pages = [
    'https://alpindustria.ru/product/ballon-gazovyy-kovea-220-g-kgf-0220.html',
    'https://www.kant.ru/product/2202650/',
    'https://www.ozon.ru/product/gazovyy-ballon-220-g-1234567890/',
  ]
  console.log('\nНастоящие страницы (разведка, не проверка)')
  for (const page of pages) {
    const stop = new AbortController()
    const timer = setTimeout(() => stop.abort(), 20_000)
    try {
      const res = await fetch(page, {
        redirect: 'follow',
        signal: stop.signal,
        headers: {
          'User-Agent': 'Pine-to-Pine/1.0 (+https://pine-to-pine.com)',
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Language': 'ru,en;q=0.8',
        },
      })
      const html = await res.text()
      const card = parseProduct(html)
      console.log(
        `  ${new URL(page).hostname}: HTTP ${res.status}, ${html.length} знаков → ` +
          `название «${card.title || '—'}», цена ${card.price || '—'}, фото ${card.img ? 'есть' : '—'}`,
      )
    } catch (e) {
      console.log(`  ${new URL(page).hostname}: не ответил — ${(e as Error).message}`)
    } finally {
      clearTimeout(timer)
    }
  }
}

console.log(bad === 0 ? '\nВсё сошлось' : `\nНе сошлось: ${bad}`)
process.exitCode = bad === 0 ? 0 : 1
