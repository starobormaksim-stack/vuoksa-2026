import type { CanRow, FuelPrice, Notes, Rent, Transport } from '@/lib/types'
import { touch, update } from '@/store'

/**
 * Правки документа в разделе «Дорога» — одни и те же руки у обоих видов.
 *
 * Вынесено из `RoadCalc.tsx`, когда у расчёта появилась вторая форма: матрица
 * на широком экране и лента на телефоне (заказчик 06.08.2026 — «всё, что связано
 * с настройками по конкретным позициям, выпадающим списком»). Две копии этих
 * четырёх функций разошлись бы на первой же правке, а править они обязаны
 * одинаково — данные-то одни.
 *
 * ⛔ Формы хранения здесь нет вовсе: функции только находят строку по её id
 * и отдают её вызывающему. Ни одного поля они не заводят и не стирают.
 */

/** Правка строки техники по её id. */
export function patchTransport(id: string, f: (t: Transport) => void): void {
  update((s) => {
    const t = s.transport.find((x) => x.i === id)
    if (t) {
      f(t)
      touch(t)
    }
  })
}

/** Правка строки аренды по её id. */
export function patchRent(id: string, f: (r: Rent) => void): void {
  update((s) => {
    const r = s.rent.find((x) => x.i === id)
    if (r) {
      f(r)
      touch(r)
    }
  })
}

/**
 * Правка строки «Топлива в канистрах» по виду топлива.
 *
 * Строки блока привязаны к топливу, а не к своему id, и в документе их может
 * ещё не быть вовсе: блок показывает и то топливо, под которое канистры только
 * посчитаны. Поэтому строка при первой же правке заводится — ровно так, как это
 * делала правка названия до появления своих полей.
 */
export function patchCanRow(fuelId: string, f: (r: CanRow) => void): void {
  update((s) => {
    let r = s.canRows.find((x) => x.fuel === fuelId)
    if (!r) {
      r = {
        i: 'can_' + fuelId,
        fuel: fuelId,
        t: '',
        c: '',
        ord: (s.canRows.length + 1) * 10,
        ua: Date.now(),
      }
      s.canRows.push(r)
    }
    f(r)
    touch(r)
  })
}

/** Правка строки справочника цен топлива по её id. */
export function patchFuel(id: string, f: (x: FuelPrice) => void): void {
  update((s) => {
    const fu = s.fuelPrices.find((x) => x.i === id)
    if (fu) {
      f(fu)
      touch(fu)
    }
  })
}

/** Подпись числа из документа: заводим только своё поле, соседние не трогаем. */
export function noteBag(bag: Notes | undefined, key: string): Notes {
  const nt = bag ?? {}
  if (!nt[key]) nt[key] = { t: '' }
  return nt
}
