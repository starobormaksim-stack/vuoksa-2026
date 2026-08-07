import { useState } from 'react'
import type { State } from '@/lib/types'
import type { SpendSplit } from '@/lib/settle'
import { money } from '@/lib/calc'
import { InlinePick } from '@/components/flops'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'

/**
 * «Кто платит» и «на кого делится» — прямо в строке расчёта, без шторки.
 *
 * Заказчик 05.08.2026: «Оплачивают, как правило, владельцы автомобиля — им уже
 * не надо платить, им наоборот возвращается часть суммы… Лодка: бензин купит
 * кто-то из команды, и потом будет перерасчёт поровну между всеми участниками».
 * То есть у траты два независимых свойства, и оба человек обязан задать сам.
 *
 * Органы взяты готовые (постулат 3): выбор одного — `InlinePick` из нашей же
 * библиотеки (список раскрывается ПОД значением и толкает строку вниз, а не
 * всплывает поверх), выбор нескольких — `ToggleGroup type="multiple"` из
 * shadcn/Radix. Своей разметки здесь нет.
 *
 * ⛔ Пустые значения означают СЕГОДНЯШНЕЕ поведение: без плательщика трата
 * считается «скинулись поровну», без круга делится на всех. Поэтому включение
 * этого органа в существующий документ не сдвигает ни одной контрольной цифры.
 */

/** Вариант «никто конкретно» — он же умолчание. */
const NOBODY = ''

/**
 * Раскладка одной траты словами: кто выложил деньги и по сколько с каждого.
 *
 * Заказчик 08.08.2026: «если разворачивается список — кто покупает; если делится,
 * по сколько частей между участниками». Считает `lib/settle.ts` теми же правилами,
 * что и весь зачёт, — здесь только показ, ни одной своей формулы (У-58).
 *
 * ⛔ Это НЕ орган правки: круг делящих правится соседним `SpendShareEdit`,
 * плательщик — колонками людей. Вычисленная величина, которую никто не показывает,
 * это отсутствующая функция (постулат 5), но второй орган для того же — дубль.
 */
export function SpendSplitLine({
  split, S, className,
}: {
  split: SpendSplit
  S: State
  className?: string
}) {
  if (split.sum <= 0 || split.share.length === 0) return null

  /* Доли у всех одинаковые — так и говорим одним числом, а не тремя равными.
     Премиальность это сдержанность (постулат 7). */
  const parts = split.share
  const same = parts.every((x) => x.sum === parts[0].sum)

  return (
    <span className={cn('block text-micro leading-snug text-muted', className)}>
      {split.paid.length > 0 ? (
        <span className="block">
          {'Выложил'}{' '}
          {split.paid.map((x, i) => (
            <span key={x.id}>
              {i > 0 ? ', ' : ''}
              <span className="font-semibold text-ink">{x.name}</span>{' '}
              <span className="tnum">{money(x.sum, S.doc)}</span>
            </span>
          ))}
        </span>
      ) : (
        <span className="block">Скинулись поровну</span>
      )}
      <span className="block">
        {same
          ? `${split.everyone ? 'Делят все' : 'Делят'} по `
          : 'Делят: '}
        {same ? (
          <span className="tnum font-semibold text-ink">{money(parts[0].sum, S.doc)}</span>
        ) : (
          parts.map((x, i) => (
            <span key={x.id}>
              {i > 0 ? ' · ' : ''}
              {x.name}{' '}
              <span className="tnum font-semibold text-ink">{money(x.sum, S.doc)}</span>
            </span>
          ))
        )}
        {same && !split.everyone ? (
          <span>{` (${parts.map((x) => x.name).join(', ')})`}</span>
        ) : null}
      </span>
    </span>
  )
}

export function SpendShareEdit({
  S, can, payer, sp, fallback, what, onPayer, onSp, circleOnly,
}: {
  S: State
  can: boolean
  /** явный плательщик; пусто — смотрим `fallback` */
  payer: string | undefined
  /** круг делящих; пусто — делится на всех */
  sp: string[] | undefined
  /** кто платит, если явно не сказано (у техники это её владелец) */
  fallback?: string
  /** что именно оплачивается — попадает в подписи для скринридера */
  what: string
  onPayer?: (id: string) => void
  onSp: (ids: string[]) => void
  /**
   * Только круг делящих, и свёрнутый до одной строки.
   *
   * Для «Закупки»: плательщик там уже задаётся колонками людей (`Buy.o` —
   * «кто сколько покупает»), второй орган для того же был бы дублем (У-58).
   * А ряд кнопок, развёрнутый у каждой из полусотни строк, превратил бы
   * таблицу в шум — премиальность это сдержанность (постулат 7). Поэтому
   * в покое стоит одна строка словами, а кнопки раскрываются НА МЕСТЕ,
   * под ней, и только у той позиции, которую правят.
   */
  circleOnly?: boolean
}) {
  const people = S.people
  const chosen = payer ?? fallback ?? NOBODY
  const circle = (sp ?? []).filter((id) => people.some((p) => p.id === id))
  const [open, setOpen] = useState(false)

  /* Ни права правки, ни своих значений — на экране пусто. Не положено или
     нечего показывать — органа нет вовсе (постулат 6). */
  if (!can && !chosen && circle.length === 0) return null

  const payerName = people.find((p) => p.id === chosen)?.name
  const circleNames = circle.map((id) => people.find((p) => p.id === id)?.name).filter(Boolean)

  /** «Делится на всех» либо перечисление круга — одной строкой. */
  const circleWords =
    circleNames.length > 0 ? `Делится на ${circleNames.join(', ')}` : 'Делится на всех'

  if (!can) {
    return (
      <span className="mt-1 block text-micro leading-snug text-muted">
        {circleOnly
          ? circleWords
          : `${payerName ? `Платит ${payerName}` : 'Скинулись поровну'} · ${circleWords.toLowerCase()}`}
      </span>
    )
  }

  const toggles = (
    <ToggleGroup
      type="multiple"
      value={circle}
      onValueChange={onSp}
      variant="outline"
      aria-label={`${what}: на кого делится`}
      className="mt-0.5 flex-wrap"
    >
      {people.map((p) => (
        <ToggleGroupItem
          key={p.id}
          value={p.id}
          aria-label={`${what}: делится на ${p.name}`}
          className="min-h-11 px-3 text-micro"
        >
          {p.name}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )

  if (circleOnly) {
    return (
      <span className="mt-1 block max-w-[19rem]">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={`${what}: на кого делится. ${circleWords}. Изменить`}
          className="-mx-1 flex min-h-11 w-[calc(100%+0.5rem)] items-center rounded-md px-1 text-left transition-colors hover:bg-zebra/70 active:bg-zebra"
        >
          <span className="editable text-micro leading-snug text-muted">{circleWords}</span>
        </button>
        {open ? toggles : null}
      </span>
    )
  }

  return (
    /* ⚠️ Ширину нельзя отдавать ячейке целиком. Липкая колонка «Расчёта дороги»
       на 390 шире окна прокрутки (453 px против 357), и значок ⌄ у выбора
       плательщика уезжал за клип — причём НАВСЕГДА: колонка липкая, боковая
       прокрутка его не покажет. Потолок держим ниже видимой части. */
    <span className="mt-1 block max-w-[19rem]">
      <span className="block text-micro leading-snug text-muted">Платит</span>
      <InlinePick
        value={chosen}
        can
        label={`${what}: кто платит`}
        placeholder="Скинулись поровну"
        className="text-micro text-ink"
        /* ⚠️ Примечаний у имён нет. Одна и та же фраза «выложил деньги вперёд,
           ему возвращают» стояла у КАЖДОГО человека в КАЖДОЙ строке расчёта —
           ровно то «гигантское количество текста», о котором сказал заказчик
           05.08.2026. Правило объяснено один раз, в подписи «Платит». */
        options={[
          { id: NOBODY, title: 'Скинулись поровну' },
          ...people.map((p) => ({ id: p.id, title: p.name })),
        ]}
        onPick={onPayer ?? (() => {})}
      />

      <span className="mt-1 block text-micro leading-snug text-muted">
        {circle.length > 0 ? 'Делится между отмеченными' : 'Делится на всех'}
      </span>
      {toggles}
    </span>
  )
}
