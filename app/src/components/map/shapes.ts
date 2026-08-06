import { useEffect, useRef, useState } from 'react'
import { roadShape, type ShapePoint } from '@/lib/osrm'
import type { Thread } from './marks'

/**
 * Линии ниток по настоящим дорогам — в памяти вкладки, не в документе.
 *
 * ─── Зачем ───
 * Заказчик 06.08.2026: «Когда я точки обозначаю на карте, через автомобильные
 * точки, Google-карты простраивали реальный маршрут». До этой правки нитка шла
 * прямой из точки в точку — через лес и залив, — хотя километры уже считались
 * по дорогам («Посчитать по карте», `lib/osrm.ts`). Картинка врала числу.
 *
 * ─── Почему в памяти ───
 * Ломаная одной нитки — это тысячи координат. Положить её в документ значило бы
 * навсегда поменять форму хранения ради того, что заново спрашивается за секунду
 * (постулат 4: форму хранения не менять — слияние отдаёт поля целиком). Поэтому
 * линии живут здесь, в состоянии компонента, и умирают вместе с вкладкой.
 *
 * ─── Что делать, когда не ответили ───
 * Ничего не прятать. Нет сети, отказал маршрутизатор, точка посреди леса без
 * дорог — нитка остаётся прямой, а человек читает словами, почему она прямая
 * (постулат 5, У-32: молчаливого отката не бывает). Слова собирает `note`.
 *
 * ─── Чего маршрутизатор не умеет ───
 * У публичного OSRM живёт только профиль `driving`. Значит по воде и пешком
 * линия прямая всегда, и это не поломка, а свойство: заказчик сам сказал
 * «Лодочный мотор по воде — не знаю, возможно или нет; если невозможно —
 * просто прямая, и километраж показывается».
 */

/** Готовые линии: ключ нитки → ломаная по дорогам. Чего нет — рисуется прямой. */
export type RoadShapes = Map<string, ShapePoint[]>

/** Ключ нитки в справочнике линий: id техники, пусто — общая нитка. */
export function threadKey(t: Thread): string {
  return t.tr || ''
}

/** Идёт ли эта нитка по дорогам — то есть есть ли смысл спрашивать маршрутизатор. */
function byRoad(t: Thread): boolean {
  /* `null` — точки без своей техники. Их километры и раньше считались профилем
     `driving` (см. `roadLegs`), и линия обязана совпадать с числом. */
  return t.leg === null || t.leg === 'road'
}

/** Точка стоит на карте — без координат маршрутизатору её показать нечем. */
function placed(p: { lat?: number; lon?: number }): boolean {
  return typeof p.lat === 'number' && typeof p.lon === 'number'
}

/** Слепок нитки: пока он тот же, спрашивать заново нечего. */
function signature(list: Thread[]): string {
  return list
    .map((t) => `${threadKey(t)}~${t.leg ?? ''}~${t.points.map((p) => `${p.lat},${p.lon}`).join(';')}`)
    .join('|')
}

export interface RoadShapesState {
  shapes: RoadShapes
  /** словами: почему часть линий прямые. null — говорить не о чем */
  note: string | null
  /** линии сейчас спрашивают */
  busy: boolean
}

/**
 * Спросить у маршрутизатора линии всех ниток и держать их в памяти.
 *
 * Запрос уходит один раз на слепок: пока точки и техника не поменялись, ответ
 * берётся из состояния. Ушедшие запросы обрываются `AbortController` внутри
 * `roadShape`, а устаревший ответ отбрасывается по номеру захода — иначе
 * медленный ответ прошлого маршрута перерисовал бы нынешний.
 */
export function useRoadShapes(list: Thread[], enabled = true): RoadShapesState {
  const sig = signature(list)
  const [state, setState] = useState<RoadShapesState>({
    shapes: new Map(),
    note: null,
    busy: false,
  })
  /** номер захода: ответ старого заезда до состояния не доходит */
  const run = useRef(0)

  /* Нитки читаем из ref: зависимость — слепок, а сам массив собирается заново
     на каждой перерисовке и гонял бы запросы без конца. */
  const listRef = useRef(list)
  listRef.current = list

  useEffect(() => {
    const mine = ++run.current

    /* Сети нет — маршрутизатора не спрашиваем вовсе: он живёт в сети, и десять
       секунд ожидания кончились бы тем же. Слов здесь тоже не пишем: про
       отсутствие сети над картой уже стоит своя плашка, и повторять её мелким
       кеглем внизу значило бы сказать одно и то же дважды. */
    if (!enabled) {
      setState({ shapes: new Map(), note: null, busy: false })
      return
    }

    const roads = listRef.current.filter(
      (t) => byRoad(t) && t.points.filter(placed).length > 1,
    )
    /* Прямые по своей природе: по воде и пешком дорог нет вовсе. */
    const straight = listRef.current.some(
      (t) => !byRoad(t) && t.points.filter(placed).length > 1,
    )

    if (roads.length === 0) {
      setState({
        shapes: new Map(),
        note: straight ? WATER_NOTE : null,
        busy: false,
      })
      return
    }

    setState((s) => ({ ...s, busy: true }))

    Promise.all(
      roads.map((t) =>
        roadShape(t.points.map((p) => ({ i: p.i, lat: p.lat, lon: p.lon }))).then((line) => ({
          key: threadKey(t),
          line,
        })),
      ),
    ).then((got) => {
      if (mine !== run.current) return
      const shapes: RoadShapes = new Map()
      let failed = 0
      for (const g of got) {
        if (g.line) shapes.set(g.key, g.line)
        else failed++
      }
      setState({
        shapes,
        note: failed > 0 ? FAIL_NOTE : straight ? WATER_NOTE : null,
        busy: false,
      })
    })
  }, [sig, enabled])

  return state
}

/** Маршрутизатор молчит — линия прямая, и об этом надо сказать. */
const FAIL_NOTE =
  'Линию по дорогам сейчас не спросить — рисуем напрямую. Километры в расчёте от этого не меняются.'

/** По воде и пешком дорог нет — линия прямая всегда, и это не поломка. */
const WATER_NOTE = 'По воде и пешком линия прямая: дорог там нет.'
