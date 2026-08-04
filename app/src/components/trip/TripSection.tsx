import { useState } from 'react'
import type { State } from '@/lib/types'
import type { Perms } from '@/lib/perm'
import { update } from '@/store'
import { fmtRange, withDate } from '@/format'
import { SectionHead } from '@/components/flops'
import { TripCover } from './TripCover'
import { DateRangePicker } from './DateRangePicker'

/**
 * Раздел «Поездка»: квадратная обложка со всем содержимым поездки и строка сборов.
 *
 * Блок «Кто уже собрался» удалён заказчиком 04.08.2026 («убери вообще этот блок,
 * он не нужен») — сразу за обложкой на странице идёт раздел «Команда».
 * Разбор «Как это считается» с обложки тоже убран: расчёты живут в «Дороге».
 *
 * ⛔ 05.08.2026 отсюда убран и `ReadyLeft` — колонка несобранного справа от обложки.
 * Дословно: «у тебя дублируется список товаров на всём протяжении… больше нигде
 * не повторяться списками оборудования, инвентаря, вещей или продуктов» (урок У-53).
 * Он перечислял позиции `S.gear` чужого раздела, да ещё и печатал названия его
 * групп. Сводка о сборах осталась там, где ей и место, — числом «собрано X из Y»
 * в шапке самих «Сборов». Обложка теперь занимает всю ширину контейнера на всех
 * ширинах: делить её было не с кем.
 *
 * Даты меняют только владелец и редактор.
 */
export function TripSection({ S, perms }: { S: State; perms: Perms }) {
  const [calOpen, setCalOpen] = useState(false)
  const canEdit = perms.isEditor()

  const saveDates = (a: Date, b: Date) => {
    update((s) => ({
      ...s,
      trip: {
        ...s.trip,
        start: withDate(s.trip.start, a, '07:30:00'),
        end: withDate(s.trip.end, b, '18:00:00'),
        dates: fmtRange(a, b),
        datesAuto: true,
      },
    }))
    setCalOpen(false)
  }

  return (
    <div className="flex flex-col gap-4 lg:gap-6">
      {/* Своя полоса есть у каждого раздела — иначе при прокрутке непонятно, где ты,
          и единообразия, которого просил заказчик, не получается. Названия из
          `S.secTitles` у «Поездки» нет (ключи первой версии — buy, log, crew, gear,
          menu), поэтому `secId` не передаём: форму хранения трогать нельзя (У-04).
          Название поездки живёт на самой обложке и правится там же. */}
      <SectionHead title="Поездка" />
      {/* ⚠️ Потолок ширины на десктопе обязателен. Обложка — квадрат (`aspect-square`
          в TripCover), и после снятия ReadyLeft она растянулась на все 1217 px
          контейнера: раздел вырос с 603 до 1362 px, то есть 1,7 экрана под одну
          фотографию. Это ровно тот «пустой скроллинг», ради которого список
          несобранного и убирали. 560 px возвращают прежний масштаб обложки.
          На мобильном потолка нет: там она и должна быть во всю ширину. */}
      <div className="lg:max-w-[560px]">
        <TripCover S={S} perms={perms} onEditDates={() => setCalOpen(true)} />
      </div>

      {calOpen && canEdit && (
        <DateRangePicker
          start={new Date(S.trip.start)}
          end={new Date(S.trip.end)}
          onCancel={() => setCalOpen(false)}
          onDone={saveDates}
        />
      )}
    </div>
  )
}
