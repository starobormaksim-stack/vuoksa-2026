import { useState } from 'react'
import { CalendarDays, Camera, MapPin, TentTree } from 'lucide-react'
import { toast } from 'sonner'
import type { State, Trip, TripPlace } from '@/lib/types'
import type { Perms } from '@/lib/perm'
import { countdown, daysUntil, fmtRange, plural } from '@/format'
import { update } from '@/store'
import { InlineText, PhotoCropSheet, usePhotoPick } from '@/components/flops'
import { MoneyTiles } from './MoneyTiles'
import { WeatherDetail, WeatherRow } from './WeatherStrip'

/**
 * Обложка поездки — квадрат с фотографией, на которой живёт вся поездка
 * (заказчик 04.08.2026: «надо вот эту фотографию сделать квадратной… не по центру
 * хуярить это всё»).
 *
 * На самой фотографии: блок «до выезда», прицепленный к левой стороне; название
 * и подзаголовок; даты и места; четыре суммы; лента погоды по дням. Всё — по левому
 * краю, никакого центрирования. Плашки с обратным отсчётом внизу больше нет:
 * она дублировала блок слева, и заказчик велел её убрать.
 *
 * Правится всё прямо здесь, тапом по самому значению. Шторок ровно две, и обе
 * неизбежны: выбор фотографии (кадрирование пальцем) и календарь дат.
 *
 * ⚠️ Фотография НЕ кадрируется: `object-contain` показывает её целиком, пустоту
 * по краям закрывает размытая копия того же снимка — приём из `PersonHead`.
 * Заказчик дважды жаловался, что снимок «обрезается по углам».
 *
 * ⚠️ Текст поверх снимка читается на любой фотографии: подложка — графит бренда
 * с прозрачностью 90 %. Даже на белом снимке крем на такой подложке даёт ≥ 6 : 1
 * (норма 4,5 : 1). Подсветка наведения тоже кремовая, а не светлая из токенов:
 * светлое пятно под кремовым текстом убило бы контраст. Селектор с потомком
 * сильнее утилиты `hover:` по специфичности, поэтому `!important` не нужен.
 */

/** Общая подложка текста поверх фотографии — один цвет на все плашки обложки. */
const SCRIM = 'bg-brand-dark/90'
/** Наведение и нажатие поверх фотографии: крем, а не светлый токен страницы. */
const ONPHOTO = '[&_button:hover]:bg-brand-cream/12 [&_button:active]:bg-brand-cream/20'

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
      className="overflow-hidden rounded-xl border border-line bg-surface shadow-md"
    >
      {/* Квадрат — решение заказчика. На десктопе это крупный квадрат, а не полоса.
          Три слоя лежат в одной клетке сетки: пустая распорка задаёт квадрат,
          на ней — снимок, поверх — содержимое. Высота клетки равна самому высокому
          слою, поэтому на узком экране содержимое не срезается верхним краем:
          обложка просто становится чуть выше квадрата, а не теряет строку. */}
      {/* ⚠️ `min-w-0` и `grid-cols-[minmax(0,1fr)]` обязательны. Без них колонка
          грида растягивается по самому длинному неразрывному куску содержимого:
          название поездки в 24 px не переносилось, задавало колонке 420 px при
          экране 390, и правый край обложки уезжал за экран (замерено 04.08.2026).
          Горизонтальной прокрутки при этом не появлялось — её гасит
          `body { overflow-x: hidden }`, — так что беда была молчаливой. */}
      <div className="relative grid w-full min-w-0 grid-cols-[minmax(0,1fr)]">
        <div className="col-start-1 row-start-1 aspect-square w-full" aria-hidden />

        <div className="relative col-start-1 row-start-1 overflow-hidden">
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
            <div className="absolute inset-0 grid place-items-center bg-brand-pine">
              <TentTree size={96} strokeWidth={1.75} aria-hidden className="text-brand-cream/25" />
            </div>
          )}
        </div>

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

        {/* Всё содержимое обложки — по левому краю, внизу снимка. */}
        <div className={`relative col-start-1 row-start-1 flex flex-col justify-end ${ONPHOTO}`}>
          <div className="h-16 shrink-0 bg-gradient-to-t to-transparent from-brand-dark/90" aria-hidden />
          <div className={`px-4 pb-4 lg:px-6 lg:pb-5 ${SCRIM}`}>
            {/* `break-words`: название придумывает человек, и «ВУОКСА · ЮБИЛЕЙНАЯ»
                одним куском не должно распирать обложку (см. комментарий у грида). */}
            <h1 className="text-title leading-tight font-[750] text-brand-cream text-balance break-words lg:text-hero">
              <InlineText
                value={trip.title}
                onSave={(v) => update((s) => { s.trip.title = v })}
                can={canEdit}
                label="Название поездки"
                required
                placeholder="Название поездки"
                className="text-brand-cream"
              />
            </h1>

            <p className="mt-0.5 text-note text-brand-cream/85">
              <InlineText
                value={trip.sub}
                onSave={(v) => update((s) => { s.trip.sub = v })}
                can={canEdit}
                label="Подзаголовок поездки"
                placeholder="Подзаголовок"
                className="text-brand-cream/85"
              />
            </p>

            <div className="mt-1 flex flex-col">
              {/* Значок внутри кнопки: так вся строка дат — одна зона нажатия 44 px,
                  и невидимый расширитель не залезает на строку места. */}
              {canEdit ? (
                <button
                  type="button"
                  onClick={onEditDates}
                  aria-label={`Даты поездки: ${dates}. Изменить`}
                  className="-mx-2 flex min-h-11 items-center gap-2 rounded-md px-2 text-note text-brand-cream/85 transition-colors"
                >
                  <CalendarDays size={16} strokeWidth={1.75} aria-hidden className="shrink-0" />
                  <span className="editable tnum font-semibold">{dates}</span>
                </button>
              ) : (
                <span className="flex min-h-11 items-center gap-2 text-note text-brand-cream/85">
                  <CalendarDays size={16} strokeWidth={1.75} aria-hidden className="shrink-0" />
                  <span className="tnum font-semibold">{dates}</span>
                </span>
              )}

              {(places.length > 0 || canEdit) && (
                <div className="flex min-h-11 items-center gap-2 text-note text-brand-cream/85">
                  <MapPin size={16} strokeWidth={1.75} aria-hidden className="shrink-0" />
                  <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4">
                    {places.map((p) => (
                      <span key={p.i} className="min-w-0 max-w-full">
                        <InlineText
                          value={p.n}
                          onSave={(v) => renamePlace(p.i, v)}
                          can={canEdit}
                          label="Место поездки"
                          required
                          className="truncate font-semibold text-brand-cream/85"
                        />
                      </span>
                    ))}
                    {/* Мест ещё нет — на обложке пусто, и вписать место негде.
                        Даём поле прямо здесь; когда место есть, лишнего приглашения
                        не рисуем: новые точки ставятся на карте в «Дороге». */}
                    {canEdit && places.length === 0 && (
                      <span className="min-w-0 max-w-full">
                        <InlineText
                          value=""
                          onSave={(v) => v && addPlace(v)}
                          can
                          label="Место поездки"
                          placeholder="Место поездки"
                          className="truncate text-brand-cream/85"
                        />
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Десктоп: суммы и погода — в потоке, СРАЗУ ПОД датами и местами.
                ⚠️ Абсолютным слоем их класть нельзя: панель с названием тоже
                прижата к низу снимка, и слой ложился ПОВЕРХ заголовка — название
                читалось сквозь цифры (заказчик 04.08.2026: «всё перекрыто,
                переделано, перерезано»). */}
            <div className="mt-2 hidden lg:block">
              <MoneyTiles S={S} perms={perms} />
              <WeatherRow S={S} open={wDay} onOpen={setWDay} />
            </div>
          </div>
        </div>

        {/* ── Суммы и погода ──
            ⚠️ На телефоне они НЕ помещаются на снимок. Замерено 04.08.2026:
            панель занимала 356 px из 357 — фотографии не оставалось вовсе,
            а заказчик просил именно «сделать фотографию квадратной», то есть
            хочет её видеть. Поэтому здесь один и тот же блок стоит в двух местах
            раскладки: на телефоне это ВТОРАЯ строка сетки, то есть панель под
            снимком; на десктопе, где квадрат ~700 px, он абсолютом ложится
            на низ снимка — как и просил заказчик, «всё на фотографии».
            Подложка одна и та же, поэтому кремовый текст читается в обоих местах. */}
        {/* Телефон: суммы и погода уходят ПОД снимок — на 390 px они занимали
            356 px из 357 и фотографии не оставалось вовсе (замерено 04.08.2026).
            На десктопе этого блока нет: там те же суммы стоят в потоке выше. */}
        <div className={`relative z-10 px-4 pt-3 pb-4 ${SCRIM} ${ONPHOTO} lg:hidden`}>
          <MoneyTiles S={S} perms={perms} />
          <WeatherRow S={S} open={wDay} onOpen={setWDay} />
        </div>
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
