import { useState } from 'react'
import { CalendarDays, Camera, MapPin, TentTree } from 'lucide-react'
import { toast } from 'sonner'
import type { Trip, TripPlace } from '../../lib/types'
import { countdown } from '../../format'
import { update } from '../../store'
import { PhotoCropSheet, usePhotoPick } from '../flops'

interface Props {
  trip: Trip
  places: TripPlace[]
  onEditDates: () => void
  onShowPlaces: () => void
  /**
   * Даты и места меняют только владелец и редактор. Участнику кнопки не рисуются
   * вовсе (правило 12.2: «действие не положено — кнопки нет, а не серая»).
   */
  canEdit: boolean
}

/**
 * Обложка поездки: на десктопе квадрат слева, фото-hero с градиентной подложкой,
 * заголовок, подзаголовок, даты (тап — календарь), места (тап — шторка) и обратный отсчёт.
 */
export function TripCover({ trip, places, onEditDates, onShowPlaces, canEdit }: Props) {
  const main = places.find((p) => p.main) ?? places[0]
  const extra = places.length - 1
  const chip =
    'flex min-h-11 items-center gap-2 rounded-xl bg-brand-dark/45 px-3 backdrop-blur-sm'

  /* Обложка меняется тем же кадрированием, что и фотографии людей (flops/PhotoSheet).
     Раньше её нельзя было поменять никак — в первой версии это работало, во второй
     пропало, и заказчик на это отдельно жаловался. */
  const [src, setSrc] = useState<string | null>(null)
  const { pick, input } = usePhotoPick(setSrc)

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
          <TentTree size={96} strokeWidth={1} aria-hidden className="opacity-25 text-brand-cream" />
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

      {/* Сменить обложку. Участнику кнопки нет вовсе — не серой, а отсутствующей. */}
      {canEdit && (
        <button
          type="button"
          onClick={pick}
          aria-label={trip.hero ? 'Сменить обложку поездки' : 'Поставить обложку поездки'}
          className="absolute top-3 right-3 grid size-11 place-items-center rounded-xl bg-brand-dark/45 text-brand-cream backdrop-blur-sm transition-colors hover:bg-brand-dark/70"
        >
          <Camera size={20} strokeWidth={1.5} aria-hidden />
        </button>
      )}
      {input}

      {src && (
        <PhotoCropSheet
          src={src}
          ratio={1}
          out={1400}
          quality={0.74}
          title="Обложка поездки"
          subtitle="Подвиньте фотографию, чтобы главное встало в кадр"
          frameHint="Так обложка и будет выглядеть на телефоне."
          okLabel="Поставить"
          onDone={(url) => {
            update((s) => {
              s.trip.hero = url
            })
            toast('Обложка обновлена')
          }}
          onClose={() => setSrc(null)}
        />
      )}

      <div className="absolute inset-x-0 bottom-0 p-5 text-brand-cream lg:p-6">
        <span className="rounded-full bg-brand-cream px-3 py-1 text-xs font-bold text-brand-dark">
          {countdown(trip.start, trip.end)}
        </span>
        <h1 className="mt-3 text-[32px] leading-[1.1] font-[750] text-balance lg:text-4xl">
          {trip.title}
        </h1>
        {trip.sub && <p className="mt-1 text-[15.5px] text-brand-cream/85">{trip.sub}</p>}

        <div className="mt-4 flex flex-wrap gap-2">
          {canEdit ? (
            <button
              type="button"
              onClick={onEditDates}
              className={`${chip} transition-colors hover:bg-brand-dark/65`}
              aria-label={`Даты поездки: ${trip.dates}. Изменить`}
            >
              <CalendarDays size={18} strokeWidth={1.5} aria-hidden />
              <span className="editable tnum text-sm font-semibold">{trip.dates}</span>
            </button>
          ) : (
            <span className={chip}>
              <CalendarDays size={18} strokeWidth={1.5} aria-hidden />
              <span className="tnum text-sm font-semibold">{trip.dates}</span>
            </span>
          )}

          {main &&
            (canEdit ? (
              <button
                type="button"
                onClick={onShowPlaces}
                className={`${chip} transition-colors hover:bg-brand-dark/65`}
                aria-label="Места поездки"
              >
                <MapPin size={18} strokeWidth={1.5} aria-hidden />
                <span className="editable max-w-56 truncate text-sm font-semibold">
                  {main.n}
                  {extra > 0 && ` +${extra}`}
                </span>
              </button>
            ) : (
              <span className={chip}>
                <MapPin size={18} strokeWidth={1.5} aria-hidden />
                <span className="max-w-56 truncate text-sm font-semibold">
                  {main.n}
                  {extra > 0 && ` +${extra}`}
                </span>
              </span>
            ))}
        </div>
      </div>
    </div>
  )
}
