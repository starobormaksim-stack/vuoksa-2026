import { useState } from 'react'
import type { State } from '@/lib/types'
import { InlinePick } from '@/components/flops'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

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
        options={[
          {
            id: NOBODY,
            title: 'Скинулись поровну',
            note: 'Никто не платил вперёд — зачёт по этой строке нулевой',
          },
          ...people.map((p) => ({
            id: p.id,
            title: p.name,
            note: 'Выложил деньги вперёд, ему возвращают',
          })),
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
