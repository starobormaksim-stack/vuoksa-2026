/**
 * Картинки листа — файлами в хранилище, в документе только ссылка.
 *
 * Зачем. Обложка и лица лежали в документе строками base64 — 1 МБ из 1,1, и
 * каждое настоящее изменение листа стоило мегабайта всем четверым (урок У-171).
 * Теперь кадрированный снимок уезжает на сервер (`rpc/img_put`), тот кладёт его
 * файлом в хранилище и возвращает адрес. Форма хранения в документе не меняется:
 * поле как было строкой, так и осталось (постулат 4) — только вместо
 * `data:image/…;base64,…` в нём теперь `https://…`.
 *
 * ⛔ Хранилище отказало — снимок кладётся в документ base64, как раньше, и об
 * этом сказано словами (постулат 5). Потерять фотографию хуже, чем потолстеть
 * на мегабайт; офлайн-копия так и живёт — у неё сети нет по определению.
 */

import { toast } from 'sonner'
import { readKey } from './perm.ts'
import { sbJson, TRIP_ID } from './supabase.ts'

/** Отправить снимок в хранилище. Возвращает адрес файла; не вышло — бросает. */
export async function uploadImage(dataUrl: string): Promise<string> {
  const rows = await sbJson<{ url?: string }[]>('rpc/img_put', {
    method: 'POST',
    body: { p_trip: TRIP_ID, p_key: readKey(null), p_data: dataUrl },
  })
  const url = Array.isArray(rows) && rows[0] && rows[0].url
  if (!url || !/^https:\/\//.test(url)) throw new Error('хранилище не вернуло адрес')
  return url
}

/**
 * Что класть в документ вместо снимка: адрес из хранилища, а при его отказе —
 * сам снимок строкой. Лист фотографию не теряет ни при каком исходе.
 */
export async function photoValue(dataUrl: string): Promise<string> {
  try {
    return await uploadImage(dataUrl)
  } catch {
    toast('Хранилище не ответило — снимок сохранён прямо в листе')
    return dataUrl
  }
}
