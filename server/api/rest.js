/**
 * Сервер данных листа Pine-to-Pine.
 *
 * Зачем он есть. 09.08.2026 у Supabase кончился бесплатный лимит исходящего
 * трафика, и боевой лист перестал открываться у всех: любой запрос отвечал
 * `402 exceed_egress_quota`. Кодом такую квоту не вернуть, а лист нужен рабочим
 * каждый день. Этот сервер повторяет ТЕ ЖЕ пять точек входа, что были у базы,
 * поэтому в приложении меняется ровно один адрес (`SB.url` в lib/supabase.ts),
 * а не модель данных и не формат документа (постулат 4).
 *
 * Что повторено один в один:
 *   POST /rest/v1/rpc/trip_read   {p_id,p_key}                        → [{data,updated_at,author}]
 *   POST /rest/v1/rpc/trip_write  {p_trip,p_key,p_data,p_seen,p_stamp,p_author}
 *                                                                     → [{updated_at}] | []
 *   POST /rest/v1/rpc/trip_owner  {p_id,p_key}                        → [{owner_email}]
 *   POST /rest/v1/rpc/trip_list   {p_key}                             → [{id,updated_at,…}]
 *   GET  /rest/v1/trip_pings?trip_id=eq.<id>&select=updated_at&limit=1 → [{updated_at}]
 *   POST /rest/v1/trip_pings      [{trip_id,updated_at,author}]        → [{updated_at}]
 *
 * ⛔ Ключ человека сверяется ЗДЕСЬ, на сервере, со списком людей внутри самого
 * документа — ровно как это делала функция базы `trip_read`. Требование заказчика
 * 05.08.2026: «чтобы в публичном доступе не была информация».
 *
 * ⛔ Документ лежит в хранилище ЗАШИФРОВАННЫМ (AES-256-GCM, ключ в переменной
 * окружения `DOC_SECRET`). Причина: у Vercel Blob адреса файлов публичные —
 * кто узнал ссылку, тот прочитал бы лист целиком. Шифр закрывает эту дыру:
 * без ключа из окружения файл нечитаем.
 *
 * ⚠️ Чего этот сервер НЕ умеет, в отличие от базы: сокета Realtime у него нет.
 * Приложение это переживает — без сокета оно спрашивает метку каждые 8 секунд,
 * а метка весит десятки байт (урок У-171).
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { list, put } from '@vercel/blob'

/** Откуда пускаем. Лист живёт на своём домене; localhost — для проверки. */
const ALLOWED = [
  'https://pine-to-pine.com',
  'https://www.pine-to-pine.com',
  'http://localhost:5199',
  'http://localhost:5200',
  'http://127.0.0.1:5199',
  'http://localhost:4173',
]

/* ── шифр ───────────────────────────────────────────────────────────────── */

function secret() {
  const raw = process.env.DOC_SECRET
  if (!raw) throw new Error('DOC_SECRET не задан')
  /* Ключ ровно 32 байта — из любой строки делаем хешем. */
  return createHash('sha256').update(raw).digest()
}

function seal(text) {
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', secret(), iv)
  const body = Buffer.concat([c.update(text, 'utf8'), c.final()])
  return Buffer.concat([iv, c.getAuthTag(), body])
}

function unseal(buf) {
  const iv = buf.subarray(0, 12)
  const tag = buf.subarray(12, 28)
  const d = createDecipheriv('aes-256-gcm', secret(), iv)
  d.setAuthTag(tag)
  return Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString('utf8')
}

/* ── хранилище ──────────────────────────────────────────────────────────── */

/**
 * Прочитать запись по имени.
 *
 * ⚠️ `cache: 'no-store'` обязателен: адреса Blob раздаёт сеть доставки, и без
 * этого сразу после записи вернулась бы прежняя версия документа.
 */
async function readBlob(name) {
  const { blobs } = await list({ prefix: name, limit: 1 })
  const hit = blobs.find((b) => b.pathname === name)
  if (!hit) return null
  const r = await fetch(hit.url, { cache: 'no-store' })
  if (!r.ok) return null
  const buf = Buffer.from(await r.arrayBuffer())
  try {
    return JSON.parse(unseal(buf))
  } catch {
    return null
  }
}

async function writeBlob(name, value) {
  await put(name, seal(JSON.stringify(value)), {
    access: 'public',
    contentType: 'application/octet-stream',
    addRandomSuffix: false,
    allowOverwrite: true,
    cacheControlMaxAge: 0,
  })
}

const rowName = (id) => 'trips/' + id + '.json'
const pingName = (id) => 'pings/' + id + '.json'

/* ── права ──────────────────────────────────────────────────────────────── */

/**
 * Есть ли человек с таким личным ключом в команде поездки.
 * Сверяем ровно так же, как сверяла функция базы: по списку `people` ВНУТРИ
 * документа. Пустой ключ не проходит никогда.
 */
function knows(row, key) {
  if (!key) return false
  const people = row?.data?.people
  if (!Array.isArray(people)) return false
  return people.some((p) => p && p.key && String(p.key) === String(key))
}

/* ── ответы ─────────────────────────────────────────────────────────────── */

function cors(req, res) {
  const from = req.headers.origin || ''
  if (ALLOWED.includes(from)) res.setHeader('Access-Control-Allow-Origin', from)
  res.setHeader('Vary', 'Origin')
  res.setHeader('Access-Control-Allow-Headers', 'apikey,authorization,content-type,prefer')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,OPTIONS')
  res.setHeader('Access-Control-Max-Age', '86400')
}

function send(res, code, body) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.status(code).send(JSON.stringify(body))
}

/** Отказ по ключу — тем же текстом, который приложение ищет в теле ответа. */
const REJECT = { code: '42501', message: 'ключ не подходит' }

/* ── точка входа ────────────────────────────────────────────────────────── */

export default async function handler(req, res) {
  cors(req, res)
  if (req.method === 'OPTIONS') return res.status(204).end()

  const url = new URL(req.url, 'http://x')
  /* Путь приходит из переписывания в `vercel.json`; прямой вызов тоже принимаем. */
  const path = String(url.searchParams.get('p') || '').replace(/^\/+/, '')
  const body = typeof req.body === 'string' ? safeJson(req.body) : req.body

  try {
    if (path === 'rpc/trip_read') return await tripRead(res, body)
    if (path === 'rpc/trip_write') return await tripWrite(res, body)
    if (path === 'rpc/trip_owner') return await tripOwner(res, body)
    if (path === 'rpc/trip_list') return await tripList(res, body)
    if (path === 'trip_pings') return await pings(req, res, url, body)
    /* Прямой доступ к таблице закрыт так же, как он закрыт в базе
       (docs/rls-apply-e.sql): всё идёт только через точки выше. */
    if (path.startsWith('trips')) return send(res, 403, REJECT)
    return send(res, 404, { code: 'PGRST202', message: 'нет такой точки: ' + path })
  } catch (e) {
    return send(res, 500, { message: String((e && e.message) || e) })
  }
}

function safeJson(s) {
  try {
    return JSON.parse(s)
  } catch {
    return null
  }
}

async function tripRead(res, b) {
  const id = String(b?.p_id || '')
  const row = await readBlob(rowName(id))
  /* Строки нет — это НЕ отказ: приложение так узнаёт, что поездку надо завести. */
  if (!row) return send(res, 200, [])
  if (!knows(row, b?.p_key)) return send(res, 401, REJECT)
  return send(res, 200, [{ data: row.data, updated_at: row.updated_at, author: row.author ?? null }])
}

async function tripOwner(res, b) {
  const row = await readBlob(rowName(String(b?.p_id || '')))
  if (!row) return send(res, 200, [])
  if (!knows(row, b?.p_key)) return send(res, 401, REJECT)
  return send(res, 200, [{ owner_email: row.owner_email ?? null }])
}

/**
 * Запись документа.
 *
 * `p_seen` — метка, которую писавший видел. Не совпала с тем, что лежит на
 * сервере, — отдаём НОЛЬ строк: приложение прочитает это как «меня опередили»,
 * заберёт свежий документ, сольёт и повторит (`pushTry` в lib/sync.ts).
 *
 * ⚠️ Честная оговорка: у файлового хранилища нет сделок, и проверка «прочитал —
 * сравнил — записал» не мгновенна. Двоих, нажавших в одну и ту же долю секунды,
 * она не разведёт; ушедшую при этом правку подберёт ближайшее слияние. У базы
 * это было настоящим условием записи. Разница названа вслух, а не спрятана.
 */
async function tripWrite(res, b) {
  const id = String(b?.p_trip || '')
  const now = b?.p_stamp || new Date().toISOString()
  const was = await readBlob(rowName(id))

  if (!was) {
    /* Строки ещё нет. Ключ сверяем с тем документом, который заводят: иначе
       первую запись поездки было бы нечем проверить. */
    const fresh = { id, data: b?.p_data, updated_at: now, author: b?.p_author ?? null, owner_email: null }
    if (!knows(fresh, b?.p_key)) return send(res, 401, REJECT)
    await writeBlob(rowName(id), fresh)
    return send(res, 200, [{ updated_at: now }])
  }

  if (!knows(was, b?.p_key)) return send(res, 401, REJECT)
  const seen = b?.p_seen ?? null
  if (seen !== null && String(seen) !== String(was.updated_at)) return send(res, 200, [])

  await writeBlob(rowName(id), {
    ...was,
    data: b?.p_data,
    updated_at: now,
    author: b?.p_author ?? was.author ?? null,
  })
  return send(res, 200, [{ updated_at: now }])
}

/** Поездки, в команде которых есть человек с этим ключом. Чужих не отдаёт. */
async function tripList(res, b) {
  const key = b?.p_key
  if (!key) return send(res, 200, [])
  const { blobs } = await list({ prefix: 'trips/', limit: 1000 })
  const out = []
  for (const blob of blobs) {
    const row = await readBlob(blob.pathname)
    if (!row || !knows(row, key)) continue
    out.push({
      id: row.id,
      updated_at: row.updated_at,
      author: row.author ?? null,
      owner_email: row.owner_email ?? null,
      title: row.data?.trip?.title ?? null,
    })
  }
  return send(res, 200, out)
}

/**
 * Метка «документ менялся» — та самая мелочь вместо мегабайта (урок У-171).
 * Ключ здесь не спрашивается сознательно: метка не содержит ничего о поездке,
 * кроме времени, а спрашивают её постоянно.
 */
async function pings(req, res, url, body) {
  if (req.method === 'GET') {
    const eq = String(url.searchParams.get('trip_id') || '').replace(/^eq\./, '')
    const row = await readBlob(pingName(eq))
    return send(res, 200, row ? [{ updated_at: row.updated_at }] : [])
  }
  const one = Array.isArray(body) ? body[0] : body
  const id = String(one?.trip_id || '')
  const stamp = one?.updated_at || new Date().toISOString()
  await writeBlob(pingName(id), { trip_id: id, updated_at: stamp, author: one?.author ?? null })
  return send(res, 200, [{ updated_at: stamp }])
}
