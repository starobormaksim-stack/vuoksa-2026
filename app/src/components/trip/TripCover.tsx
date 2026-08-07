import { useState } from 'react'
import { CalendarDays, Camera, MapPin, TentTree } from 'lucide-react'
import { toast } from 'sonner'
import type { State, Trip, TripPlace } from '@/lib/types'
import type { Perms } from '@/lib/perm'
import { countdown, daysUntil, fmtRange, plural } from '@/format'
import { askMapLook, askPlaceMain } from '@/lib/mapfocus'
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
 * Значок места: кнопка 44 × 44, вынутая из потока строки.
 *
 * Сдвиг влево на 14 px = (44 − 16) / 2: он ставит сам значок на 0, то есть
 * на ту же вертикаль, где стоит значок дат строкой выше. Подробнее — в разметке.
 */
const PIN_BTN =
  'absolute top-1/2 left-0 grid size-11 -translate-x-3.5 -translate-y-1/2 place-items-center ' +
  'rounded-md text-muted transition-colors hover:bg-zebra hover:text-ink'

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
  /* Главное место — оно же точка приезда: от него и адрес, и единственная
     иконка карты в строке мест. */
  const mapPlace = places.find((p) => p.main) ?? places[0]
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
            /* ⛔ Снимок есть — открываем РЕДАКТОР на нём, а не выбор файла.
               Иначе поправить кадр или убрать обложку было нельзя вовсе: редактор
               открывался только на только что выбранном файле, и заказчик написал
               «не позволяет удалить». Из редактора выбор файла доступен кнопкой
               «Другой снимок». */
            onClick={() => (trip.hero ? setSrc(trip.hero) : pick())}
            aria-label={trip.hero ? 'Изменить обложку поездки' : 'Поставить обложку поездки'}
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
          <h1 className="text-title leading-tight font-bold text-ink text-balance break-words lg:text-hero">
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
            /* ⛔ Значок здесь стоит ПОВЕРХ строки, а не в её потоке, и это
               единственный способ поставить его на ту же вертикаль, что значок
               дат строкой выше. В строке дат значок и текст лежат внутри одной
               кнопки: значок занимает 16 px, `gap-2` даёт 8 — текст начинается
               на 24 px. Здесь текст правится на месте и в кнопку его не завернуть,
               поэтому значок был кнопкой 44 × 44 в потоке, и название уезжало
               на 44 px — на 20 px правее даты. Заказчик 08.08.2026: «у тебя
               выравнивание… с иконкой локации какая-то дичь полная».
               Теперь кнопка вынута из потока и сдвинута влево на 14 px, так что
               сам значок стоит ровно на 0, а текст получает свои 24 px отступом.
               Цель касания осталась 44 × 44; текст лежит выше кнопки (`z-10`),
               поэтому правка названия нажатие себе не отдаёт. */
            <div className="relative flex min-h-11 items-center text-note text-muted">
              {/* ⛔ Иконка геолокации здесь ОДНА, и она же — орган.
                  Заказчик 06.08.2026: «у тебя рядом геолокация, ещё одна иконка
                  геолокации, название… короче, бред какой-то. Я хочу, чтобы там
                  была просто ссылка на карту: нажимаешь — открываешь… если там
                  пусто — он тебе предлагает указать точку». Было две: немой значок
                  слева у всей строки и вторая кнопка `MapPinned` у каждого места.
                  Осталась левая — она стоит на одной линии со значками дат и адреса,
                  и она же нажимается.
                  ⛔ Кнопка доступна ВСЕМ, включая участника: «участники могут
                  просмотреть, что это такое. Менять они не смогут» (05.08.2026).
                  Правка названия по-прежнему только у владельца и редактора.
                  Места без координат орган теперь тоже получают — но другой:
                  не «показать», а «указать точку», и только тому, кто вправе
                  её ставить (постулат 6). */}
              {mapPlace && typeof mapPlace.lat === 'number' && typeof mapPlace.lon === 'number' ? (
                <button
                  type="button"
                  onClick={() => askMapLook(mapPlace.lat as number, mapPlace.lon as number)}
                  aria-label={`Показать «${mapPlace.n}» на карте`}
                  className={PIN_BTN}
                >
                  <MapPin size={16} strokeWidth={1.75} aria-hidden />
                </button>
              ) : canEdit ? (
                <button
                  type="button"
                  onClick={askPlaceMain}
                  aria-label="Указать место поездки на карте"
                  className={PIN_BTN}
                >
                  <MapPin size={16} strokeWidth={1.75} aria-hidden />
                </button>
              ) : (
                <MapPin
                  size={16}
                  strokeWidth={1.75}
                  aria-hidden
                  className="absolute top-1/2 left-0 -translate-y-1/2"
                />
              )}
              <div className="relative z-10 flex min-w-0 flex-1 flex-wrap items-center gap-x-4 pl-6">
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

          {/* ⛔ Здесь стояла строка адреса конечной точки — «Горы, Ленинградская
              область». Убрана 07.08.2026 по прямому слову заказчика, в одном
              перечне со строкой маршрута, «2026, юбилей, 10 лет» и «Вы — Макс,
              владелец». Взамен он попросил «просто точку на геолокации указать
              и подписать её, чтобы всё было поэтично и по-человечески» — это
              строка выше: значок геолокации и название места («озеро Вуокса»),
              которое он пишет сам.

              Машинный адрес рядом с ним и был лишним: человек назвал место
              по-своему, а следом стояла казённая расшифровка того же места
              словами геокодера.

              ⚠️ Убрано С ЭКРАНА, не из документа (постулат 4): `place.addr`
              на месте, геокодер его по-прежнему заводит (`guessDestAddr`
              в `map/TripMap.tsx`), слияние переносит. Он нужен выгрузке
              и вернётся одной правкой, если заказчик передумает. */}
        </div>

        <MoneyTiles S={S} perms={perms} />
        <WeatherRow S={S} open={wDay} onOpen={setWDay} />
      </div>

      {/* Что не влезло в ленту прогноза: разбор дня, световой день и выводы. */}
      <WeatherDetail S={S} open={wDay} />

      {src && (
        <PhotoCropSheet
          src={src}
          /* ⛔ Рамка редактора обязана быть той же формы, что плашка обложки
             (`aspect-[4/3]` выше). Стояла единица — квадрат, — и человек кадрировал
             в квадрате то, что показывается лежачим прямоугольником. Отсюда жалоба
             06.08.2026: «плашка с фотографией — она у тебя прямоугольная… я бы хотел
             условно уменьшить кадр, но по ширине расставить фотографию квадратную,
             а у меня не получается». Теперь форма одна, а «Вписать целиком» ставит
             квадратный снимок в лежачую рамку целиком, полями по бокам. */
          ratio={4 / 3}
          out={1400}
          quality={0.74}
          title="Обложка поездки"
          subtitle="Подвиньте фотографию, чтобы главное встало в кадр"
          frameHint="Так обложка и будет выглядеть. Меньше рамки — по краям остаются поля."
          okLabel="Поставить"
          onDone={(url) => {
            update((s) => {
              s.trip.hero = url
            })
            toast('Обложка обновлена')
          }}
          onPickOther={pick}
          onRemove={
            trip.hero
              ? () => {
                  update((s) => {
                    s.trip.hero = ''
                  })
                  toast('Обложка убрана')
                }
              : undefined
          }
          onClose={() => setSrc(null)}
        />
      )}
    </section>
  )
}
