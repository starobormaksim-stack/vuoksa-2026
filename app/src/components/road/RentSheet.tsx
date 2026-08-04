import { useState } from 'react'
import type { Rent, State } from '@/lib/types'
import { Btn, InlineText, PickSheet, ResponsiveSheet, SheetRow } from '@/components/flops'
import { DocNotes } from './TransportSheet'
import { rentCatName } from './roadx'

/**
 * Карточка строки аренды — только выбор из списка и тексты.
 *
 * ⚠️ Числа отсюда ушли: цена, срок и количество правятся прямо в строке таблицы
 * «Расчёт дороги» (заказчик 04.08.2026: поп-ап с пересказом того же самого ему
 * не нужен). Ушёл и разбор живой фразой — он повторял строку таблицы слово
 * в слово.
 *
 * Осталось то, чему в узкой ячейке места нет: категория, единица счёта, что
 * входит в стоимость (blocks[] — бывшая карточка лодки из первой версии),
 * предупреждение и подписи чисел из документа.
 */

interface Props {
  item: Rent
  S: State
  canEdit: boolean
  onPatch: (f: (r: Rent) => void) => void
  onClose: () => void
}

export function RentSheet({ item, S, canEdit, onPatch, onClose }: Props) {
  const [pick, setPick] = useState(false)
  const blocks = item.blocks ?? []

  return (
    <>
      <ResponsiveSheet
        open={!pick}
        onOpenChange={(v) => !v && onClose()}
        title={item.n || 'Аренда'}
        subtitle={rentCatName(item, S)}
        footer={
          <Btn scale="lg" className="w-full" onClick={onClose}>
            Готово
          </Btn>
        }
      >
        <div className="border-b border-line pb-3">
          <div className="text-note font-semibold text-muted">Название</div>
          <InlineText
            value={item.n}
            onSave={(v) =>
              onPatch((r) => {
                r.n = v
              })
            }
            can={canEdit}
            required
            label="Название аренды"
            placeholder="Например, Лодка «Ладога»"
            className="text-body font-[650] text-ink"
          />
        </div>

        <div className="mt-1">
          <SheetRow
            label="Категория"
            value={rentCatName(item, S)}
            onClick={canEdit ? () => setPick(true) : undefined}
          />
        </div>

        <div className="mt-3">
          <div className="text-note font-semibold text-muted">Считаем в</div>
          <InlineText
            value={item.unit}
            onSave={(v) =>
              onPatch((r) => {
                r.unit = v
              })
            }
            can={canEdit}
            label="За что берут цену"
            placeholder="сут."
            className="text-body text-ink"
          />
          <p className="mt-0.5 text-note text-muted">
            За что берут цену: за сутки, за час, за штуку
          </p>
        </div>

        {/* Текстовые блоки строки аренды — то, что в первой версии было
            отдельной карточкой лодки: «в стоимость входят 4 жилета». */}
        {blocks.map((b, idx) => (
          <div key={`${b.t}-${idx}`} className="mt-3 border-t border-line pt-3">
            <InlineText
              value={b.t}
              onSave={(v) =>
                onPatch((r) => {
                  const list = r.blocks ?? []
                  if (list[idx]) list[idx].t = v
                })
              }
              can={canEdit}
              label="Заголовок блока"
              className="text-body font-[650] text-ink"
            />
            <InlineText
              value={b.c}
              onSave={(v) =>
                onPatch((r) => {
                  const list = r.blocks ?? []
                  if (list[idx]) list[idx].c = v
                })
              }
              can={canEdit}
              multiline
              label="Текст блока"
              className="text-note leading-snug text-muted"
            />
          </div>
        ))}

        {canEdit || item.warn ? (
          <div className="mt-3">
            <div className="text-note font-semibold text-muted">Предупреждение</div>
            <InlineText
              value={item.warn ?? ''}
              onSave={(v) =>
                onPatch((r) => {
                  r.warn = v
                })
              }
              can={canEdit}
              multiline
              label="Предупреждение"
              placeholder="То, о чём легко забыть на месте"
              className="text-body leading-snug font-semibold text-accent-text"
            />
          </div>
        ) : null}

        <div className="mt-3">
          <div className="text-note font-semibold text-muted">Примечание</div>
          <InlineText
            value={item.c}
            onSave={(v) =>
              onPatch((r) => {
                r.c = v
              })
            }
            can={canEdit}
            multiline
            label="Примечание"
            placeholder="Что важно помнить про эту аренду"
            className="text-body leading-snug text-ink"
          />
        </div>

        <DocNotes
          nt={item.nt}
          can={canEdit}
          onSave={(key, part, v) =>
            onPatch((r) => {
              if (!r.nt) r.nt = {}
              if (!r.nt[key]) r.nt[key] = { t: '' }
              r.nt[key][part] = v
            })
          }
        />
      </ResponsiveSheet>

      <PickSheet
        open={pick}
        onOpenChange={(v) => !v && setPick(false)}
        onBack={() => setPick(false)}
        title="Категория"
        subtitle={item.n}
        value={item.cat}
        options={[...S.rentCats].sort((a, b) => a.ord - b.ord).map((c) => ({ id: c.i, title: c.t }))}
        onPick={(id) =>
          onPatch((r) => {
            r.cat = id
          })
        }
      />
    </>
  )
}
