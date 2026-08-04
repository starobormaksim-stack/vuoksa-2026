import { useState, type ReactNode } from 'react'
import { Trash2, TriangleAlert } from 'lucide-react'
import { toast } from 'sonner'
import type { Rent, State } from '@/lib/types'
import { money, rentSum } from '@/lib/calc'
import {
  Btn, EditNum, NumberSheet, PickSheet, ResponsiveSheet, ResultNum, SheetRow, TextSheet,
} from '@/components/flops'
import { Alert, AlertTitle } from '@/components/ui/alert'
import { fmtNum, NBSP, plural } from '@/format'
import { rentCatName, rentPer, rentQtyLabel, tripDays } from './roadx'

/**
 * Карточка строки аренды (docs/v2-ux-redesign.md, 10.5).
 * Разбор проще, чем у техники, но устроен так же: три ступени и итог.
 *
 * Карточка лодки из v1 переезжает сюда целиком: текстовые блоки `blocks[]`
 * и предупреждение `warn` — иначе «в стоимость входят 4 жилета» пропадёт.
 */

/** Что открыто вторым уровнем. */
type Level2 = null | 'price' | 'qty' | 'count' | 'name' | 'cat' | 'unit' | 'calcT' | 'note'

interface Props {
  item: Rent
  S: State
  canEdit: boolean
  canDelete: boolean
  onPatch: (f: (r: Rent) => void) => void
  onDelete: () => void
  onClose: () => void
}

export function RentSheet({ item, S, canEdit, canDelete, onPatch, onDelete, onClose }: Props) {
  const [lvl, setLvl] = useState<Level2>(null)
  const back = () => setLvl(null)
  const go = (l: Level2) => (canEdit ? () => setLvl(l) : undefined)

  const nt = (k: string) => item.nt?.[k]
  const days = tripDays(S)
  const daysMismatch = item.unit === 'сут.' && days > 0 && item.qty !== days
  const ntList = Object.entries(item.nt ?? {}).filter(([, n]) => n && n.t)

  return (
    <>
      <ResponsiveSheet
        open={lvl === null}
        onOpenChange={(v) => !v && onClose()}
        title={item.n}
        subtitle={rentCatName(item, S)}
        footer={
          <Btn scale="lg" className="w-full" onClick={onClose}>
            Готово
          </Btn>
        }
      >
        <div className="rounded-2xl border border-line bg-bg p-3">
          <Step n={1} note={nt('price')?.c}>
            <Line>
              Стоит{' '}
              <EditNum onClick={go('price')} label="Цена аренды">
                {money(item.price, S.doc)}
              </EditNum>{' '}
              {rentPer(item)}
            </Line>
          </Step>

          <Step n={2} note={nt('qty')?.c}>
            <Line>
              Берём на{' '}
              <EditNum onClick={go('qty')} label="Сколько берём">
                {fmtNum(item.qty, 1)}
              </EditNum>{' '}
              {item.unit === 'сут.'
                ? plural(Math.round(item.qty), 'сутки', 'суток', 'суток')
                : item.unit}
            </Line>
            {canEdit && daysMismatch && (
              <Btn
                tone="ghost"
                scale="sm"
                className="mt-1 -ml-3"
                onClick={() => {
                  const was = item.qty
                  onPatch((r) => {
                    r.qty = days
                  })
                  toast(`Взяли на ${days}${NBSP}суток`, {
                    action: {
                      label: 'Отменить',
                      onClick: () =>
                        onPatch((r) => {
                          r.qty = was
                        }),
                    },
                  })
                }}
              >
                В поездке {days} {plural(days, 'сутки', 'суток', 'суток')} — подставить?
              </Btn>
            )}
          </Step>

          <Step n={3} note={nt('count')?.c}>
            <Line>
              Штук{' '}
              <EditNum onClick={go('count')} label="Сколько штук">
                {fmtNum(item.count, 0)}
              </EditNum>
            </Line>
          </Step>

          <div className="mt-2 flex items-center gap-3 rounded-xl bg-accent-soft px-3 py-3">
            <span className="flex-1 text-[15px] font-[650] text-ink">Итого</span>
            <ResultNum className="text-2xl">{money(rentSum(item), S.doc)}</ResultNum>
          </div>
        </div>

        {/* Текстовые блоки строки аренды — то, что в v1 было отдельной карточкой лодки. */}
        {(item.blocks ?? []).map((b, idx) => (
          <div key={`${b.t}-${idx}`} className="mt-3">
            <div className="text-[15px] font-[650] text-ink">{b.t}</div>
            {b.c ? <p className="mt-0.5 text-[14px] leading-snug text-muted">{b.c}</p> : null}
          </div>
        ))}

        {item.warn ? (
          <Alert className="mt-3 border-accent-text bg-surface">
            <TriangleAlert className="text-accent-text" aria-hidden />
            <AlertTitle className="text-[14px] leading-snug font-semibold text-ink">
              {item.warn}
            </AlertTitle>
          </Alert>
        ) : null}

        {item.c ? <p className="mt-3 text-sm leading-snug text-muted">{item.c}</p> : null}

        <div className="mt-3">
          <SheetRow label="Название" value={item.n} onClick={go('name')} />
          <SheetRow label="Категория" value={rentCatName(item, S)} onClick={go('cat')} />
          <SheetRow label="Считаем в" value={item.unit || 'шт.'} onClick={go('unit')} />
          <SheetRow
            label="Подпись в расчёте"
            value={item.calcT || 'собирается сама'}
            empty={!item.calcT}
            onClick={go('calcT')}
          />
          <SheetRow
            label="Примечание"
            value={item.c || 'нет'}
            empty={!item.c}
            onClick={go('note')}
          />
        </div>

        {ntList.length > 0 && (
          <div className="mt-4 rounded-xl border border-line bg-bg p-3">
            <div className="text-[13px] font-semibold text-muted">Как подписано в документе</div>
            <ul className="mt-1">
              {ntList.map(([key, note]) => (
                <li key={key} className="text-[13px] leading-snug text-muted">
                  {note.t}
                  {note.u ? ` · ${note.u}` : ''}
                </li>
              ))}
            </ul>
          </div>
        )}

        {canDelete && (
          <div className="mt-6 border-t border-line pt-4">
            <Btn
              tone="danger"
              className="w-full"
              onClick={() => {
                onDelete()
                onClose()
              }}
            >
              <Trash2 size={18} strokeWidth={1.5} aria-hidden />
              Убрать аренду
            </Btn>
          </div>
        )}
      </ResponsiveSheet>

      {/* ─── второй уровень ─── */}
      <NumberSheet
        open={lvl === 'price'}
        onOpenChange={(v) => !v && back()}
        onBack={back}
        title={nt('price')?.t || 'Цена аренды'}
        subtitle={`${item.n}, ${rentPer(item)}`}
        value={item.price}
        kind="price"
        unit={nt('price')?.u || '₽'}
        hint={(v) => `За ${rentQtyLabel(item)} выйдет ${money(v * item.qty * item.count, S.doc)}`}
        onChange={(v) =>
          onPatch((r) => {
            r.price = v
          })
        }
      />
      <NumberSheet
        open={lvl === 'qty'}
        onOpenChange={(v) => !v && back()}
        onBack={back}
        title={nt('qty')?.t || 'Сколько берём'}
        subtitle={item.n}
        value={item.qty}
        kind={item.unit === 'сут.' ? 'days' : 'qty'}
        unit={nt('qty')?.u || item.unit || 'шт.'}
        hint={(v) =>
          days > 0 && item.unit === 'сут.' && v !== days
            ? `В поездке ${days}${NBSP}${plural(days, 'сутки', 'суток', 'суток')} — выйдет ${money(item.price * v * item.count, S.doc)}`
            : `Выйдет ${money(item.price * v * item.count, S.doc)}`
        }
        onChange={(v) =>
          onPatch((r) => {
            r.qty = v
          })
        }
      />
      <NumberSheet
        open={lvl === 'count'}
        onOpenChange={(v) => !v && back()}
        onBack={back}
        title={nt('count')?.t || 'Сколько штук'}
        subtitle={item.n}
        value={item.count}
        kind="count"
        unit={nt('count')?.u || 'шт.'}
        hint={(v) => `Выйдет ${money(item.price * item.qty * v, S.doc)}`}
        onChange={(v) =>
          onPatch((r) => {
            r.count = v
          })
        }
      />

      <TextSheet
        open={lvl === 'name'}
        onOpenChange={(v) => !v && back()}
        onBack={back}
        title="Название"
        subtitle={rentCatName(item, S)}
        value={item.n}
        onDone={(v) =>
          v &&
          onPatch((r) => {
            r.n = v
          })
        }
      />
      <PickSheet
        open={lvl === 'cat'}
        onOpenChange={(v) => !v && back()}
        onBack={back}
        title="Категория"
        subtitle={item.n}
        value={item.cat}
        options={[...S.rentCats]
          .sort((a, b) => a.ord - b.ord)
          .map((c) => ({ id: c.i, title: c.t }))}
        onPick={(id) =>
          onPatch((r) => {
            r.cat = id
          })
        }
      />
      <TextSheet
        open={lvl === 'unit'}
        onOpenChange={(v) => !v && back()}
        onBack={back}
        title="Считаем в"
        subtitle="За что берут цену: за сутки, за час, за штуку"
        value={item.unit}
        placeholder="сут."
        onDone={(v) =>
          onPatch((r) => {
            r.unit = v
          })
        }
      />
      <TextSheet
        open={lvl === 'calcT'}
        onOpenChange={(v) => !v && back()}
        onBack={back}
        title="Подпись в расчёте"
        subtitle="Так строка называется в общем расчёте"
        value={item.calcT}
        placeholder={`Аренда: ${item.n}`}
        onDone={(v) =>
          onPatch((r) => {
            r.calcT = v
          })
        }
      />
      <TextSheet
        open={lvl === 'note'}
        onOpenChange={(v) => !v && back()}
        onBack={back}
        title="Примечание"
        subtitle={item.n}
        value={item.c}
        multiline
        placeholder="Что важно помнить про эту аренду"
        onDone={(v) =>
          onPatch((r) => {
            r.c = v
          })
        }
      />
    </>
  )
}

/** Ступень разбора: номер в кружке, содержимое и пояснение из данных. */
function Step({ n, note, children }: { n: number; note?: string; children: ReactNode }) {
  return (
    <div className="flex gap-3 py-1.5">
      <span
        aria-hidden
        className="tnum mt-1 grid size-6 shrink-0 place-items-center rounded-full border border-accent text-[13px] font-bold text-accent-text"
      >
        {n}
      </span>
      <div className="min-w-0 flex-1">
        {children}
        {note ? <p className="mt-1 text-[13px] leading-snug text-muted">{note}</p> : null}
      </div>
    </div>
  )
}

/** Строка живой фразы: 17 px, число внутри — кнопка. */
function Line({ children }: { children: ReactNode }) {
  return <div className="text-[17px] leading-snug text-ink">{children}</div>
}
