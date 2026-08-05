import { useState } from 'react'
import { Check, Plus, Trash2 } from 'lucide-react'
import type { Person, State } from '@/lib/types'
import type { Perms } from '@/lib/perm'
import { counted, unitOf } from '@/lib/buyx'
import { money } from '@/lib/calc'
import {
  InlineNum, InlineText, PersonHead, ProductLink, RowAction, RowActions,
  StripField, StripRow,
} from '@/components/flops'
import { safeUrl, saveNameOrUrl } from '@/lib/producturl'
import { applyCard, clearGrab, grabProduct } from '@/lib/product'
import { SpendShareEdit } from '@/components/road/SpendShare'
import { cn } from '@/lib/utils'
import {
  buyerQty, descText, digitsOf, foldStatus, setBuyer, type BuyItem,
} from './buylocal'

/**
 * «Закупка» лентой — вид раздела на телефоне.
 *
 * Заказчик 06.08.2026: «речь идёт про покупку, про товары — там условно у меня
 * написано, допустим, макароны, три пачки, кто покупает» и «если речь идёт
 * про покупки, то там с правой стороны цена».
 *
 * ⛔ Колонки «Сумма» здесь НЕТ ни в полоске, ни в подробности. Его слова:
 * «Сумма — я не понимаю, что это такое. Бред же: у тебя есть цена плановая…
 * и цена факт — а сумма-то тут на кой? По сути это оно и есть, это есть цена
 * факт». Итог по всему блоку при этом остался внизу, как в его Excel, — он же
 * просил «внизу должен видеть условно как в Excel: сумма факт, сумма план».
 *
 * ⛔ Модель данных не тронута: `pr` — цена план, `prf` — цена факт, обе за
 * единицу, и `lib/calc.ts` считает по ним ровно как считал. Контрольные цифры
 * держатся на факте, поэтому поле суммы, которое раньше вписывало
 * `prf = сумма ÷ количество`, просто убрано с экрана, а не переопределено.
 */

interface Props {
  rows: BuyItem[]
  S: State
  perms: Perms
  people: Person[]
  /** id только что добавленной строки */
  fresh: string | null
  onPatch: (id: string, f: (x: BuyItem) => void) => void
  onDelete: (p: BuyItem) => void
  onInsert: (afterId: string) => void
  onFreshEnd: (id: string, saved: boolean) => void
  /** есть ли право заводить позиции (не то же, что право править чужую строку) */
  canAdd: boolean
}

export function BuyStrip({
  rows, S, perms, people, fresh, onPatch, onDelete, onInsert, onFreshEnd, canAdd,
}: Props) {
  const [openId, setOpenId] = useState('')

  return (
    <div role="list">
      {rows.map((p, idx) => {
        const canEdit = perms.canEditItem(p)
        const canQty = canEdit && perms.canEditQty(p)
        const isFresh = fresh === p.i
        const open = openId === p.i || isFresh
        const take = counted(p)
        const desc = descText(p, S)
        /* Главное число справа — цена. Факт, как только он появился: он и есть
           то, что заказчик называет суммой. Пока факта нет — план, и подпись
           под числом честно говорит, какая это цена. */
        const hasFact = p.prf > 0
        const price = hasFact ? p.prf : p.pr

        const grab = (url: string) =>
          void grabProduct(p.i, url, (card) => onPatch(p.i, (x) => applyCard(x, card)))

        return (
          <StripRow
            key={p.i}
            dataHit={p.i}
            zebra={idx % 2 === 1}
            done={!!p.b}
            open={open}
            onToggle={() => setOpenId(open ? '' : p.i)}
            lead={
              <Box
                on={!!p.b}
                can={canEdit}
                label={`${p.n || 'Позиция'}: ${p.b ? 'куплено' : 'ещё не куплено'}`}
                onToggle={() => onPatch(p.i, (x) => { x.b = !x.b })}
              />
            }
            title={p.n || 'Без названия'}
            sub={
              take
                ? desc || `${p.q}${' '}${unitOf(p, S)}`
                : desc
                  ? `Не берём. ${desc}`
                  : 'Не берём — в сумму не идёт'
            }
            right={money(price, S.doc)}
            rightHint={hasFact ? 'цена факт' : 'цена план'}
          >
            <StripField label="Название" wide>
              <InlineText
                value={p.n}
                can={canEdit}
                label="Название"
                required={!isFresh}
                autoEdit={isFresh}
                placeholder={isFresh ? 'Что купить' : undefined}
                onSave={(v) => {
                  onPatch(p.i, (x) => { saveNameOrUrl(x, v) })
                  const u = safeUrl(v)
                  if (u) grab(u)
                }}
                onEditEnd={isFresh ? () => onFreshEnd(p.i, !!p.n) : undefined}
                className="text-body font-semibold text-ink"
              />
              {p.url ? (
                <ProductLink
                  url={p.url}
                  img={p.img}
                  itemId={p.i}
                  canEdit={canEdit}
                  onRefresh={() => grab(p.url as string)}
                  onClear={() => {
                    clearGrab(p.i)
                    onPatch(p.i, (x) => {
                      x.url = ''
                      x.img = ''
                      x.pat = 0
                    })
                  }}
                />
              ) : null}
            </StripField>

            <StripField label="Количество">
              <span className="flex items-center gap-2">
                <InlineNum
                  value={p.q}
                  can={canQty}
                  label="Количество"
                  step={1}
                  digits={digitsOf(p.q)}
                  onSave={(v) => onPatch(p.i, (x) => { x.q = v; x.qby = perms.me || x.qby })}
                  className="text-body font-semibold text-ink"
                />
                <InlineText
                  value={unitOf(p, S)}
                  can={canEdit}
                  label="Единица"
                  onSave={(v) =>
                    onPatch(p.i, (x) => {
                      const u = S.units.find((z) => z.t.toLowerCase() === v.trim().toLowerCase())
                      x.u = u ? u.t : v
                      x.uid = u ? u.i : ''
                    })
                  }
                  className="text-body text-muted"
                />
              </span>
            </StripField>

            {/* Две цены рядом и подписаны словами — заказчик просил, чтобы план
                и факт были заметны, а не терялись в ряду одинаковых чисел. */}
            <StripField label="Цена, план">
              <span className="flex items-center gap-1">
                <InlineNum
                  value={p.pr}
                  can={canEdit}
                  label="Цена, план"
                  kind="plain"
                  digits={digitsOf(p.pr)}
                  onSave={(v) => onPatch(p.i, (x) => { x.pr = v })}
                  className={cn('text-body font-semibold', p.pr > 0 ? 'text-ink' : 'text-muted')}
                />
                <span className="text-note text-muted">{'₽'}</span>
              </span>
            </StripField>

            <StripField label="Цена, факт">
              <span className="flex items-center gap-1">
                <InlineNum
                  value={p.prf}
                  can={canEdit}
                  label="Цена, факт"
                  kind="plain"
                  digits={digitsOf(p.prf)}
                  onSave={(v) => onPatch(p.i, (x) => { x.prf = v })}
                  className={cn('text-body font-semibold', p.prf > 0 ? 'text-ink' : 'text-muted')}
                />
                <span className="text-note text-muted">{'₽'}</span>
              </span>
            </StripField>

            <StripField label="Берём — идёт в сумму">
              <Box
                on={take}
                can={canEdit}
                label={`${p.n || 'Позиция'}: ${take ? 'берём, идёт в сумму' : 'не берём, в сумму не идёт'}`}
                onToggle={() =>
                  onPatch(p.i, (x) => {
                    const was = x.st === 'buy'
                    foldStatus(x, S)
                    x.st = was ? 'skip' : 'buy'
                  })
                }
              />
            </StripField>

            <StripField label="Описание" wide>
              <InlineText
                value={desc}
                can={canEdit}
                label="Описание"
                multiline
                placeholder={canEdit ? 'примечание' : undefined}
                onSave={(v) =>
                  onPatch(p.i, (x) => {
                    foldStatus(x, S)
                    x.c = v
                  })
                }
                className="text-note text-muted"
              />
            </StripField>

            {/* «Кто покупает» — его же слова: «покупает один человек, делит
                на всех — потому что всё равно кто-то один будет оплачивать». */}
            <div className="mt-2 border-t border-line/50 pt-2">
              <div className="text-micro font-semibold text-muted">Кто покупает</div>
              {people.map((who) => {
                const qty = buyerQty(p, who.id)
                return (
                  <div
                    key={who.id}
                    className="flex min-h-14 items-center gap-3 border-b border-line/50 py-1 last:border-b-0"
                  >
                    <PersonHead
                      name={who.name}
                      photo={who.photo}
                      ini={who.ini}
                      mine={who.id === perms.me}
                      size={32}
                    />
                    <span className="min-w-0 flex-1 truncate text-body text-ink">{who.name}</span>
                    {perms.canMark(who.id) ? (
                      qty > 0 ? (
                        <InlineNum
                          value={qty}
                          can
                          label={`${who.name} покупает`}
                          kind="plain"
                          digits={digitsOf(qty)}
                          onSave={(v) => onPatch(p.i, (x) => setBuyer(x, who.id, v, perms.me))}
                          className="text-body font-semibold text-ink"
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => onPatch(p.i, (x) => setBuyer(x, who.id, 1, perms.me))}
                          aria-label={`${who.name} покупает. Отметить`}
                          className="grid size-11 place-items-center rounded-md text-note text-muted transition-colors hover:bg-zebra/70 active:scale-[0.98]"
                        >
                          &#8212;
                        </button>
                      )
                    ) : (
                      <span className="tnum min-w-11 text-right text-body font-semibold text-ink">
                        {qty > 0 ? qty : '—'}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>

            <StripField label="Делят затрату" wide>
              <SpendShareEdit
                S={S}
                can={canEdit}
                circleOnly
                payer={p.payer}
                sp={p.sp}
                what={p.n || 'Позиция'}
                onSp={(ids) => onPatch(p.i, (x) => { x.sp = ids })}
              />
            </StripField>

            <div className="mt-2 flex justify-end border-t border-line/50 pt-2">
              <RowActions>
                {canAdd ? (
                  <RowAction
                    key="ins"
                    icon={Plus}
                    label="Вставить строку ниже"
                    onClick={() => onInsert(p.i)}
                  />
                ) : null}
                {perms.canDel(p) ? (
                  <RowAction
                    key="del"
                    icon={Trash2}
                    label="Удалить позицию"
                    tone="danger"
                    onClick={() => onDelete(p)}
                  />
                ) : null}
              </RowActions>
            </div>
          </StripRow>
        )
      })}
    </div>
  )
}

/**
 * Галочка. Права нет — рисуется только состояние, без кнопки и без серого
 * заглушечного вида (постулат 6). Копия из `BuyRow`: два экрана одного раздела
 * обязаны показывать галочку одинаково.
 */
function Box({
  on, can, label, onToggle,
}: {
  on: boolean
  can: boolean
  label: string
  onToggle: () => void
}) {
  const mark = (
    <span
      className={cn(
        'grid size-6 place-items-center rounded-sm border-[1.5px]',
        on ? 'border-accent bg-accent text-on-accent' : 'border-line-strong',
      )}
    >
      {on && <Check size={18} strokeWidth={1.75} aria-hidden />}
    </span>
  )
  if (!can) {
    return (
      <span role="img" aria-label={label} className="grid size-11 shrink-0 place-items-center">
        {mark}
      </span>
    )
  }
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={on}
      aria-label={label}
      className="grid size-11 shrink-0 place-items-center rounded-md transition-colors hover:bg-zebra/70 active:scale-[0.98]"
    >
      {mark}
    </button>
  )
}
