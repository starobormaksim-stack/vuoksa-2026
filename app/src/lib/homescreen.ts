/**
 * Ярлык на домашнем экране открывает СВОЙ лист, а не пустой сервис.
 *
 * ─── Что было ───
 * Заказчик 06.08.2026: «добавил на „Домой“ на iPhone… я опять должен заходить
 * заново. Такого не должно происходить. Я зашёл — значит я зашёл». Причина:
 * в `manifest.webmanifest` стоит `start_url: "./"` — общий адрес без личной
 * ссылки. Телефон запоминает ярлык именно по нему, а у приложения с домашнего
 * экрана СВОЁ хранилище, отдельное от браузера: запомненного ключа там нет,
 * и человек упирается в «Этот лист закрыт».
 *
 * ─── Что делаем ───
 * Пока человек смотрит лист, подменяем манифест на личный: тот же файл, но
 * `start_url` — его собственная ссылка (`?u=…&k=…&trip=…`). Телефон, добавляя
 * ярлык, берёт адрес уже из него.
 *
 * ⛔ Личная ссылка НЕ уезжает в файл сайта: манифест собирается в браузере
 * и живёт как `blob:` только в этой вкладке (У-65 — ключи в публичной сборке
 * недопустимы). Статический `manifest.webmanifest` остаётся общим и без ключей.
 *
 * ⚠️ Если браузер личный манифест не примет, хуже не станет: ярлык откроется
 * по общему адресу, и человек один раз вставит свою ссылку на экране «Этот лист
 * закрыт» — дальше ключ запомнится уже в хранилище приложения.
 */

import { linkFor } from './perm.ts'
import type { Person } from './types.ts'

/** Что кладём в личный манифест сверх общего. Остальное берём из файла. */
interface Personal {
  start_url: string
  id: string
}

let текущий = ''
let прежнийBlob = ''

/** Личная ссылка этого человека на этом сайте — с ключом и поездкой. */
function myLink(me: Person): string {
  return linkFor(me)
}

/**
 * Держать в адресной строке личную ссылку.
 *
 * ⛔ Без этого ярлык на iPhone бесполезен. Safari добавляет на домашний экран
 * ТОТ АДРЕС, который сейчас в строке (личный манифест он может и не принять —
 * это `blob:`), а у владельца, вошедшего по письму, в адресе ни имени, ни ключа:
 * код из письма стирается сразу после обмена. Ярлык запоминался «голым», в новом
 * хранилище приложения не было ни ключа, ни сеанса почты — и человек снова
 * упирался во вход. Заказчик 06.08.2026: «я только что зарегистрировался
 * в Safari, сделал иконку домой, захожу — и у меня опять просят вписать. Я уже
 * должен быть зарегистрирован» (У-105).
 *
 * Страницу не перезагружаем: `replaceState` меняет только строку адреса.
 * Историю не засоряем — заменяем текущую запись, а не добавляем новую.
 *
 * ⚠️ Список поездок (`?trips=1`) не трогаем: его метку снимает `closeTripsList()`,
 * и подмена адреса из-под неё вернула бы человека в список после обновления.
 */
function keepPersonalUrl(me: Person): void {
  if (typeof location === 'undefined' || typeof history === 'undefined') return
  if (!me.key) return
  const q = new URLSearchParams(location.search)
  if (q.has('trips')) return
  if (q.get('k') === me.key && q.has('u')) return
  /* Прочие метки адреса остаются как были — в том числе `trip` и `sandbox`:
     потерять `sandbox=1` значит увести проверку в боевую строку (У-01). */
  q.set('u', me.slug || me.id)
  q.set('k', me.key)
  const s = q.toString()
  history.replaceState(null, '', location.pathname + (s ? '?' + s : '') + location.hash)
}

/**
 * Подменить манифест на личный.
 *
 * Зовётся, когда человек опознан. Повторный вызов с той же ссылкой ничего
 * не делает: перевешивать `<link>` на каждый рендер незачем.
 */
export async function personalizeManifest(me: Person | null): Promise<void> {
  if (typeof document === 'undefined' || typeof URL === 'undefined') return
  if (!me) return
  /* Первым делом — адрес: на него смотрит Safari, когда кладёт значок на экран. */
  keepPersonalUrl(me)

  const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]')
  if (!link) return

  const start = myLink(me)
  if (!start || start === текущий) return

  /* Общий манифест читаем с сайта — так личный отличается от него ровно
     одним полем и не расходится с ним при правках. */
  let base: Record<string, unknown>
  try {
    const src = link.dataset.src || link.getAttribute('href') || ''
    if (!src || src.startsWith('blob:')) return
    const res = await fetch(src, { cache: 'no-store' })
    if (!res.ok) return
    base = (await res.json()) as Record<string, unknown>
    link.dataset.src = src
  } catch {
    /* манифеста нет или он не читается — оставляем как есть */
    return
  }

  const personal: Personal = {
    start_url: start,
    /* `id` держит ярлык привязанным к одному приложению, даже если ссылка
       поменяется (смена ключа в «Команде»): иначе телефон завёл бы второй
       значок рядом со старым. */
    id: new URL('./', location.href).href,
  }
  const doc = { ...base, ...personal, scope: new URL('./', location.href).href }

  try {
    const blob = new Blob([JSON.stringify(doc)], { type: 'application/manifest+json' })
    const url = URL.createObjectURL(blob)
    link.setAttribute('href', url)
    if (прежнийBlob) URL.revokeObjectURL(прежнийBlob)
    прежнийBlob = url
    текущий = start
  } catch {
    /* браузер не дал собрать файл — работаем с общим манифестом */
  }
}
