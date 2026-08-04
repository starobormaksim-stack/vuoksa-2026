/**
 * Книга Excel своими руками — без единой новой зависимости.
 *
 * Как это работает словами: файл `.xlsx` — это обычный zip, внутри которого лежат
 * несколько текстовых файлов XML. Мы их собираем строками и складываем в zip
 * способом «store» (без сжатия): у store нет ни словарей, ни алгоритмов — только
 * контрольная сумма CRC-32, которую честнее посчитать самим, чем тянуть библиотеку.
 * Файл получается крупнее сжатого, но открывается и Excel, и Гугл-таблицами,
 * и Numbers, и телефоном.
 *
 * Что умеет: заголовок листа, подпись под ним, заголовки разделов, шапку колонок
 * (жирную, на кремовом фоне), текстовые и числовые ячейки, ширину колонок,
 * закрепление шапки и первых столбцов. Больше ничего и не нужно: заказчик просил
 * простейшую выгрузку, а не второй сервис внутри первого.
 *
 * Строки пишутся «внутри ячейки» (inlineStr), а не через общий словарь
 * sharedStrings: словарь экономит место, но добавляет целый файл и второй проход,
 * а выгрузка у нас разовая и небольшая.
 *
 * Цвета — брендовые: крем F9F3D4, графит 262513, янтарь BC6C25 и их смесь для
 * подписей. В книге Excel переменных CSS нет, поэтому здесь они записаны числом.
 */

/* ─────────── что кладём в ячейки ─────────── */

/** Начертание ячейки. Числовые стили отличаются только форматом числа. */
export type CellStyle =
  | 'text'
  | 'qty'
  | 'money'
  | 'note'
  | 'head'
  | 'title'
  | 'section'
  | 'total'
  | 'totalMoney'

/** Ячейка с явным начертанием. */
export interface Cell {
  v: string | number | null
  s?: CellStyle
}

/** Ячейка в строке: можно писать просто строку или число. */
export type CellIn = Cell | string | number | null

/** Строка листа. */
export type Row = CellIn[]

/** Лист книги. */
export interface Sheet {
  /** имя вкладки; Excel запрещает `[]:*?/\` и больше 31 знака — почистим сами */
  name: string
  /** ширины колонок в знаках; лишние колонки получат ширину по умолчанию */
  widths: number[]
  rows: Row[]
  /** сколько первых строк закрепить (обычно — по шапку включительно) */
  freezeRows?: number
  /** сколько первых столбцов закрепить (на телефоне спасает «Наименование») */
  freezeCols?: number
}

/** Номер строки (с единицы) первой шапки — по неё и закрепляем лист. */
export function firstHeadRow(rows: Row[]): number {
  for (let i = 0; i < rows.length; i++) {
    const first = rows[i][0]
    if (first && typeof first === 'object' && first.s === 'head') return i + 1
  }
  return 0
}

/* ─────────── начертания ─────────── */

/** Начертание → номер записи в cellXfs файла styles.xml. */
const STYLE_INDEX: Record<CellStyle, number> = {
  text: 0,
  qty: 1,
  money: 2,
  note: 3,
  head: 4,
  title: 5,
  section: 6,
  total: 7,
  totalMoney: 8,
}

const STYLES_XML =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
  '<numFmts count="2">' +
  '<numFmt numFmtId="164" formatCode="#,##0"/>' +
  '<numFmt numFmtId="165" formatCode="#,##0.###"/>' +
  '</numFmts>' +
  '<fonts count="4">' +
  '<font><sz val="11"/><color rgb="FF262513"/><name val="Calibri"/></font>' +
  '<font><b/><sz val="11"/><color rgb="FF262513"/><name val="Calibri"/></font>' +
  '<font><b/><sz val="14"/><color rgb="FF2B391A"/><name val="Calibri"/></font>' +
  '<font><sz val="11"/><color rgb="FF7A7663"/><name val="Calibri"/></font>' +
  '</fonts>' +
  '<fills count="3">' +
  '<fill><patternFill patternType="none"/></fill>' +
  '<fill><patternFill patternType="gray125"/></fill>' +
  '<fill><patternFill patternType="solid"><fgColor rgb="FFF9F3D4"/><bgColor indexed="64"/></patternFill></fill>' +
  '</fills>' +
  '<borders count="3">' +
  '<border><left/><right/><top/><bottom/><diagonal/></border>' +
  '<border><left/><right/><top/><bottom style="thin"><color rgb="FFBC6C25"/></bottom><diagonal/></border>' +
  '<border><left/><right/><top style="thin"><color rgb="FF262513"/></top><bottom/><diagonal/></border>' +
  '</borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="9">' +
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
  '<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
  '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
  '<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
  '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>' +
  '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
  '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
  '<xf numFmtId="0" fontId="1" fillId="0" borderId="2" xfId="0" applyFont="1" applyBorder="1"/>' +
  '<xf numFmtId="164" fontId="1" fillId="0" borderId="2" xfId="0" applyFont="1" applyBorder="1" applyNumberFormat="1"/>' +
  '</cellXfs>' +
  '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
  '</styleSheet>'

/* ─────────── XML ─────────── */

/**
 * Экранирование для XML. Управляющие знаки выкидываем совсем: XML 1.0 их
 * запрещает, и книга с ними не откроется вовсе (а прилететь они могут
 * из чужой вставки текста).
 */
function esc(s: string): string {
  let out = ''
  for (const ch of s) {
    const code = ch.codePointAt(0) as number
    if (ch === '&') out += '&amp;'
    else if (ch === '<') out += '&lt;'
    else if (ch === '>') out += '&gt;'
    else if (ch === '"') out += '&quot;'
    else if (code < 0x20 && ch !== '\t' && ch !== '\n') continue
    else out += ch
  }
  return out
}

/** Номер колонки (с единицы) → буквенное имя: 1 → A, 27 → AA. */
function colName(n: number): string {
  let s = ''
  let x = n
  while (x > 0) {
    const r = (x - 1) % 26
    s = String.fromCharCode(65 + r) + s
    x = (x - r - 1) / 26
  }
  return s
}

/** Привести любую запись ячейки к общему виду. */
function toCell(c: CellIn): Cell {
  if (c === null || c === undefined) return { v: null }
  if (typeof c === 'object') return c
  return { v: c }
}

function cellXml(ref: string, raw: CellIn): string {
  const c = toCell(raw)
  const idx = STYLE_INDEX[c.s || 'text']
  const attr = idx ? ` s="${idx}"` : ''
  if (typeof c.v === 'number' && Number.isFinite(c.v)) {
    return `<c r="${ref}"${attr}><v>${c.v}</v></c>`
  }
  const text = c.v === null || c.v === undefined ? '' : String(c.v)
  if (!text) return idx ? `<c r="${ref}"${attr}/>` : ''
  return `<c r="${ref}"${attr} t="inlineStr"><is><t xml:space="preserve">${esc(text)}</t></is></c>`
}

/** Закрепление областей. Без него на телефоне теряется, к какой строке цифра. */
function paneXml(rows: number, cols: number): string {
  if (!rows && !cols) return ''
  const top = colName(cols + 1) + String(rows + 1)
  const active = rows && cols ? 'bottomRight' : cols ? 'topRight' : 'bottomLeft'
  const x = cols ? ` xSplit="${cols}"` : ''
  const y = rows ? ` ySplit="${rows}"` : ''
  return (
    `<pane${x}${y} topLeftCell="${top}" activePane="${active}" state="frozen"/>` +
    `<selection pane="${active}" activeCell="${top}" sqref="${top}"/>`
  )
}

function sheetXml(sheet: Sheet): string {
  const cols = sheet.widths
    .map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`)
    .join('')
  const body = sheet.rows
    .map((row, r) => {
      const cells = row.map((c, i) => cellXml(colName(i + 1) + String(r + 1), c)).join('')
      return cells ? `<row r="${r + 1}">${cells}</row>` : `<row r="${r + 1}"/>`
    })
    .join('')
  const pane = paneXml(sheet.freezeRows || 0, sheet.freezeCols || 0)
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    `<sheetViews><sheetView workbookViewId="0">${pane}</sheetView></sheetViews>` +
    '<sheetFormatPr defaultRowHeight="15"/>' +
    (cols ? `<cols>${cols}</cols>` : '') +
    `<sheetData>${body}</sheetData>` +
    '</worksheet>'
  )
}

/** Имя вкладки по правилам Excel: без запрещённых знаков, не длиннее 31, не пустое. */
function sheetName(raw: string, taken: Set<string>): string {
  let name = raw.replace(/[[\]:*?/\\]/g, ' ').trim().slice(0, 31)
  if (!name) name = 'Лист'
  let out = name
  let n = 2
  while (taken.has(out.toLowerCase())) {
    const tail = ' ' + n
    out = name.slice(0, 31 - tail.length) + tail
    n++
  }
  taken.add(out.toLowerCase())
  return out
}

/* ─────────── zip ─────────── */

let CRC_TABLE: Uint32Array | null = null

/** Таблица CRC-32 (полином 0xEDB88320) — считается один раз за сеанс. */
function crcTable(): Uint32Array {
  if (CRC_TABLE) return CRC_TABLE
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  CRC_TABLE = t
  return t
}

function crc32(bytes: Uint8Array): number {
  const t = crcTable()
  let c = 0xffffffff
  for (let i = 0; i < bytes.length; i++) c = t[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

interface ZipFile {
  name: string
  text: string
}

/**
 * Сложить файлы в zip способом «store» (без сжатия).
 *
 * Формат придуман в восьмидесятых и с тех пор не менялся: у каждого файла есть
 * локальный заголовок, в конце — оглавление (central directory) и запись о нём.
 * Имена у нас только латинские, поэтому возни с кодировками имён нет.
 */
function zip(files: ZipFile[]): Uint8Array<ArrayBuffer> {
  const enc = new TextEncoder()
  const items = files.map((f) => {
    const data = enc.encode(f.text)
    return { name: enc.encode(f.name), data, crc: crc32(data) }
  })

  let size = 22
  for (const it of items) size += 30 + it.name.length + it.data.length + 46 + it.name.length
  const out = new Uint8Array(size)
  const dv = new DataView(out.buffer)

  const now = new Date()
  const time =
    (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2)
  const date =
    ((Math.max(1980, now.getFullYear()) - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()

  let at = 0
  const offsets: number[] = []
  for (const it of items) {
    offsets.push(at)
    dv.setUint32(at, 0x04034b50, true)
    dv.setUint16(at + 4, 20, true) /* версия распаковщика */
    dv.setUint16(at + 6, 0x0800, true) /* имена в UTF-8 */
    dv.setUint16(at + 8, 0, true) /* метод: store */
    dv.setUint16(at + 10, time, true)
    dv.setUint16(at + 12, date, true)
    dv.setUint32(at + 14, it.crc, true)
    dv.setUint32(at + 18, it.data.length, true)
    dv.setUint32(at + 22, it.data.length, true)
    dv.setUint16(at + 26, it.name.length, true)
    dv.setUint16(at + 28, 0, true)
    at += 30
    out.set(it.name, at)
    at += it.name.length
    out.set(it.data, at)
    at += it.data.length
  }

  const cdStart = at
  for (let i = 0; i < items.length; i++) {
    const it = items[i]
    dv.setUint32(at, 0x02014b50, true)
    dv.setUint16(at + 4, 20, true)
    dv.setUint16(at + 6, 20, true)
    dv.setUint16(at + 8, 0x0800, true)
    dv.setUint16(at + 10, 0, true)
    dv.setUint16(at + 12, time, true)
    dv.setUint16(at + 14, date, true)
    dv.setUint32(at + 16, it.crc, true)
    dv.setUint32(at + 20, it.data.length, true)
    dv.setUint32(at + 24, it.data.length, true)
    dv.setUint16(at + 28, it.name.length, true)
    dv.setUint16(at + 30, 0, true)
    dv.setUint16(at + 32, 0, true)
    dv.setUint16(at + 34, 0, true)
    dv.setUint16(at + 36, 0, true)
    dv.setUint32(at + 38, 0, true)
    dv.setUint32(at + 42, offsets[i], true)
    at += 46
    out.set(it.name, at)
    at += it.name.length
  }

  dv.setUint32(at, 0x06054b50, true)
  dv.setUint16(at + 4, 0, true)
  dv.setUint16(at + 6, 0, true)
  dv.setUint16(at + 8, items.length, true)
  dv.setUint16(at + 10, items.length, true)
  dv.setUint32(at + 12, at - cdStart, true) /* размер оглавления */
  dv.setUint32(at + 16, cdStart, true)
  dv.setUint16(at + 20, 0, true)

  return out
}

/* ─────────── сборка книги ─────────── */

/** Собрать книгу Excel. Возвращает байты файла — их остаётся отдать на скачивание. */
export function buildXlsx(sheets: Sheet[]): Uint8Array<ArrayBuffer> {
  const taken = new Set<string>()
  const named = sheets.map((s) => ({ ...s, name: sheetName(s.name, taken) }))

  const files: ZipFile[] = []

  files.push({
    name: '[Content_Types].xml',
    text:
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      named
        .map(
          (_s, i) =>
            `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
        )
        .join('') +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      '</Types>',
  })

  files.push({
    name: '_rels/.rels',
    text:
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
      '</Relationships>',
  })

  files.push({
    name: 'xl/workbook.xml',
    text:
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"' +
      ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      '<sheets>' +
      named
        .map(
          (s, i) => `<sheet name="${esc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`,
        )
        .join('') +
      '</sheets>' +
      '</workbook>',
  })

  files.push({
    name: 'xl/_rels/workbook.xml.rels',
    text:
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      named
        .map(
          (_s, i) =>
            `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
        )
        .join('') +
      `<Relationship Id="rId${named.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
      '</Relationships>',
  })

  files.push({ name: 'xl/styles.xml', text: STYLES_XML })

  named.forEach((s, i) => {
    files.push({ name: `xl/worksheets/sheet${i + 1}.xml`, text: sheetXml(s) })
  })

  return zip(files)
}
