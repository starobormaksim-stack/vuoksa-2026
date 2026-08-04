import { Car, HandCoins, ShoppingCart, Wallet, type LucideIcon } from 'lucide-react'
import type { State } from '../../lib/types'
import { calcAll, money, type CalcResult } from '../../lib/calc'

/** Суммы-нули на случай сбоя расчётного ядра — плитки не должны ронять обложку. */
const ZERO: CalcResult = {
  km: 0, fuel: 0, rent: 0, transport: 0, buy: 0,
  personal: 0, total: 0, perPerson: 0, cans: [],
}

interface TileDef {
  key: 'transport' | 'buy' | 'total' | 'perPerson'
  label: string
  icon: LucideIcon
  deep?: boolean
}

const TILES: TileDef[] = [
  { key: 'transport', label: 'Транспорт', icon: Car },
  { key: 'buy', label: 'Продукты', icon: ShoppingCart },
  { key: 'total', label: 'Общий бюджет', icon: Wallet, deep: true },
  { key: 'perPerson', label: 'С каждого', icon: HandCoins },
]

/** Четыре денежные плитки обложки. Подписи можно переопределить в S.tileLabels. */
export function MoneyTiles({ S }: { S: State }) {
  let sums: CalcResult
  try {
    sums = calcAll(S)
  } catch {
    sums = ZERO
  }
  const labels = (S as unknown as { tileLabels?: Partial<Record<TileDef['key'], string>> }).tileLabels

  return (
    <div className="grid grid-cols-2 gap-3">
      {TILES.map((t) => {
        const Icon = t.icon
        return (
          <div key={t.key} className="rounded-2xl border border-line bg-card p-4 shadow-sm">
            <div className="flex items-center gap-1.5 text-muted">
              <Icon size={16} strokeWidth={1.5} aria-hidden />
              <span className="text-[11px] font-semibold tracking-[.12em] uppercase">
                {labels?.[t.key] ?? t.label}
              </span>
            </div>
            <div
              className={`tnum mt-2 text-[22px] leading-tight font-bold ${
                t.deep ? 'text-accent-text' : 'text-ink'
              }`}
            >
              {money(sums[t.key], S.doc)}
            </div>
          </div>
        )
      })}
    </div>
  )
}
