/**
 * Офлайн-копия одним файлом.
 *
 * Как это работает словами: рядом с сайтом лежит собранный самодостаточный HTML
 * (весь код, шрифты и значок внутри, ни одной внешней загрузки). Владелец жмёт
 * «Скачать офлайн-копию» — мы забираем этот файл, вшиваем в него ТЕКУЩИЙ документ
 * отдельной строкой и отдаём на скачивание. Получается снимок листа на сегодня,
 * который открывается двойным щелчком без интернета и без сервера.
 *
 * Данные вшиваются в base64: в такой строке не бывает ни «меньше», ни разделителей
 * строк Unicode, поэтому экранировать внутри script нечего и сломать разметку
 * данными невозможно.
 *
 * Обратная сторона — store.ts: при старте он смотрит window.__PINE_DOC__ и,
 * если там что-то есть, берёт документ оттуда.
 */

import { toast } from 'sonner'
import type { State } from './types.ts'

/** Имя файла офлайн-сборки рядом с index.html. */
const OFFLINE_FILE = 'Вуокса-2026.html'

/** Документ в base64 (utf-8). Без spread: документ бывает под сотню килобайт. */
function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + 0x8000)))
  }
  return btoa(bin)
}

/** Скачать офлайн-копию с текущими данными. Возвращает true, если получилось. */
export async function saveOfflineCopy(S: State): Promise<boolean> {
  try {
    const res = await fetch('./' + encodeURIComponent(OFFLINE_FILE), { cache: 'no-store' })
    if (!res.ok) throw new Error(String(res.status))
    const html = await res.text()

    const b64 = toBase64(JSON.stringify(S))
    const inject =
      '<script>window.__PINE_DOC__=JSON.parse(new TextDecoder().decode(' +
      'Uint8Array.from(atob("' +
      b64 +
      '"),function(c){return c.charCodeAt(0)})))</' +
      'script>'
    const out = html.includes('</head>')
      ? html.replace('</head>', inject + '</head>')
      : inject + html

    const url = URL.createObjectURL(new Blob([out], { type: 'text/html;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = OFFLINE_FILE
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 4000)
    toast('Копия скачана. Откроется без интернета')
    return true
  } catch {
    toast('Копию сейчас не забрать — нужен интернет и опубликованная версия')
    return false
  }
}
