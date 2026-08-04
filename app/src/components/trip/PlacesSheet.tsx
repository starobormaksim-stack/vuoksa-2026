import { useEffect } from 'react'
import { Map as MapIcon, MapPin, X } from 'lucide-react'
import type { TripPlace } from '../../lib/types'

/**
 * Шторка «Места поездки»: список точек с координатами и заглушка карты.
 * TODO: Leaflet + OSM подключим в онлайн-режиме; в офлайн-сборке карта скрыта.
 */
export function PlacesSheet({ places, onClose }: { places: TripPlace[]; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Места поездки"
    >
      <button
        type="button"
        aria-label="Закрыть"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-brand-dark/40"
      />
      <div className="relative w-full max-w-md rounded-t-2xl border border-line bg-surface p-5 pb-8 shadow-lg sm:rounded-2xl sm:pb-5">
        {/* Ручка шторки на мобайле */}
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line sm:hidden" aria-hidden />

        <div className="flex items-center justify-between">
          <h3 className="text-xl font-bold">Места поездки</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="grid size-11 place-items-center rounded-xl text-muted hover:bg-zebra hover:text-ink"
          >
            <X size={20} strokeWidth={1.5} aria-hidden />
          </button>
        </div>

        <ul className="mt-3 divide-y divide-line/60">
          {places.map((p) => (
            <li key={p.i} className="flex items-center gap-3 py-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent-deep">
                <MapPin size={20} strokeWidth={1.5} aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">{p.n}</div>
                {typeof p.lat === 'number' && typeof p.lon === 'number' && (
                  <div className="tnum text-sm text-muted">
                    {p.lat.toFixed(2)}, {p.lon.toFixed(2)}
                  </div>
                )}
              </div>
              {p.main && (
                <span className="shrink-0 rounded-lg bg-brand-cream px-2 py-1 text-xs font-semibold text-brand-dark">
                  главная точка
                </span>
              )}
            </li>
          ))}
        </ul>

        {/* Заглушка «карта появится в онлайне» отсюда убрана: карта теперь стоит
            прямо в блоке маршрута, и главная точка отмечена на ней плашкой. */}
        <p className="mt-2 flex items-start gap-2 rounded-2xl bg-zebra/60 p-3 text-sm text-muted">
          <MapIcon size={18} strokeWidth={1.5} aria-hidden className="mt-0.5 shrink-0" />
          <span>
            Главная точка отмечена на карте отдельной плашкой с названием. Переставить
            её можно кнопкой «Конечная» под картой.
          </span>
        </p>
      </div>
    </div>
  )
}
