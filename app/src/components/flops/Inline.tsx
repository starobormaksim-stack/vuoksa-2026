import {
  useEffect, useId, useRef, useState,
  type KeyboardEvent as ReactKeyboardEvent, type ReactNode,
} from 'react'
import { ChevronDown, Minus, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Правка НА МЕСТЕ — фундамент второй версии интерфейса.
 *
 * ⚠️ Прежнее правило «список показывает — шторка редактирует» ОТМЕНЕНО заказчиком
 * 04.08.2026: «мне не нужен поп-ап, в котором всё написано; это прямо вот здесь,
 * в этой таблице уже должно быть». Поэтому здесь живут кирпичи, которыми
 * собираются все таблицы сервиса: текст, число, счётчик, вставка строки.
 *
 * Три правила на все компоненты этого файла:
 *
 * 1. Нет права правки — интерактива НЕТ ВОВСЕ (постулат 5). Не серая кнопка,
 *    не отказ по нажатию, а просто текст. Пунктирное подчёркивание `.editable`
 *    рисуется только тому, кто действительно может править: оно обещает действие.
 * 2. Поле ввода набирается 16 px всегда. Всё, что мельче, iOS встречает
 *    принудительным зумом страницы при фокусе — и человек оказывается
 *    на увеличенной странице, из которой не выбраться (см. --text-field).
 * 3. Отказ объясняется словами прямо под полем (постулат 4). Молча вернуть
 *    прежнее значение нельзя: человек решит, что сервис сломан.
 */

/** Общий вид поля ввода в состоянии правки — одинаковый во всём сервисе. */
const FIELD =
  'w-full rounded-md border border-accent bg-surface px-2 py-1 text-field text-ink ' +
  'outline-none selection:bg-accent-soft'

/* ──────────────────────────────────────────────────────────────────────────
   Текст
   ────────────────────────────────────────────────────────────────────────── */

interface InlineTextProps {
  value: string
  /** сохранить; вызывается только когда значение действительно изменилось */
  onSave: (v: string) => void
  /** есть ли право правки; нет — рисуется обычный текст без намёка на действие */
  can: boolean
  /** что именно правим — читает скринридер и видит человек в подсказке поля */
  label: string
  /** описание вместо названия: несколько строк и другой размер */
  multiline?: boolean
  /** пустым оставлять нельзя — например название позиции */
  required?: boolean
  /** что показать вместо пустого значения */
  placeholder?: string
  /** оформление текста в покое; поле ввода наследует ширину, но не размер */
  className?: string
  /** новая строка: открыться сразу в правке, чтобы было видно, куда вводить */
  autoEdit?: boolean
  /** правка закончилась (сохранением или отменой) — снять подсветку новой строки */
  onEditEnd?: () => void
  /**
   * Правка поверх фотографии (обложка поездки): подсветка наведения кремовая,
   * а не светлым токеном страницы. Светлое пятно на снимке съедает контраст
   * текста, и надпись становится нечитаемой ровно в момент наведения.
   */
  onPhoto?: boolean
}

/** Подсветка наведения: на странице — поверхность чередования, на снимке — крем. */
function hoverSkin(onPhoto?: boolean) {
  return onPhoto
    ? 'hover:bg-brand-cream/12 active:bg-brand-cream/20'
    : 'hover:bg-zebra/70 active:bg-zebra'
}

export function InlineText({
  value, onSave, can, label, multiline, required, placeholder, className,
  autoEdit, onEditEnd, onPhoto,
}: InlineTextProps) {
  const [edit, setEdit] = useState(!!autoEdit && can)
  const [draft, setDraft] = useState(value)
  const [why, setWhy] = useState('')
  const errId = useId()
  const ref = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null)

  /* Значение могло измениться у соседа по документу, пока строка не правится. */
  useEffect(() => {
    if (!edit) setDraft(value)
  }, [value, edit])

  useEffect(() => {
    if (!edit) return
    const el = ref.current
    if (!el) return
    el.focus()
    el.select()
  }, [edit])

  const close = () => {
    setEdit(false)
    setWhy('')
    onEditEnd?.()
  }

  /**
   * Сохранить.
   *
   * `byBlur` — уход фокуса, а не нажатие Enter. Разница важна на телефоне:
   * там нет клавиши Esc, и «вернуть фокус в пустое обязательное поле» означало бы
   * западню — выйти из правки нельзя вовсе. Поэтому при уходе фокуса пустое
   * обязательное поле молча возвращается к прежнему значению (если оно было),
   * а объяснение показывается только когда человек сам нажал Enter.
   */
  const commit = (byBlur?: boolean) => {
    const next = draft.trim()
    if (required && !next) {
      if (byBlur) {
        /* Прежнего значения тоже нет — новая строка: отпускаем как есть,
           такую строку раздел показывает как «Без названия» и даёт удалить. */
        if (value) setDraft(value)
        close()
        return
      }
      setWhy(`${label} не может остаться пустым`)
      ref.current?.focus()
      return
    }
    if (next !== value) onSave(next)
    close()
  }

  const cancel = () => {
    setDraft(value)
    close()
  }

  const keys = (e: ReactKeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      cancel()
      return
    }
    /* В описании Enter — это перенос строки, сохраняет Ctrl+Enter или уход фокуса. */
    if (e.key === 'Enter' && (!multiline || e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      commit(false)
    }
  }

  if (!can) {
    return (
      <span className={cn('block text-pretty', !value && 'text-muted', className)}>
        {value || placeholder || ''}
      </span>
    )
  }

  if (edit) {
    const common = {
      ref: ref as never,
      value: draft,
      onChange: (e: { target: { value: string } }) => setDraft(e.target.value),
      onBlur: () => commit(true),
      onKeyDown: keys,
      'aria-label': label,
      'aria-describedby': why ? errId : undefined,
      placeholder,
      className: cn(FIELD, multiline && 'resize-none leading-snug'),
    }
    return (
      <span className="block">
        {multiline ? <textarea {...common} rows={2} /> : <input {...common} type="text" />}
        {why ? (
          <span id={errId} role="alert" className="mt-1 block text-micro text-accent-text">
            {why}
          </span>
        ) : (
          <span className="mt-1 block text-micro text-muted">
            {multiline ? 'Ctrl + Enter — сохранить' : 'Enter — сохранить'} · Esc — отменить
          </span>
        )}
      </span>
    )
  }

  return (
    <button
      type="button"
      onClick={() => setEdit(true)}
      aria-label={`${label}. Изменить`}
      className={cn(
        /* Зона нажатия у названия и описания намеренно совпадает с их текстом:
           строка целиком под кнопку не отдана, иначе тап по описанию правил бы
           название. Высоту до 44 px добирает сама строка таблицы. */
        '-mx-1 block w-[calc(100%+0.5rem)] rounded-md px-1 py-0.5 text-left transition-colors',
        hoverSkin(onPhoto),
      )}
    >
      <span className={cn('editable block text-pretty', !value && 'text-muted', className)}>
        {value || placeholder || '—'}
      </span>
    </button>
  )
}

/* ──────────────────────────────────────────────────────────────────────────
   Число
   ────────────────────────────────────────────────────────────────────────── */

interface InlineNumProps {
  value: number
  onSave: (v: number) => void
  can: boolean
  label: string
  /** единица после числа — «км», «₽», «л»; ставится через неразрывный пробел */
  unit?: string
  /** шаг счётчика; 0 — счётчика нет, только поле */
  step?: number
  min?: number
  max?: number
  /** сколько знаков после запятой показывать в покое */
  digits?: number
  className?: string
  /** counter — со стрелками, plain — только поле (для длинных сумм) */
  kind?: 'counter' | 'plain'
  /** правка поверх фотографии: подсветка кремом (см. InlineText.onPhoto) */
  onPhoto?: boolean
  /** стопкой: число сверху, кнопки −/+ под ним — для узких колонок таблицы */
  stack?: boolean
}

/** Показ числа: разряды пробелами, дробная часть запятой — как в таблице заказчика. */
export function numText(v: number, digits = 0) {
  const s = v.toFixed(digits)
  const [i, f] = s.split('.')
  const head = i.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  return f ? `${head},${f}` : head
}

export function InlineNum({
  value, onSave, can, label, unit, step = 1, min = 0, max, digits = 0,
  className, kind = 'counter', onPhoto, stack,
}: InlineNumProps) {
  const [edit, setEdit] = useState(false)
  const [draft, setDraft] = useState(String(value))
  const [why, setWhy] = useState('')
  const errId = useId()
  const ref = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (!edit) setDraft(String(value))
  }, [value, edit])

  useEffect(() => {
    if (edit) {
      ref.current?.focus()
      ref.current?.select()
    }
  }, [edit])

  const clamp = (n: number) => {
    if (max != null && n > max) return max
    if (n < min) return min
    return n
  }

  const commit = () => {
    /* Запятая — то, что человек наберёт на русской раскладке телефона. */
    const n = Number(draft.replace(',', '.').replace(/\s/g, ''))
    if (!Number.isFinite(n)) {
      setWhy('Нужно число')
      ref.current?.focus()
      return
    }
    const next = clamp(n)
    if (next !== value) onSave(next)
    setEdit(false)
    setWhy('')
  }

  const bump = (d: number) => {
    const next = clamp(value + d)
    if (next !== value) onSave(next)
  }

  const shown = (
    <span className={cn('tnum', className)}>
      {numText(value, digits)}
      {unit ? <>&#160;{unit}</> : null}
    </span>
  )

  if (!can) return shown

  if (edit) {
    return (
      <span className="block">
        <input
          ref={ref}
          /* inputMode, а не type="number": на телефоне нужна цифровая клавиатура,
             а стрелки-крутилки type="number" ломают вёрстку узкой ячейки. */
          type="text"
          inputMode="decimal"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              commit()
            }
            if (e.key === 'Escape') {
              e.preventDefault()
              setDraft(String(value))
              setEdit(false)
              setWhy('')
            }
          }}
          aria-label={label}
          aria-describedby={why ? errId : undefined}
          className={cn(FIELD, 'tnum text-right')}
        />
        {why ? (
          <span id={errId} role="alert" className="mt-1 block text-micro text-accent-text">
            {why}
          </span>
        ) : null}
      </span>
    )
  }

  const field = (
    <button
      type="button"
      onClick={() => setEdit(true)}
      aria-label={`${label}: ${numText(value, digits)}${unit ? ' ' + unit : ''}. Изменить`}
      className={cn('-mx-1 rounded-md px-1 py-0.5 transition-colors', hoverSkin(onPhoto))}
    >
      <span className="editable">{shown}</span>
    </button>
  )

  if (kind === 'plain' || step === 0) return field

  /* В узкой колонке таблицы ряд «− число +» встаёт впритык, а на пятизначных
     количествах («Наличные деньги, 10 000») вылезает за ячейку. Поэтому у стопки
     число стоит сверху, а кнопки под ним — ширина ячейки перестаёт быть помехой. */
  if (stack) {
    return (
      <span className="inline-flex flex-col items-center gap-1">
        {field}
        <span className="inline-flex items-center gap-2">
          <StepBtn dir="minus" label={`${label}: меньше`} onClick={() => bump(-step)} off={value <= min} />
          <StepBtn
            dir="plus"
            label={`${label}: больше`}
            onClick={() => bump(step)}
            off={max != null && value >= max}
          />
        </span>
      </span>
    )
  }

  return (
    <span className="inline-flex items-center gap-1">
      <StepBtn dir="minus" label={`${label}: меньше`} onClick={() => bump(-step)} off={value <= min} />
      {field}
      <StepBtn
        dir="plus"
        label={`${label}: больше`}
        onClick={() => bump(step)}
        off={max != null && value >= max}
      />
    </span>
  )
}

/**
 * Кнопка счётчика. Видимый кружок 28 px, зона нажатия — 44 px невидимым слоем:
 * в узкой ячейке таблицы кружок в 44 px не помещается, а промахиваться пальцем
 * человек не должен (постулат 7).
 */
function StepBtn({
  dir, label, onClick, off,
}: {
  dir: 'minus' | 'plus'
  label: string
  onClick: () => void
  off?: boolean
}) {
  if (off) return <span className="size-7 shrink-0" aria-hidden />
  const Icon = dir === 'minus' ? Minus : Plus
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        'relative grid size-7 shrink-0 place-items-center rounded-full border border-line-strong',
        /* Наведение подсвечивает фон и НЕ меняет цвет текста: перекрашивание
           надписи под курсором заказчик назвал «неадекватной подсветкой». */
        'text-muted transition-colors hover:bg-zebra/70',
        'active:scale-95',
        /* Невидимое расширение зоны нажатия до 44 × 44. */
        'before:absolute before:-inset-2 before:content-[""]',
      )}
    >
      <Icon size={14} strokeWidth={1.75} aria-hidden />
    </button>
  )
}

/* ──────────────────────────────────────────────────────────────────────────
   Выбор из списка
   ────────────────────────────────────────────────────────────────────────── */

export interface InlinePickOption {
  id: string
  title: string
  /** пояснение под названием варианта — правило, а не жест */
  note?: string
}

/**
 * Выбор из готового списка ПРЯМО В СТРОКЕ.
 *
 * Последнее, ради чего в разделах ещё оставались шторки: вид техники, топливо,
 * категория аренды, метка точки, единица измерения. Заказчик отменил попапы
 * везде, где можно, — значит и здесь.
 *
 * Список раскрывается под значением и толкает строку вниз, а не всплывает поверх:
 * всплывающий слой — это тот же попап, и он же приносит с собой беду с зависшей
 * подложкой, из-за которой «ничего не нажимается» (см. index.css).
 *
 * ⚠️ Нативный `<select>` намеренно не используется: в тёмной теме браузер рисует
 * его список системными цветами, и он читается плохо — проверено в прошлой сессии.
 */
export function InlinePick({
  value, options, onPick, can, label, placeholder, allowFree, onFree, className,
}: {
  /** id выбранного варианта; пусто — ничего не выбрано */
  value: string
  options: InlinePickOption[]
  onPick: (id: string) => void
  can: boolean
  label: string
  placeholder?: string
  /** можно вписать своё слово, которого нет в справочнике (единицы измерения) */
  allowFree?: boolean
  onFree?: (text: string) => void
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const chosen = options.find((o) => o.id === value)
  const shown = chosen?.title || placeholder || '—'

  if (!can) return <span className={cn('block', !chosen && 'text-muted', className)}>{shown}</span>

  return (
    <span className="block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={`${label}: ${shown}. Выбрать`}
        className={cn(
          '-mx-1 flex w-[calc(100%+0.5rem)] items-center gap-1 rounded-md px-1 py-0.5 text-left transition-colors',
          'hover:bg-zebra/70 active:bg-zebra',
        )}
      >
        <span className={cn('editable min-w-0 flex-1 truncate', !chosen && 'text-muted', className)}>
          {shown}
        </span>
        <ChevronDown
          size={16}
          strokeWidth={1.75}
          aria-hidden
          className={cn('shrink-0 text-muted transition-transform', open && 'rotate-180')}
        />
      </button>

      {open && (
        <span className="mt-1 block overflow-hidden rounded-md border border-line bg-surface">
          {options.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => {
                onPick(o.id)
                setOpen(false)
              }}
              className={cn(
                'flex min-h-11 w-full flex-col justify-center px-3 py-1.5 text-left transition-colors',
                'hover:bg-zebra/70 active:bg-zebra',
                o.id === value && 'bg-accent-soft',
              )}
            >
              <span className="text-body text-ink">{o.title}</span>
              {o.note ? <span className="text-micro text-muted">{o.note}</span> : null}
            </button>
          ))}
          {allowFree && onFree ? (
            <span className="block border-t border-line px-3 py-2">
              <InlineText
                value={chosen ? '' : value}
                onSave={(v) => {
                  onFree(v)
                  setOpen(false)
                }}
                can
                label={`${label}: своё слово`}
                placeholder="Вписать своё"
                className="text-body text-ink"
              />
            </span>
          ) : null}
        </span>
      )}
    </span>
  )
}

/* ──────────────────────────────────────────────────────────────────────────
   Вставка строки в любом месте
   ────────────────────────────────────────────────────────────────────────── */

/**
 * Полоса между строками: «я не должен листать до самого конца, чтобы добавить
 * ещё одну вещь» (заказчик, 04.08.2026).
 *
 * На десктопе полоса невидима, пока на неё не навели, — иначе между каждой парой
 * строк висело бы по кнопке и таблица превратилась бы в решето. На телефоне
 * наведения нет, поэтому там вставку даёт «Вставить строку ниже» в действиях
 * самой строки (см. RowActions).
 */
export function RowInsert({ onInsert, label }: { onInsert: () => void; label: string }) {
  return (
    <div className="relative hidden h-0 lg:block">
      <button
        type="button"
        onClick={onInsert}
        aria-label={label}
        className={cn(
          'group absolute inset-x-0 -top-2 z-10 grid h-4 w-full place-items-center',
          'opacity-0 transition-opacity focus-visible:opacity-100 hover:opacity-100',
        )}
      >
        <span className="absolute inset-x-4 h-px bg-accent" aria-hidden />
        <span
          className="relative grid size-5 place-items-center rounded-full bg-accent text-on-accent"
          aria-hidden
        >
          <Plus size={12} strokeWidth={1.75} />
        </span>
      </button>
    </div>
  )
}

/* ──────────────────────────────────────────────────────────────────────────
   Шапка колонки: человек
   ────────────────────────────────────────────────────────────────────────── */

/**
 * Квадратная фотография человека с именем под ней — шапка колонки в таблицах
 * сборов. Заказчик: «фотография должна быть такой же квадратной, только будет
 * написано только слово „Костя“».
 *
 * ⚠️ Снимок НЕ кадрируется: `object-contain` показывает его целиком, а пустоту
 * по краям закрывает размытая копия того же снимка. `object-cover` срезал людям
 * головы — заказчик жаловался на это дважды («всё равно обрезается по углам»).
 */
export function PersonHead({
  name, photo, ini, size = 40, mine,
}: {
  name: string
  photo?: string
  ini?: string
  size?: number
  /** колонка читателя — свою человек ищет первой */
  mine?: boolean
}) {
  return (
    <span className="flex min-w-0 flex-col items-center gap-1">
      <span
        className={cn(
          'relative grid shrink-0 place-items-center overflow-hidden rounded-lg bg-zebra',
          mine && 'ring-2 ring-accent',
        )}
        style={{ width: size, height: size }}
        aria-hidden
      >
        {photo ? (
          <>
            <img src={photo} alt="" className="absolute inset-0 size-full scale-110 object-cover blur-md" />
            <img src={photo} alt="" className="relative size-full object-contain" />
          </>
        ) : (
          <span className="text-micro font-semibold text-ink">{ini || name.slice(0, 2)}</span>
        )}
      </span>
      <span className="max-w-full truncate text-micro font-semibold text-ink">{name}</span>
    </span>
  )
}

/* ──────────────────────────────────────────────────────────────────────────
   Действия строки
   ────────────────────────────────────────────────────────────────────────── */

/**
 * Действия в самой строке, а не в шторке (постулат 2). Рисуются тихо: на десктопе
 * проявляются при наведении на строку (`group-hover`), на телефоне видны всегда,
 * потому что наведения там не существует.
 *
 * Пустой список действий не рисует ничего — так участник без прав не видит
 * ни серых кнопок, ни заглушек (постулат 5).
 */
export function RowActions({ children }: { children: ReactNode }) {
  const items = Array.isArray(children) ? children.filter(Boolean) : children
  if (!items || (Array.isArray(items) && items.length === 0)) return null
  return (
    <span className="flex shrink-0 items-center gap-0.5 opacity-100 transition-opacity lg:opacity-0 lg:group-focus-within:opacity-100 lg:group-hover:opacity-100">
      {items}
    </span>
  )
}

/** Одно действие строки: значок 18 px, зона нажатия 44 × 44, подпись словами. */
export function RowAction({
  icon: Icon, label, onClick, tone = 'muted',
}: {
  icon: typeof Plus
  label: string
  onClick: () => void
  tone?: 'muted' | 'danger'
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        'grid size-11 shrink-0 place-items-center rounded-md transition-colors active:scale-95',
        /* И удаление, и обычное действие в покое приглушены — премиальность
           это сдержанность. Под курсором меняется только фон. */
        tone === 'danger' ? 'text-muted hover:bg-accent-soft' : 'text-muted hover:bg-zebra/70',
      )}
    >
      <Icon size={18} strokeWidth={1.75} aria-hidden />
    </button>
  )
}
