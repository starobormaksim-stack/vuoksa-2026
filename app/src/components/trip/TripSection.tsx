import { useState } from 'react'
import type { State } from '@/lib/types'
import type { Perms } from '@/lib/perm'
import { update } from '@/store'
import { fmtRange, withDate } from '@/format'
import { TripCover } from './TripCover'
import { ReadyLeft } from './ReadyLeft'
import { DateRangePicker } from './DateRangePicker'

/**
 * Раздел «Поездка»: квадратная обложка со всем содержимым поездки и строка сборов.
 *
 * Блок «Кто уже собрался» удалён заказчиком 04.08.2026 («убери вообще этот блок,
 * он не нужен») — сразу за обложкой на странице идёт раздел «Команда».
 * Разбор «Как это считается» с обложки тоже убран: расчёты живут в «Дороге».
 *
 * На десктопе это не растянутый мобильный: обложка-квадрат слева, список
 * несобранного — колонкой рядом, вровень с ней по высоте.
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
    <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1.15fr)_minmax(20rem,1fr)] lg:items-start lg:gap-6">
      <TripCover S={S} perms={perms} onEditDates={() => setCalOpen(true)} />
      <ReadyLeft S={S} perms={perms} />

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
