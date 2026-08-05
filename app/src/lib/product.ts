/**
 * Снятие карточки товара со страницы магазина — сторона приложения.
 *
 * Слово заказчика 05.08.2026: «я туда либо вписываю название товара, либо вставляю
 * ссылку. Она автоматически подтягивает туда название товара и фотографию.
 * Стоимость фиксируется в плановую, потому что фактическая всё равно может
 * отличаться от той, которая там указана».
 *
 * Читает страницу не браузер, а посредник на сервере: чужую страницу браузеру
 * читать запрещено (CORS). Посредник — `supabase/functions/product/index.ts`,
 * и он ничего не знает ни про документ, ни про права: спросили адрес — ответил
 * названием, фотографией и ценой.
 *
 * ⛔ Три правила, на которых всё держится, живут ЗДЕСЬ:
 *   1. цена ложится ТОЛЬКО в «Цена, план» (`Buy.pr`); «Цена, факт» (`Buy.prf`)
 *      не трогается ничем, кроме рук человека, — на ней стоят контрольные суммы;
 *   2. цену, вписанную человеком, автоматика не перетирает никогда;
 *   3. не прочиталось — ссылка всё равно остаётся, а человек читает СЛОВАМИ,
 *      почему (постулат 5). Позиция при этом ничего не теряет.
 *
 * Снимаем один раз — в минуту вставки ссылки, и потом по кнопке «Проверить цену».
 * Фоном не обновляем: бюджет менялся бы сам собой, а контрольные цифры перестали
 * бы что-либо значить.
 */

import { SB } from './supabase'
import { siteName } from './producturl'

/** Что посредник вернул со страницы. */
export interface ProductCard {
  title: string
  img: string
  price: number
  currency: string
  site: string
}

/** Состояние снятия у одной позиции. Живёт только в памяти вкладки. */
export interface GrabState {
  /** идёт запрос */
  busy: boolean
  /** почему не вышло — человеческими словами; пусто, если всё хорошо */
  why: string
}

type Listener = (id: string, s: GrabState) => void

const listeners = new Set<Listener>()
const states = new Map<string, GrabState>()

/**
 * Состояние держим не в документе, а рядом с ним, и на то есть причина:
 * «магазин не отдал карточку» — это про сегодняшнюю попытку, а не про поездку.
 * Попади оно в документ — уехало бы всей команде и осталось бы там навсегда.
 */
export function onGrab(l: Listener): () => void {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

export function grabState(id: string): GrabState | null {
  return states.get(id) ?? null
}

function setState(id: string, s: GrabState | null): void {
  if (s) states.set(id, s)
  else states.delete(id)
  const out = s ?? { busy: false, why: '' }
  listeners.forEach((l) => l(id, out))
}

/** Забыть отказ: человек убрал ссылку или вставил другую. */
export function clearGrab(id: string): void {
  setState(id, null)
}

/** Позиция «Сборов» или «Закупки» в той части, что касается ссылки на товар. */
export interface Linked {
  n: string
  url?: string
  img?: string
  pat?: number
  /** «Цена, план» — есть только у закупки; у сборов цены нет вовсе */
  pr?: number
}

/**
 * Положить снятое в позицию.
 *
 * Название заменяем, только если своего у позиции нет: своим считается всё, кроме
 * пустого и имени сайта, которое подставилось при вставке адреса. Человек вставлял
 * ссылку К позиции, а не ВМЕСТО неё, и «5 л воды» затирать нельзя.
 *
 * Цена — только в план и только в пустое место. Дважды проверенное правило:
 * заказчик сказал «стоимость фиксируется в плановую», а контрольные суммы
 * держатся на факте.
 */
export function applyCard(item: Linked, card: ProductCard): void {
  const own = item.n.trim()
  const auto = !own || (item.url ? own === siteName(item.url) : false)
  if (card.title && auto) item.n = card.title
  if (card.img) item.img = card.img
  if (card.price > 0 && 'pr' in item && !item.pr) item.pr = card.price
  item.pat = Date.now()
}

/** Адрес посредника. Отдельной функцией — так его видно в одном месте. */
function endpoint(): string {
  return SB.url + '/functions/v1/product'
}

/** Ответ посредника, как он приходит по сети. */
interface Reply {
  ok?: boolean
  why?: string
  site?: string
  title?: string
  img?: string
  price?: number
  currency?: string
}

/**
 * Спросить у посредника карточку и, если он ответил, положить её в позицию.
 *
 * `apply` — вызывающий сам решает, куда писать: у «Сборов» цены нет, у «Закупки»
 * есть, и знание об этом остаётся в разделе. Отказ не бросается исключением:
 * он оседает в состоянии позиции и показывается строкой рядом со ссылкой.
 */
export async function grabProduct(
  id: string,
  url: string,
  apply: (card: ProductCard) => void,
): Promise<void> {
  setState(id, { busy: true, why: '' })
  let r: Response
  try {
    r = await fetch(endpoint(), {
      method: 'POST',
      headers: {
        apikey: SB.key,
        Authorization: 'Bearer ' + SB.key,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url }),
    })
  } catch {
    /* Сюда приходят ДВА разных случая, и различить их браузер не даёт: сети нет
       либо посредник ещё не выложен (тогда отказ приходит без заголовков CORS,
       и браузер его просто отбрасывает). Поэтому формулировка верна для обоих. */
    setState(id, {
      busy: false,
      why: 'Сервер не ответил про карточку — название и цену впишите сами',
    })
    return
  }

  if (r.status === 404) {
    /* Переходный период: приложение выложено, а функция в Supabase ещё нет.
       Ровно так же ведут себя `trip_write` и `trip_read` (см. lib/supabase.ts). */
    setState(id, {
      busy: false,
      why: 'Чтение карточек товара пока не включено — название и цену впишите сами',
    })
    return
  }

  let body: Reply
  try {
    body = (await r.json()) as Reply
  } catch {
    setState(id, { busy: false, why: 'Сервер ответил непонятно — название и цену впишите сами' })
    return
  }

  if (!r.ok || !body.ok) {
    setState(id, {
      busy: false,
      why: body.why || `${siteName(url) || 'Сайт'} не отдал карточку — название и цену впишите сами`,
    })
    return
  }

  apply({
    title: body.title || '',
    img: body.img || '',
    price: typeof body.price === 'number' ? body.price : 0,
    currency: body.currency || '',
    site: body.site || siteName(url),
  })
  /* Цену со страницы могли не найти вовсе — тогда сказать об этом честно, хотя
     название и фотография уже подставлены: человек ждал именно цену. */
  setState(
    id,
    body.price
      ? { busy: false, why: '' }
      : { busy: false, why: `${body.site || siteName(url)} не показал цену — впишите её сами` },
  )
}
