import type { State } from '@/lib/types'
import type { Perms } from '@/lib/perm'
import { update } from '@/store'
import { calcAll, money, type CalcResult } from '@/lib/calc'
import { InlineText } from '@/components/flops'

/** Суммы-нули на случай сбоя расчётного ядра — плитки не должны ронять обложку. */
const ZERO: CalcResult = {
  km: 0, fuel: 0, rent: 0, transport: 0, buy: 0,
  personal: 0, total: 0, perPerson: 0, cans: [],
}

interface TileDef {
  key: 'transport' | 'buy' | 'total' | 'perPerson'
  /**
   * Место подписи в `S.tileLabels`. Это массив из первой версии с закреплённым
   * порядком: 0 — транспорт, 1 — продукты, 2 — бюджет, 3 — с каждого. Порядок
   * плиток на экране другой (его назвал заказчик), поэтому место хранения
   * задаётся отдельно. ⚠️ Форму массива не менять: слияние отдаёт `tileLabels`
   * целиком, и подмена его словарём стёрла бы подписи из первой версии.
   */
  slot: 0 | 1 | 2 | 3
  label: string
}

/** Порядок назван заказчиком: бюджет · дорога · продукты · с каждого. */
const TILES: TileDef[] = [
  { key: 'total', slot: 2, label: 'Общий бюджет' },
  { key: 'transport', slot: 0, label: 'Бензин, лодка, парковка' },
  { key: 'buy', slot: 1, label: 'Продукты' },
  { key: 'perPerson', slot: 3, label: 'С каждого' },
]

/**
 * Четыре суммы в панели обложки.
 *
 * Разбор «Как это считается» отсюда убран заказчиком 04.08.2026: «сами расчёты
 * должны быть внизу, в разделе другом». На обложке остались только цифры.
 * Подпись плитки правится тапом по ней же — как вижу, так и редактирую.
 *
 * ⛔ Подпись к подписи, число к числу. Заказчик 05.08.2026: «неграмотно
 * расположены вот эти вот цифры, там 47 тысяч, 21 385, 26 005, 12 305 — всё
 * на разных уровнях, я не знаю, зачем ты это так сделал». Он прав, и причина
 * была не в замысле: подписи разной длины («Бензин, лодка, парковка» против
 * «Продукты») занимают то одну строку, то две, и число под длинной подписью
 * уезжает ниже соседнего. Лечится сеткой, а не подгонкой: у каждой плитки
 * ДВА ряда внешней сетки (`row-span-2` + `grid-rows-subgrid`), поэтому все
 * подписи одного ряда стоят на одной линии и все числа — на одной линии,
 * сколько бы строк ни занял текст. ⚠️ Обрезать подпись в одну строку нельзя:
 * своя подпись из документа потерялась бы на глазах у владельца.
 */
export function MoneyTiles({ S, perms }: { S: State; perms: Perms }) {
  const canEdit = perms.isEditor()
  let sums: CalcResult
  try {
    sums = calcAll(S)
  } catch {
    sums = ZERO
  }
  const labels = S.tileLabels

  /** Подпись плитки: своя из документа, иначе заводская. */
  const labelOf = (t: TileDef) => labels?.[t.slot]?.trim() || t.label

  /** Сохранить подпись на её месте в массиве; пустая строка возвращает заводскую. */
  const saveLabel = (t: TileDef, v: string) =>
    update((s) => {
      const bag = [...(s.tileLabels ?? [])]
      while (bag.length < 4) bag.push('')
      bag[t.slot] = v.trim() === t.label ? '' : v
      s.tileLabels = bag
    })

  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-4 lg:grid-cols-4">
      {TILES.map((t) => (
        <div key={t.key} className="row-span-2 grid min-w-0 grid-rows-subgrid gap-0">
          <div className="text-micro leading-tight text-muted">
            <InlineText
              value={labelOf(t)}
              onSave={(v) => saveLabel(t, v)}
              can={canEdit}
              label={`Подпись суммы «${t.label}»`}
              placeholder={t.label}
              className="text-muted"
            />
          </div>
          {/* Число прижато к низу своей клетки: подпись сверху может занять одну
              строку или две, а числа обязаны стоять на одной линии. */}
          <div className="tnum self-end pt-1 text-head font-bold text-ink lg:text-title">
            {money(sums[t.key], S.doc)}
          </div>
        </div>
      ))}
    </div>
  )
}
