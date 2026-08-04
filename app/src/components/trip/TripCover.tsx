import { useState } from 'react'
import { CalendarDays, Camera, MapPin, TentTree } from 'lucide-react'
import { toast } from 'sonner'
import type { Trip, TripPlace } from '../../lib/types'
import { countdown, fmtRange } from '../../format'
import { update } from '../../store'
import { PhotoCropSheet, usePhotoPick } from '../flops'

/**
 * Подпись с датами. Считается из trip.start и trip.end — из тех же полей, из которых
 * считается обратный отсчёт и длительность поездки. Готовая строка trip.dates берётся
 * только тогда, когда владелец вписал её руками (datesAuto === false): иначе после
 * правки календаря на обложке могла бы остаться старая подпись, не сходящаяся
 * с отсчётом «до выезда».
 */
function datesLabel(trip: Trip): string {
  if (trip.datesAuto === false) return trip.dates
  const a = new Date(trip.start)
  const b = new Date(trip.end)
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return trip.dates
  return fmtRange(a, b)
}

interface Props {
  trip: Trip
  places: TripPlace[]
  onEditDates: () => void
  onShowPlaces: () => void
  /** тап по названию поездки — шторка правки текста (живёт в TripSection) */
  onEditTitle: () => void
  /** тап по подзаголовку — своя шторка там же */
  onEditSub: () => void
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
export function TripCover({
  trip, places, onEditDates, onShowPlaces, onEditTitle, onEditSub, canEdit,
}: Props) {
  const main = places.find((p) => p.main) ?? places[0]
  const extra = places.length - 1
  const dates = datesLabel(trip)
  const chip =
    'flex min-h-11 items-center gap-2 rounded-xl bg-brand-dark/45 px-3 backdrop-blur-sm'

  /* Обложка меняется тем же кадрированием, что и фотографии людей (flops/PhotoSheet).
     Раньше её нельзя было поменять никак — в первой версии это работало, во второй
     пропало, и заказчик на это отдельно жаловался. */
  const [src, setSrc] = useState<string | null>(null)
  const { pick, input } = usePhotoPick(setSrc)

  return (
    /* На десктопе обложка больше не квадрат: под ней в той же колонке стоит лента
       точек (см. map/RouteBoard.tsx), и квадрат съедал бы всю высоту блока. */
    <div className="relative aspect-[4/3] overflow-hidden rounded-2xl shadow-md sm:aspect-[16/9] lg:max-h-[400px]">
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
        {/* Название и подзаголовок: у редактора это кнопки правки («как вижу, так и
            редактирую»), у участника — обычный текст, не кнопка. Зона нажатия
            добирается до 44 px невидимыми полями (py + отрицательный my). */}
        <h1 className="mt-3 text-[32px] leading-[1.1] font-[750] text-balance lg:text-4xl">
          {canEdit ? (
            <button
              type="button"
              onClick={onEditTitle}
              aria-label={`Название поездки: ${trip.title}. Изменить`}
              className="editable -mx-2 -my-1.5 max-w-full rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-brand-dark/40"
            >
              {trip.title}
            </button>
          ) : (
            trip.title
          )}
        </h1>
        {canEdit ? (
          <p className="mt-1 text-[15.5px] text-brand-cream/85">
            <button
              type="button"
              onClick={onEditSub}
              aria-label={
                trip.sub ? `Подзаголовок: ${trip.sub}. Изменить` : 'Добавить подзаголовок'
              }
              className="editable -mx-2 -my-3 max-w-full rounded-xl px-2 py-3 text-left transition-colors hover:bg-brand-dark/40"
            >
              {/* Пустой подзаголовок — спокойное приглашение, чтобы было по чему тапнуть */}
              {trip.sub || <span className="text-brand-cream/55">Подзаголовок</span>}
            </button>
          </p>
        ) : (
          trip.sub && <p className="mt-1 text-[15.5px] text-brand-cream/85">{trip.sub}</p>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          {canEdit ? (
            <button
              type="button"
              onClick={onEditDates}
              className={`${chip} transition-colors hover:bg-brand-dark/65`}
              aria-label={`Даты поездки: ${dates}. Изменить`}
            >
              <CalendarDays size={18} strokeWidth={1.5} aria-hidden />
              <span className="editable tnum text-sm font-semibold">{dates}</span>
            </button>
          ) : (
            <span className={chip}>
              <CalendarDays size={18} strokeWidth={1.5} aria-hidden />
              <span className="tnum text-sm font-semibold">{dates}</span>
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
