import { useCallback, useEffect, useRef, useState } from 'react'
import { Minus, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { ResponsiveSheet } from './ResponsiveSheet'
import { Btn } from './Btn'
import { fmtNum, MDASH, NBSP } from '@/format'
import { nameAcc } from '@/lib/gearx'

/**
 * Правка одного числа (docs/v2-ux-redesign.md, 4.3).
 * Ответ на «неудобно вводить в поля с пунктиром»: −/+ 56×56, пресеты,
 * клавиатура — только по кнопке «Ввести точно». Изменения применяются сразу,
 * при закрытии — тост с «Отменить».
 */

/** Смысл числа: от него зависят шаг и пресеты. */
export type NumKind =
  | 'qty' | 'price' | 'km' | 'l100' | 'lh' | 'hours'
  | 'litres' | 'days' | 'count' | 'fuelPrice' | 'coeff'

interface Preset {
  /** 'set' — поставить значение, 'add' — прибавить */
  t: 'set' | 'add'
  v: number
}

interface StepDef {
  step: number
  frac: number
  min: number
  presets: Preset[]
}

const STEPS: Record<NumKind, StepDef> = {
  qty:       { step: 1,   frac: 0, min: 0, presets: [1, 2, 3, 4].map((v) => ({ t: 'set' as const, v })) },
  count:     { step: 1,   frac: 0, min: 0, presets: [1, 2, 3].map((v) => ({ t: 'set' as const, v })) },
  price:     { step: 10,  frac: 0, min: 0, presets: [-100, 100, 500, 1000].map((v) => ({ t: 'add' as const, v })) },
  km:        { step: 5,   frac: 0, min: 0, presets: [10, 50, 100].map((v) => ({ t: 'add' as const, v })) },
  l100:      { step: 0.5, frac: 1, min: 0, presets: [7, 8.5, 10, 12].map((v) => ({ t: 'set' as const, v })) },
  lh:        { step: 0.5, frac: 1, min: 0, presets: [1.5, 2.5, 5].map((v) => ({ t: 'set' as const, v })) },
  hours:     { step: 1,   frac: 0, min: 0, presets: [5, 10, 20].map((v) => ({ t: 'set' as const, v })) },
  litres:    { step: 1,   frac: 0, min: 0, presets: [5, 10, 20].map((v) => ({ t: 'set' as const, v })) },
  days:      { step: 1,   frac: 0, min: 0, presets: [3, 5, 7].map((v) => ({ t: 'set' as const, v })) },
  fuelPrice: { step: 0.5, frac: 1, min: 0, presets: [60, 65, 70, 75].map((v) => ({ t: 'set' as const, v })) },
  coeff:     { step: 1,   frac: 0, min: 1, presets: [1, 2].map((v) => ({ t: 'set' as const, v })) },
}

export interface NumberSheetProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  title: string
  subtitle?: string
  value: number
  kind: NumKind
  /** единица рядом с числом: «₽», «шт.», «км», «л» */
  unit?: string
  /** фраза-последствие под числом, пересчитывается на каждый шаг */
  hint?: (v: number) => string
  onChange: (v: number) => void
  onBack?: () => void
  /**
   * Шаг внутри мастера, где сущность ещё не заведена: свой тост об изменении
   * числа не показывать — иначе человек видит «готово» на середине пути.
   * По умолчанию выключено: обычная правка тост показывает.
   */
  quiet?: boolean
  /**
   * Числo назначил другой человек: вместо −/+ показывается «Попросить изменить»
   * (docs/v2-ux-redesign.md, 12.3).
   */
  ask?: { assignerName: string; onAsk: (want: number, why: string) => void }
}

export function NumberSheet(props: NumberSheetProps) {
  const { open, onOpenChange, title, subtitle, value, kind, unit, hint, quiet, onChange, onBack, ask } = props
  const def = STEPS[kind]
  const initial = useRef(value)
  const [exact, setExact] = useState(false)
  const [raw, setRaw] = useState('')
  const [want, setWant] = useState(value)
  const [why, setWhy] = useState('')

  useEffect(() => {
    if (open) {
      initial.current = value
      setExact(false)
      setRaw('')
      setWant(value)
      setWhy('')
    }
    /* value намеренно не в зависимостях: запоминаем ровно то, что было при открытии */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const clamp = useCallback(
    (v: number) => {
      const r = Math.round(v * 10 ** def.frac) / 10 ** def.frac
      return r < def.min ? def.min : r
    },
    [def.frac, def.min],
  )

  /* ── удержание на −/+: через 500 мс шаг каждые 90 мс, после 20 шагов шаг × 10 ── */
  const hold = useRef<{ t1?: number; t2?: number; n: number }>({ n: 0 })
  const stopHold = useCallback(() => {
    if (hold.current.t1) window.clearTimeout(hold.current.t1)
    if (hold.current.t2) window.clearInterval(hold.current.t2)
    hold.current = { n: 0 }
  }, [])

  const bump = useCallback(
    (dir: 1 | -1, fast = false) => {
      const s = def.step * (fast ? 10 : 1)
      onChange(clamp(valueRef.current + dir * s))
    },
    [clamp, def.step, onChange],
  )

  /* Актуальное значение для обработчиков удержания (замыкание не должно устареть). */
  const valueRef = useRef(value)
  valueRef.current = value

  const startHold = useCallback(
    (dir: 1 | -1) => {
      bump(dir)
      hold.current.t1 = window.setTimeout(() => {
        hold.current.t2 = window.setInterval(() => {
          hold.current.n += 1
          bump(dir, hold.current.n > 20)
        }, 90)
      }, 500)
    },
    [bump],
  )

  useEffect(() => stopHold, [stopHold])

  const close = () => {
    const was = initial.current
    const now = valueRef.current
    onOpenChange(false)
    if (!quiet && was !== now) {
      toast(`${title} ${MDASH} ${fmtNum(now, def.frac)}${unit ? NBSP + unit : ''}`, {
        action: { label: 'Отменить', onClick: () => onChange(was) },
      })
    }
  }

  const applyExact = () => {
    const n = parseFloat(String(raw).replace(',', '.'))
    if (!Number.isNaN(n)) onChange(clamp(n))
    setExact(false)
  }

  /* ── режим «попросить изменить»: числа мои руки не трогают ── */
  if (ask) {
    return (
      <ResponsiveSheet
        open={open}
        onOpenChange={onOpenChange}
        onBack={onBack}
        title={title}
        subtitle={`Поставил ${ask.assignerName} ${MDASH} менять может он`}
        footer={
          <Btn
            scale="lg"
            className="w-full"
            onClick={() => {
              ask.onAsk(want, why.trim())
              onOpenChange(false)
              toast(`${ask.assignerName} увидит просьбу поставить ${fmtNum(want, def.frac)}`)
            }}
          >
            Попросить {nameAcc(ask.assignerName)}
          </Btn>
        }
      >
        <div className="tnum py-4 text-center text-hero font-bold text-muted">
          {fmtNum(value, def.frac)}
          {unit ? <span className="ml-1 text-head font-semibold">{unit}</span> : null}
        </div>
        <div className="text-note font-semibold text-muted">Сколько нужно?</div>
        <Stepper
          value={want}
          frac={def.frac}
          unit={unit}
          onMinus={() => setWant(clamp(want - def.step))}
          onPlus={() => setWant(clamp(want + def.step))}
        />
        <label className="mt-4 block">
          <span className="text-note font-semibold text-muted">Почему</span>
          {/* 16 px у поля ввода — не украшение: на меньшем iOS сам зумит страницу при фокусе */}
          <input
            value={why}
            onChange={(e) => setWhy(e.target.value)}
            placeholder="Нужно на смену"
            className="mt-2 h-12 w-full rounded-lg border border-line-strong bg-surface px-3 text-[16px] text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
          />
        </label>
      </ResponsiveSheet>
    )
  }

  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={(v) => (v ? onOpenChange(true) : close())}
      onBack={onBack}
      title={title}
      subtitle={subtitle}
      footer={
        <Btn scale="lg" className="w-full" onClick={close}>
          Готово
        </Btn>
      }
    >
      <Stepper
        value={value}
        frac={def.frac}
        unit={unit}
        onMinus={() => startHold(-1)}
        onPlus={() => startHold(1)}
        onRelease={stopHold}
      />

      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {def.presets.map((p) => (
          <button
            key={`${p.t}${p.v}`}
            type="button"
            onClick={() => onChange(clamp(p.t === 'set' ? p.v : value + p.v))}
            className="tnum h-11 min-w-16 rounded-full border border-line-strong bg-surface px-4 text-body font-semibold text-ink transition-colors hover:bg-zebra"
          >
            {p.t === 'set' ? fmtNum(p.v, def.frac) : (p.v > 0 ? '+' : MINUS) + fmtNum(Math.abs(p.v), 0)}
          </button>
        ))}
      </div>

      {exact ? (
        <div className="mt-4 flex gap-2">
          <input
            autoFocus
            inputMode="decimal"
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && applyExact()}
            placeholder={fmtNum(value, def.frac)}
            aria-label={`${title}: точное значение`}
            className="tnum h-12 min-w-0 flex-1 rounded-lg border border-line-strong bg-surface px-3 text-[16px] font-semibold text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
          />
          <Btn tone="secondary" onClick={applyExact}>
            Поставить
          </Btn>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setExact(true)}
          className="mx-auto mt-4 flex h-11 items-center rounded-md px-4 text-body font-semibold text-accent-text transition-colors hover:bg-zebra"
        >
          Ввести точно
        </button>
      )}

      {hint ? (
        <p className="mt-4 text-center text-note text-muted" aria-live="polite">
          {hint(value)}
        </p>
      ) : null}
    </ResponsiveSheet>
  )
}

/** Минус-знак, а не дефис: он живёт на пресетах «−100». */
const MINUS = '−'

/** Степпер: −/+ 56×56 и крупное число между ними. */
function Stepper({
  value,
  frac,
  unit,
  onMinus,
  onPlus,
  onRelease,
}: {
  value: number
  frac: number
  unit?: string
  onMinus: () => void
  onPlus: () => void
  onRelease?: () => void
}) {
  const btn =
    'grid size-14 shrink-0 place-items-center rounded-lg border border-line-strong bg-surface text-ink transition-colors hover:bg-zebra active:bg-zebra'
  const rel = onRelease
    ? { onPointerUp: onRelease, onPointerLeave: onRelease, onPointerCancel: onRelease }
    : {}
  return (
    <div className="flex items-center justify-center gap-4 py-4">
      <button type="button" aria-label="Меньше" className={btn} onPointerDown={onMinus} {...rel}>
        <Minus size={26} strokeWidth={1.75} aria-hidden />
      </button>
      <div className="min-w-36 text-center" aria-live="polite">
        <span className="tnum text-hero font-bold text-ink">{fmtNum(value, frac)}</span>
        {unit ? <span className="ml-1 text-head font-semibold text-muted">{unit}</span> : null}
      </div>
      <button type="button" aria-label="Больше" className={btn} onPointerDown={onPlus} {...rel}>
        <Plus size={26} strokeWidth={1.75} aria-hidden />
      </button>
    </div>
  )
}
