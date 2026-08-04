import { useState } from 'react'
import type { State, TripPlace } from '../../lib/types'
import type { DocUpdater } from '../../store'
import { fmtRange, withDate } from '../../format'
import { TripCover } from './TripCover'
import { ReadyRing } from './ReadyRing'
import { MoneyTiles } from './MoneyTiles'
import { DateRangePicker } from './DateRangePicker'
import { PlacesSheet } from './PlacesSheet'

/** Точки поездки; если массива places ещё нет — собираем из старых полей place/lat/lon. */
function tripPlaces(S: State): TripPlace[] {
  if (S.trip.places?.length) return S.trip.places
  if (S.trip.place) return [{ i: 'pl-legacy', n: S.trip.place, main: true }]
  return []
}

/** Раздел «Поездка»: обложка, кольцо готовности, четыре денежные плитки. */
export function TripSection({ S, update }: { S: State; update: DocUpdater }) {
  const [calOpen, setCalOpen] = useState(false)
  const [placesOpen, setPlacesOpen] = useState(false)
  const places = tripPlaces(S)

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
    <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,1fr)_384px] lg:items-start">
      <TripCover
        trip={S.trip}
        places={places}
        onEditDates={() => setCalOpen(true)}
        onShowPlaces={() => setPlacesOpen(true)}
      />

      <div className="flex flex-col gap-4">
        <ReadyRing />
        <MoneyTiles S={S} />
      </div>

      {calOpen && (
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
