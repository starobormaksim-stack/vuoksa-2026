import { TentTree } from 'lucide-react'
import type { Trip } from '@/lib/types'
import { plural } from '@/format'
import { kmLabel } from './roadx'

/**
 * Заглавный квадрат «Дороги»: фотография поездки, а пока её нет — фирменная
 * хвойная подложка (та же, что на обложке в разделе «Поездка»).
 *
 * Здесь же живёт строка trip.route — словесное описание маршрута из документа.
 * Больше её показать негде, а потерять нельзя.
 */
interface Props {
  trip: Trip
  /** сколько всего точек в маршруте */
  points: number
  /** сколько из них поставлено на карту */
  onMap: number
  /** пробег на всю поездку */
  km: number
  /**
   * Сколько концов пути словами — «туда и обратно», «только туда», «3 конца пути».
   * Раньше здесь было вшито «туда и обратно», и при одном конце плашка врала
   * ровно так же, как врала карточка «Сколько едем» (см. kBackWord в roadx.ts).
   */
  kBack: string
}

export function RoadCover({ trip, points, onMap, km, kBack }: Props) {
  return (
    <div className="relative aspect-[4/3] overflow-hidden rounded-2xl shadow-md sm:aspect-[16/9] lg:aspect-square">
      {trip.hero ? (
        <img src={trip.hero} alt="" className="absolute inset-0 size-full object-cover" />
      ) : (
        <div className="absolute inset-0 grid place-items-center bg-linear-to-b from-brand-pine to-brand-dark">
          <TentTree size={96} strokeWidth={1} aria-hidden className="text-brand-cream opacity-25" />
        </div>
      )}

      {/* Подложка под текст: без неё крем по светлой фотографии не читается. */}
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-3/4 bg-linear-to-t from-brand-dark/85 via-brand-dark/45 to-transparent"
      />

      <div className="absolute inset-x-0 bottom-0 p-5 text-brand-cream lg:p-6">
        <span className="tnum rounded-full bg-brand-cream px-3 py-1 text-xs font-bold text-brand-dark">
          {kmLabel(km)} {kBack}
        </span>
        <h3 className="mt-3 text-[26px] leading-tight font-[750] text-balance lg:text-[30px]">
          {trip.title}
        </h3>
        {trip.route ? (
          <p className="mt-1 text-[14.5px] leading-snug text-brand-cream/85">{trip.route}</p>
        ) : null}
        <p className="tnum mt-2 text-[13px] font-semibold text-brand-cream/75">
          {points} {plural(points, 'точка', 'точки', 'точек')} в маршруте
          {onMap > 0 ? ` · ${onMap} на карте` : ''}
        </p>
      </div>
    </div>
  )
}
