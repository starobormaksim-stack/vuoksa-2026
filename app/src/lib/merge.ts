/**
 * Слияние двух копий документа — перенос mergeInto из боевой версии (src/app.template.html)
 * плюс новые коллекции v2 (docs/v2-architecture.md, раздел 2.4).
 *
 * Как это работает словами: документ на сервере один, но правки вливаются не «кто последний,
 * тот и прав», а по позициям. Каждая позиция сопоставляется по полю `i`; у кого метка времени
 * `ua` свежее — тот и прав. Отметки при равных метках берутся более продвинутые (включённая
 * галочка не гаснет от чужой старой копии). Удалённое помнится в `S.del` («коллекция:i» → когда
 * убрали) и не воскресает.
 *
 * Объектные поля (`nt`, `blocks`, `o`, `q`, `oby`, `qask`) сравниваются через JSON.stringify —
 * так же, как в v1: отдельных меток времени у них нет, а посимвольная разница не нужна.
 *
 * Функции меняют переданный документ на месте: вызывающий сам делает клон, если ему нужна
 * неизменяемость (так делает store.ts).
 */

import type { State } from './types.ts'

/** Позиция коллекции глазами слияния. */
interface Item {
  i: string
  ua?: number
  nw?: number
  [k: string]: unknown
}

/** Документ глазами слияния — коллекции по имени. */
type Bag = Record<string, unknown>

/** Сколько чего приехало. */
export interface MergeResult {
  /** изменившихся отметок */
  marks: number
  /** изменившихся полей */
  edits: number
  /** новых позиций */
  news: number
  /** убранных позиций */
  gone: number
  total: number
}

/** Глубокая копия (документ — обычный JSON). */
export function clone<T>(x: T): T {
  return x === undefined ? x : (JSON.parse(JSON.stringify(x)) as T)
}

/** Запомнить удаление: слияние не вернёт позицию обратно. */
export function forget(S: State, kind: string, i: string): void {
  if (!S.del) S.del = {}
  S.del[kind + ':' + i] = Date.now()
}

/** Отменить удаление. */
export function revive(S: State, kind: string, i: string): void {
  if (S.del) delete S.del[kind + ':' + i]
}

/* ─────────── таблица коллекций ───────────
   Простые коллекции: сравниваем перечисленные поля, побеждает более свежий `ua`.
   Списки полей — из docs/v2-architecture.md, раздел 2.4. */
const PLAIN: Record<string, string[]> = {
  /* ⚠️ `payer` — кто выложил деньги за топливо (взаиморасчёты, settle.ts).
     `owner` рядом с ним ОСТАЁТСЯ и не переписывается: подмена формы стёрла бы
     принадлежность техники у всех сразу (урок У-04). */
  /* ⚠️ `kmAuto`/`km`/`kmSrc`/`kmLocal` — свой пробег единицы техники (calc.kmOf).
     Это ДЕНЬГИ: без них правка пробега у Кости не доехала бы до Макса, а карта
     на другом телефоне молча вернула бы старую цифру. */
  /* ⚠️ `kBack` — свой множитель «туда и обратно» у ветки на карте. Тоже деньги:
     галочку ставят на карте, а расход считается у всех. `tone` — свой цвет
     нитки, `o` — экипаж (см. объекты ниже: `o` сравнивается целиком). */
  transport: [
    'n', 'kind', 'kindT', 'fuel', 'rate', 'rateU', 'hours', 'litres',
    'carry', 'owner', 'payer', 'leg', 'kmAuto', 'km', 'kmSrc', 'kmLocal',
    'kBack', 'tone', 'color', 'calcT', 'c', 'ord', 'by', 'as',
  ],
  rent: [
    'n', 'cat', 'price', 'unit', 'qty', 'count', 'payer', 'calcT', 'c', 'warn',
    'ord', 'by', 'as',
  ],
  fuelPrices: ['n', 'price', 'u', 'c', 'ord'],
  gearSections: ['t', 'ord'],
  buySections: ['t', 'personal', 'ord'],
  units: ['t', 'full', 'ord'],
  kinds: ['t', 'rateU', 'icon', 'ord'],
  rentCats: ['t', 'ord'],
  canRows: ['t', 'c', 'fuel', 'ord'],
}

/**
 * Поля-объекты: сравнение через JSON.stringify.
 *
 * ⚠️ `sp` — круг делящих трату (взаиморасчёты). Это МАССИВ, а `fields()`
 * сравнивает через `!==`, то есть у двух одинаковых списков он всегда видел бы
 * разницу и переписывал бы поле на каждом слиянии. Поэтому только сюда.
 */
const PLAIN_JSON: Record<string, string[]> = {
  /* `o` — экипаж этой единицы техники (кто едет). Словарь, поэтому сюда же. */
  transport: ['nt', 'sp', 'o'],
  rent: ['blocks', 'nt', 'sp'],
  fuelPrices: ['nt'],
}

/** Поля карточки участника, которые слияние переносит. */
const PERSON_FIELDS = ['name', 'ini', 'car', 'role', 'desc', 'color', 'perm', 'key', 'slug', 'photo']

/**
 * Общие блоки без собственных меток времени: решаются по свежести всего документа.
 * Из v1-списка ушли ставшие коллекциями log/boat/calcRows/canRows/logNotes/buySections,
 * добавился doc (валюта и единицы).
 */
const WHOLE_DOC = ['menu', 'weather', 'tileLabels', 'secTitles', 'trip', 'doc']

/** Поля, которые страховка «добери недостающее» не трогает: они личные, не общие. */
const LOCAL_ONLY = ['me', 'theme', 'author', 'updatedAt']

/**
 * Добрать в `a` ключи, которые есть в `b` и отсутствуют в `a`. Возвращает, сколько добрал.
 *
 * Только добавляет: существующие значения не трогает, списки не сливает (за них
 * отвечает `pick`), в чужие ветки не спускается глубже одного уровня объектов.
 * Смысл — не дать устаревшей копии молча удалить поле с сервера.
 */
function fillMissingKeys(a: unknown, b: unknown): number {
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return 0
  if (Array.isArray(a) || Array.isArray(b)) return 0
  const dst = a as Bag
  const src = b as Bag
  let n = 0
  Object.keys(src).forEach((k) => {
    const bv = src[k]
    if (bv === undefined || bv === null) return
    const av = dst[k]
    if (av === undefined || av === null) {
      dst[k] = clone(bv)
      n++
      return
    }
    /* Оба — простые объекты: спускаемся на уровень ниже (например, trip.lat/lon). */
    if (
      typeof av === 'object' &&
      typeof bv === 'object' &&
      !Array.isArray(av) &&
      !Array.isArray(bv)
    ) {
      n += fillMissingKeys(av, bv)
    }
  })
  return n
}

/** Влить входящий документ `inc` в `S`. Меняет `S` на месте. */
export function mergeInto(S: State, inc: Partial<State> | null | undefined): MergeResult {
  let marks = 0
  let news = 0
  let edits = 0
  let gone = 0
  const src = (inc || {}) as Bag
  const dst = S as unknown as Bag

  if (!S.del) S.del = {}
  const del = S.del
  const idel = (src.del || {}) as Record<string, number>
  Object.keys(idel).forEach((k) => {
    if ((idel[k] || 0) > (del[k] || 0)) del[k] = idel[k]
  })

  /* ── участники: сопоставление по id, а не по i ── */
  const people = (dst.people || []) as unknown as Item[]
  const incPeople = (src.people || []) as unknown as Item[]
  incPeople.forEach((ip) => {
    const id = String(ip.id)
    let mine: Item | null = null
    people.forEach((p) => {
      if (p.id === id) mine = p
    })
    const have = mine as Item | null
    if (!have) {
      /* ⛔ Метка удаления должна СУЩЕСТВОВАТЬ. Без первой половины условия
         отсутствующая метка (0) и не правленная руками карточка (`ua: 0`) дают
         `0 >= 0` — и человек, которого никто не удалял, молча не приезжает
         в пустую копию. Урок У-68, тот же дефект ниже в `pick`. */
      const t = del['people:' + id] || 0
      if (t && t >= (ip.ua || 0)) return
      people.push(clone(ip))
      news++
      return
    }
    if ((ip.ua || 0) > (have.ua || 0)) {
      PERSON_FIELDS.forEach((f) => {
        if (ip[f] != null && ip[f] !== have[f]) {
          have[f] = clone(ip[f])
          edits++
        }
      })
      have.ua = ip.ua
    } else if (!have.photo && ip.photo) {
      have.photo = ip.photo
      edits++
    }
  })
  for (let pj = people.length - 1; pj >= 0; pj--) {
    const t = del['people:' + String(people[pj].id)] || 0
    if (t && t > (people[pj].ua || 0) && people.length > 1) {
      people.splice(pj, 1)
      gone++
    }
  }

  /** Перенести перечисленные поля; вернуть число изменившихся. */
  function fields(a: Item, b: Item, list: string[]): number {
    let e = 0
    list.forEach((f) => {
      if (b[f] !== undefined && b[f] !== a[f]) {
        a[f] = clone(b[f])
        e++
      }
    })
    return e
  }

  /** То же, но для объектных полей: сравнение через JSON.stringify. */
  function jsonFields(a: Item, b: Item, list: string[]): number {
    let e = 0
    list.forEach((f) => {
      if (b[f] === undefined) return
      if (JSON.stringify(b[f]) !== JSON.stringify(a[f])) {
        a[f] = clone(b[f])
        e++
      }
    })
    return e
  }

  /** Пройти коллекцию: добавить новое, слить общее, убрать удалённое. */
  function pick(k: string, cmp: (a: Item, b: Item) => { marks: number; edits: number }): void {
    if (!Array.isArray(dst[k])) {
      if (Array.isArray(src[k])) dst[k] = clone(src[k])
      else return
    }
    const list = dst[k] as unknown as Item[]
    const byId: Record<string, Item> = {}
    list.forEach((x) => {
      byId[x.i] = x
    })
    const incoming = (src[k] || []) as unknown as Item[]
    incoming.forEach((x) => {
      const mine = byId[x.i]
      if (!mine) {
        /* ⛔ Сначала «метка удаления вообще есть», и только потом сравнение.
           Пока сид был полной копией поездки, сюда попадали только чужие новинки,
           и `0 >= 0` не стреляло: заводские позиции уже лежали в `list`. С заводским
           сидом без данных (У-65) в эту ветку пошло ВСЁ, и позиция, которую никто
           не правил руками (`ua: 0`), молча не доезжала до чистого браузера:
           из 103 сборов приезжало 3, из 53 закупок — 2, из 4 машин — ни одной.
           А следом эта обеднённая копия ушла бы на сервер. Урок У-68.
           Ниже, в проходе по своим позициям, существование метки проверяется
           точно так же (`t && t > …`) — здесь этой половины не хватало. */
        const t = del[k + ':' + x.i] || 0
        if (t && t >= (x.ua || 0)) return
        const c = clone(x)
        c.nw = 1
        list.push(c)
        byId[c.i] = c
        news++
        return
      }
      const r = cmp(mine, x)
      marks += r.marks
      edits += r.edits
    })
    for (let j = list.length - 1; j >= 0; j--) {
      const it = list[j]
      const t = del[k + ':' + it.i] || 0
      if (t && t > (it.ua || 0)) {
        list.splice(j, 1)
        gone++
      }
    }
  }

  /* ── сборы: статусы по людям + количества, просьбы и «кто назначил» ── */
  pick('gear', (a, b) => {
    let m = 0
    let e = 0
    const bs = (b.s || {}) as Record<string, number>
    const as = (a.s || (a.s = {})) as Record<string, number>
    Object.keys(bs).forEach((p) => {
      const av = as[p] || 0
      const bv = bs[p] || 0
      /* при равных метках берём более продвинутый статус — чужая старая копия его не гасит */
      const take = (b.ua || 0) > (a.ua || 0) ? bv : Math.max(av, bv)
      if (take !== av) {
        as[p] = take
        m++
      }
    })
    if ((b.ua || 0) > (a.ua || 0)) {
      /* `url`, `img`, `pat` — ссылка на страницу товара, её фотография и время
         последнего снятия цены (см. ProductLink в types.ts). Простые значения,
         значит идут обычным `fields`; пустые — сегодняшнее поведение. */
      e += fields(a, b, ['n', 'c', 'sec', 'by', 'as', 'ord', 'url', 'img', 'pat'])
      e += jsonFields(a, b, ['o', 'q', 'oby'])
      a.ua = b.ua
    }
    return { marks: m, edits: e }
  })

  /* ── закупка ── */
  pick('buy', (a, b) => {
    let m = 0
    let e = 0
    /* старое поле «куплено» из документов v1: включённое не гаснет */
    if (b.b !== undefined && !!b.b !== !!a.b) {
      if ((b.ua || 0) >= (a.ua || 0) || b.b) {
        a.b = !!b.b
        m++
      }
    }
    if ((b.ua || 0) > (a.ua || 0)) {
      e += fields(a, b, [
        'n', 'q', 'pr', 'prf', 'st', 'u', 'uid', 'who', 'sec', 'c', 'by', 'as', 'qby',
        'payer', 'ord',
        /* `url`, `img`, `pat` — ссылка на страницу товара, её фотография и время
           последнего снятия цены (см. ProductLink в types.ts). */
        'url', 'img', 'pat',
      ])
      /* `o` — кто сколько покупает (id человека → количество). Появилось
         04.08.2026 вместе с отметками покупателей в таблице закупки; без слияния
         эти отметки жили бы только в одном браузере. Взаиморасчёты читают его же
         как плательщиков позиции (settle.ts), поэтому потерять его нельзя вдвойне.
         `sp` — круг делящих; массив, значит только через jsonFields. */
      e += jsonFields(a, b, ['qask', 'o', 'sp'])
      a.ua = b.ua
    }
    return { marks: m, edits: e }
  })

  /* ── маршрут: галочка «пройдено» + расширенный набор полей v2 ── */
  pick('route', (a, b) => {
    let m = 0
    let e = 0
    if (!!b.done !== !!a.done) {
      if ((b.ua || 0) >= (a.ua || 0) || b.done) {
        a.done = !!b.done
        m++
      }
    }
    if ((b.ua || 0) > (a.ua || 0)) {
      /* `tr` — чья это точка (id единицы техники). Появилось 04.08.2026 вместе
         с цветными нитками маршрута на карте; без слияния принадлежность точки
         не доехала бы с другого телефона, и нитки разошлись бы по-разному. */
      e += fields(a, b, [
        'n', 'time', 'c', 'lat', 'lon', 'addr', 'lab', 'labT', 'mode', 'tr', 'leg', 'legSrc', 'ord',
      ])
      /* `o` — кто едет этой точкой (id человека → 1). Отдельной строкой и через
         jsonFields, а не в списке выше: `fields` сравнивает через `!==`, а два
         одинаковых объекта так всегда разные — поле переписывалось бы на каждом
         слиянии и могло затереть чужую свежую правку клоном самой себя. Ровно
         поэтому `sp` и `o` закупки заведены здесь же, а не в `fields`. */
      e += jsonFields(a, b, ['o'])
      a.ua = b.ua
    }
    return { marks: m, edits: e }
  })

  /* ── «что не забыть» ── */
  pick('ideas', (a, b) => {
    let m = 0
    let e = 0
    if (!!b.done !== !!a.done) {
      if ((b.ua || 0) >= (a.ua || 0) || b.done) {
        a.done = !!b.done
        m++
      }
    }
    if ((b.ua || 0) > (a.ua || 0)) {
      e += fields(a, b, ['n', 'why', 'who'])
      a.ua = b.ua
    }
    return { marks: m, edits: e }
  })

  /* ── новые коллекции v2 и справочники ── */
  Object.keys(PLAIN).forEach((k) => {
    const list = PLAIN[k]
    const jlist = PLAIN_JSON[k] || []
    pick(k, (a, b) => {
      if ((b.ua || 0) <= (a.ua || 0)) return { marks: 0, edits: 0 }
      const e = fields(a, b, list) + jsonFields(a, b, jlist)
      a.ua = b.ua
      return { marks: 0, edits: e }
    })
  })

  /* ── общие блоки без собственных меток: по свежести всего документа ── */
  const fresher = (inc?.updatedAt || '') > (S.updatedAt || '')
  WHOLE_DOC.forEach((f) => {
    if (src[f] === undefined || src[f] === null) return
    if (fresher) {
      dst[f] = clone(src[f])
      return
    }
    /* Пришедшее старее нашего — но того, чего у нас НЕТ, оно не отменяет.
       См. страховку ниже: именно так 04.08.2026 пропали свои названия разделов. */
    if (dst[f] === undefined || dst[f] === null) {
      dst[f] = clone(src[f])
      edits++
      return
    }
    edits += fillMissingKeys(dst[f], src[f])
  })
  if (fresher && src.theme !== undefined) S.theme = src.theme as string | null

  /* ── Страховка: слияние не имеет права терять поля ──────────────────────
     04.08.2026 боевой лист четырежды обеднела вкладка с УСТАРЕВШЕЙ копией:
     она сливала свежий серверный документ со своим, но поля, которых в её
     копии не было вовсе (`secTitles`, `tileLabels`, `trip.lat/lon`, прогноз),
     слияние не воскрешало — и обеднённый документ уезжал обратно на сервер.
     Здесь мы добираем всё, что есть на сервере и отсутствует у нас. Это
     действие только добавляющее: ни одно существующее значение оно не трогает,
     а значит и чужую свежую правку затереть не может.
     Настоящее лечение — RLS по auth.uid(), см. PROMPT-NEXT.md. */
  const local = { ...src }
  /* Это не общие поля документа, а личные: «кто я», выбранная тема, подпись
     последнего писавшего и метка документа. С сервера их не добираем. */
  LOCAL_ONLY.forEach((k) => delete local[k])
  edits += fillMissingKeys(dst, local)

  return { marks, edits, news, gone, total: marks + edits + news + gone }
}

/**
 * Привести документ в рабочий вид: собрать недостающие коллекции, объекты и метки.
 * Аналог normalize() из v1; ничего не выдумывает, только заполняет пустое.
 */
export function normalizeDoc(S: State): State {
  const d = S as unknown as Bag
  if (!S.del) S.del = {}
  const LISTS = [
    'people', 'gear', 'gearSections', 'buy', 'buySections', 'route', 'ideas',
    'transport', 'fuelPrices', 'rent', 'rentCats', 'kinds', 'rateUnits', 'units', 'canRows',
  ]
  LISTS.forEach((k) => {
    if (!Array.isArray(d[k])) d[k] = []
  })
  if (typeof S.updatedAt === 'number') S.updatedAt = new Date(S.updatedAt).toISOString()
  /* `url` и `img` — пустая строка, `pat` — ноль: это ровно сегодняшнее поведение
     позиции без ссылки на товар (см. ProductLink в types.ts). Умолчание нужно
     затем же, зачем оно у остальных полей: без него `fields()` сравнивал бы
     undefined с пустой строкой и переписывал бы поле на каждом слиянии. */
  S.gear.forEach((g) => {
    if (!g.o) g.o = {}
    if (!g.q) g.q = {}
    if (!g.oby) g.oby = {}
    if (!g.s) g.s = {}
    if (g.url == null) g.url = ''
    if (g.img == null) g.img = ''
    g.pat = g.pat || 0
    g.ua = g.ua || 0
  })
  S.buy.forEach((p) => {
    if (p.who == null) p.who = ''
    if (p.url == null) p.url = ''
    if (p.img == null) p.img = ''
    p.pat = p.pat || 0
    p.ua = p.ua || 0
  })
  S.route.forEach((r) => {
    /* Пустой объект = сегодняшнее поведение: точка ничья, едут все. */
    if (!r.o) r.o = {}
    r.ua = r.ua || 0
  })
  S.people.forEach((p) => {
    if (p.photo == null) p.photo = ''
    if (!p.perm) p.perm = 'member'
    p.ua = p.ua || 0
  })
  return S
}

/**
 * Добрать из сида то, чего нет в документе: новые позиции и людей.
 * Ссылки и ключи прав держим одинаковыми во всех копиях — берём их из сида, если своих нет.
 */
export function mergeSeed(doc: State, seed: State): State {
  const out = clone(doc)
  const od = out as unknown as Bag
  const sd = seed as unknown as Bag
  const COLLECTIONS = [
    'gear', 'buy', 'route', 'ideas', 'gearSections', 'buySections',
    'transport', 'fuelPrices', 'rent', 'rentCats', 'kinds', 'rateUnits', 'units', 'canRows',
  ]
  COLLECTIONS.forEach((k) => {
    if (!Array.isArray(od[k])) od[k] = []
    const list = od[k] as unknown as Item[]
    const have: Record<string, number> = {}
    list.forEach((x) => {
      have[x.i] = 1
    })
    const from = (sd[k] || []) as unknown as Item[]
    from.forEach((x) => {
      /* убранное вручную не возвращаем */
      if ((out.del || {})[k + ':' + x.i]) return
      if (!have[x.i]) list.push(clone(x))
    })
  })
  const hp: Record<string, { slug?: string; key?: string }> = {}
  out.people.forEach((p) => {
    hp[p.id] = p
  })
  seed.people.forEach((p) => {
    const m = hp[p.id]
    if (!m) {
      if (!(out.del || {})['people:' + p.id]) out.people.push(clone(p))
      return
    }
    if (!m.slug && p.slug) m.slug = p.slug
    if (!m.key && p.key) m.key = p.key
  })
  if (!out.trip) out.trip = clone(seed.trip)
  else
    Object.keys(seed.trip).forEach((k) => {
      const t = out.trip as unknown as Bag
      if (t[k] === undefined) t[k] = clone((seed.trip as unknown as Bag)[k])
    })
  if (!out.doc) out.doc = clone(seed.doc)
  if (!out.weather) out.weather = clone(seed.weather)
  if (!out.menu) out.menu = clone(seed.menu)
  return out
}
