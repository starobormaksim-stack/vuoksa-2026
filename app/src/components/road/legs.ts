/**
 * «Посчитать по карте» — одно действие на весь раздел «Дорога».
 *
 * Спрашивает у OSRM (lib/osrm.ts) километры между точками маршрута и кладёт их
 * в документ: каждому участку — своё расстояние (route[].leg, legSrc:'osrm'),
 * а сумму дорожных участков — в trip.dist.auto.
 *
 * ⚠️ trip.dist.src здесь НЕ трогается. Пробег в расчёте переключается на карту
 * только явным действием человека — иначе поездка молча схлопнулась бы
 * с 330 км до тех километров, которые успели посчитаться.
 *
 * Живёт отдельным файлом, потому что зовут его из двух мест: карточки «Исходные
 * данные» в разделе и карточки одной точки маршрута.
 */

import { roadLegs } from '@/lib/osrm'
import { readTrip, touch, update } from '@/store'

/** Чем кончился расчёт. `why` — почему не вышло, человеческими словами наружу. */
export type LegsResult =
  | { ok: true; legs: number; km: number }
  /** 'few' — на карте меньше двух точек; 'net' — маршрутизатор не ответил */
  | { ok: false; why: 'few' | 'net' }

export async function calcLegsByMap(): Promise<LegsResult> {
  const { S } = readTrip()
  const placed = S.route.filter((p) => typeof p.lat === 'number' && typeof p.lon === 'number')
  if (placed.length < 2) return { ok: false, why: 'few' }

  const legs = await roadLegs(S.route)
  if (legs.length === 0) return { ok: false, why: 'net' }

  /* В пробег авто идут только участки «по дороге»: переправа на остров едет
     на лодке, и её километры машинам приписывать нельзя (та же логика, что
     в lib/calc.ts, где бензин авто считается от trip.dist). */
  const km = legs.reduce((sum, l) => {
    const p = S.route.find((x) => x.i === l.i)
    return p && p.mode !== 'road' ? sum : sum + l.km
  }, 0)

  update((s) => {
    for (const l of legs) {
      const p = s.route.find((x) => x.i === l.i)
      if (p) {
        p.leg = l.km
        p.legSrc = 'osrm'
        touch(p)
      }
    }
    s.trip.dist.auto = km
  })

  return { ok: true, legs: legs.length, km }
}
