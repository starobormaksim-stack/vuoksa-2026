import { useState } from 'react'
import type { State, TripPlace } from '@/lib/types'
import type { Perms } from '@/lib/perm'
import { update } from '@/store'
import { fmtRange, withDate } from '@/format'
import { TripMap } from '../map/TripMap'
import { TripCover } from './TripCover'
import { ReadyRing } from './ReadyRing'
import { MoneyTiles } from './MoneyTiles'
import { CrewReady } from './CrewReady'
import { WeatherStrip } from './WeatherStrip'
import { DateRangePicker } from './DateRangePicker'
import { PlacesSheet } from './PlacesSheet'

/** Точки поездки; если массива places ещё нет — собираем из старых полей place/lat/lon. */
function tripPlaces(S: State): TripPlace[] {
  if (S.trip.places?.length) return S.trip.places
  if (S.trip.place) return [{ i: 'pl-legacy', n: S.trip.place, main: true }]
  return []
}

/**
 * Раздел «Поездка»: обложка, отсчёт с кольцом готовности, деньги с разбором,
 * погода гармошкой и «кто уже собрался».
 *
 * Даты и места меняют только владелец и редактор — в v2 это раньше мог кто угодно.
 */
export function TripSection({ S, perms }: { S: State; perms: Perms }) {
  const [calOpen, setCalOpen] = useState(false)
  const [placesOpen, setPlacesOpen] = useState(false)
  const places = tripPlaces(S)
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
      {/* Заглавная фотография, а сразу за ней — карта: так попросил заказчик 04.08.2026.
          Раньше карта пряталась во вкладке «Маршрут» в самом низу «Дороги», и он её
          попросту не находил. */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,560px)] lg:items-stretch lg:gap-6">
        <TripCover
          trip={S.trip}
          places={places}
          canEdit={canEdit}
          onEditDates={() => setCalOpen(true)}
          onShowPlaces={() => setPlacesOpen(true)}
        />
        <TripMap S={S} perms={perms} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2 lg:items-start lg:gap-6">
        <ReadyRing S={S} />
        <MoneyTiles S={S} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2 lg:items-start lg:gap-6">
        <WeatherStrip S={S} />
        <CrewReady S={S} />
      </div>

      {calOpen && canEdit && (
        <DateRangePicker
          start={new Date(S.trip.start)}
          end={new Date(S.trip.end)}
          onCancel={() => setCalOpen(false)}
          onDone={saveDates}
        />
      )}
      {placesOpen && <PlacesSheet places={places} onClose={() => setPlacesOpen(false)} />}
    </div>
  )
}
