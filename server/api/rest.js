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
 * Свои точки, которых у базы не было:
 *   POST /rest/v1/rpc/img_put        {p_trip,p_key,p_data}  → [{url}]
 *     Картинка (обложка, лицо) уезжает ФАЙЛОМ в Blob, в документе остаётся ссылка.
 *     Прежде картинки лежали в документе строками base64 — 1 МБ из 1,1, и каждая
 *     правка листа стоила мегабайта всем (У-171). Адрес файла неугадываемый
 *     (случайный суффикс) и публичный — решение заказчика 09.08.2026: «по
 *     секретной ссылке». Сам документ как был шифрованным, так и остаётся.
 *   POST /rest/v1/rpc/trip_set_owner {p_id,p_key,p_email}   → [{owner_email}]
 *     Почту владельца ставит только владелец (perm=chief).
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
import { head, list, put } from '@vercel/blob'

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
 * Хост, с которого Blob раздаёт файлы. Имена у нас без случайного суффикса,
 * значит адрес записи известен заранее: `хост/имя`.
 *
 * ⛔ Зачем это вместо `list()`. Vercel считает `list()` ДОРОГОЙ операцией
 * (advanced), и бесплатная мера — 10 тысяч в месяц, при превышении хранилище
 * блокируется до конца месяца. А чтение у нас — на каждом опросе метки, то есть
 * `list()` в прежнем виде давал 4 320 операций В СУТКИ с одной открытой
 * вкладки — тот же останов, что у Supabase, третьей единицей счёта подряд:
 * байты → вызовы функции → операции хранилища (У-171, У-176). Прямое чтение
 * адреса — дешёвая операция (simple, 100 тысяч в месяц) либо вовсе кеш.
 *
 * Хост угадывается из BLOB_READ_WRITE_TOKEN, а подтверждается первым же
 * настоящим адресом (из `put` или запасного `list`): пока он не подтверждён,
 * 404 может значить и «записи нет», и «хост угадан неверно» — эти случаи
 * разводит одинарный `list()`.
 */
let blobBase = String(process.env.BLOB_READ_WRITE_TOKEN || '').replace(
  /^vercel_blob_rw_([A-Za-z0-9]+)_.*$/,
  (_, id) => 'https://' + id.toLowerCase() + '.public.blob.vercel-storage.com',
)
if (!blobBase.startsWith('https://')) blobBase = ''
let blobSure = false

/** Запомнить настоящий хост по адресу записи `…хост/имя`. */
function learnBase(url, name) {
  if (typeof url === 'string' && url.endsWith('/' + name)) {
    blobBase = url.slice(0, url.length - name.length - 1)
    blobSure = true
  }
}

/**
 * Прочитать запись по имени.
 *
 * ⚠️ Свежесть и существование — две разные ловушки сети доставки.
 *
 * Свежесть: адреса Blob раздаёт сеть доставки, и сразу после записи по чистому
 * адресу может вернуться ПРЕЖНЯЯ версия. Поэтому каждый запрос идёт с меняющимся
 * `?b=` — такой адрес сеть ещё не кешировала.
 *
 * Существование: сеть доставки кешируют и 404 — «файла нет» живёт в кеше до
 * минуты ПОСЛЕ того, как файл записан. Живой случай 09.08.2026: `trip_read`
 * строку видел, а `img_put` секундой позже получал 404 и отвечал «ключ не
 * подходит». Хуже того, ложное «строки нет» в `trip_write` пересоздало бы
 * документ поверх живого (родня У-07). Поэтому 404 здесь НЕ доказательство:
 * отсутствие подтверждает только `head()` — он спрашивает API, а не кеш.
 */
/**
 * Свежезаписанное — в памяти инстанса, пока хранилище догоняет.
 *
 * ⛔ Перезапись Blob согласуется ДО МИНУТЫ-ДВУХ: чтение сразу после записи
 * возвращает прежнюю версию, и сброс кеша адресом не помогает — отстаёт само
 * хранилище, а не сеть доставки. Живой случай 09.08.2026: миграция записала
 * документ, перечитала — и увидела старый; выглядело как «запись не прошла».
 * Для листа это хуже, чем неудобство: `trip_write`, прочитав отставшую версию,
 * сверил бы `p_seen` с ней и переписал бы свежую правку старьём.
 *
 * ⚠️ Память — НЕ замена чтению, а сверка после него: хранилище читается всегда,
 * и побеждает та версия, у которой `updated_at` новее. Ранний возврат «из
 * памяти, раз она свежая» здесь был бы дырой: он маскировал бы запись соседнего
 * инстанса на всё время жизни записи в памяти. Второй инстанс (редко, при
 * одновременных запросах) до согласования может видеть старое — это та же
 * честная оговорка «двоих в одну долю секунды не разведёт», что была всегда
 * (У-176), только окно теперь названо: до минуты-двух.
 */
const ROW_KEEP = 600000
/** name → { value, at } */
const rowMem = new Map()

function remember(name, value) {
  /* попутная уборка: память держит только недавнее, карта не растёт */
  for (const [k, v] of rowMem) if (Date.now() - v.at > ROW_KEEP) rowMem.delete(k)
  rowMem.set(name, { value, at: Date.now() })
}

/** Что новее — по `updated_at`, если оно есть у обеих версий. */
function newer(a, b) {
  if (!a) return b
  if (!b) return a
  const sa = String(a.updated_at || '')
  const sb = String(b.updated_at || '')
  return sa >= sb ? a : b
}

async function readBlob(name) {
  const mem = rowMem.get(name)
  const bust = () => '?b=' + Date.now() + Math.random().toString(36).slice(2)
  if (blobBase) {
    const r = await fetch(blobBase + '/' + name + bust(), { cache: 'no-store' })
    /* даже удачное чтение сверяем с памятью: хранилище могло ещё не догнать */
    if (r.ok) return newer(parseSealed(Buffer.from(await r.arrayBuffer())), mem && mem.value)
    /* 404 и прочее — ниже спросим авторитетно; хост мог быть и угадан неверно */
  }
  let url = ''
  try {
    const meta = await head(blobBase ? blobBase + '/' + name : name)
    url = meta && meta.url
  } catch {
    /* head() бросает BlobNotFoundError — записи правда нет */
  }
  if (!url) {
    if (blobSure) return (mem && mem.value) || null
    /* хост не подтверждён — последний шанс, что он просто угадан неверно */
    const { blobs } = await list({ prefix: name, limit: 1 })
    const hit = blobs.find((b) => b.pathname === name)
    if (!hit) return (mem && mem.value) || null
    url = hit.url
  }
  learnBase(url, name)
  const r = await fetch(url + bust(), { cache: 'no-store' })
  if (!r.ok) return (mem && mem.value) || null
  return newer(parseSealed(Buffer.from(await r.arrayBuffer())), mem && mem.value)
}

function parseSealed(buf) {
  try {
    return JSON.parse(unseal(buf))
  } catch {
    return null
  }
}

async function writeBlob(name, value) {
  const out = await put(name, seal(JSON.stringify(value)), {
    access: 'public',
    contentType: 'application/octet-stream',
    addRandomSuffix: false,
    allowOverwrite: true,
    cacheControlMaxAge: 0,
  })
  learnBase(out && out.url, name)
  /* своя запись видна своим чтениям сразу, не дожидаясь согласования */
  remember(name, value)
}

const rowName = (id) => 'trips/' + id + '.json'
const pingName = (id) => 'pings/' + id + '.json'

/* ── память инстанса: метка пинга и «кто сейчас в листе» ────────────────── */

/**
 * Метка пинга держится в памяти и перечитывается из хранилища не чаще раза
 * в PING_VERIFY. Обычный случай — один тёплый инстанс: своя запись видна
 * опросу мгновенно, а хранилище не дёргается на каждый тик. Когда инстансов
 * два (редко, при одновременных запросах), второй увидит чужую правку
 * с опозданием до PING_VERIFY — прибавка к 20-секундному опросу, названа
 * в HANDOFF, а не спрятана.
 */
const PING_VERIFY = 30000
/** trip → { row, at } */
const pingMem = new Map()

/**
 * Присутствие: кого видели за последние PRESENCE_TTL. Живёт ТОЛЬКО в памяти —
 * писать его в хранилище значило бы платить дорогой операцией за каждый опрос
 * (та же арифметика, что у `list()` выше). Цена честно названа: после холодного
 * старта функции полоска пустеет на один-два опроса, потом собирается заново.
 */
const PRESENCE_TTL = 35000
/** trip → Map(viewer → когда видели, мс) */
const whoMem = new Map()

function markViewer(trip, viewer) {
  if (!viewer) return
  let m = whoMem.get(trip)
  if (!m) {
    m = new Map()
    whoMem.set(trip, m)
  }
  m.set(viewer, Date.now())
}

function viewersOf(trip) {
  const m = whoMem.get(trip)
  if (!m) return []
  const out = []
  for (const [id, at] of m) {
    if (Date.now() - at > PRESENCE_TTL) m.delete(id)
    else out.push(id)
  }
  return out
}

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
    if (path === 'rpc/img_put') return await imgPut(res, body)
    if (path === 'rpc/trip_set_owner') return await tripSetOwner(res, body)
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

/**
 * Картинка листа — файлом в хранилище, в документ уходит только ссылка.
 *
 * Право то же, что на чтение: любой человек из команды. Тело — data:URL,
 * ровно то, что отдаёт кадрирование (`PhotoCropSheet`); обратно — адрес файла.
 *
 * ⛔ Адрес НЕУГАДЫВАЕМЫЙ (случайный суффикс) и НЕИЗМЕНЯЕМЫЙ: замена снимка —
 * это новый файл с новым адресом, поэтому кеш ставится на год и картинка
 * раздаётся сетью доставки бесплатно. Старые файлы при замене не удаляются
 * нарочно: на них могут ссылаться снимки и офлайн-копии (постулат 4 — данные
 * не выбрасываем), а хранение стоит копейки против повторного мегабайта.
 */
const IMG_MAX = 2 * 1024 * 1024

async function imgPut(res, b) {
  const id = String(b?.p_trip || '')
  const row = await readBlob(rowName(id))
  if (!row || !knows(row, b?.p_key)) return send(res, 401, REJECT)
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(b?.p_data || ''))
  if (!m) return send(res, 400, { message: 'ожидается картинка data:image/…;base64' })
  const bytes = Buffer.from(m[2], 'base64')
  if (!bytes.length) return send(res, 400, { message: 'картинка пуста' })
  if (bytes.length > IMG_MAX) return send(res, 400, { message: 'картинка больше 2 МБ' })
  const ext = m[1] === 'image/png' ? '.png' : m[1] === 'image/webp' ? '.webp' : '.jpg'
  const out = await put('img/' + id + '/photo' + ext, bytes, {
    access: 'public',
    contentType: m[1],
    addRandomSuffix: true,
    cacheControlMaxAge: 31536000,
  })
  return send(res, 200, [{ url: out.url }])
}

/**
 * Почта владельца. Ставит только владелец (perm=chief) — вход почтой даёт
 * права владельца, и раздавать его редактор не должен. Пустая строка счищает.
 */
async function tripSetOwner(res, b) {
  const id = String(b?.p_id || '')
  const row = await readBlob(rowName(id))
  if (!row) return send(res, 200, [])
  const key = String(b?.p_key || '')
  const people = Array.isArray(row?.data?.people) ? row.data.people : []
  const me = key ? people.find((p) => p && p.key && String(p.key) === key) : null
  if (!me || me.perm !== 'chief') return send(res, 401, REJECT)
  const email = String(b?.p_email || '').trim().toLowerCase()
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return send(res, 400, { message: 'это не похоже на почту' })
  await writeBlob(rowName(id), { ...row, owner_email: email || null })
  return send(res, 200, [{ owner_email: email || null }])
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
 *
 * Заодно — присутствие: `?viewer=<id>` отмечает спросившего, а в ответ
 * дописывается `viewers` — кого видели за последние полминуты. Полоска «кто
 * сейчас в листе» едет на уже идущем опросе, не добавляя ни одного запроса
 * и ни одной операции хранилища. Имена по id подставит клиент из документа;
 * посторонний id ничего не раскрывает — это те же слаги, что в личных ссылках.
 */
async function pings(req, res, url, body) {
  if (req.method === 'GET') {
    const eq = String(url.searchParams.get('trip_id') || '').replace(/^eq\./, '')
    markViewer(eq, String(url.searchParams.get('viewer') || '').slice(0, 40))
    const mem = pingMem.get(eq)
    let row
    if (mem && Date.now() - mem.at < PING_VERIFY) row = mem.row
    else {
      row = await readBlob(pingName(eq))
      pingMem.set(eq, { row, at: Date.now() })
    }
    return send(res, 200, row ? [{ updated_at: row.updated_at, viewers: viewersOf(eq) }] : [])
  }
  const one = Array.isArray(body) ? body[0] : body
  const id = String(one?.trip_id || '')
  const stamp = one?.updated_at || new Date().toISOString()
  const row = { trip_id: id, updated_at: stamp, author: one?.author ?? null }
  await writeBlob(pingName(id), row)
  /* своя же память — сразу: опрос соседней вкладки не должен ждать PING_VERIFY */
  pingMem.set(id, { row, at: Date.now() })
  return send(res, 200, [{ updated_at: stamp }])
}
