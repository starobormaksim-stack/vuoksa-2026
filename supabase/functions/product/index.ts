/**
 * Посредник, который читает страницу товара, — Supabase Edge Function.
 *
 * Зачем он вообще нужен. Заказчик 05.08.2026: «я ссылку вставляю, автоматически
 * цена фиксируется… она автоматически подтягивает туда название товара
 * и фотографию». Браузеру чужую страницу читать запрещено самим устройством веба
 * (CORS), поэтому читает сервер, а браузер только спрашивает.
 *
 * ⛔ Заслоны не обходятся. Обычный GET, честное имя робота, никаких капч
 * и никакой имитации живого браузера: это чужое правило на чужом сайте
 * (`docs/BRIEF-2026-08-05.md`, пункт 16). Ozon и родня карточку не отдадут —
 * и это штатный ответ, а не поломка.
 *
 * ⛔ Не прочиталось — ссылка всё равно остаётся. Функция никогда не отвечает
 * ошибкой транспорта: она отвечает `ok: false` и причиной ЧЕЛОВЕЧЕСКИМИ словами,
 * которую вызывающий покажет прямо в строке (постулат 5, молчаливых отказов нет).
 *
 * ⛔ Цена, снятая отсюда, ложится ТОЛЬКО в «Цена, план» (`Buy.pr`). «Цена, факт»
 * не трогается ничем, кроме рук человека, — на ней держатся контрольные суммы.
 * Это правило живёт на стороне приложения (`app/src/lib/product.ts`), здесь же
 * важно другое: функция ничего не пишет в базу и вообще не знает про документ.
 *
 * Выкладывается командой (из корня репозитория):
 *   supabase functions deploy product --project-ref oagonfdnlgqkoosvgaly --no-verify-jwt
 */

import { absoluteImg, parseProduct } from './parse.ts'

/** Сколько ждём чужой сервер. Больше — человек решит, что сервис завис. */
const TIMEOUT_MS = 12_000

/** Сколько знаков страницы читаем. Карточка товара лежит в самом начале. */
const MAX_BYTES = 1_000_000

/**
 * Кто мы. Роботу положено называть себя и оставлять адрес, по которому с ним
 * можно связаться, — это ровно противоположность «имитации живого браузера».
 *
 * ⛔ ТОЛЬКО ЛАТИНИЦА. Заголовки HTTP — байтовые строки, и кириллица в них роняет
 * `fetch` ещё до выхода в сеть, исключением, неотличимым от «сайт не ответил».
 * 05.08.2026 на это ушла выкладка: посредник отвечал «не отвечает» даже про
 * example.com, хотя сеть была ни при чём.
 */
const UA = 'Pine-to-Pine/1.0 (+https://pine-to-pine.com; product card reader)'

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

/** Ответ всегда 200 и всегда JSON: отказ — это тоже ответ, а не сбой. */
function reply(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' },
  })
}

/**
 * Адрес, по которому вообще можно ходить.
 *
 * Отказываем не только чужим схемам, но и внутренним адресам: посредник, который
 * по просьбе из браузера сходит на `http://127.0.0.1` или в частную сеть, — это
 * дыра, через которую читают чужое хозяйство (SSRF). Нам нужен публичный сайт
 * магазина, и ничего больше.
 */
function checkUrl(raw: unknown): { url: URL } | { why: string } {
  if (typeof raw !== 'string' || !raw.trim()) return { why: 'Ссылки нет' }
  let u: URL
  try {
    u = new URL(raw.trim())
  } catch {
    return { why: 'Это не похоже на адрес страницы' }
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    return { why: 'Открываем только обычные ссылки http и https' }
  }
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, '')
  const local =
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host === '::1' ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    /^f[cd][0-9a-f]{2}:/i.test(host)
  if (local) return { why: 'Это внутренний адрес, а не страница магазина' }
  return { url: u }
}

/** Почему сайт не отдал страницу — словами, которые человек прочитает в строке. */
function whyStatus(status: number, site: string): string {
  if (status === 403 || status === 401) return `${site} не пускает робота на эту страницу`
  if (status === 404) return `${site}: такой страницы нет`
  if (status === 429) return `${site} просит подождать: слишком много запросов`
  if (status >= 500) return `${site} сейчас отвечает ошибкой`
  return `${site} ответил отказом (${status})`
}

/** Прочитать не больше MAX_BYTES: карточка лежит в начале, хвост нам не нужен. */
async function readCapped(res: Response): Promise<string> {
  const body = res.body
  if (!body) return ''
  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  while (size < MAX_BYTES) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    size += value.length
  }
  try {
    await reader.cancel()
  } catch {
    /* поток уже закрыт — нам всё равно */
  }
  const all = new Uint8Array(size)
  let at = 0
  for (const c of chunks) {
    all.set(c.subarray(0, Math.min(c.length, size - at)), at)
    at += c.length
    if (at >= size) break
  }
  /* Кодировку берём из заголовка: старые магазины до сих пор отдают windows-1251,
     и в UTF-8 такая страница читается как каша. */
  const ct = res.headers.get('content-type') || ''
  const enc = ct.match(/charset=([\w-]+)/i)?.[1]?.toLowerCase() || 'utf-8'
  try {
    return new TextDecoder(enc).decode(all)
  } catch {
    return new TextDecoder('utf-8').decode(all)
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return reply({ ok: false, why: 'Так спрашивать нельзя' })

  let asked: unknown
  try {
    asked = await req.json()
  } catch {
    return reply({ ok: false, why: 'Не разобрал просьбу' })
  }

  const checked = checkUrl((asked as { url?: unknown })?.url)
  if ('why' in checked) return reply({ ok: false, why: checked.why })
  const url = checked.url
  const site = url.hostname.replace(/^www\./i, '')

  const stop = new AbortController()
  const timer = setTimeout(() => stop.abort(), TIMEOUT_MS)
  let res: Response
  try {
    res = await fetch(url.toString(), {
      redirect: 'follow',
      signal: stop.signal,
      headers: {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'ru,en;q=0.8',
      },
    })
  } catch (e) {
    clearTimeout(timer)
    const aborted = e instanceof DOMException && e.name === 'AbortError'
    return reply({
      ok: false,
      site,
      why: aborted ? `${site} не ответил за 12 секунд` : `${site} не отвечает`,
    })
  }
  clearTimeout(timer)

  if (!res.ok) return reply({ ok: false, site, why: whyStatus(res.status, site) })

  const type = res.headers.get('content-type') || ''
  if (type && !/text\/html|application\/xhtml/i.test(type)) {
    return reply({ ok: false, site, why: `${site} отдал не страницу, а ${type.split(';')[0]}` })
  }

  let html = ''
  try {
    html = await readCapped(res)
  } catch {
    return reply({ ok: false, site, why: `${site} оборвал страницу на полуслове` })
  }

  const card = parseProduct(html)
  const img = absoluteImg(card.img, res.url || url.toString())

  if (!card.title && !card.price) {
    /* Страница пришла, но карточки в разметке нет: так ведут себя магазины,
       которые рисуют название и цену уже в браузере покупателя. */
    return reply({
      ok: false,
      site,
      why: `${site} не отдал карточку товара — впишите название и цену сами`,
    })
  }

  return reply({
    ok: true,
    site,
    title: card.title,
    img,
    price: card.price,
    currency: card.currency,
  })
})
