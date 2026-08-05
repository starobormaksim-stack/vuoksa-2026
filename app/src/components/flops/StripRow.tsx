import { useRef, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Строка вертикальной ленты — общая форма списочных разделов на телефоне.
 *
 * ─── Откуда она взялась ───
 * Заказчик 06.08.2026 забраковал матрицу «липкая колонка слева + столбцы людей
 * справа» для телефона целиком: «с телефона вообще нереалистично для тебя сделана
 * мобильная версия, то есть редактирование… я захожу туда, я вижу, что там есть
 * список, список крупно написан, условно каждый из видов товаров — целая плашка
 * под него, а не приходится условно скроллить вправо до упора».
 *
 * Отсюда устройство: **плашка во всю ширину, название крупно слева, главное число
 * справа**. Дословно: «я вижу просто список названий. Если речь идёт про покупки,
 * то там с правой стороны цена. То есть основополагающие, самые главные значения
 * прописываются с правой стороны, а название — и подробности в выпадашке».
 *
 * ⛔ Раскрытие идёт НА МЕСТЕ, толкая ленту вниз, — это не шторка и не окно
 * (постулат 2, забраковано дважды). Никакого перехода на отдельный экран тоже
 * нет: «не надо кучу подразделов делать, не нужно делать отдельные целые листики
 * под разделы».
 *
 * ─── Что взято из внешних разборов, а не придумано ───
 * · **Material Design 3, Lists** — раскладка строки «ведущий элемент · основной
 *   текст · хвостовой элемент»: имя слева, число справа.
 * · **Apple HIG, Disclosure controls** — часто нужное видно всегда, редкое уходит
 *   за раскрытие; знак раскрытия поворачивается на 180°.
 * · **Nielsen Norman Group, progressive disclosure** — свёрнутая строка обязана
 *   сама по себе давать достаточно, чтобы решить, раскрывать её или нет. Поэтому
 *   в полоске стоит и число, а не одно название.
 * · **GOV.UK Design System, summary list** — правка значения остаётся внутри того
 *   же блока и не уводит на другой экран.
 * · **Smashing Magazine, accessible responsive tables** — превращение широкой
 *   таблицы в вертикальный список на узком экране как признанный приём, с
 *   требованием сохранить связь «подпись поля → значение» (её держат `aria-label`
 *   у каждого `Inline*`).
 *
 * ⚠️ Тело строится лениво и остаётся в разметке после первого раскрытия — тот же
 * приём, что в `Group`: 96 позиций «Сборов» с полной подробностью каждой рисовать
 * впустую нельзя.
 */

interface Props {
  /** слот слева: кружок состояния, галочка «куплено» или значок вида позиции */
  lead?: ReactNode
  /** название крупно — главное, ради чего человек листает ленту */
  title: ReactNode
  /** вторая строка полоски: примечание одной фразой */
  sub?: ReactNode
  /** главное число справа: цена у покупки, общее количество у вещи, итог у расчёта */
  right?: ReactNode
  /** подпись под числом: единица измерения или «план» / «факт» */
  rightHint?: ReactNode
  open: boolean
  onToggle: () => void
  zebra?: boolean
  /** тревога: кто-то не может взять — полоса слева и подсветка */
  alarm?: boolean
  /** позиция сделана: название приглушено */
  done?: boolean
  /** якорь для перехода из поиска */
  dataHit?: string
  /** подробность позиции: раскрывается на месте */
  children: ReactNode
}

export function StripRow({
  lead, title, sub, right, rightHint, open, onToggle, zebra, alarm, done, dataHit, children,
}: Props) {
  const seen = useRef(open)
  if (open) seen.current = true

  return (
    <div
      role="listitem"
      data-hit={dataHit}
      className={cn(
        'relative border-b border-line/70 last:border-b-0',
        alarm ? 'bg-accent-soft' : zebra ? 'bg-zebra' : 'bg-surface',
      )}
    >
      {alarm && <span className="absolute inset-y-0 left-0 w-1 bg-accent-text" aria-hidden />}

      <div className="flex items-center gap-2 pr-2 pl-3">
        {lead ? <div className="shrink-0">{lead}</div> : null}

        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          /* 64 px — минимум строки списка на телефоне. Вся полоска целиком одна
             зона нажатия: делить её на «текст» и «значок» нельзя, промах по
             половине строки читается как «не работает» (NN/g про цель клика). */
          className="flex min-h-16 min-w-0 flex-1 items-center gap-3 py-2 text-left"
        >
          <span className={cn('min-w-0 flex-1', done && 'opacity-70')}>
            <span className="block text-head leading-snug font-[650] text-ink text-pretty">
              {title}
            </span>
            {sub ? (
              /* ⚠️ `line-clamp-2`, а не обрезка по высоте строки: заказчик прислал
                 снимок, где примечание точки было срезано по нижней кромке. Здесь
                 длинный текст честно кончается многоточием, а целиком читается
                 в раскрытой подробности.

                 ⛔ `block` рядом с `line-clamp-2` ставить нельзя: обрезка держится
                 на `display:-webkit-box`, а `block` его перебивает, и подпись
                 растёт без предела. Замер 06.08.2026: у 5 позиций из 157 подпись
                 занимала 4 строки вместо двух, у точки маршрута — 71,5 px вместо
                 35,8. Порядок классов в строке роли не играет, побеждает
                 объявленное позже в слое utilities. */
              <span className="mt-0.5 line-clamp-2 text-note leading-snug text-muted">
                {sub}
              </span>
            ) : null}
          </span>

          {right != null ? (
            <span className="shrink-0 text-right">
              <span className="tnum block text-head font-bold text-ink">{right}</span>
              {rightHint ? (
                <span className="block text-micro leading-tight text-muted">{rightHint}</span>
              ) : null}
            </span>
          ) : null}

          <ChevronDown
            size={20}
            strokeWidth={1.75}
            aria-hidden
            className={cn('shrink-0 text-muted transition-transform', open && 'rotate-180')}
          />
        </button>
      </div>

      {seen.current && (
        <div className={cn('border-t border-line/70 bg-bg/40 px-4 py-3', open ? 'block' : 'hidden')}>
          {children}
        </div>
      )}
    </div>
  )
}

/**
 * Полка подробности: подпись слева, значение справа. Одна форма на все поля
 * во всех разделах — ровно то «единообразие», которого заказчик просил дважды.
 */
export function StripField({
  label, children, wide,
}: {
  label: ReactNode
  children: ReactNode
  /** значение занимает свою строку целиком: примечание, круг делящих, единицы */
  wide?: boolean
}) {
  if (wide) {
    return (
      <div className="border-b border-line/50 py-2 last:border-b-0">
        <div className="text-micro font-semibold text-muted">{label}</div>
        <div className="mt-1">{children}</div>
      </div>
    )
  }
  return (
    <div className="flex min-h-11 items-center justify-between gap-3 border-b border-line/50 py-1.5 last:border-b-0">
      <span className="min-w-0 text-note text-muted">{label}</span>
      <span className="shrink-0 text-right">{children}</span>
    </div>
  )
}
