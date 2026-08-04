import type { ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import type { State } from '@/lib/types'
import { routeKm } from '@/lib/calc'
import { AddRow } from '@/components/flops'
import { fmtNum, NBSP } from '@/format'
import { cn } from '@/lib/utils'
import {
  hoursLabel, kBackWord, kmLabel, litresLabel, rentPer, rentQtyLabel, type NumField,
} from './roadx'

/**
 * Карточка «Исходные данные (правим здесь)» — левая половина листа «Логистика»
 * из таблицы заказчика: все числа, из которых собирается расчёт, одним списком.
 *
 * Строка показывает, шторка правит: тап по любой строке открывает NumberSheet
 * с тем самым числом. Ни одного поля ввода прямо в списке.
 *
 * Подписи и пояснения берутся из документа (nt.<поле>.t, .u, .c) — это те же
 * слова, что стоят в таблице заказчика, и терять их нельзя. Своё название
 * подставляется только там, где в документе подписи нет.
 */

interface Props {
  S: State
  canEdit: boolean
  /** какое число открыть в шторке */
  onNum: (f: NumField) => void
  onAdd: (what: 'transport' | 'rent') => void
  /** полоса «посчитать по карте» — она живёт сразу под расстоянием */
  mapStrip: ReactNode
}

export function RoadInputs({ S, canEdit, onNum, onAdd, mapStrip }: Props) {
  const dist = S.trip.dist
  const nt = dist.nt ?? {}
  const baseKm = dist.src === 'auto' ? dist.auto : dist.manual

  const transport = [...S.transport].sort((a, b) => a.ord - b.ord)
  const rent = [...S.rent].sort((a, b) => a.ord - b.ord)
  /* Топлива показываем те, которыми реально кто-то заправляется: справочник
     держит и дизель с нулём, а пустая строка в списке только мешает. */
  const fuels = [...S.fuelPrices]
    .filter((f) => f.price > 0 || S.transport.some((t) => t.fuel === f.i))
    .sort((a, b) => a.ord - b.ord)

  const go = (f: NumField) => (canEdit ? () => onNum(f) : undefined)

  return (
    <section className="overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">
      <div className="border-b border-line px-4 py-3">
        <h3 className="text-[17px] leading-snug font-[650] text-pretty text-ink">
          Исходные данные (правим здесь)
        </h3>
        <p className="mt-0.5 text-[13px] text-muted">
          Все числа, из которых считается дорога. Ниже они только показываются
        </p>
      </div>

      <Head>Дорога</Head>
      <Field
        label={nt.manual?.t || 'Расстояние в одну сторону'}
        value={`${fmtNum(baseKm, 0)}${NBSP}${nt.manual?.u || 'км'}`}
        note={
          dist.src === 'auto'
            ? ['Считается по карте', nt.manual?.c].filter(Boolean).join(' · ')
            : nt.manual?.c
        }
        onClick={go({ k: 'dist', f: 'manual' })}
      />
      {mapStrip}
      <Field
        label={nt.kBack?.t || 'Коэффициент «туда и обратно»'}
        value={`${fmtNum(dist.kBack, 1)}${NBSP}${nt.kBack?.u || '×'}`}
        note={[kBackWord(dist.kBack), nt.kBack?.c].filter(Boolean).join(' · ')}
        onClick={go({ k: 'dist', f: 'kBack' })}
      />
      <Field
        label={nt.local?.t || 'Местные разъезды'}
        value={`${fmtNum(dist.local, 0)}${NBSP}${nt.local?.u || 'км'}`}
        note={nt.local?.c}
        onClick={go({ k: 'dist', f: 'local' })}
      />
      <div className="flex items-center gap-3 border-b border-line/70 bg-zebra/40 px-4 py-3">
        <span className="min-w-0 flex-1 text-[15px] font-[650] text-ink">Пробег на поездку</span>
        <span className="tnum shrink-0 text-[20px] font-bold text-ink">{kmLabel(routeKm(S))}</span>
      </div>

      <Head>Цены на топливо</Head>
      {fuels.length === 0 ? (
        <Empty>Цены ещё не вписаны.</Empty>
      ) : (
        fuels.map((f) => (
          <Field
            key={f.i}
            label={f.nt?.price?.t || `Цена ${f.n}`}
            value={`${fmtNum(f.price, 1)}${NBSP}${f.nt?.price?.u || f.u || '₽/л'}`}
            note={f.nt?.price?.c || f.c}
            onClick={go({ k: 'fuel', id: f.i })}
          />
        ))
      )}

      <Head>Техника</Head>
      {transport.length === 0 ? (
        <Empty>Техники пока нет — добавьте машину, мотор или бензопилу.</Empty>
      ) : (
        transport.map((t) => {
          const tnt = t.nt ?? {}
          /* У каждой единицы техники правится ровно то, от чего зависят её литры:
             у машины — расход, у мотора — моточасы и расход, у пилы — готовый объём. */
          if (t.rateU === 'lh') {
            return (
              <div key={t.i}>
                <Field
                  label={tnt.hours?.t || `Моточасы: ${t.n}`}
                  value={hoursLabel(t.hours)}
                  note={tnt.hours?.c}
                  onClick={go({ k: 'tr', id: t.i, f: 'hours' })}
                />
                <Field
                  label={tnt.rate?.t || `Расход: ${t.n}`}
                  value={`${fmtNum(t.rate, 1)}${NBSP}${tnt.rate?.u || 'л/ч'}`}
                  note={tnt.rate?.c}
                  onClick={go({ k: 'tr', id: t.i, f: 'rate' })}
                />
              </div>
            )
          }
          if (t.rateU === 'fix') {
            return (
              <Field
                key={t.i}
                label={tnt.litres?.t || `Заливаем разом: ${t.n}`}
                value={litresLabel(t.litres)}
                note={tnt.litres?.c}
                onClick={go({ k: 'tr', id: t.i, f: 'litres' })}
              />
            )
          }
          return (
            <Field
              key={t.i}
              label={tnt.rate?.t || `Расход: ${t.n}`}
              value={`${fmtNum(t.rate, 1)}${NBSP}${tnt.rate?.u || 'л/100 км'}`}
              note={tnt.rate?.c}
              onClick={go({ k: 'tr', id: t.i, f: 'rate' })}
            />
          )
        })
      )}
      {canEdit && <AddRow label="Добавить технику" onClick={() => onAdd('transport')} />}

      <Head>Аренда</Head>
      {rent.length === 0 ? (
        <Empty>Ничего не арендуем: ни лодки, ни парковки, ни домика.</Empty>
      ) : (
        rent.map((r) => {
          const rnt = r.nt ?? {}
          return (
            <div key={r.i}>
              <Field
                label={rnt.price?.t || `Цена: ${r.n}`}
                value={`${fmtNum(r.price, 0)}${NBSP}${rnt.price?.u || '₽'}`}
                note={[rentPer(r), rnt.price?.c].filter(Boolean).join(' · ')}
                onClick={go({ k: 'rent', id: r.i, f: 'price' })}
              />
              <Field
                label={rnt.qty?.t || `Сколько берём: ${r.n}`}
                value={rentQtyLabel(r)}
                note={rnt.qty?.c}
                onClick={go({ k: 'rent', id: r.i, f: 'qty' })}
              />
              {r.count > 1 || rnt.count ? (
                <Field
                  label={rnt.count?.t || `Штук: ${r.n}`}
                  value={`${fmtNum(r.count, 0)}${NBSP}${rnt.count?.u || 'шт.'}`}
                  note={rnt.count?.c}
                  onClick={go({ k: 'rent', id: r.i, f: 'count' })}
                />
              ) : null}
            </div>
          )
        })
      )}
      {canEdit && <AddRow label="Добавить аренду" onClick={() => onAdd('rent')} />}
    </section>
  )
}

/** Подзаголовок группы полей — как в таблице, где строки идут блоками. */
function Head({ children }: { children: ReactNode }) {
  return (
    <h4 className="border-b border-line/70 bg-zebra/40 px-4 py-2 text-[13px] font-bold text-muted">
      {children}
    </h4>
  )
}

function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="border-b border-line/70 px-4 py-3 text-[15px] leading-snug text-muted">
      {children}
    </p>
  )
}

/**
 * Строка исходного данного: подпись из документа, значение и шеврон.
 *
 * Подпись длинная («Расстояние Дворцовая → Приозерск (в одну сторону)»), поэтому
 * она переносится, а не обрезается: при 390 px строка обязана складываться вниз,
 * а не уезжать вбок. Правки нет — та же строка без кнопки и без шеврона.
 */
function Field({
  label,
  value,
  note,
  onClick,
}: {
  label: string
  value: string
  note?: string
  onClick?: () => void
}) {
  const body = (
    <>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] leading-snug font-medium text-pretty text-ink">
          {label}
        </span>
        {note ? (
          <span className="mt-0.5 block text-[13px] leading-snug text-muted">{note}</span>
        ) : null}
      </span>
      <span className="tnum shrink-0 text-[15px] font-semibold text-ink">{value}</span>
      {onClick && (
        <ChevronRight size={18} strokeWidth={1.5} aria-hidden className="shrink-0 text-muted" />
      )}
    </>
  )

  const shell = 'flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-left'

  return (
    <div className="border-b border-line/70">
      {onClick ? (
        <button
          type="button"
          onClick={onClick}
          aria-label={`${label}: ${value}. Изменить`}
          className={cn(shell, 'transition-colors hover:bg-zebra/60')}
        >
          {body}
        </button>
      ) : (
        <div className={shell}>{body}</div>
      )}
    </div>
  )
}
