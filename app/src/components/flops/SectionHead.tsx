import { useState, type ReactNode } from 'react'
import { Plus } from 'lucide-react'
import { useTrip, update } from '@/store'
import { hintOf, setSectionTitle, titleOf } from '@/lib/sectitles'
import { InlineText } from './Inline'

/**
 * Полоса раздела: крупное название слева, условные обозначения справа.
 *
 * ─── Почему полоса липкая (заказчик, 05.08.2026) ───
 * Дословно: «полоска раздела остаётся липкой, она прилипает к верхней полоске меню;
 * как только я заканчиваю этот раздел, следующий тоже прилипает на время, пока
 * я иду по разделу». `position: sticky` внутри своей `<section>` даёт ровно это
 * поведение бесплатно: полоса держится под шапкой, пока секция на экране, и
 * уезжает вместе с её низом, уступая место полосе следующего раздела.
 *
 * `top` берётся из `--header-h` (index.css) — одного числа на весь проект:
 * 56 px плюс безопасная зона на мобильном, 64 px на десктопе. Фон непрозрачный:
 * содержимое обязано уезжать ПОД полосу и там пропадать, а не просвечивать
 * сквозь неё (урок У-20).
 * ⚠️ Липкость может отвалиться, если какой-нибудь слой поставит `overflow`
 * на `<html>` (шторки, встроенный браузер Телеграма) — урок У-18. Тогда полоса
 * просто перестанет прилипать и поедет вместе со страницей: раздел от этого
 * не ломается, читаться хуже не станет.
 *
 * ─── Чего здесь больше нет ───
 * 1. **Подписи под названием.** Заказчик 05.08.2026: «должно быть написано крупно
 *    „Сборы“, а вот это „общая база вещей, личные списки“ — вообще убирай, такой
 *    информации не нужно, лишнее». Своё значение подписи из `S.secTitles` при этом
 *    НЕ трогается и лежит в документе как лежало (постулат «ничего из данных
 *    не выбрасывать», урок У-04 про форму хранения). ⚠️ Убрана она только
 *    с ЭКРАНА: править её можно — вторым полем, которое появляется при
 *    переименовании раздела. Значение, которое негде исправить, — дефект
 *    по постулату 1, и именно так подпись однажды осталась без хозяина.
 * 2. **Шторки переименования.** Название правится на месте, `InlineText` —
 *    попапов нет (постулат 2, урок У-43).
 * 3. **Кнопки «что означают значки» со шторкой.** Условные обозначения теперь
 *    стоят прямо в полосе, по правому краю контента: «человек должен понимать,
 *    что это такое, а для этого нужны условные обозначения». На телефоне ширины
 *    под подписи нет, поэтому там они раскрываются на месте, под полосой.
 */

/** Один значок условных обозначений: сам знак и что он значит. */
export interface LegendItem {
  mark: ReactNode
  label: string
}

export function SectionHead({
  title,
  hint,
  secId,
  legend,
  action,
  children,
}: {
  title: string
  hint?: string
  /** идентификатор раздела из sections.ts — включает своё название и правку */
  secId?: string
  /** условные обозначения раздела; нет значков — нет и полосы обозначений */
  legend?: LegendItem[]
  action?: { label: string; onClick: () => void }
  children?: ReactNode
}) {
  const { S, perms } = useTrip()
  const [openLegend, setOpenLegend] = useState(false)
  const canEdit = !!secId && perms.isEditor()
  const шапка = secId ? titleOf(S, secId, title) : title

  /* Подпись раздела с экрана убрана, но из документа не выброшена. Раз значение
     есть — оно обязано правиться (постулат 1): вторым полем при переименовании. */
  const подпись = secId ? hintOf(S, secId, hint) : hint

  const saveTitle = (h: string, sub?: string) =>
    update((s) => {
      setSectionTitle(s, secId!, h, sub ?? подпись ?? '')
    })

  const есть = !!legend?.length

  return (
    <>
    <div
      /* Полоса тянется до краёв контейнера контента: под ней не должно
         просвечивать содержимое по бокам от текста. */
      className="sticky z-30 -mx-4 mb-4 border-b border-line/70 bg-bg px-4 lg:-mx-6 lg:px-6"
      style={{ top: 'var(--header-h)' }}
    >
      <div className="flex min-h-14 items-center gap-3">
        {/* ⚠️ Кнопку правки внутри `InlineText` до 44 px добирает обычно сама строка
            таблицы (см. комментарий в `flops/Inline.tsx`) — в полосе раздела строки
            нет, и цель касания получалась 34 px: `elementFromPoint` на ±21 px мимо.
            Высоту добираем здесь, у вложенной кнопки, не трогая сам `InlineText`:
            в таблицах она обязана остаться прежней. */}
        <h2 className="min-w-0 flex-1 text-title font-[700] text-ink [&>button]:flex [&>button]:min-h-11 [&>button]:items-center">
          <InlineText
            value={шапка}
            onSave={saveTitle}
            can={canEdit}
            required
            label="Название раздела"
            className="text-title font-[700] text-ink"
            second={
              secId
                ? {
                    value: подпись ?? '',
                    label: 'Подпись раздела',
                    placeholder: 'Подписи нет',
                    note: 'Под названием раздела не показывается',
                  }
                : undefined
            }
          />
        </h2>

        {/* Обозначения по правому краю контента — на десктопе прямо в строке. */}
        {есть && (
          <ul className="hidden shrink-0 items-center gap-4 lg:flex" aria-label="Условные обозначения">
            {legend!.map((l) => (
              <li key={l.label} className="flex items-center gap-1.5">
                <span className="grid shrink-0 place-items-center" aria-hidden>
                  {l.mark}
                </span>
                <span className="text-micro whitespace-nowrap text-muted">{l.label}</span>
              </li>
            ))}
          </ul>
        )}

        {/* На телефоне подписи в строку не помещаются: пять значков со словами —
            это около 470 px при 358 доступных. Поэтому там они раскрываются
            на месте, под полосой, а не шторкой поверх экрана. */}
        {есть && (
          <button
            type="button"
            onClick={() => setOpenLegend((v) => !v)}
            aria-expanded={openLegend}
            className="grid size-11 shrink-0 place-items-center rounded-md text-micro font-semibold text-muted transition-colors hover:bg-zebra hover:text-ink lg:hidden"
          >
            {openLegend ? 'скрыть' : 'знаки'}
          </button>
        )}

        {action && (
          <button
            type="button"
            onClick={action.onClick}
            /* На узком экране подпись прячется, чтобы не спорить за ширину с
               названием раздела, — но кнопка не имеет права остаться безымянной:
               без `aria-label` вслух она читалась просто «кнопка», а глазами
               выглядела голым плюсом (постулат 4). */
            aria-label={action.label}
            className="flex h-11 shrink-0 items-center gap-1.5 rounded-lg bg-accent-fill px-4 text-body font-semibold text-on-accent transition-opacity hover:opacity-90"
          >
            <Plus size={18} strokeWidth={1.75} aria-hidden />
            <span className="hidden sm:inline">{action.label}</span>
          </button>
        )}
      </div>

      {есть && openLegend && (
        <ul className="flex flex-wrap gap-x-4 gap-y-1 pb-3 lg:hidden" aria-label="Условные обозначения">
          {legend!.map((l) => (
            <li key={l.label} className="flex items-center gap-1.5">
              <span className="grid shrink-0 place-items-center" aria-hidden>
                {l.mark}
              </span>
              <span className="text-micro text-muted">{l.label}</span>
            </li>
          ))}
        </ul>
      )}

    </div>
    {/* ⚠️ `children` живёт СНАРУЖИ липкой полосы. Внутри неё пояснение участнику
        («кружок нажимается только в своей колонке») прилипало к шапке навсегда
        и съедало до 23,5 % экрана на 390 — оно читается один раз и обязано
        уехать вместе со страницей. */}
    {children}
    </>
  )
}

/** Строка «+ Добавить …» в конце списка. */
export function AddRow({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-14 w-full items-center gap-2 px-4 text-left text-body font-semibold text-accent-text transition-colors hover:bg-zebra"
    >
      <Plus size={18} strokeWidth={1.75} aria-hidden />
      {label}
    </button>
  )
}
