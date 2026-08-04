import { useState } from 'react'
import type { State, TripPlace } from '@/lib/types'
import type { Perms } from '@/lib/perm'
import { update } from '@/store'
import { fmtRange, withDate } from '@/format'
import { TextSheet } from '@/components/flops'
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
  /** какая строка обложки правится: название или подзаголовок */
  const [textOpen, setTextOpen] = useState<null | 'title' | 'sub'>(null)
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
      {/* Обложка поездки. Маршрут с картой отсюда уехал в «Дорогу» (заказчик
          04.08.2026: «в „Дороге“ должен жить сам маршрут и расчёт»), а обложка
          осталась здесь — в одном месте, а не двух. */}
      <TripCover
        trip={S.trip}
        places={places}
        canEdit={canEdit}
        onEditDates={() => setCalOpen(true)}
        onShowPlaces={() => setPlacesOpen(true)}
        onEditTitle={() => setTextOpen('title')}
        onEditSub={() => setTextOpen('sub')}
      />

      <div className="grid gap-4 lg:grid-cols-2 lg:items-start lg:gap-6">
        <ReadyRing S={S} />
        <MoneyTiles S={S} perms={perms} />
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
      {placesOpen && (
        <PlacesSheet places={places} canEdit={canEdit} onClose={() => setPlacesOpen(false)} />
      )}

      {/* Правка названия и подзаголовка обложки — тем же путём, что и даты:
          update() сам ставит метку документа, отдельного touch у trip нет. */}
      {canEdit && (
        <>
          <TextSheet
            open={textOpen === 'title'}
            onOpenChange={(v) => !v && setTextOpen(null)}
            title="Название поездки"
            subtitle="Так она подписана на обложке"
            value={S.trip.title}
            placeholder="Вуокса-2026"
            onDone={(v) =>
              v &&
              update((s) => {
                s.trip.title = v
              })
            }
          />
          <TextSheet
            open={textOpen === 'sub'}
            onOpenChange={(v) => !v && setTextOpen(null)}
            title="Подзаголовок"
            subtitle={S.trip.title}
            value={S.trip.sub}
            placeholder="Например, водный поход по озеру"
            onDone={(v) =>
              update((s) => {
                s.trip.sub = v
              })
            }
          />
        </>
      )}
    </div>
  )
}
