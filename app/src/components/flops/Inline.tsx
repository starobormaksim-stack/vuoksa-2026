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

/**
 * Второе поле, которое появляется только в правке.
 *
 * Заведено под подпись раздела: с экрана она убрана по слову заказчика, но из
 * документа НЕ выброшена (`S.secTitles[].sub`, уроки У-04 и У-08). Раз значение
 * есть, а править его негде — это дефект по постулату 1. Отдельного органа
 * ради одного поля не заводим: правка названия и правка подписи — одно
 * действие человека, поэтому второе поле живёт внутри того же `InlineText`.
 */
export interface InlineSecond {
  value: string
  label: string
  placeholder?: string
  /** строка-правило под полем: почему значения не видно на экране */
  note?: string
}

/** Одна подсказка под полем правки. */
export interface InlineHit {
  /** чем отличать находки друг от друга в списке */
  id: string
  /** что человек читает крупно */
  title: string
  /** уточнение мельче: полный адрес, район, «примерно» */
  note?: string
}

/**
 * Подсказки прямо под полем правки — «выпадающий список», как при поиске города.
 *
 * ─── Откуда ───
 * Заказчик 08.08.2026 про место поездки и погоду: «Там, где прописывается
 * „впишите локацию“, должен быть выпадающий список… Когда ты ищешь город
 * или что-то такое, допустим, Приозерск». До этого место было простой строкой
 * текста: человек писал «оз. Вуокса», координат у записи не появлялось,
 * и прогноз погоды не за что было зацепить.
 *
 * ⛔ Не всплывает: список встаёт ПОД полем и толкает содержимое вниз, как
 * `InlinePick` (постулат 2 — попапов нет). Ничего не подставляется молча:
 * человек видит находки и выбирает сам, ровно как в строке поиска над картой
 * (`map/MapSearch.tsx`), откуда взяты и состояния «ищем», «не нашлось»,
 * «спросить было некого».
 */
export interface InlineSuggest {
  /**
   * Спросить подсказки по набранному.
   * `null` — спросить было некого (нет сети, служба не ответила);
   * пустой список — честно не нашлось.
   */
  ask: (q: string) => Promise<InlineHit[] | null>
  /** человек выбрал находку; правка после этого закрывается */
  onPick: (hit: InlineHit) => void
  /** строка-правило над списком: что случится с выбранным */
  hint?: string
}

/** Пауза перед запросом подсказок: столько человек «допечатывает» слово. */
const SUGGEST_DELAY = 500
/** Короче трёх букв спрашивать нечего. */
const SUGGEST_MIN = 3

interface InlineTextProps {
  value: string
  /** сохранить; вызывается только когда значение действительно изменилось */
  onSave: (v: string, second?: string) => void
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
  /** второе поле, видимое только в правке (подпись раздела) */
  second?: InlineSecond
  /** подсказки под полем правки: место на карте, город (см. `InlineSuggest`) */
  suggest?: InlineSuggest
}

/** Подсветка наведения: на странице — поверхность чередования, на снимке — крем. */
function hoverSkin(onPhoto?: boolean) {
  return onPhoto
    ? 'hover:bg-brand-cream/12 active:bg-brand-cream/20'
    : 'hover:bg-zebra/70 active:bg-zebra'
}

export function InlineText({
  value, onSave, can, label, multiline, required, placeholder, className,
  autoEdit, onEditEnd, onPhoto, second, suggest,
}: InlineTextProps) {
  const [edit, setEdit] = useState(!!autoEdit && can)
  const [draft, setDraft] = useState(value)
  const [draft2, setDraft2] = useState(second?.value ?? '')
  const [why, setWhy] = useState('')
  const errId = useId()
  const ref = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null)
  /* Оба поля правки живут в одной коробке: уход фокуса ВНУТРИ неё — это переход
     с названия на подпись, а не окончание правки. Без этой проверки первый же
     Tab закрывал бы правку раньше, чем человек дошёл до второго поля. */
  const box = useRef<HTMLSpanElement | null>(null)
  const second2 = second?.value ?? ''

  /* Значение могло измениться у соседа по документу, пока строка не правится. */
  useEffect(() => {
    if (!edit) setDraft(value)
  }, [value, edit])

  useEffect(() => {
    if (!edit) setDraft2(second2)
  }, [second2, edit])

  useEffect(() => {
    if (!edit) return
    const el = ref.current
    if (!el) return
    el.focus()
    el.select()
  }, [edit])

  /* ─── подсказки под полем (место на карте) ───
     Состояния взяты у строки поиска над картой (`map/MapSearch.tsx`): «ищем»,
     «вот что нашлось», «не нашлось», «спросить было некого» — последнее
     отдельно, иначе без сети поле врало бы «ничего не нашлось» (постулат 5). */
  const [hits, setHits] = useState<InlineHit[] | null>(null)
  const [asking, setAsking] = useState(false)
  const [noAsk, setNoAsk] = useState(false)
  /* Ответы приходят не в том порядке, в котором ушли запросы: поздний ответ
     на старую строку затирал бы свежий список. Считаем запросы номерами. */
  const seq = useRef(0)
  /* Объект подсказок приходит новым на каждой отрисовке — держим его ссылкой,
     иначе запрос уходил бы по кругу. */
  const ask = useRef(suggest?.ask)
  ask.current = suggest?.ask

  const wantHints = !!suggest && edit
  useEffect(() => {
    if (!wantHints) return
    const q = draft.trim()
    if (q.length < SUGGEST_MIN) {
      seq.current++
      setHits(null)
      setAsking(false)
      setNoAsk(false)
      return
    }
    const t = window.setTimeout(() => {
      const my = ++seq.current
      setAsking(true)
      void ask.current?.(q).then((list) => {
        if (my !== seq.current) return
        setAsking(false)
        setNoAsk(list === null)
        setHits(list ?? [])
      })
    }, SUGGEST_DELAY)
    return () => window.clearTimeout(t)
  }, [draft, wantHints])

  const close = () => {
    setEdit(false)
    setWhy('')
    seq.current++
    setHits(null)
    setAsking(false)
    setNoAsk(false)
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
    if (second) {
      const sub = draft2.trim()
      /* Второе поле правится вместе с первым: если изменилось любое из двух,
         записываем оба — иначе подпись потерялась бы при правке одного названия. */
      if (next !== value || sub !== second.value) onSave(next, sub)
    } else if (next !== value) onSave(next)
    close()
  }

  const cancel = () => {
    setDraft(value)
    setDraft2(second2)
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
    /* Уход фокуса на соседнее поле той же правки правкой не заканчивает. */
    const leave = (e: { relatedTarget: EventTarget | null }) => {
      const to = e.relatedTarget as Node | null
      if (to && box.current?.contains(to)) return
      commit(true)
    }
    const common = {
      ref: ref as never,
      value: draft,
      onChange: (e: { target: { value: string } }) => setDraft(e.target.value),
      onBlur: leave,
      onKeyDown: keys,
      'aria-label': label,
      'aria-describedby': why ? errId : undefined,
      placeholder,
      className: cn(FIELD, multiline && 'resize-none leading-snug'),
    }
    return (
      <span className="block" ref={box}>
        {multiline ? <textarea {...common} rows={2} /> : <input {...common} type="text" />}
        {second ? (
          <span className="mt-2 block">
            <span className="mb-1 block text-micro font-semibold text-muted">{second.label}</span>
            <input
              type="text"
              value={draft2}
              onChange={(e) => setDraft2(e.target.value)}
              onBlur={leave}
              onKeyDown={keys}
              aria-label={second.label}
              placeholder={second.placeholder}
              /* Поле мельче соседнего (у того кегль названия раздела), поэтому
                 высоту добираем до цели касания явно: 31 px пальцем не берётся. */
              className={cn(FIELD, 'min-h-11 text-field font-normal')}
            />
            {second.note ? (
              <span className="mt-1 block text-micro text-muted">{second.note}</span>
            ) : null}
          </span>
        ) : null}
        {/* ── Подсказки: список ПОД полем, содержимое толкается вниз ── */}
        {suggest && (asking || hits !== null) ? (
          <span className="mt-1 block">
            {asking && hits === null ? (
              <span className="block text-micro text-muted">Ищем на карте…</span>
            ) : null}
            {noAsk ? (
              <span className="block text-micro text-muted">
                Спросить было некого: нет сети или служба поиска не ответила. Название
                сохранится как есть.
              </span>
            ) : null}
            {!noAsk && hits !== null && hits.length === 0 && !asking ? (
              <span className="block text-micro text-muted">
                Ничего не нашлось. Напишите иначе — или оставьте своё название.
              </span>
            ) : null}
            {hits !== null && hits.length > 0 ? (
              <span className="block">
                {suggest.hint ? (
                  <span className="mb-1 block text-micro font-semibold text-muted">
                    {suggest.hint}
                  </span>
                ) : null}
                <span className="block max-h-56 overflow-y-auto rounded-md border border-line">
                  {hits.map((hit) => (
                    <button
                      key={hit.id}
                      type="button"
                      onClick={() => {
                        suggest.onPick(hit)
                        close()
                      }}
                      className="flex min-h-11 w-full flex-col justify-center gap-0.5 border-b border-line/60 px-2 py-1.5 text-left transition-colors last:border-b-0 hover:bg-zebra"
                    >
                      <span className="block text-field leading-tight font-semibold text-ink">
                        {hit.title}
                      </span>
                      {hit.note ? (
                        <span className="block text-micro leading-snug text-muted">{hit.note}</span>
                      ) : null}
                    </button>
                  ))}
                </span>
              </span>
            ) : null}
          </span>
        ) : null}
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
  value, options, onPick, can, label, placeholder, allowFree, onFree, freeText, className,
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
  /**
   * Своё слово, уже вписанное вместо варианта справочника.
   *
   * ⚠️ Показывается вместо подсказки, когда `value` в справочнике не нашлось:
   * у техники со своим видом в документе лежит `kind`, которого в `S.kinds` нет,
   * а название её вида — в отдельном поле `kindT`. Без этого на месте «снегохода»
   * стояло бы общее слово-заглушка, то есть поле документа пропадало бы с экрана
   * (постулат 4).
   */
  freeText?: string
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const chosen = options.find((o) => o.id === value)
  const own = chosen ? '' : (freeText ?? '')
  const shown = chosen?.title || own || placeholder || '—'

  if (!can) {
    return (
      <span className={cn('block', !chosen && !own && 'text-muted', className)}>{shown}</span>
    )
  }

  return (
    <span className="block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={`${label}: ${shown}. Выбрать`}
        className={cn(
          /* Цель нажатия — вся строка выбора и не меньше 44 px по высоте:
             у подписи мелким кеглем видимая высота выходила 26 px, и палец
             промахивался мимо неё (правило «интерактив ≥ 44 × 44»). */
          '-mx-1 flex min-h-11 w-[calc(100%+0.5rem)] items-center gap-1 rounded-md px-1 py-0.5 text-left transition-colors',
          'hover:bg-zebra/70 active:bg-zebra',
        )}
      >
        <span
          className={cn('editable min-w-0 flex-1 truncate', !chosen && !own && 'text-muted', className)}
        >
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
                /* Своё слово живёт либо прямо в `value` (единицы измерения),
                   либо в отдельном поле документа — тогда его подаёт `freeText`. */
                value={chosen ? '' : (freeText ?? value)}
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
 * Действия в самой строке, а не в шторке (постулат 2). Видны ВСЕГДА и на обеих
 * ширинах.
 *
 * ⛔ Прежде на десктопе они проявлялись только при наведении (`lg:opacity-0`
 * + `group-hover`). Заказчик 05.08.2026: «вот эти плюсики и удаление тех или иных
 * строк — они не видны, при наведении только видны… было бы неплохо, чтобы это
 * условно с правой стороны». Действие, о существовании которого человек узнаёт
 * только случайно наведя мышь, — это отсутствующее действие (родня постулата 4).
 *
 * Решето из корзин при этом не получается: значки приглушены (`text-muted`,
 * толщина 1,75), а фон под ними появляется только под курсором — колонка действий
 * читается как поле, а не как ряд кнопок.
 *
 * Пустой список действий не рисует ничего — так участник без прав не видит
 * ни серых кнопок, ни заглушек (постулат 5).
 */
export function RowActions({ children }: { children: ReactNode }) {
  const items = Array.isArray(children) ? children.filter(Boolean) : children
  if (!items || (Array.isArray(items) && items.length === 0)) return null
  return <span className="flex shrink-0 items-center gap-0.5">{items}</span>
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

/**
 * Действие строки, которое СПРАШИВАЕТ. Заказчик 08.08.2026 про технику:
 * «нужно уведомлять человека: вы извините, мы удалим, вы уверены, что вы
 * хотите удалить» — удаление техники тянет за собой топливо и расчёт.
 * ⛔ `confirm()` и попапы запрещены (постулаты 2 и 9), поэтому вопрос — второй
 * шаг ПРЯМО В СТРОКЕ, как у «Очистить» в полосе карты: первый тап превращает
 * значок в «Удалить? · Отмена», второй — удаляет. Кнопка «Вернуть» в сообщении
 * остаётся дополнительно, а не вместо спроса.
 */
export function ConfirmAction({
  icon, label, onConfirm,
}: {
  icon: typeof Plus
  label: string
  onConfirm: () => void
}) {
  const [asking, setAsking] = useState(false)
  if (!asking) {
    return <RowAction icon={icon} tone="danger" label={label} onClick={() => setAsking(true)} />
  }
  return (
    <span className="flex shrink-0 items-center">
      <button
        type="button"
        onClick={() => {
          setAsking(false)
          onConfirm()
        }}
        aria-label={label}
        className="flex min-h-11 items-center rounded-md px-2 text-note font-semibold text-accent-text transition-colors hover:bg-accent-soft active:scale-95"
      >
        Удалить?
      </button>
      <button
        type="button"
        onClick={() => setAsking(false)}
        aria-label="Не удалять"
        className="flex min-h-11 items-center rounded-md px-2 text-note text-muted transition-colors hover:bg-zebra/70 active:scale-95"
      >
        Отмена
      </button>
    </span>
  )
}
