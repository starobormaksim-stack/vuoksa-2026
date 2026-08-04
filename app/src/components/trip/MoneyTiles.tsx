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
 * Четыре суммы поверх фотографии обложки.
 *
 * Разбор «Как это считается» отсюда убран заказчиком 04.08.2026: «сами расчёты
 * должны быть внизу, в разделе другом». На обложке остались только цифры.
 * Подпись плитки правится тапом по ней же — как вижу, так и редактирую.
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
    <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 lg:grid-cols-4">
      {TILES.map((t) => (
        <div key={t.key} className="min-w-0">
          <div className="text-micro">
            <InlineText
              value={labelOf(t)}
              onSave={(v) => saveLabel(t, v)}
              can={canEdit}
              label={`Подпись суммы «${t.label}»`}
              placeholder={t.label}
              className="truncate text-brand-cream/85"
            />
          </div>
          <div className="tnum mt-0.5 text-head font-bold text-brand-cream lg:text-title">
            {money(sums[t.key], S.doc)}
          </div>
        </div>
      ))}
    </div>
  )
}
