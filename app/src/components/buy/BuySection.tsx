import { useMemo, useState } from 'react'
import { Check, ShoppingCart } from 'lucide-react'
import { toast } from 'sonner'
import type { Buy } from '@/lib/types'
import { useTrip, touch } from '@/store'
import { buyLine, counted, sumLabel } from '@/lib/buyx'
import {
  AddRow, EmptyState, Group, ItemRow, SectionHead, TextSheet,
} from '@/components/flops'
import { BuyTotals } from './BuyTotals'
import { BuyItemSheet } from './BuyItemSheet'
import { ShopSheet } from './ShopSheet'
import { cn } from '@/lib/utils'

/**
 * Раздел «Закупка» (docs/v2-ux-redesign.md, раздел 9).
 *
 * Претензия заказчика была про строку: «2 шт. × 900 план — факт» — форма ввода
 * в списке. Здесь строка ничего не вводит: она показывает вещь, одну фразу
 * («3 шт. по 550 ₽ · покупает Костя») и сумму. Всё редактирование — в карточке
 * по тапу. Ни одного `input` и ни одного знака × на экране списка.
 */
export function BuySection() {
  const { S, update, remove, perms } = useTrip()
  const [open, setOpen] = useState<Record<string, boolean>>(() => ({ [S.buySections[0]?.i]: true }))
  const [sheet, setSheet] = useState<string | null>(null)
  const [shop, setShop] = useState(false)
  const [addTo, setAddTo] = useState<string | null>(null)

  const bySec = useMemo(() => {
    const m: Record<string, Buy[]> = {}
    for (const p of S.buy) (m[p.sec] ||= []).push(p)
    for (const k of Object.keys(m)) m[k].sort((a, b) => (a.ord ?? 0) - (b.ord ?? 0))
    return m
  }, [S.buy])

  const patch = (id: string, f: (p: Buy) => void) =>
    update((s) => {
      const p = s.buy.find((x) => x.i === id)
      if (p) {
        f(p)
        touch(p)
      }
    })

  const toggleBought = (p: Buy) => {
    patch(p.i, (x) => {
      x.b = !x.b
      if (x.b && !x.who && perms.me) x.who = perms.me
    })
  }

  const addItem = (secId: string, name: string) => {
    const id = 'p' + Date.now().toString(36)
    update((s) => {
      s.buy.push({
        i: id, sec: secId, n: name, q: 1, u: 'шт.', uid: 'sht',
        pr: 0, prf: 0, st: 'buy', c: '', who: '', by: perms.me || '',
        qby: perms.me || '', ord: (s.buy.length + 1) * 10, ua: Date.now(),
      })
    })
    toast(`«${name}» в списке`)
    setSheet(id)
  }

  const current = sheet ? S.buy.find((p) => p.i === sheet) : null
  const personalIds = new Set(S.buySections.filter((s) => s.personal).map((s) => s.i))

  return (
    <div className="flex flex-col gap-4">
      <SectionHead
        title="Закупка"
        hint="Тап по строке открывает карточку, тап по галочке отмечает купленное"
      />

      <BuyTotals S={S} onShop={() => setShop(true)} />

      {[...S.buySections]
        .sort((a, b) => a.ord - b.ord)
        .map((sec) => {
          const rows = bySec[sec.i] ?? []
          const done = rows.filter((p) => p.b).length
          return (
            <Group
              key={sec.i}
              title={sec.t}
              done={done}
              total={rows.length}
              open={!!open[sec.i]}
              onToggle={() => setOpen((o) => ({ ...o, [sec.i]: !o[sec.i] }))}
              badge={
                sec.personal ? (
                  <span className="shrink-0 rounded-lg border border-accent-text px-2 py-0.5 text-[11px] font-bold text-accent-text">
                    личное
                  </span>
                ) : undefined
              }
              className={cn(sec.personal && 'border-dashed border-line-strong bg-bg')}
            >
              {rows.length === 0 ? (
                <EmptyState
                  icon={ShoppingCart}
                  title="Ничего не запланировано"
                  text="Добавьте, что нужно купить в этом разделе"
                  action={{ label: 'Добавить позицию', onClick: () => setAddTo(sec.i) }}
                />
              ) : (
                <div role="list">
                  {rows.map((p, idx) => (
                    <ItemRow
                      key={p.i}
                      dataHit={p.i}
                      zebra={idx % 2 === 1}
                      done={!!p.b}
                      onOpen={() => setSheet(p.i)}
                      onDelete={perms.canDel(p) ? () => {
                        remove('buy', p.i)
                        toast(`«${p.n}» удалено`, {
                          action: { label: 'Отменить', onClick: () => undo(p) },
                        })
                      } : undefined}
                      lead={
                        <button
                          type="button"
                          aria-label={`${p.n}: ${p.b ? 'куплено' : 'не куплено'}. Отметить`}
                          onClick={(e) => {
                            e.stopPropagation()
                            toggleBought(p)
                          }}
                          className="grid size-11 place-items-center rounded-xl transition-colors hover:bg-zebra"
                        >
                          <span
                            className={cn(
                              'grid size-6 place-items-center rounded-lg border-[1.5px]',
                              p.b ? 'border-accent bg-accent text-on-accent' : 'border-line-strong',
                            )}
                          >
                            {p.b && <Check size={16} strokeWidth={3} aria-hidden />}
                          </span>
                        </button>
                      }
                      title={p.n}
                      line2={buyLine(p, S)}
                      right={
                        <span className={cn(!counted(p) && 'text-muted line-through')}>
                          {sumLabel(p, S)}
                        </span>
                      }
                    />
                  ))}
                  <AddRow label="Добавить позицию" onClick={() => setAddTo(sec.i)} />
                </div>
              )}
            </Group>
          )
        })}

      {current && (
        <BuyItemSheet
          item={current}
          S={S}
          perms={perms}
          personal={personalIds.has(current.sec)}
          onPatch={(f) => patch(current.i, f)}
          onDelete={() => {
            remove('buy', current.i)
            toast(`«${current.n}» удалено`, {
              action: { label: 'Отменить', onClick: () => undo(current) },
            })
          }}
          onClose={() => setSheet(null)}
        />
      )}

      <ShopSheet
        S={S}
        open={shop}
        onOpenChange={setShop}
        onToggle={(id, b) => patch(id, (p) => { p.b = b })}
      />

      <TextSheet
        open={addTo !== null}
        onOpenChange={(v) => !v && setAddTo(null)}
        title="Что купить"
        subtitle={S.buySections.find((s) => s.i === addTo)?.t}
        value=""
        placeholder="Например, хлеб"
        onDone={(v) => {
          if (v && addTo) addItem(addTo, v)
          setAddTo(null)
        }}
      />
    </div>
  )

  /** Вернуть удалённую позицию (кнопка «Отменить» в тосте). */
  function undo(p: Buy) {
    update((s) => {
      if (s.del) delete s.del['buy:' + p.i]
      if (!s.buy.some((x) => x.i === p.i)) s.buy.push({ ...p, ua: Date.now() })
    })
  }
}
