import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { startOfDay } from '../../format'

/**
 * Всплывающий календарь диапазона дат: русская локаль, понедельник — первый день.
 * Свой лёгкий компонент, без сторонних библиотек. Права пока не проверяем — менять могут все.
 */

const MONTHS_NOM = [
  'январь', 'февраль', 'март', 'апрель', 'май', 'июнь',
  'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь',
]
const WEEKDAYS = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс']

interface Props {
  start: Date
  end: Date
  onCancel: () => void
  onDone: (start: Date, end: Date) => void
}

function sameDay(a: Date | null, b: Date | null): boolean {
  return !!a && !!b && a.getTime() === b.getTime()
}

export function DateRangePicker({ start, end, onCancel, onDone }: Props) {
  const [selStart, setSelStart] = useState<Date | null>(() => startOfDay(start))
  const [selEnd, setSelEnd] = useState<Date | null>(() => startOfDay(end))
  const [view, setView] = useState(() => ({ y: start.getFullYear(), m: start.getMonth() }))

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  const first = new Date(view.y, view.m, 1)
  const lead = (first.getDay() + 6) % 7 // понедельник — первый
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate()
  const today = startOfDay(new Date())

  const pick = (d: Date) => {
    if (!selStart || (selStart && selEnd)) {
      setSelStart(d)
      setSelEnd(null)
    } else if (d.getTime() < selStart.getTime()) {
      setSelStart(d)
    } else {
      setSelEnd(d)
    }
  }

  const shift = (delta: number) => {
    setView(({ y, m }) => {
      const next = new Date(y, m + delta, 1)
      return { y: next.getFullYear(), m: next.getMonth() }
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Даты поездки"
    >
      <button
        type="button"
        aria-label="Закрыть календарь"
        onClick={onCancel}
        className="absolute inset-0 cursor-default bg-brand-dark/40"
      />
      <div className="relative w-full max-w-[356px] rounded-xl border border-line bg-surface p-4 shadow-lg">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => shift(-1)}
            aria-label="Предыдущий месяц"
            className="grid size-11 place-items-center rounded-lg text-muted hover:bg-zebra hover:text-ink"
          >
            <ChevronLeft size={20} strokeWidth={1.75} aria-hidden />
          </button>
          <div className="text-head font-bold" aria-live="polite">
            {MONTHS_NOM[view.m]} <span className="tnum">{view.y}</span>
          </div>
          <button
            type="button"
            onClick={() => shift(1)}
            aria-label="Следующий месяц"
            className="grid size-11 place-items-center rounded-lg text-muted hover:bg-zebra hover:text-ink"
          >
            <ChevronRight size={20} strokeWidth={1.75} aria-hidden />
          </button>
        </div>

        <div className="mt-2 grid grid-cols-7 text-center">
          {WEEKDAYS.map((w) => (
            <div key={w} className="py-1 text-micro font-semibold text-muted">
              {w}
            </div>
          ))}
          {Array.from({ length: lead }, (_, idx) => (
            <div key={`lead-${idx}`} />
          ))}
          {Array.from({ length: daysInMonth }, (_, idx) => {
            const d = new Date(view.y, view.m, idx + 1)
            const isStart = sameDay(d, selStart)
            const isEnd = sameDay(d, selEnd)
            const inRange =
              !!selStart && !!selEnd &&
              d.getTime() > selStart.getTime() && d.getTime() < selEnd.getTime()
            const isToday = sameDay(d, today)

            let cls = 'text-ink hover:bg-zebra'
            if (inRange) cls = 'bg-accent-soft text-ink'
            if (isStart || isEnd) cls = 'bg-accent-fill font-bold text-on-accent'
            return (
              <button
                key={idx + 1}
                type="button"
                onClick={() => pick(d)}
                aria-pressed={isStart || isEnd}
                aria-label={`${idx + 1} ${MONTHS_NOM[view.m]} ${view.y}`}
                className={`tnum mx-auto grid size-11 place-items-center rounded-lg text-body transition-colors ${cls} ${
                  isToday && !isStart && !isEnd ? 'ring-1 ring-accent ring-inset' : ''
                }`}
              >
                {idx + 1}
              </button>
            )
          })}
        </div>

        <p className="mt-2 min-h-5 text-center text-note text-muted" aria-live="polite">
          {!selStart && 'Выберите день выезда'}
          {selStart && !selEnd && 'Теперь — день возвращения'}
        </p>

        <div className="mt-2 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="min-h-11 rounded-lg px-4 font-semibold text-muted hover:bg-zebra hover:text-ink"
          >
            Отмена
          </button>
          <button
            type="button"
            disabled={!selStart || !selEnd}
            onClick={() => selStart && selEnd && onDone(selStart, selEnd)}
            className="min-h-11 rounded-lg bg-accent-fill px-5 font-semibold text-on-accent shadow-sm transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Готово
          </button>
        </div>
      </div>
    </div>
  )
}
