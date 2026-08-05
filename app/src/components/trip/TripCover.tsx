import { useState } from 'react'
import { CalendarDays, Camera, MapPin, MapPinned, TentTree } from 'lucide-react'
import { toast } from 'sonner'
import type { State, Trip, TripPlace } from '@/lib/types'
import type { Perms } from '@/lib/perm'
import { countdown, daysUntil, fmtRange, plural } from '@/format'
import { askMapLook } from '@/lib/mapfocus'
import { update } from '@/store'
import { InlineText, PhotoCropSheet, usePhotoPick } from '@/components/flops'
import { MoneyTiles } from './MoneyTiles'
import { WeatherDetail, WeatherRow } from './WeatherStrip'

/**
 * Обложка поездки — левый из двух одинаковых блоков раздела «Поездка»
 * (правый — карта, см. `TripMapCard.tsx`).
 *
 * ─── Форма блока, названная заказчиком 05.08.2026 ───
 * «Длинную фотографию давай сделаем… вот она у тебя есть такая фотография
 * квадратная, в итоге мы её растянем на правую сторону, и ты грамотно
 * расположишь функциональность какую-либо под ней».
 *
 * Отсюда устройство: **широкая фотография сверху, всё остальное — под ней**.
 * Название и подзаголовок, даты и места, четыре суммы, лента погоды стоят
 * в панели на обычном фоне страницы, а не поверх снимка. Что это даёт:
 *   · снимок виден целиком, его больше не закрывает наполовину тёмная плашка;
 *   · цифры выравниваются по общей сетке (была жалоба «всё на разных уровнях»);
 *   · блок карты справа получает ровно ту же форму — «абсолютно идентичны
 *     и симметрично выглядят друг с другом», как он и просил.
 *
 * На самой фотографии остался только обратный отсчёт «до выезда» слева
 * и кнопка смены обложки справа — две плашки, которые снимку не мешают.
 *
 * Правится всё прямо здесь, тапом по самому значению. Шторок ровно две, и обе
 * неизбежны: выбор фотографии (кадрирование пальцем) и календарь дат.
 *
 * ⚠️ Фотография НЕ кадрируется: `object-contain` показывает её целиком, пустоту
 * по краям закрывает размытая копия того же снимка — приём из `PersonHead`.
 * Заказчик дважды жаловался, что снимок «обрезается по углам». Именно поэтому
 * широкая рамка безопасна для уже загруженного квадратного снимка: он встанет
 * в неё целиком, а поля закроет размытая копия его самого.
 *
 * ⚠️ Текст на двух плашках поверх снимка читается на любой фотографии:
 * подложка — графит бренда с прозрачностью 90 %. Даже на белом снимке крем
 * на такой подложке даёт ≥ 6 : 1 (норма 4,5 : 1).
 */

/** Общая подложка плашек поверх фотографии — один цвет на обе. */
const SCRIM = 'bg-brand-dark/90'

/**
 * Подпись с датами. Считается из trip.start и trip.end — из тех же полей, из которых
 * считается обратный отсчёт. Готовая строка trip.dates берётся только тогда, когда
 * владелец вписал её руками (datesAuto === false).
 */
function datesLabel(trip: Trip): string {
  if (trip.datesAuto === false) return trip.dates
  const a = new Date(trip.start)
  const b = new Date(trip.end)
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return trip.dates
  return fmtRange(a, b)
}

/** Точки поездки; если массива places ещё нет — собираем из старого поля place. */
function tripPlaces(S: State): TripPlace[] {
  if (S.trip.places?.length) return S.trip.places
  if (S.trip.place) return [{ i: 'pl-legacy', n: S.trip.place, main: true }]
  return []
}

interface Props {
  S: State
  perms: Perms
  /** тап по датам — календарь (одна из двух оправданных шторок) */
  onEditDates: () => void
}

export function TripCover({ S, perms, onEditDates }: Props) {
  const trip = S.trip
  const canEdit = perms.isEditor()
  const places = tripPlaces(S)
  const dates = datesLabel(trip)
  const days = daysUntil(trip.start)
  const start = new Date(trip.start)
  const time = Number.isNaN(start.getTime()) ? '' : start.toTimeString().slice(0, 5)

  /** какой день прогноза раскрыт под фотографией */
  const [wDay, setWDay] = useState<string | null>(null)
  /** выбранный файл ждёт кадрирования */
  const [src, setSrc] = useState<string | null>(null)
  const { pick, input } = usePhotoPick(setSrc)

  /* Названия мест правятся на месте. Массива в документе может ещё не быть —
     тогда сперва заводим его из старого поля, не потеряв название. */
  const patchPlaces = (f: (list: TripPlace[]) => void) =>
    update((s) => {
      if (!s.trip.places?.length) {
        s.trip.places = s.trip.place ? [{ i: 'pl-legacy', n: s.trip.place, main: true }] : []
      }
      f(s.trip.places)
    })

  const renamePlace = (id: string, n: string) =>
    patchPlaces((list) => {
      const p = list.find((x) => x.i === id)
      if (p) p.n = n
    })

  const addPlace = (n: string) =>
    patchPlaces((list) => {
      list.push({ i: 'pl' + Date.now().toString(36), n, main: list.length === 0 })
    })

  return (
    <section
      aria-label="Обложка поездки"
      className="flex h-full min-w-0 flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-md"
    >
      {/* ── Фотография ──
          Соотношение то же, что у карты справа (COVER_MEDIA в TripMapCard.tsx):
          два блока обязаны выглядеть одинаково. Снимок лежит целиком
          (`object-contain`), поля закрывает размытая копия его самого. */}
      <div className="relative aspect-[4/3] w-full shrink-0 overflow-hidden bg-brand-pine">
        {trip.hero ? (
          <>
            {/* Размытая копия закрывает поля по краям, чтобы снимок не пришлось резать. */}
            <img
              src={trip.hero}
              alt=""
              aria-hidden
              className="absolute inset-0 size-full scale-110 object-cover blur-xl"
            />
            <img src={trip.hero} alt="" className="absolute inset-0 size-full object-contain" />
          </>
        ) : (
          <div className="absolute inset-0 grid place-items-center">
            <TentTree size={96} strokeWidth={1.75} aria-hidden className="text-brand-cream/25" />
          </div>
        )}

        {/* Блок «до выезда» прицеплен к левой стороне — так просил заказчик. */}
        <div className={`absolute top-4 left-0 z-10 rounded-r-lg px-4 py-2 ${SCRIM}`}>
          {days > 0 ? (
            <>
              <span className="block text-micro text-brand-cream/85">До выезда</span>
              <span className="tnum block text-title font-bold text-brand-cream lg:text-hero">
                {days}&#160;{plural(days, 'день', 'дня', 'дней')}
              </span>
            </>
          ) : (
            <span className="block text-head font-bold text-brand-cream">
              {countdown(trip.start, trip.end)}
            </span>
          )}
          {days >= 0 && time ? (
            <span className="block text-micro text-brand-cream/85">
              выезд в <span className="tnum">{time}</span>
            </span>
          ) : null}
        </div>

        {/* Сменить обложку. Участнику кнопки нет вовсе — не серой, а отсутствующей. */}
        {canEdit && (
          <button
            type="button"
            onClick={pick}
            aria-label={trip.hero ? 'Сменить обложку поездки' : 'Поставить обложку поездки'}
            className={`absolute top-4 right-4 z-10 grid size-11 place-items-center rounded-lg text-brand-cream transition-colors hover:bg-brand-dark ${SCRIM}`}
          >
            <Camera size={20} strokeWidth={1.75} aria-hidden />
          </button>
        )}
        {input}
      </div>

      {/* ── Панель под фотографией ──
          ⚠️ `min-w-0` обязателен. Без него колонка растягивается по самому
          длинному неразрывному куску: название поездки в 24 px не переносилось,
          задавало 420 px при экране 390, и правый край уезжал за экран
          (замерено 04.08.2026). Горизонтальной прокрутки при этом не появлялось —
          её гасит `body { overflow-x: hidden }`, — так что беда была молчаливой. */}
      <div className="flex min-w-0 flex-1 flex-col gap-4 p-4 lg:p-5">
        <div className="min-w-0">
          {/* `break-words`: название придумывает человек, и «ВУОКСА · ЮБИЛЕЙНАЯ»
              одним куском не должно распирать блок. */}
          <h1 className="text-title leading-tight font-[750] text-ink text-balance break-words lg:text-hero">
            <InlineText
              value={trip.title}
              onSave={(v) => update((s) => { s.trip.title = v })}
              can={canEdit}
              label="Название поездки"
              required
              placeholder="Название поездки"
            />
          </h1>

          <p className="mt-0.5 text-note text-muted">
            <InlineText
              value={trip.sub}
              onSave={(v) => update((s) => { s.trip.sub = v })}
              can={canEdit}
              label="Подзаголовок поездки"
              placeholder="Подзаголовок"
              className="text-muted"
            />
          </p>
        </div>

        <div className="flex min-w-0 flex-col">
          {/* Значок внутри кнопки: так вся строка дат — одна зона нажатия 44 px,
              и невидимый расширитель не залезает на строку места. */}
          {canEdit ? (
            <button
              type="button"
              onClick={onEditDates}
              aria-label={`Даты поездки: ${dates}. Изменить`}
              className="-mx-2 flex min-h-11 items-center gap-2 rounded-md px-2 text-note text-muted transition-colors hover:bg-zebra"
            >
              <CalendarDays size={16} strokeWidth={1.75} aria-hidden className="shrink-0" />
              <span className="editable tnum font-semibold text-ink">{dates}</span>
            </button>
          ) : (
            <span className="flex min-h-11 items-center gap-2 text-note text-muted">
              <CalendarDays size={16} strokeWidth={1.75} aria-hidden className="shrink-0" />
              <span className="tnum font-semibold text-ink">{dates}</span>
            </span>
          )}

          {(places.length > 0 || canEdit) && (
            <div className="flex min-h-11 items-center gap-2 text-note text-muted">
              <MapPin size={16} strokeWidth={1.75} aria-hidden className="shrink-0" />
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4">
                {places.map((p) => (
                  <span key={p.i} className="flex min-w-0 max-w-full items-center gap-1">
                    <InlineText
                      value={p.n}
                      onSave={(v) => renamePlace(p.i, v)}
                      can={canEdit}
                      label="Место поездки"
                      required
                      className="truncate font-semibold text-ink"
                    />
                    {/* Показать место на карте — она стоит тут же, справа.
                        ⛔ Кнопка доступна ВСЕМ, включая участника. Слово заказчика
                        05.08.2026: «при нажатии нужно не только название выбрать,
                        но и можно точку показать. Участники могут просмотреть,
                        что это такое. Менять они не смогут» — смотреть можно всем,
                        правка названия по-прежнему только у владельца и редактора.
                        Места без координат кнопки не получают вовсе (постулат 6):
                        показывать нечего, а серых кнопок у нас не бывает. */}
                    {typeof p.lat === 'number' && typeof p.lon === 'number' && (
                      <button
                        type="button"
                        onClick={() => askMapLook(p.lat as number, p.lon as number)}
                        aria-label={`Показать «${p.n}» на карте`}
                        className="grid size-11 shrink-0 place-items-center rounded-md text-muted transition-colors hover:bg-zebra hover:text-ink"
                      >
                        <MapPinned size={16} strokeWidth={1.75} aria-hidden />
                      </button>
                    )}
                  </span>
                ))}
                {/* Мест ещё нет — на обложке пусто, и вписать место негде.
                    Даём поле прямо здесь; когда место есть, лишнего приглашения
                    не рисуем: новые точки ставятся на карте рядом. */}
                {canEdit && places.length === 0 && (
                  <span className="min-w-0 max-w-full">
                    <InlineText
                      value=""
                      onSave={(v) => v && addPlace(v)}
                      can
                      label="Место поездки"
                      placeholder="Место поездки"
                      className="truncate"
                    />
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        <MoneyTiles S={S} perms={perms} />
        <WeatherRow S={S} open={wDay} onOpen={setWDay} />
      </div>

      {/* Что не влезло в ленту прогноза: разбор дня, световой день и выводы. */}
      <WeatherDetail S={S} open={wDay} />

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
    </section>
  )
}
