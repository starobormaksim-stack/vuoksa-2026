import { useState } from 'react'
import { ListPlus, Trash2, TriangleAlert } from 'lucide-react'
import type { Gear, Person } from '@/lib/types'
import type { Perms } from '@/lib/perm'
import {
  cantOf, cycleMark, markName, markOf, setCantWhy, setUnitOf, statusOf, totalQty, unitOf,
} from '@/lib/gearx'
import {
  InlineNum, InlineText, PersonHead, ProductLink, RowAction, RowActions,
  StatusDial, StripField, StripRow, numText,
} from '@/components/flops'
import { safeUrl, saveNameOrUrl } from '@/lib/producturl'
import { applyCard, clearGrab, grabProduct } from '@/lib/product'
import { NBSP } from '@/format'
import { UnitPick } from './GearMatrix'

/**
 * «Сборы» лентой — вид раздела на телефоне.
 *
 * Заказчик 06.08.2026, дословно: «одна плашка широкая на всю ширину условно
 * мобильного телефона, и там написано „трусы“… я нажимаю на этот пункт списка,
 * и выпадающее — и там прописано, что ага, Костя ещё возьмёт, должен взять,
 * Миша должен ещё взять, трусы, такое-то количество».
 *
 * Поэтому в полоске — название и **общее количество** справа (эталон-Excel 2024,
 * колонка «Общее количество»), а раскладка по людям уезжает в подробность.
 *
 * ⛔ Ни одного нового способа правки здесь не заведено: и счётчик по человеку,
 * и кружок состояния, и выбор единицы — те же органы, что в матрице на десктопе
 * (`GearMatrix`), просто расставленные столбиком. Модель данных та же, `patch`
 * тот же, права те же.
 *
 * ⚠️ Название правится ВНУТРИ раскрытой подробности, а не в полоске. В полоске
 * тап отдан раскрытию: два разных действия на одном месте — это ровно та беда,
 * из-за которой раньше «тап просто не работал» (см. `GearMatrix`, про долгое
 * нажатие).
 */

interface Props {
  rows: Gear[]
  people: Person[]
  perms: Perms
  /** частые единицы измерения из справочника S.units[] */
  units: string[]
  /** только что заведённая строка — раскрыта и открыта на правку названия */
  fresh: string
  onFreshDone: () => void
  patch: (id: string, f: (g: Gear) => void) => void
  onDelete: (g: Gear) => void
  /** завести строку перед строкой с этим номером */
  onInsert: (before: number) => void
}

export function GearStrip({
  rows, people, perms, units, fresh, onFreshDone, patch, onDelete, onInsert,
}: Props) {
  /** раскрытая позиция; открыта всегда одна — лента остаётся лентой */
  const [openId, setOpenId] = useState('')
  /** у какой позиции сейчас выбирается единица измерения */
  const [unitAt, setUnitAt] = useState('')

  const grabItem = (id: string, url: string) =>
    void grabProduct(id, url, (card) => patch(id, (x) => applyCard(x, card)))

  return (
    <div role="list">
      {rows.map((g, idx) => {
        const alarm = people.some((p) => !!cantOf(g, p.id))
        const canEdit = perms.canEditItem(g)
        const isFresh = fresh === g.i
        const open = openId === g.i || isFresh
        const total = totalQty(g)
        /* Свёрнутая полоска обязана сама говорить, кто уже везёт: иначе решить,
           раскрывать её или нет, нельзя (NN/g про progressive disclosure). */
        const carriers = people
          .filter((p) => (g.o?.[p.id] || 0) > 0)
          .map((p) => p.name)
          .join(', ')

        return (
          <StripRow
            key={g.i}
            dataHit={g.i}
            zebra={idx % 2 === 1}
            alarm={alarm}
            open={open}
            onToggle={() => setOpenId(open ? '' : g.i)}
            title={g.n || 'Без названия'}
            sub={carriers || (g.c ? g.c : 'никто не везёт')}
            right={numText(total)}
            rightHint={unitOf(g)}
          >
            <StripField label="Название" wide>
              <InlineText
                value={g.n}
                onSave={(v) => {
                  patch(g.i, (x) => { saveNameOrUrl(x, v) })
                  const u = safeUrl(v)
                  if (u) grabItem(g.i, u)
                }}
                can={canEdit}
                label="Название вещи"
                placeholder="Без названия"
                autoEdit={isFresh}
                onEditEnd={onFreshDone}
                className="text-body font-semibold text-ink"
              />
              {g.url ? (
                <ProductLink
                  url={g.url}
                  img={g.img}
                  itemId={g.i}
                  canEdit={canEdit}
                  onRefresh={() => grabItem(g.i, g.url as string)}
                  onClear={() => {
                    clearGrab(g.i)
                    patch(g.i, (x) => {
                      x.url = ''
                      x.img = ''
                      x.pat = 0
                    })
                  }}
                />
              ) : null}
            </StripField>

            <StripField label="Примечание" wide>
              <InlineText
                value={g.c}
                onSave={(v) => patch(g.i, (x) => { x.c = v })}
                can={canEdit}
                label="Примечание к вещи"
                placeholder="примечание"
                multiline
                className="text-note text-muted"
              />
            </StripField>

            <StripField label="Единица">
              {canEdit ? (
                <button
                  type="button"
                  onClick={() => setUnitAt(unitAt === g.i ? '' : g.i)}
                  aria-label={`Единица измерения: ${unitOf(g)}. Изменить`}
                  className="grid min-h-11 min-w-11 place-items-center rounded-md px-2 transition-colors hover:bg-zebra/70 active:bg-zebra"
                >
                  <span className="editable text-body text-ink">{unitOf(g)}</span>
                </button>
              ) : (
                <span className="text-body text-ink">{unitOf(g)}</span>
              )}
            </StripField>
            {unitAt === g.i && canEdit && (
              <UnitPick
                units={units}
                value={unitOf(g)}
                onPick={(u) => {
                  patch(g.i, (x) => { setUnitOf(x, u) })
                  setUnitAt('')
                }}
              />
            )}

            {/* Кто сколько везёт — по строке на человека во всю ширину.
                Заказчик: «Костя ещё возьмёт, должен взять, Миша должен ещё взять,
                трусы, такое-то количество». */}
            <div className="mt-2 border-t border-line/50 pt-2">
              <div className="text-micro font-semibold text-muted">Кто сколько везёт</div>
              {people.map((p) => (
                <PersonLine key={p.id} g={g} p={p} perms={perms} patch={patch} />
              ))}
            </div>

            {people.map((p) => {
              const cant = cantOf(g, p.id)
              if (!cant) return null
              return (
                <div key={p.id} className="mt-2 flex min-w-0 items-start gap-1.5">
                  <TriangleAlert
                    size={16}
                    strokeWidth={1.75}
                    className="mt-0.5 shrink-0 text-accent-text"
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-micro font-semibold text-accent-text">
                      {p.name} не может взять
                    </span>
                    <InlineText
                      value={cant.why || ''}
                      onSave={(v) => patch(g.i, (x) => { setCantWhy(x, p.id, v) })}
                      can={perms.canMark(p.id)}
                      label="Почему не может взять"
                      placeholder="причина не записана"
                      multiline
                      className="text-micro text-muted"
                    />
                  </span>
                </div>
              )
            })}

            <div className="mt-2 flex justify-end border-t border-line/50 pt-2">
              <RowActions>
                <RowAction
                  icon={ListPlus}
                  label={`Завести вещь после «${g.n}»`}
                  onClick={() => onInsert(idx + 1)}
                />
                {perms.canDel(g) && (
                  <RowAction
                    icon={Trash2}
                    tone="danger"
                    label={`Удалить «${g.n}»`}
                    onClick={() => onDelete(g)}
                  />
                )}
              </RowActions>
            </div>
          </StripRow>
        )
      })}
    </div>
  )
}

/**
 * Один человек в раскрытой позиции: снимок и имя слева, кружок состояния
 * и счётчик справа. Те же органы, что в ячейке матрицы, — только развёрнутые
 * во всю ширину, где им наконец хватает места на 44 px.
 */
function PersonLine({
  g, p, perms, patch,
}: {
  g: Gear
  p: Person
  perms: Perms
  patch: (id: string, f: (g: Gear) => void) => void
}) {
  const qty = g.o?.[p.id] || 0
  const mark = markOf(g, p.id)
  const canQty = perms.canEditQty(g, p.id)
  const canMark = perms.canMark(p.id)

  /* Ноль — человек вещь не везёт: снимаем и его отметки, иначе они «висят»
     за назначением, которого больше нет. Правило то же, что в матрице. */
  const write = (n: number) =>
    patch(g.i, (x) => {
      x.o = x.o || {}
      x.oby = x.oby || {}
      if (n > 0) {
        x.o[p.id] = n
        x.oby[p.id] = x.oby[p.id] || perms.me || ''
        return
      }
      delete x.o[p.id]
      delete x.oby[p.id]
      if (x.s) delete x.s[p.id]
      if (x.q) delete x.q[p.id]
    })

  return (
    <div className="flex min-h-14 items-center gap-3 border-b border-line/50 py-1 last:border-b-0">
      <PersonHead name={p.name} photo={p.photo} ini={p.ini} mine={p.id === perms.me} size={32} />
      <span className="min-w-0 flex-1 truncate text-body text-ink">{p.name}</span>

      <StatusDial
        value={statusOf(g, p.id)}
        cant={mark === 'cant'}
        who={p.name}
        size={44}
        onCycle={canMark ? () => patch(g.i, (x) => { cycleMark(x, p.id) }) : undefined}
      />

      {canQty ? (
        <InlineNum
          value={qty}
          onSave={write}
          can
          label={`${p.name}: сколько везёт`}
          min={0}
          step={1}
          className="text-body font-semibold text-ink"
        />
      ) : (
        <span className="tnum min-w-11 text-right text-body font-semibold text-ink">
          {qty > 0 ? `${numText(qty)}${NBSP}${unitOf(g)}` : '—'}
        </span>
      )}
      <span className="sr-only">{markName(mark)}</span>
    </div>
  )
}
