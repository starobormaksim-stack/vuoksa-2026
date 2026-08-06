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
 * Подменить манифест на личный.
 *
 * Зовётся, когда человек опознан. Повторный вызов с той же ссылкой ничего
 * не делает: перевешивать `<link>` на каждый рендер незачем.
 */
export async function personalizeManifest(me: Person | null): Promise<void> {
  if (typeof document === 'undefined' || typeof URL === 'undefined') return
  const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]')
  if (!link) return
  if (!me) return

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
