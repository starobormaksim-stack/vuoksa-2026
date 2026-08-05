/**
 * Разбор страницы товара: название, фотография и цена.
 *
 * Живёт отдельно от посредника (`index.ts`) по одной причине: это чистая функция
 * от текста к трём значениям, и её можно прогнать на настоящих страницах прямо
 * с рабочей машины, не поднимая Supabase (`supabase/functions/product/test.ts`).
 *
 * Берём ровно то, что магазины кладут для поисковиков и соцсетей, — иных путей
 * не ищем и заслонов не обходим (слово заказчика 05.08.2026: чужое правило
 * на чужом сайте):
 *   1. `application/ld+json` со `schema.org/Product` — самый точный источник:
 *      там и название, и картинка, и цена в `offers.price`;
 *   2. Open Graph: `og:title`, `og:image`, `og:price:amount`;
 *   3. микроразметка `itemprop="price"`;
 *   4. `<title>` — последняя надежда на название.
 *
 * ⛔ Ничего не найдено — это НЕ ошибка. Ссылка у позиции всё равно остаётся,
 * человек вписывает название и цену руками (`docs/BRIEF-2026-08-05.md`, пункт 16).
 */

export interface ProductCard {
  /** название товара со страницы; пусто — не нашлось */
  title: string
  /** адрес фотографии; пусто — не нашлось */
  img: string
  /** цена числом; 0 — не нашлась */
  price: number
  /** валюта, как её назвала страница: RUB, USD… пусто — не сказано */
  currency: string
}

/** Сколько знаков названия имеет смысл переносить в строку таблицы. */
const TITLE_MAX = 120

/** Расшифровка сущностей, которые реально встречаются в заголовках магазинов. */
export function unescapeHtml(s: string): string {
  return s
    .replace(/&nbsp;/gi, ' ')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&#0?39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&laquo;/gi, '«')
    .replace(/&raquo;/gi, '»')
    .replace(/&mdash;/gi, '—')
    .replace(/&ndash;/gi, '–')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    /* &amp; расшифровывается ПОСЛЕДНИМ: иначе «&amp;quot;» превратится в кавычку,
       которой на странице не было. */
    .replace(/&amp;/gi, '&')
}

/** Убрать переносы и лишние пробелы, обрезать до разумной длины. */
function tidy(s: string): string {
  const t = unescapeHtml(s).replace(/\s+/g, ' ').trim()
  return t.length > TITLE_MAX ? t.slice(0, TITLE_MAX).trim() + '…' : t
}

/**
 * Цена из строки вида «1 299,00 ₽», «1,299.00», «300.00», «от 1 990 ₽».
 *
 * Разделитель дробной части выбирается по последнему знаку: если после него
 * ровно один или два разряда — это дробная часть, иначе это разделитель тысяч.
 * Так «1,299» читается как тысяча двести девяносто девять, а «1,29» — как рубль
 * двадцать девять, и оба случая настоящие.
 */
export function parsePrice(raw: string): number {
  if (!raw) return 0
  const s = String(raw)
    .replace(/[   ]/g, ' ')
    .replace(/[^\d.,\s]/g, ' ')
    .trim()
  if (!s) return 0
  const m = s.match(/\d[\d\s.,]*/)
  if (!m) return 0
  let body = m[0].replace(/\s/g, '')
  const lastDot = body.lastIndexOf('.')
  const lastComma = body.lastIndexOf(',')
  const cut = Math.max(lastDot, lastComma)
  if (cut >= 0) {
    const tail = body.slice(cut + 1)
    if (/^\d{1,2}$/.test(tail)) {
      body = body.slice(0, cut).replace(/[.,]/g, '') + '.' + tail
    } else {
      body = body.replace(/[.,]/g, '')
    }
  }
  const n = Number(body)
  if (!isFinite(n) || n <= 0) return 0
  /* Цена товара больше миллиона на сборы в поход не похожа: скорее всего это
     склеенный артикул или идентификатор. Лучше не подставить ничего, чем
     подставить чушь в бюджет. */
  return n > 1_000_000 ? 0 : Math.round(n * 100) / 100
}

/** Значение атрибута `content` у мета-строки — атрибуты идут в любом порядке. */
function metaContent(html: string, attr: string, name: string): string {
  const re = new RegExp(`<meta[^>]*\\b${attr}\\s*=\\s*["']${name}["'][^>]*>`, 'i')
  const tag = html.match(re)?.[0]
  if (!tag) return ''
  return tag.match(/\bcontent\s*=\s*["']([^"']*)["']/i)?.[1] ?? ''
}

/** Все куски `application/ld+json` со страницы. */
function ldBlocks(html: string): string[] {
  const re = /<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  return [...html.matchAll(re)].map((m) => m[1])
}

/** Развернуть любое дерево JSON-LD в плоский список объектов. */
function flatten(node: unknown, acc: Record<string, unknown>[] = []): Record<string, unknown>[] {
  if (Array.isArray(node)) {
    for (const n of node) flatten(n, acc)
    return acc
  }
  if (node && typeof node === 'object') {
    const o = node as Record<string, unknown>
    acc.push(o)
    for (const key of ['@graph', 'mainEntity', 'itemListElement', 'offers', 'hasVariant']) {
      if (o[key]) flatten(o[key], acc)
    }
  }
  return acc
}

/** Это описание товара? `@type` бывает строкой и списком. */
function isType(o: Record<string, unknown>, want: string): boolean {
  const t = o['@type']
  if (typeof t === 'string') return t.toLowerCase() === want
  if (Array.isArray(t)) return t.some((x) => String(x).toLowerCase() === want)
  return false
}

/** Картинка в JSON-LD бывает строкой, списком и объектом ImageObject. */
function ldImage(v: unknown): string {
  if (typeof v === 'string') return v
  if (Array.isArray(v)) return ldImage(v[0])
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>
    return typeof o.url === 'string' ? o.url : ''
  }
  return ''
}

/** Разобрать страницу. Ничего не нашлось — вернутся пустые значения, и это норма. */
export function parseProduct(html: string): ProductCard {
  const out: ProductCard = { title: '', img: '', price: 0, currency: '' }

  /* 1. schema.org/Product — самый точный источник. */
  for (const block of ldBlocks(html)) {
    let parsed: unknown
    try {
      parsed = JSON.parse(block)
    } catch {
      /* Магазины кладут сюда и сломанный JSON — это не повод бросать разбор. */
      continue
    }
    const nodes = flatten(parsed)
    const product = nodes.find((o) => isType(o, 'product'))
    if (product) {
      if (!out.title && typeof product.name === 'string') out.title = tidy(product.name)
      if (!out.img) out.img = ldImage(product.image)
    }
    const offer = nodes.find((o) => isType(o, 'offer') || isType(o, 'aggregateoffer'))
    if (offer && !out.price) {
      const p = offer.price ?? offer.lowPrice ?? offer.highPrice
      if (typeof p === 'string' || typeof p === 'number') out.price = parsePrice(String(p))
      if (typeof offer.priceCurrency === 'string') out.currency = offer.priceCurrency
    }
  }

  /* 2. Open Graph — есть почти везде, где вообще что-то есть. */
  if (!out.title) out.title = tidy(metaContent(html, 'property', 'og:title'))
  if (!out.title) out.title = tidy(metaContent(html, 'name', 'og:title'))
  if (!out.title) out.title = tidy(metaContent(html, 'name', 'twitter:title'))
  if (!out.img) out.img = metaContent(html, 'property', 'og:image')
  if (!out.img) out.img = metaContent(html, 'name', 'twitter:image')
  if (!out.price) out.price = parsePrice(metaContent(html, 'property', 'og:price:amount'))
  if (!out.price) out.price = parsePrice(metaContent(html, 'property', 'product:price:amount'))
  if (!out.currency) out.currency = metaContent(html, 'property', 'og:price:currency')
  if (!out.currency) out.currency = metaContent(html, 'property', 'product:price:currency')

  /* 3. Микроразметка itemprop. */
  if (!out.price) out.price = parsePrice(metaContent(html, 'itemprop', 'price'))
  if (!out.price) {
    const tag = html.match(/<[^>]*\bitemprop\s*=\s*["']price["'][^>]*>/i)?.[0] ?? ''
    const content = tag.match(/\bcontent\s*=\s*["']([^"']*)["']/i)?.[1] ?? ''
    out.price = parsePrice(content)
  }

  /* 4. Заголовок вкладки. Хуже всех: в нём часто ещё и имя магазина, — но
        название товара человеку всё равно понятнее, чем голый адрес. */
  if (!out.title) {
    const t = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? ''
    out.title = tidy(t)
  }

  return out
}

/**
 * Привести адрес картинки к полному. Магазины пишут «//host/…» и «/img/…»,
 * а нам нужен адрес, который откроется из чужого места.
 */
export function absoluteImg(img: string, pageUrl: string): string {
  if (!img) return ''
  try {
    const u = new URL(img, pageUrl)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return ''
    return u.toString()
  } catch {
    return ''
  }
}
