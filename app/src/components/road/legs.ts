/**
 * «Посчитать по карте» — одно действие на весь раздел «Дорога».
 *
 * ─── Что оно считает ───
 * Спрашивает километры между точками маршрута и кладёт их в документ:
 * каждому участку — своё расстояние (`route[].leg`), каждой единице техники —
 * её собственный пробег (`transport[].kmAuto`), а общей нитке (точки, за
 * которыми техники нет) — прежний `trip.dist.auto`.
 *
 * ─── ⛔ Считается ПО НИТКАМ, а не одной вереницей ───
 * Заказчик 06.08.2026: «разные участники, которые на автотранспорте едут…
 * у них тоже, как с первой по последней, разные точки должны быть. Если лодка
 * будет одна, то у неё своя точка старта и точка финиша. То же самое касается
 * всех единиц транспорта».
 *
 * До этой правки все точки с координатами уходили маршрутизатору ОДНИМ списком,
 * и в боевом документе это было видно насквозь: 141 км, склеенные из точек
 * Honda, Aveo и лодки вперемешку, шли в расход обеим машинам сразу. Прыжок
 * с парковки на воду и обратно считался пробегом автомобиля.
 *
 * Теперь каждая нитка (`map/marks.ts`, `threads()`) спрашивается отдельно,
 * и «расстояние от прошлой точки» — это расстояние от прошлой точки СВОЕЙ
 * нитки, а не от чужой машины, случайно стоящей выше в документе.
 *
 * ─── Чего маршрутизатор не умеет ───
 * У публичного OSRM живёт только профиль `driving`. Нитки по воде и пешком
 * считаются по прямой (`legSrc:'line'`) — ровно как разрешил заказчик:
 * «Лодочный мотор по воде — если невозможно — просто прямая, и километраж
 * показывается». То же самое уже делает линия на карте (`map/shapes.ts`),
 * и число обязано совпадать с картинкой.
 *
 * ⚠️ Ни `trip.dist.src`, ни `transport[].kmSrc` здесь НЕ трогаются. Пробег
 * переключается на карту только явным действием человека — иначе поездка молча
 * схлопнулась бы с 330 км до тех километров, которые успели посчитаться,
 * а вписанная руками цифра пропала бы при первом же нажатии (заказчик прямо
 * просил обратного: «точки никак не повлияют — как они были, так они будут»).
 *
 * Живёт отдельным файлом, потому что зовут его из двух мест: карточки «Исходные
 * данные» в разделе и карточки одной точки маршрута.
 */

import { threads } from '@/components/map/marks'
import { roadLegs, type LegKm } from '@/lib/osrm'
import type { RoutePoint } from '@/lib/types'
import { readTrip, touch, update } from '@/store'

/** Пробег одной единицы техники по её нитке. */
export interface OwnKm {
  /** id единицы техники из S.transport */
  i: string
  n: string
  km: number
  /** линия шла по дорогам или по прямой (вода, пешком) */
  straight: boolean
}

/** Чем кончился расчёт. `why` — почему не вышло, человеческими словами наружу. */
export type LegsResult =
  | {
      ok: true
      legs: number
      /** километры общей нитки — они и уходят в trip.dist.auto */
      km: number
      /** свой пробег каждой техники, у которой нитка посчиталась */
      own: OwnKm[]
    }
  /** 'few' — на карте меньше двух точек; 'net' — маршрутизатор не ответил */
  | { ok: false; why: 'few' | 'net' }

/** Есть ли у точки координаты. */
function placed(p: RoutePoint): boolean {
  return typeof p.lat === 'number' && typeof p.lon === 'number'
}

/** Радиус Земли, км — тот же, которым меряют расстояния все карты. */
const R_KM = 6371

/**
 * Расстояние по прямой между двумя точками, км (формула гаверсинуса).
 *
 * Нужна там, где дорог нет вовсе: по воде и пешком. Это не «запасной вариант
 * на случай отказа сети», а честное свойство маршрута — прямая по воде и есть
 * путь лодки.
 */
function lineKm(a: RoutePoint, b: RoutePoint): number {
  const rad = Math.PI / 180
  const dLat = ((b.lat as number) - (a.lat as number)) * rad
  const dLon = ((b.lon as number) - (a.lon as number)) * rad
  const la1 = (a.lat as number) * rad
  const la2 = (b.lat as number) * rad
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2
  return 2 * R_KM * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** Участки одной нитки по прямой — в том же виде, в каком их отдаёт OSRM. */
function straightLegs(points: RoutePoint[]): LegKm[] {
  const out: LegKm[] = []
  for (let k = 1; k < points.length; k++) {
    out.push({ i: points[k].i, km: Math.round(lineKm(points[k - 1], points[k])) })
  }
  return out
}

/** Как звать расчёт. */
export interface LegsOpts {
  /**
   * Сразу принять посчитанное как пробег ветки (`kmSrc = 'auto'`).
   *
   * Заказчик 06.08.2026, поздний вечер: «при добавлении маршрута для
   * определённого вида транспорта — авто или водного, неважно — он сразу же
   * берёт расчёты по точкам, ведёт авторасчёты по точкам в логистике». То есть
   * расставил точки — и километры этой ветки уже в расчёте, без второго
   * нажатия где-то в другом разделе.
   *
   * ⚠️ Ручную цифру это НЕ трогает: `kmSrc === 'manual'` значит, что человек
   * вписал километры сам, и карта их не отменяет. Общее число поездки
   * (`trip.dist.src`) тоже не переключается — его источник выбирают руками.
   */
  adopt?: boolean
}

export async function calcLegsByMap(opts: LegsOpts = {}): Promise<LegsResult> {
  const { S } = readTrip()

  /* Нитки те же самые, что рисует карта: одна на каждую единицу техники плюс
     общая. Число и картинка обязаны быть об одном и том же. */
  const list = threads(S.route, S.transport)
    .map((t) => ({ ...t, points: t.points.filter(placed) }))
    .filter((t) => t.points.length > 1)

  if (list.length === 0) return { ok: false, why: 'few' }

  /* По воде и пешком дорог нет — там прямая, и спрашивать некого. Всё
     остальное идёт маршрутизатору, каждая нитка своим запросом. */
  const got = await Promise.all(
    list.map(async (t) => {
      const straight = t.leg === 'water' || t.leg === 'walk'
      const legs = straight
        ? straightLegs(t.points)
        : await roadLegs(t.points.map((p) => ({ i: p.i, lat: p.lat, lon: p.lon })))
      return { tr: t.tr, straight, legs }
    }),
  )

  /* Ни одна нитка не ответила — это отказ сети, а не «нечего считать».
     Прямые линии считаются на месте и не отказывают никогда. */
  if (got.every((g) => g.legs.length === 0)) return { ok: false, why: 'net' }

  const common = got.find((g) => !g.tr)
  const commonKm = common ? common.legs.reduce((sum, l) => sum + l.km, 0) : 0
  const legsCount = got.reduce((sum, g) => sum + g.legs.length, 0)

  const own: OwnKm[] = []
  for (const g of got) {
    if (!g.tr || g.legs.length === 0) continue
    const t = S.transport.find((x) => x.i === g.tr)
    if (!t) continue
    own.push({
      i: t.i,
      n: t.calcT || t.n || 'Без названия',
      km: g.legs.reduce((sum, l) => sum + l.km, 0),
      straight: g.straight,
    })
  }

  /* ⚠️ Общее число трогаем, только если общая нитка правда посчиталась.
     Иначе (а в боевом документе ровно так: все шесть общих точек без
     координат) прежние 141 км молча обнулились бы — вместе с деньгами
     у всей техники, которая своей цифры ещё не получила. */
  const takeCommon = !!common && common.legs.length > 0

  /**
   * Изменилось ли хоть что-нибудь.
   *
   * ⚠️ Без этой проверки авторасчёт (`adopt`) писал бы в документ при КАЖДОМ
   * открытии листа: те же самые числа, но с новой меткой времени и новым
   * автором — и четверо участников всю дорогу видели бы «правил Костя»,
   * хотя Костя ничего не трогал. Пустая запись хуже отсутствия записи.
   */
  const same =
    got.every((g) =>
      g.legs.every((l) => {
        const p = S.route.find((x) => x.i === l.i)
        return p && p.leg === l.km && p.legSrc === (g.straight ? 'line' : 'osrm')
      }),
    ) &&
    own.every((o) => {
      const t = S.transport.find((x) => x.i === o.i)
      if (!t || t.kmAuto !== o.km) return false
      return !opts.adopt || t.kmSrc === 'manual' || t.kmSrc === 'auto'
    }) &&
    (!takeCommon || S.trip.dist.auto === commonKm)

  if (!same) {
    update((s) => {
      for (const g of got) {
        for (const l of g.legs) {
          const p = s.route.find((x) => x.i === l.i)
          if (p) {
            p.leg = l.km
            p.legSrc = g.straight ? 'line' : 'osrm'
            touch(p)
          }
        }
      }
      for (const o of own) {
        const t = s.transport.find((x) => x.i === o.i)
        if (t) {
          t.kmAuto = o.km
          /* Ручную цифру карта не отменяет — её вписал человек. */
          if (opts.adopt && t.kmSrc !== 'manual') t.kmSrc = 'auto'
          touch(t)
        }
      }
      if (takeCommon) s.trip.dist.auto = commonKm
    })
  }

  return { ok: true, legs: legsCount, km: commonKm, own }
}

/**
 * Что сказать человеку после расчёта — одними словами на оба места вызова.
 *
 * Молчаливых отказов не бывает (постулат 5): если у нитки нашлась одна точка,
 * если по воде считалось прямой, если общего маршрута нет вовсе — это должно
 * быть прочитано словами, а не угадано по числу, которое не изменилось.
 */
export function legsWords(r: Extract<LegsResult, { ok: true }>): string {
  const parts: string[] = []
  for (const o of r.own) {
    parts.push(`${o.n} — ${Math.round(o.km)} км${o.straight ? ' по прямой' : ''}`)
  }
  if (r.km > 0) parts.push(`общий маршрут — ${Math.round(r.km)} км`)
  if (parts.length === 0) return 'Считать нечего: у точек с координатами нет пары в своей нитке'
  return `Посчитали по карте: ${parts.join(' · ')}`
}
