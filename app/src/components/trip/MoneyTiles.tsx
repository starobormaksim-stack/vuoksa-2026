import { useState } from 'react'
import { Car, ChevronDown, HandCoins, ShoppingCart, Wallet, type LucideIcon } from 'lucide-react'
import type { State } from '@/lib/types'
import { calcAll, money, type CalcResult } from '@/lib/calc'
import { cn } from '@/lib/utils'

/** Суммы-нули на случай сбоя расчётного ядра — плитки не должны ронять обложку. */
const ZERO: CalcResult = {
  km: 0, fuel: 0, rent: 0, transport: 0, buy: 0,
  personal: 0, total: 0, perPerson: 0, cans: [],
}

interface TileDef {
  key: 'transport' | 'buy' | 'total' | 'perPerson'
  label: string
  sub: string
  icon: LucideIcon
}

const TILES: TileDef[] = [
  { key: 'perPerson', label: 'С каждого', sub: 'на человека', icon: HandCoins },
  { key: 'total', label: 'Общий бюджет', sub: 'на всех', icon: Wallet },
  { key: 'transport', label: 'Дорога и аренда', sub: 'бензин + лодка', icon: Car },
  { key: 'buy', label: 'Продукты', sub: 'по плану', icon: ShoppingCart },
]

/**
 * Четыре денежные плитки и разбор «откуда сумма» (docs/v2-ux-redesign.md, 6.3).
 *
 * В v1 плитки были немыми: 47 390 ₽ — и всё. Ни один итог теперь не показывается
 * без объяснения (правило 7): под сеткой раскрывается разбор по слагаемым.
 * Подписи плиток правятся из «⋯», а не прямо в строке, — иначе промах по цифре
 * оставлял случайную правку.
 */
export function MoneyTiles({ S }: { S: State }) {
  const [open, setOpen] = useState(false)
  let sums: CalcResult
  try {
    sums = calcAll(S)
  } catch {
    sums = ZERO
  }
  const labels = S.tileLabels as unknown as Partial<Record<TileDef['key'], string>> | undefined
  const n = S.people.length || 1

  const Row = ({ title, sum, muted }: { title: string; sum: string; muted?: boolean }) => (
    <div className="flex min-h-9 items-center gap-3 text-[14px]">
      <span className={cn('min-w-0 flex-1', muted ? 'text-muted' : 'text-ink')}>{title}</span>
      <span className={cn('tnum shrink-0 font-semibold', muted ? 'text-muted' : 'text-ink')}>{sum}</span>
    </div>
  )

  return (
    <section className="overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">
      <div className="grid grid-cols-2 gap-px bg-line/60">
        {TILES.map((t) => {
          const Icon = t.icon
          return (
            <div key={t.key} className="bg-surface p-4">
              <div className="flex items-center gap-1.5 text-muted">
                <Icon size={15} strokeWidth={1.5} aria-hidden />
                <span className="truncate text-[11px] font-bold tracking-[.1em] uppercase">
                  {labels?.[t.key] ?? t.label}
                </span>
              </div>
              <div className="tnum mt-1.5 text-[24px] leading-tight font-bold text-ink">
                {money(sums[t.key], S.doc)}
              </div>
              <div className="text-[12px] text-muted">{t.sub}</div>
            </div>
          )
        })}
      </div>

      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex min-h-12 w-full items-center gap-2 border-t border-line px-4 text-left text-[15px] font-semibold text-ink transition-colors hover:bg-zebra"
      >
        <span className="flex-1">Как это считается</span>
        <ChevronDown
          size={20}
          strokeWidth={1.5}
          aria-hidden
          className={cn('text-muted transition-transform', open && 'rotate-180')}
        />
      </button>

      {open && (
        <div className="border-t border-line px-4 py-3">
          <Row title={`Бензин · ${sums.km} км на всю технику`} sum={money(sums.fuel, S.doc)} />
          <Row title="Аренда · лодка и парковка" sum={money(sums.rent, S.doc)} />
          <Row title="Продукты и расходники" sum={money(sums.buy, S.doc)} />
          <div className="mt-2 border-t border-line pt-2">
            <Row title="Общий бюджет" sum={money(sums.total, S.doc)} />
            <Row title={`Делим на ${n}`} sum={money(sums.perPerson, S.doc)} />
          </div>
          <div className="mt-2 border-t border-line pt-2">
            <Row title="Личное, в делёж не входит" sum={money(sums.personal, S.doc)} muted />
          </div>
        </div>
      )}
    </section>
  )
}
