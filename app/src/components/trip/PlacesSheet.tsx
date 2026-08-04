import { useEffect, useState } from 'react'
import { Map as MapIcon, MapPin, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import type { TripPlace } from '../../lib/types'
import { update } from '../../store'
import { Btn, ResponsiveSheet, SheetRow, TextSheet } from '../flops'

/**
 * Шторка «Места поездки»: список точек с координатами.
 * Владельцу и редактору тап по месту открывает его карточку: правка названия,
 * назначение главной точкой и удаление; участнику список только показывается.
 * TODO: Leaflet + OSM подключим в онлайн-режиме; в офлайн-сборке карта скрыта.
 */
export function PlacesSheet({
  places,
  canEdit,
  onClose,
}: {
  places: TripPlace[]
  canEdit: boolean
  onClose: () => void
}) {
  /** открытая карточка места и её второй уровень «переименовать» */
  const [sel, setSel] = useState<string | null>(null)
  const [rename, setRename] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      /* пока открыта карточка места, Escape закрывает её, а не всю шторку */
      if (e.key === 'Escape' && !sel) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, sel])

  /**
   * Правка списка мест. Массива в документе может ещё не быть (места собраны
   * из старого поля trip.place) — тогда сперва заводим его, не теряя название.
   * Тот же приём, что у «Конечной» в map/TripMap.tsx.
   */
  const patchPlaces = (f: (list: TripPlace[]) => void) =>
    update((s) => {
      if (!s.trip.places?.length) {
        s.trip.places = s.trip.place
          ? [{ i: 'pl-legacy', n: s.trip.place, main: true }]
          : []
      }
      f(s.trip.places)
    })

  const renamePlace = (id: string, n: string) =>
    patchPlaces((list) => {
      const p = list.find((x) => x.i === id)
      if (p) p.n = n
    })

  /** Главная точка одна: по ней погода и плашка на карте. Снять её нельзя — только передать. */
  const makeMain = (place: TripPlace) => {
    patchPlaces((list) => {
      for (const p of list) p.main = p.i === place.i
    })
    toast(`«${place.n}» теперь главная точка`)
  }

  const delPlace = (place: TripPlace) => {
    setSel(null)
    patchPlaces((list) => {
      const idx = list.findIndex((x) => x.i === place.i)
      if (idx >= 0) list.splice(idx, 1)
    })
    toast(`«${place.n}» убрано из мест`, {
      action: {
        label: 'Отменить',
        onClick: () =>
          patchPlaces((list) => {
            if (!list.some((x) => x.i === place.i)) list.push({ ...place })
          }),
      },
    })
  }

  const cur = sel ? places.find((p) => p.i === sel) ?? null : null

  const rowBody = (p: TripPlace) => (
    <>
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent-deep">
        <MapPin size={20} strokeWidth={1.5} aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <div className={canEdit ? 'editable truncate font-semibold' : 'truncate font-semibold'}>
          {p.n}
        </div>
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
    </>
  )

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
            <li key={p.i}>
              {/* Право есть — строка и есть кнопка; права нет — просто строка (12.2) */}
              {canEdit ? (
                <button
                  type="button"
                  onClick={() => setSel(p.i)}
                  aria-label={`Место: ${p.n}. Открыть карточку`}
                  className="flex min-h-14 w-full items-center gap-3 rounded-lg py-3 text-left transition-colors hover:bg-zebra"
                >
                  {rowBody(p)}
                </button>
              ) : (
                <div className="flex items-center gap-3 py-3">{rowBody(p)}</div>
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
            её можно кнопкой «Конечная» под картой{canEdit ? ' или здесь, из карточки места' : ''}.
          </span>
        </p>
      </div>

      {/* ─── карточка места (только владелец и редактор) ─── */}
      {canEdit && cur && (
        <ResponsiveSheet
          open={!rename}
          onOpenChange={(v) => !v && setSel(null)}
          title={cur.n}
          subtitle="Место поездки"
          footer={
            <Btn scale="lg" className="w-full" onClick={() => setSel(null)}>
              Готово
            </Btn>
          }
        >
          <SheetRow label="Название" value={cur.n} onClick={() => setRename(true)} />
          <SheetRow
            label="Главная точка"
            value={cur.main ? 'да' : 'нет'}
            hint="По главной точке считается погода, и она стоит плашкой на карте"
          />
          <div className="mt-3 flex flex-col gap-2">
            {!cur.main && (
              <Btn tone="secondary" className="w-full justify-start" onClick={() => makeMain(cur)}>
                <MapPin size={18} strokeWidth={1.5} aria-hidden />
                Сделать главной точкой
              </Btn>
            )}
            {/* Главную точку не удаляем: без неё погоде и карте не на что смотреть.
                Сначала передайте звание другому месту. */}
            {!cur.main && (
              <Btn tone="danger" className="w-full justify-start" onClick={() => delPlace(cur)}>
                <Trash2 size={18} strokeWidth={1.5} aria-hidden />
                Убрать место
              </Btn>
            )}
            {cur.main && (
              <p className="text-[13px] leading-snug text-muted">
                Главная точка не удаляется и не снимается: сначала назначьте главной
                другое место.
              </p>
            )}
          </div>
        </ResponsiveSheet>
      )}

      {canEdit && cur && (
        <TextSheet
          open={rename}
          onOpenChange={(v) => !v && setRename(false)}
          onBack={() => setRename(false)}
          title="Название места"
          subtitle="Места поездки"
          value={cur.n}
          placeholder="Например, озеро Вуокса"
          onDone={(v) => v && renamePlace(cur.i, v)}
        />
      )}
    </div>
  )
}
