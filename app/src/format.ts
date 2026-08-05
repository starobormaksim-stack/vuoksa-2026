/** Русская типографика: «ёлочки», длинное тире, неразрывные и узкие пробелы. */

export const NBSP = ' '
export const NNBSP = ' '
export const NDASH = '–'
export const MDASH = '—'
/** Разделитель частей подписи: «10 августа · день 1». */
export const MIDDOT = '·'

/**
 * Число по-русски: дробная часть через запятую, разряды — узкий неразрывный пробел.
 * fmtNum(34.7) → «34,7» · fmtNum(21385) → «21 385» · fmtNum(10.5, 1) → «10,5»
 */
export function fmtNum(n: number, maxFrac = 1): string {
  const neg = n < 0
  const abs = Math.abs(n)
  const r = Math.round(abs * 10 ** maxFrac) / 10 ** maxFrac
  const int = Math.floor(r)
  const frac = r - int
  let out = String(int).replace(/\B(?=(\d{3})+(?!\d))/g, NNBSP)
  if (frac > 0) out += ',' + String(Math.round(frac * 10 ** maxFrac)).padStart(maxFrac, '0').replace(/0+$/, '')
  return (neg ? '−' : '') + out
}

/** «34,7 л» — число и единица склеены неразрывным пробелом (правило типографики). */
export function withUnit(n: number, unit: string, maxFrac = 1): string {
  return `${fmtNum(n, maxFrac)}${NBSP}${unit}`
}

/** Родительный падеж месяцев для дат («10–14 августа»). */
const MONTHS_GEN = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
]

/** Русская плюрализация: plural(5, 'день', 'дня', 'дней') → 'дней'. */
export function plural(n: number, one: string, few: string, many: string): string {
  const abs = Math.abs(n) % 100
  const d = abs % 10
  if (abs > 10 && abs < 20) return many
  if (d > 1 && d < 5) return few
  if (d === 1) return one
  return many
}

/**
 * Имя в дательном падеже: «Костя» → «Косте», «Макс» → «Максу».
 *
 * Нужно ровно там, где сервис говорит «кто кому отдаёт»: «Макс отдаёт Костя»
 * по-русски не читается вовсе, а имена в документе лежат в именительном
 * (постулат 9 — ни одной небрежности в языке).
 *
 * Правила покрывают обычные русские имена. Всё, что под них не подходит,
 * возвращается КАК ЕСТЬ и `sure: false` — вызывающий обязан построить фразу
 * без падежа, а не подставить неверную форму. Выдумывать окончание чужому
 * слову нельзя: имя человека — это его имя, а не строка для склеивания.
 *
 * Отказываемся намеренно: латиница · двойные имена через дефис · ЗАГЛАВНЫМИ
 * (в таблице заказчика люди записаны «МИШКА» — «МИШКе» было бы издевательством) ·
 * мягкий знак на конце (по имени не отличить «Игорю» от «Любови») ·
 * несклоняемые окончания («Данко», «Тимоти»).
 * Беглые гласные общим правилом не берутся — они в списке `DATIVE_ODD`.
 */
const DATIVE_ODD: Record<string, string> = {
  /* Беглая гласная: по общему правилу вышло бы «Пётру», «Льву» — «Леву». */
  пётр: 'Петру',
  петр: 'Петру',
  лев: 'Льву',
  павел: 'Павлу',
}

export function dative(name: string): { text: string; sure: boolean } {
  const n = name.trim()
  /* Дефис пропускаем мимо правил: «Анна-Мария» склоняется обеими частями,
     а по общему правилу вышло бы «Анна-Марии» — половина имени в именительном. */
  if (!/^[А-ЯЁа-яё][а-яё]*$/.test(n)) return { text: n, sure: false }
  const low = n.toLowerCase()
  const odd = DATIVE_ODD[low]
  if (odd) return { text: odd, sure: true }
  /* Беглая гласная в уменьшительных на -ёк: «Санёк» → «Саньку», «Витёк» →
     «Витьку», «Игорёк» → «Игорьку». В этой позиции «ё» выпадает всегда, поэтому
     правило общее, а не список. Именно так зовут друг друга в компании, ради
     которой лист и делается. */
  if (low.length > 3 && low.endsWith('ёк')) return { text: n.slice(0, -2) + 'ьку', sure: true }
  /* «Мария» → «Марии», но «Илья» → «Илье»: на -ия окончание другое. */
  if (low.endsWith('ия')) return { text: n.slice(0, -1) + 'и', sure: true }
  if (low.endsWith('я') || low.endsWith('а')) return { text: n.slice(0, -1) + 'е', sure: true }
  if (low.endsWith('й')) return { text: n.slice(0, -1) + 'ю', sure: true }
  /* «Игорь» → «Игорю». Женские на мягкий знак («Любовь») склоняются иначе,
     но по имени их не отличить — такие отдаём без падежа, а не наугад. */
  if (low.endsWith('ь')) return { text: n, sure: false }
  /* Несклоняемые окончания: «Данко», «Тимоти». */
  if (/[оеуыиэю]$/.test(low)) return { text: n, sure: false }
  return { text: n + 'у', sure: true }
}

/** «14 августа 2026». */
export function fmtDate(d: Date): string {
  return `${d.getDate()}${NBSP}${MONTHS_GEN[d.getMonth()]}${NBSP}${d.getFullYear()}`
}

/**
 * Диапазон дат по-русски:
 *  тот же месяц   → «10–14 августа 2026»
 *  разные месяцы  → «28 июля — 2 августа 2026»
 *  разные годы    → «30 декабря 2026 — 2 января 2027»
 */
export function fmtRange(a: Date, b: Date): string {
  if (a.getFullYear() !== b.getFullYear()) return `${fmtDate(a)}${NBSP}${MDASH} ${fmtDate(b)}`
  if (a.getMonth() !== b.getMonth()) {
    return `${a.getDate()}${NBSP}${MONTHS_GEN[a.getMonth()]}${NBSP}${MDASH} ${fmtDate(b)}`
  }
  if (a.getDate() === b.getDate()) return fmtDate(a)
  return `${a.getDate()}${NDASH}${b.getDate()}${NBSP}${MONTHS_GEN[a.getMonth()]}${NBSP}${a.getFullYear()}`
}

/**
 * Название дня раскладки по датам поездки: «10 августа · день 1».
 *
 * Заказчик 05.08.2026, пункт 6 разбора: «если у тебя календарь здесь 10–14 августа
 * работает, соответственно везде, где условно эти даты начинают фигурировать, они
 * появляются при условии, что я их добавляю здесь, в этой обложке». Раскладка —
 * ровно то место, где даты «начинают фигурировать»: до этого их приходилось
 * вписывать в каждый день руками второй раз.
 *
 * `idx` — порядковый номер дня, считая с нуля.
 */
export function autoDayTitle(startIso: string, idx: number): string {
  const a = new Date(startIso)
  if (Number.isNaN(a.getTime())) return ''
  const d = new Date(a.getFullYear(), a.getMonth(), a.getDate() + idx)
  return `${d.getDate()}${NBSP}${MONTHS_GEN[d.getMonth()]}${NBSP}${MIDDOT}${NBSP}день${NBSP}${idx + 1}`
}

/**
 * Похоже ли название дня на выданное автоматом («10 августа · день 3»).
 *
 * Нужно, чтобы смена дат в обложке переписала унаследованные названия и НЕ тронула
 * то, что человек назвал сам («День рыбалки»). Пробелы принимаем любые: в боевом
 * документе стоят обычные, а автомат ставит неразрывные.
 */
export function isAutoDayTitle(t: string): boolean {
  const s = t.trim().replace(/[  ]/g, ' ')
  return new RegExp(`^\\d{1,2} (?:${MONTHS_GEN.join('|')})(?: · день \\d+)?$`, 'i').test(s)
}

/** Начало суток локального времени. */
export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

/** Целых суток от «сегодня» до даты (может быть отрицательным). */
export function daysUntil(iso: string): number {
  const target = startOfDay(new Date(iso)).getTime()
  const today = startOfDay(new Date()).getTime()
  return Math.round((target - today) / 86_400_000)
}

/**
 * Строка обратного отсчёта из trip.start/trip.end:
 * «До выезда 6 дней» · «Выезд сегодня» · «Поездка идёт» · «Поездка завершена».
 */
export function countdown(startIso: string, endIso: string): string {
  const days = daysUntil(startIso)
  if (days > 0) return `До${NBSP}выезда ${days}${NBSP}${plural(days, 'день', 'дня', 'дней')}`
  if (days === 0) return 'Выезд сегодня'
  const endDays = daysUntil(endIso)
  if (endDays >= 0) return 'Поездка идёт'
  return 'Поездка завершена'
}

/** «2026-08-10T07:30:00» + новая дата → тот же час-минута, новая дата. */
export function withDate(oldIso: string, date: Date, fallbackTime: string): string {
  const time = oldIso.match(/T(\d{2}:\d{2}(?::\d{2})?)/)?.[1] ?? fallbackTime
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}T${time}`
}
