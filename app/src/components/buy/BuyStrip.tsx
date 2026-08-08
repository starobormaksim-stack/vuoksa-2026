import { useRef, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import type { Person, State } from '@/lib/types'
import type { Perms } from '@/lib/perm'
import { counted, planSumOf, sumOf, unitOf } from '@/lib/buyx'
import { money } from '@/lib/calc'
import { buySplit } from '@/lib/settle'
import {
  InlineNum, InlineText, PersonHead, ProductLink, RowAction, RowActions,
  StripField, StripRow,
} from '@/components/flops'
/* Галочка «куплено» — общий орган: обе копии были слово в слово, а 08.08.2026
   понадобилась третья, в поиске. Имя оставлено прежним, чтобы разметка ниже
   не менялась ни в одном месте. */
import { BuyBox as Box } from '@/components/flops'
import { safeUrl, saveNameOrUrl } from '@/lib/producturl'
import { applyCard, clearGrab, grabProduct } from '@/lib/product'
import { SpendShareEdit, SpendSplitLine } from '@/components/road/SpendShare'
import { cn } from '@/lib/utils'
import {
  buyerQty, descText, digitsOf, foldStatus, restQty, setBuyer, type BuyItem,
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
  /* Успели ли что-то вписать в новую строку. ⛔ Читать здесь `p.n` нельзя:
     обработчик замкнут на тот рендер, где названия ещё нет, и строка,
     в которую человек только что вписал название, удалялась как «пустая»
     (урок У-100). В матрице (`BuyRow`) это давно сделано ссылкой — здесь
     ссылка одна на список, потому что свежая строка бывает только одна. */
  const saved = useRef(false)

  return (
    <div role="list">
      {rows.map((p, idx) => {
        const canEdit = perms.canEditItem(p)
        const canQty = canEdit && perms.canEditQty(p)
        const isFresh = fresh === p.i
        const open = openId === p.i || isFresh
        const take = counted(p)
        const desc = descText(p, S)
        /* Главное число справа — СТОИМОСТЬ ПОЗИЦИИ ЦЕЛИКОМ, а не цена за штуку.
           Заказчик 08.08.2026: «справа должна быть указана финальная стоимость,
           а не за единицу, и там фактическая». Три пачки по 90 ₽ показывали 90,
           и человек складывал глазами не то, что стоит внизу в «Сумма, факт».
           Цены за единицу никуда не делись — они правятся ниже, в развороте. */
        const hasFact = p.prf > 0
        const cost = hasFact ? sumOf(p) : planSumOf(p)

        /* Кто покупает — прямо в свёрнутой полоске, лицами. Заказчик 08.08.2026:
           «в мобильной версии должно быть написано, кто покупает… когда я галочку
           ставлю „Макс покупает“, перерасчёт делится, отталкиваясь от того, что
           он покупает». До этой правки покупатель был виден только в развороте:
           решить, раскрывать строку или нет, было нельзя. Образец — `carriers`
           в ленте «Сборов» (`gear/GearStrip.tsx`), там же и правило: свёрнутая
           полоска обязана сама говорить главное о себе.

           Отметка «куплено» остаётся СЛЕВА, у названия: она про сам товар.
           Деньги — справа. Лица — под названием, вместе с тем, чей это товар. */
        const buyers = people.filter((w) => buyerQty(p, w.id) > 0)

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
            marks={
              take ? (
                buyers.length ? (
                  <>
                    {buyers.map((w) => (
                      <PersonHead
                        key={w.id}
                        name={w.name}
                        photo={w.photo}
                        ini={w.ini}
                        mine={w.id === perms.me}
                        size={24}
                      />
                    ))}
                    <span className="min-w-0 truncate text-micro text-muted">
                      {buyers.length === 1
                        ? `покупает ${buyers[0].name}`
                        : `покупают ${buyers.map((w) => w.name).join(', ')}`}
                    </span>
                  </>
                ) : p.b ? (
                  /* Куплено, а покупатель не отмечен — деньги потрачены, но
                     `buyCover` даёт 0 (lib/settle.ts), и трата не попадает
                     в зачёт ни к кому. Молчать об этом нельзя (постулат 5):
                     именно из-за таких строк взаиморасчёты выходят неверными.
                     Правило, а не жест (постулат 7).

                     Когда позиция ещё не куплена, строка не рисуется вовсе:
                     отсутствие лиц и так читается, а лишняя строка у каждой
                     из десятков позиций — тот самый перегруз, который заказчик
                     читает как брак (07.08.2026, «убирать, а не добавлять»). */
                  <span className="truncate text-micro text-accent-text">
                    куплено, но покупатель не отмечен — в перерасчёт не попадёт
                  </span>
                ) : null
              ) : null
            }
            right={money(cost, S.doc)}
            rightHint={hasFact ? 'стоимость, факт' : 'стоимость, план'}
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
                  saved.current = true
                  onPatch(p.i, (x) => { saveNameOrUrl(x, v) })
                  const u = safeUrl(v)
                  if (u) grab(u)
                }}
                onEditEnd={
                  isFresh
                    ? () => {
                        const ok = saved.current
                        saved.current = false
                        onFreshEnd(p.i, ok)
                      }
                    : undefined
                }
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
                на всех — потому что всё равно кто-то один будет оплачивать»
                и 06.08.2026: «кто покупает — там должны быть галочки, можно
                отметить одного или двух; купил Макс — галочку поставил, идёт
                в перерасчёт». Орган — тот же `Box`, что у «куплено» и «берём». */}
            <div className="mt-2 border-t border-line/50 pt-2">
              <div className="text-micro font-semibold text-muted">Кто покупает</div>
              {/* Подсказка — правило, а не жест (постулат 7). */}
              <div className="text-micro leading-snug text-muted">
                Галочка — этот человек берёт остаток количества; число рядом идёт
                в перерасчёт
              </div>
              {people.map((who) => {
                const qty = buyerQty(p, who.id)
                const on = qty > 0
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
                    {on ? (
                      <InlineNum
                        value={qty}
                        can={perms.canMark(who.id)}
                        label={`${who.name} покупает: сколько берёт на себя`}
                        kind="plain"
                        digits={digitsOf(qty)}
                        onSave={(v) => onPatch(p.i, (x) => setBuyer(x, who.id, v, perms.me))}
                        className="text-body font-semibold text-ink"
                      />
                    ) : null}
                    <Box
                      on={on}
                      can={perms.canMark(who.id)}
                      label={`${who.name} покупает`}
                      /* Галочка кладёт ОСТАТОК количества позиции, а не единицу:
                         «купил 8 рулонов — галочку поставил» (см. `restQty`). */
                      onToggle={() =>
                        onPatch(p.i, (x) =>
                          setBuyer(x, who.id, on ? 0 : restQty(p, who.id), perms.me),
                        )
                      }
                    />
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
              {/* «по сколько частей между участниками» — 08.08.2026. Считается
                  теми же правилами, что и весь зачёт (`lib/settle.ts`). */}
              <SpendSplitLine split={buySplit(p, S)} S={S} className="mt-1" />
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

