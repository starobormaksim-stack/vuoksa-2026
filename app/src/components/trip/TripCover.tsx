import { CalendarDays, MapPin, TentTree } from 'lucide-react'
import type { Trip, TripPlace } from '../../lib/types'
import { countdown } from '../../format'

interface Props {
  trip: Trip
  places: TripPlace[]
  onEditDates: () => void
  onShowPlaces: () => void
}

/**
 * Обложка поездки: на десктопе квадрат слева, фото-hero с градиентной подложкой,
 * заголовок, подзаголовок, даты (тап — календарь), места (тап — шторка) и обратный отсчёт.
 */
export function TripCover({ trip, places, onEditDates, onShowPlaces }: Props) {
  const main = places.find((p) => p.main) ?? places[0]
  const extra = places.length - 1

  return (
    <div className="relative overflow-hidden rounded-2xl shadow-md aspect-[4/3] sm:aspect-[16/9] lg:aspect-square">
      {trip.hero ? (
        <img src={trip.hero} alt="" className="absolute inset-0 size-full object-cover" />
      ) : (
        /* Пока у поездки нет фото — фирменная хвойная подложка. */
        <div
          className="absolute inset-0 grid place-items-center"
          style={{ background: 'linear-gradient(160deg, #3D5226 0%, #223012 70%, #161C10 100%)' }}
        >
          <TentTree size={96} strokeWidth={1} aria-hidden className="opacity-25 text-brand-parchment" />
        </div>
      )}

      {/* Градиентная подложка под текст */}
      <div
        className="absolute inset-x-0 bottom-0 h-3/4"
        style={{
          background:
            'linear-gradient(to top, rgba(22,28,16,.82) 0%, rgba(22,28,16,.45) 45%, rgba(22,28,16,0) 100%)',
        }}
        aria-hidden
      />

      <div className="absolute inset-x-0 bottom-0 p-5 text-brand-cream lg:p-6">
        <span className="rounded-full bg-brand-cream px-3 py-1 text-xs font-bold text-brand-dark">
          {countdown(trip.start, trip.end)}
        </span>
        <h1 className="mt-3 text-[32px] leading-[1.1] font-[750] text-balance lg:text-4xl">
          {trip.title}
        </h1>
        {trip.sub && <p className="mt-1 text-[15.5px] text-brand-cream/85">{trip.sub}</p>}

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onEditDates}
            className="flex min-h-11 items-center gap-2 rounded-xl bg-brand-dark/45 px-3 backdrop-blur-sm transition-colors hover:bg-brand-dark/65"
            aria-label={`Даты поездки: ${trip.dates}. Изменить`}
          >
            <CalendarDays size={18} strokeWidth={1.5} aria-hidden />
            <span className="editable tnum text-sm font-semibold">{trip.dates}</span>
          </button>

          {main && (
            <button
              type="button"
              onClick={onShowPlaces}
              className="flex min-h-11 items-center gap-2 rounded-xl bg-brand-dark/45 px-3 backdrop-blur-sm transition-colors hover:bg-brand-dark/65"
              aria-label="Места поездки"
            >
              <MapPin size={18} strokeWidth={1.5} aria-hidden />
              <span className="editable max-w-56 truncate text-sm font-semibold">
                {main.n}
                {extra > 0 && ` +${extra}`}
              </span>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
