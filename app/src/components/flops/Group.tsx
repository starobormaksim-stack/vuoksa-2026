import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { ChevronDown, MoreHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Заголовок группы и её тело (docs/v2-ux-redesign.md, 4.6).
 * Полоса прогресса — нижняя граница заголовка, а не отдельный элемент.
 * Содержимое строится лениво при первом раскрытии (принцип lazyBody из v1):
 * иначе 105 строк «Сборов» рисуются впустую.
 *
 * Действия над самим разделом (переименовать, свернуть все, удалить) вызываются
 * двумя путями сразу: долгим тапом по заголовку — привычка мобильных списков —
 * и кнопкой «⋯» справа, потому что долгий тап не виден и мышью неудобен.
 */

/** Сколько держать заголовок, чтобы открылись действия раздела. */
const LONG_PRESS_MS = 500
/** На столько палец может съехать, пока это ещё удержание, а не прокрутка. */
const MOVE_TOLERANCE = 10

interface Props {
  title: ReactNode
  /**
   * Название раздела, правящееся на месте (обычно `InlineText`). Передано —
   * заголовок перестаёт быть одной большой кнопкой: слева правится название,
   * справа отдельная кнопка сворачивания. Кнопку в кнопку вкладывать нельзя —
   * это невалидная разметка, и промах по названию сворачивал бы раздел.
   *
   * Появилось 04.08.2026: переименование раздела было последним местом,
   * где оставалась шторка, а заказчик отменил шторки везде, где можно.
   */
  titleEdit?: ReactNode
  /** счётчик «12 / 18»; без него счётчик не рисуется */
  done?: number
  total?: number
  open: boolean
  onToggle: () => void
  /** бейдж справа от названия — например «личное» */
  badge?: ReactNode
  /** действия над разделом: долгий тап по заголовку и кнопка «⋯»; без него ни того, ни другого */
  onMenu?: () => void
  children: ReactNode
  className?: string
  /** якорь блока: по нему липкий «плюс» находит подраздел, который сейчас читают */
  'data-block'?: string
}

export function Group({
  title, titleEdit, done, total, open, onToggle, badge, onMenu, children, className,
  'data-block': dataBlock,
}: Props) {
  const seen = useRef(open)
  if (open) seen.current = true
  const [, force] = useState(0)
  const pct = total && total > 0 ? Math.round(((done ?? 0) / total) * 100) : 0

  /* Удержание заголовка. `fired` гасит клик, который браузер шлёт после долгого тапа,
     иначе раздел заодно свернулся бы. Прокрутка удержание отменяет. */
  const press = useRef<{ t: number | null; x: number; y: number; fired: boolean }>({
    t: null, x: 0, y: 0, fired: false,
  })
  const stopPress = () => {
    if (press.current.t !== null) window.clearTimeout(press.current.t)
    press.current.t = null
  }
  useEffect(() => stopPress, [])

  const down = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (!onMenu) return
    stopPress()
    press.current = {
      x: e.clientX,
      y: e.clientY,
      fired: false,
      t: window.setTimeout(() => {
        press.current.t = null
        press.current.fired = true
        onMenu()
      }, LONG_PRESS_MS),
    }
  }
  const move = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (press.current.t === null) return
    if (
      Math.abs(e.clientX - press.current.x) > MOVE_TOLERANCE ||
      Math.abs(e.clientY - press.current.y) > MOVE_TOLERANCE
    )
      stopPress()
  }
  const click = () => {
    stopPress()
    if (press.current.fired) {
      press.current.fired = false
      return
    }
    seen.current = true
    onToggle()
    force((n) => n + 1)
  }

  return (
    /* Рамка карточки — единственное, что отделяет группу от фона. Тень отсюда убрана:
       она ничего не сообщала, а рядом с волосяной линией читалась как вторая граница. */
    /* ⛔ `overflow-clip`, а НЕ `overflow-hidden`. Обрезают углы они одинаково,
       но `hidden` делает блок прокручиваемым (просто без полос), и липкая шапка
       таблицы внутри прилипает к верху ЭТОЙ группы — то есть никуда, потому что
       группа высотой во весь список. Замер 05.08.2026: шапка уезжала на y = −492.
       `clip` прокручиваемым блок не делает, и шапка находит настоящий экран. */
    <section
      data-block={dataBlock}
      className={cn('overflow-clip rounded-2xl border border-line bg-surface', className)}
    >
      <h3 className="relative flex items-stretch">
        {titleEdit ? (
          /* Название правится на месте, поэтому оно НЕ внутри кнопки сворачивания:
             кнопка в кнопке — невалидная разметка, и промах по названию сворачивал бы
             раздел вместо правки. Сворачивание уезжает в отдельную кнопку справа. */
          <span className="flex min-h-14 min-w-0 flex-1 items-center gap-3 px-4">
            {/* ⚠️ Кегль 20 (`text-head`), а не 15,5. Заказчик 06.08.2026: «название
                разделов должно быть крупно написано… чтобы было очевидно».
                Значение из шкалы проекта, штучных размеров не заведено. */}
            <span className="min-w-0 flex-1 text-head font-[650] text-ink">{titleEdit}</span>
            {badge}
          </span>
        ) : null}
        <button
          type="button"
          onClick={click}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={stopPress}
          onPointerLeave={stopPress}
          onPointerCancel={stopPress}
          aria-expanded={open}
          aria-label={titleEdit ? 'Свернуть или раскрыть раздел' : undefined}
          className={cn(
            /* 56 px — высота заголовка группы во всех разделах */
            'flex min-h-14 items-center gap-3 px-4 text-left transition-colors hover:bg-zebra',
            /* Название уехало наружу и правится на месте — кнопке остаются
               только счётчик и шеврон, растягивать её на всю ширину незачем. */
            titleEdit ? 'shrink-0' : 'flex-1',
            onMenu && 'pr-1 select-none',
          )}
        >
          {/* ⚠️ Без `truncate`. На 20 px название «Бытовое и расходники» на 390
              обрывалось многоточием — «Бытовое и расходн…», — а заказчик просил
              ровно обратного: «название разделов должно быть крупно написано…
              чтобы было очевидно». Пусть лучше перенесётся: высота заголовка
              растёт на строку, зато название читается целиком. */}
          {titleEdit ? null : (
            <span className="min-w-0 flex-1 text-head leading-snug font-[650] text-ink text-pretty">
              {title}
            </span>
          )}
          {titleEdit ? null : badge}
          {total != null && total > 0 && (
            <span className="tnum shrink-0 text-note font-semibold text-muted">
              {done ?? 0} / {total}
            </span>
          )}
          <ChevronDown
            size={20}
            strokeWidth={1.75}
            aria-hidden
            className={cn('shrink-0 text-muted transition-transform', open && 'rotate-180')}
          />
        </button>
        {onMenu && (
          <button
            type="button"
            onClick={onMenu}
            aria-label="Действия раздела"
            className="my-auto mr-2 grid size-11 shrink-0 place-items-center rounded-md text-muted transition-colors hover:bg-zebra hover:text-ink"
          >
            <MoreHorizontal size={20} strokeWidth={1.75} aria-hidden />
          </button>
        )}
        {/* Полоса под заголовком одна и та же всегда: без счётчика это просто линия,
            отделяющая заголовок от содержимого, со счётчиком — она же показывает долю
            сделанного. Отдельного разделителя поэтому нигде не нужно. */}
        <span className="absolute inset-x-0 bottom-0 h-0.5 bg-line" aria-hidden>
          {total != null && total > 0 && (
            <span className="block h-full bg-accent transition-[width]" style={{ width: `${pct}%` }} />
          )}
        </span>
      </h3>
      {seen.current && <div className={open ? 'block' : 'hidden'}>{children}</div>}
    </section>
  )
}
