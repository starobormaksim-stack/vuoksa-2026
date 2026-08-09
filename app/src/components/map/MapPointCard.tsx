import { useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import {
  Car, Check, ChevronDown, Footprints, Plus, Sailboat, Search, Trash2, X, type LucideIcon,
} from 'lucide-react'
import type { LegMode, Person, RoutePoint, Transport } from '@/lib/types'
import type { Perms } from '@/lib/perm'
import { InlineText, PersonHead } from '@/components/flops'
import { requestAdd } from '@/lib/addnew'
import { humanAddr, type PlaceFound } from '@/lib/geocode'
import { MapSearch } from './MapSearch'
import { coordLabel, travels } from '@/components/road/roadx'
import { Dot, RoutePointCoords, RoutePointSetup } from '@/components/road/RoutePointSetup'
import { cn } from '@/lib/utils'
import { toneOf, COMMON_TONE, type MapTone } from './marks'

/**
 * Карточка метки — правка точки маршрута ПРЯМО НА КАРТЕ.
 *
 * Заказчик 04.08.2026: «он автоматически называет адрес… и я пишу название
 * действия, которое происходит… дать каждому из них название и возможность
 * передвигать и редактировать название прямо на карте. Кратенько при наведении
 * получаешь больше информации. Ты можешь также дать описание, так же как
 * со списками снаряжения».
 *
 * Поэтому здесь нет ни одной шторки: название, время и описание правятся теми же
 * кирпичами, что и таблицы разделов (InlineText), а адрес подставляет обратный
 * геокодер и показывает серой строкой — его не правят, он следует за координатами.
 *
 * Карточку показывает сама карта (см. GoogleRouteMap.tsx, MapCard): она держит её
 * над меткой и возит вместе с картой. Слоем над картой, а не внутри метки: узлы
 * меток принадлежат карте, и поля ввода внутри них теряли бы нажатия — карта
 * забирает их себе как жест перетаскивания.
 *
 * Нет права правки — полей нет вовсе, остаётся тот же текст без намёка на действие
 * (постулат «не положено — кнопки нет»). Смотреть карточку может кто угодно.
 *
 * ─── Здесь живёт ВСЯ точка, а не половина (06.08.2026) ───
 * Заказчик дословно: «Да, она не нужна вообще. Просто список точек на карте» —
 * про ленту точек в «Дороге». Убрать её можно было только после того, как всё,
 * что на ней висело, переехало сюда (постулат 4): адрес стал правиться, а не
 * только показываться; «пройдено» и «кто едет этой точкой» встали своими
 * органами; метка этапа, чем добираемся, расстояние от прошлой точки и
 * координаты — в подробностях, одним готовым блоком `road/RoutePointSetup`,
 * тем же самым, что стоял в ленте.
 *
 * Подробности свёрнуты по умолчанию — «пускай все списки будут свёрнуты»
 * (06.08.2026): карточка стоит НА карте, и раскрытая целиком она закрыла бы
 * собой то, ради чего её открыли.
 */

interface Props {
  point: RoutePoint
  /** номер точки в маршруте — тот же, что нарисован в метке */
  index: number
  canEdit: boolean
  /** техника поездки: из неё выбирают, чья это точка */
  transports: Transport[]
  /** кто в поездке: отмечаются те, кто едет этой точкой (`p.o`) */
  people: Person[]
  /** права: отметиться за себя может и участник без права правки точки */
  perms: Perms
  /** адрес сейчас спрашивают у геокодера */
  busy: boolean
  /**
   * Точку только что поставили тапом по карте: Esc убирает её целиком,
   * а не просто закрывает карточку.
   */
  fresh: boolean
  /**
   * Карточка стоит ПОЛОСОЙ под картой, а не плавающим окном у метки.
   *
   * Так она живёт на телефоне: карточка 366 px выше карты 280 px, и в блоке
   * с `overflow-hidden` ей срезало верх — до ряда техники палец не доходил
   * вовсе (У-112, замер 06.08.2026 на 390). Полосе рамка и тень не нужны:
   * её край рисует сам блок карты, а плавающему окну — нужны.
   */
  flat?: boolean
  onPatch: (f: (p: RoutePoint) => void) => void
  /**
   * Человек нашёл точный адрес для ЭТОЙ точки — её надо переставить туда
   * и навести карту (заказчик 09.08.2026: «я точку поставил, допустим, новую,
   * я хочу точно отфиксировать адрес… он его находит и центрируется куда надо»).
   * Без обработчика поиска в карточке нет вовсе — постулат 6.
   */
  onLocate?: (hit: PlaceFound) => void
  /** куда смотрит поездка: около этого места ищем, пока у точки нет координат */
  near?: { lat: number; lon: number }
  /** точка перестала быть новой: название сохранили, Esc её больше не убирает */
  onKeep: () => void
  onDelete: () => void
  onClose: () => void
  /* ⛔ Здесь были `onPin`, `onPointerEnter` и `onPointerLeave` — вся оснастка
     карточки, открытой НАВЕДЕНИЕМ: держать её, пока курсор идёт с метки на неё,
     и закрывать с задержкой. Наведение отменено заказчиком 06.08.2026, поздний
     вечер: «при наведении на точки не нужно, чтобы они показывали, что там
     есть, потому что при нажатии — да». Карточка теперь только нажимается,
     значит держать её ничем не надо: она и так открыта до закрытия. */
}

/** Значок участка — тот же, что карта рисует в углу метки. */
const LEG_ICONS: Record<LegMode, LucideIcon> = {
  road: Car,
  water: Sailboat,
  walk: Footprints,
}

export function MapPointCard({
  point, index, canEdit, transports, people, perms, busy, fresh, flat,
  onPatch, onKeep, onDelete, onClose, onLocate, near,
}: Props) {
  /** раскрыты ли подробности точки: метка этапа, дорога, расстояние, координаты */
  const [more, setMore] = useState(false)
  /** открыт ли поиск точного адреса для этой точки */
  const [locating, setLocating] = useState(false)

  /**
   * Esc — общий выход. У только что поставленной точки он ещё и убирает метку:
   * человек ткнул мимо, и оставлять после этого «Новую точку» посреди озера нельзя.
   * Ловим до полей ввода (capture): поле по Esc отменяет свою правку, а решение,
   * что делать дальше, принимается здесь.
   */
  const keys = (e: ReactKeyboardEvent) => {
    if (e.key !== 'Escape') return
    if (fresh) onDelete()
    else onClose()
  }

  const chosen = point.tr ? transports.find((t) => t.i === point.tr) : null

  /**
   * Что предлагать у точки: только ту технику, что едет.
   *
   * ⚠️ Номер `idx` берётся ИСХОДНЫЙ, из `S.transport`: тон нитки считается по
   * месту в этом списке (`toneAt` внутри `toneOf`), и после фильтра кружок
   * в карточке взял бы чужой цвет — тот, каким на карте нарисована другая техника.
   *
   * Уже выбранная техника остаётся в ряду всегда, даже если ездить она перестала:
   * иначе снять привязку было бы нечем (постулат 4).
   */
  const offered = transports
    .map((t, idx) => ({ t, idx }))
    .filter(({ t }) => travels(t) || chosen?.i === t.i)

  /** Кто отмечен едущим этой точкой — подписью под рядом, именами. */
  const riders = people.filter((who) => !!point.o?.[who.id]).map((who) => who.name)

  return (
    <div
      onKeyDownCapture={keys}
      className={cn(
        'bg-surface p-2',
        flat ? 'w-full' : 'w-64 rounded-xl border border-line shadow-lg',
        /* ⛔ Потолок с прокруткой ВНУТРИ карточки — только на широком экране
           и только при раскрытых подробностях. Замер 06.08.2026 на 1280: свёрнутая
           карточка 256 × 509 стоит в блоке 604 × 890 целиком, а с подробностями
           вырастает до 1096 и вылезает за верх блока — там `overflow-hidden`,
           и верх ей срезает вместе с названием и рядом техники (тот же корень,
           что У-112). Запаса над меткой 168 px, значит потолок 576 честно
           умещается. На телефоне потолка нет вовсе: там карточка стоит полосой
           в потоке и блок растёт под неё. */
        !flat && more && 'max-h-[36rem] overflow-y-auto overscroll-contain',
      )}
    >
      <div className="flex items-start gap-2">
        <span
          className="tnum mt-1 grid size-6 shrink-0 place-items-center rounded-full bg-accent-fill text-micro font-bold text-on-accent"
          aria-hidden
        >
          {index}
        </span>
        <div className="min-w-0 flex-1">
          <InlineText
            value={point.n}
            can={canEdit}
            label="Название точки"
            required
            placeholder="Например, старт"
            autoEdit={fresh}
            className="text-body leading-snug font-semibold"
            onSave={(v) =>
              onPatch((p) => {
                p.n = v
              })
            }
            /* Правку названия закончили сохранением — точка больше не «только что
               поставленная», и Esc её уже не убирает, а просто закрывает карточку.
               Отмену (Esc) сюда не пускаем: её ловит keys() выше, до полей. */
            onEditEnd={onKeep}
          />
        </div>
        <CardBtn icon={X} label="Закрыть карточку" onClick={onClose} />
      </div>

      {/* Адрес подставляет геокодер по координатам, но последнее слово за человеком:
          в ленте «Дороги» он правился словами (`PlaceRow`), и с её уходом это право
          обязано было переехать сюда, а не пропасть (постулат 4). Пока геокодер
          думает — так и написано, поля в этот момент нет: подставленный им ответ
          затёр бы начатую правку. */}
      <div className="mt-1 pl-8">
        {busy ? (
          <p className="text-micro leading-snug text-muted">Адрес ищем…</p>
        ) : (
          <div className="flex items-start gap-1">
            <div className="min-w-0 flex-1">
              <InlineText
                /* Показываем адрес человеку, а не геокодеру: без Plus Code
                   («23JV+M5 Приозерск…»), без «Россия» и почтового индекса.
                   Заказчик 06.08.2026 вечером прямо про них: «непонятные значения…
                   я не совсем понимаю, зачем эта информация». Правка сохраняет
                   ровно то, что видно, — иначе человек правил бы одно, а в листе
                   лежало бы другое. */
                value={humanAddr(point.addr)}
                can={canEdit}
                label="Адрес точки"
                placeholder={coordLabel(point) || 'Адрес не нашёлся — метку можно подвинуть'}
                className="text-micro leading-snug text-muted"
                onSave={(v) =>
                  onPatch((p) => {
                    p.addr = v
                  })
                }
              />
            </div>
            {/* Не «правка адреса», а поиск по нему: адрес рядом правится словами
                и точку не двигает, а этот орган ставит точку ТУДА, где место
                вправду находится. Права нет — органа нет (постулат 6). */}
            {canEdit && onLocate && (
              <CardBtn
                icon={Search}
                label={locating ? 'Убрать поиск адреса' : 'Найти точку по адресу'}
                onClick={() => setLocating((v) => !v)}
              />
            )}
          </div>
        )}
        {locating && canEdit && onLocate && (
          <div className="mt-2">
            <MapSearch
              /* Ищем около самой точки, а если координат у неё ещё нет —
                 около места поездки: находки «поблизости» иначе сортируются
                 от нулевой широты, то есть из Атлантики. */
              near={
                point.lat != null && point.lon != null
                  ? { lat: point.lat, lon: point.lon }
                  : (near ?? { lat: 0, lon: 0 })
              }
              onPick={(hit) => {
                setLocating(false)
                onLocate(hit)
              }}
              hint="Точка встанет по выбранному адресу"
            />
          </div>
        )}
      </div>

      {/* Время и описание — каждое своей строкой во всю ширину карточки: в поле
          ввода шириной в полтора слова подсказка «Enter — сохранить» переносится
          на четыре строки и карточка прыгает прямо под рукой. */}
      <div className="mt-2 pl-8">
        <InlineText
          value={point.time}
          can={canEdit}
          label="Время"
          placeholder="··:··"
          className="tnum text-note font-bold text-accent-text"
          onSave={(v) =>
            onPatch((p) => {
              p.time = v
            })
          }
        />
      </div>

      <div className="mt-1 pl-8">
        <InlineText
          value={point.c}
          can={canEdit}
          label="Описание точки"
          multiline
          placeholder="Описание"
          className="text-note leading-snug text-muted"
          onSave={(v) =>
            onPatch((p) => {
              p.c = v
            })
          }
        />
      </div>

      {/* Ряд техники стоит и тогда, когда техники в поездке ещё ни одной: заказчик
          06.08.2026 — «Дать возможность добавлять автотранспорт, и он появляется
          в списке, когда я указываю точку». Пустой ряд с одним «＋» и есть эта
          возможность; без него завести машину прямо от точки было бы нечем. */}
      {canEdit && (
        <div className="mt-2 border-t border-line pt-2 pl-8">
          <div className="flex flex-wrap items-center gap-1">
            <TrBtn
              tone={COMMON_TONE}
              label="Общая точка, без техники"
              on={!chosen}
              onClick={() =>
                onPatch((p) => {
                  p.tr = ''
                })
              }
            />
            {offered.map(({ t, idx }) => (
              <TrBtn
                key={t.i}
                /* ⛔ Именно `toneOf`, а не `toneAt`: у ветки может быть свой
                   цвет, выбранный человеком (`t.tone`). Карта его учитывает
                   (`threads` → `toneOf`), а кружок здесь считал цвет только
                   по месту в списке — и заказчик 06.08.2026 увидел синюю ветку
                   Aveo на карте и зелёный кружок той же Aveo в карточке точки
                   («почему у тебя автотранспорт и автомобили разного цвета»). */
                tone={toneOf(t, idx)}
                icon={LEG_ICONS[t.leg]}
                label={t.n}
                on={chosen?.i === t.i}
                onClick={() =>
                  onPatch((p) => {
                    /* Пишем только принадлежность. Способ передвижения (p.mode)
                       у точки свой и правится в её карточке в ленте — молча
                       подменять чужое поле нельзя. */
                    p.tr = t.i
                  })
                }
              />
            ))}
            {/* Заводит строку техники её собственный раздел и уводит туда человека
                (`requestAdd` из lib/addnew.ts): правила создания живут в одном
                месте, второй их копии здесь не заводится. */}
            <AddTrBtn onClick={() => requestAdd('fuel')} />
          </div>
          <p className="mt-1 text-micro text-muted">
            {chosen ? chosen.n : transports.length > 0 ? 'Общая точка' : 'Техники в поездке пока нет'}
          </p>
        </div>
      )}

      {/* «Этап пройден» — та самая отметка, что стояла колонкой «Пройдено» в ленте.
          Кружок тот же (`Dot`), и он же зачёркивает название точки. */}
      <div className="mt-2 border-t border-line pt-1 pl-8">
        {canEdit ? (
          <button
            type="button"
            onClick={() =>
              onPatch((p) => {
                p.done = !p.done
              })
            }
            aria-label={`${point.n || 'Точка'}: ${point.done ? 'этап пройден' : 'этап впереди'}. Отметить`}
            aria-pressed={point.done}
            className="flex min-h-11 w-full items-center gap-2 rounded-lg text-left transition-colors hover:bg-zebra"
          >
            <Dot done={point.done} />
            <span className="min-w-0 flex-1 text-note text-ink">
              {point.done ? 'Этап пройден' : 'Этап впереди'}
            </span>
          </button>
        ) : (
          <span className="flex min-h-11 items-center gap-2">
            <Dot done={point.done} />
            <span className="min-w-0 flex-1 text-note text-muted">
              {point.done ? 'Этап пройден' : 'Этап впереди'}
            </span>
          </span>
        )}
      </div>

      {/* «Кто именно едет этой точкой» — ответ заказчика 05.08.2026 на вопрос,
          хватает ли привязки точки к технике. Поле `o` то же самое, что стояло
          в ленте, и отметиться может и участник без права правки точки: это его
          собственная отметка, за других он не отмечает.
          ⚠️ Ряд, а не список строк. Строками (аватар · имя · отметка, как было
          в ленте) три человека давали карточке лишние 100 px — при 562 px общей
          высоты на 390 это полторы страницы под одну метку. Форма ряда взята
          не с потолка: ровно так в этой же карточке стоит техника этажом выше. */}
      {people.length > 0 && (
        <div className="mt-1 border-t border-line pt-1 pl-8">
          <div className="flex flex-wrap items-center gap-1">
            {people.map((who) => (
              <RiderBtn
                key={who.id}
                who={who}
                on={!!point.o?.[who.id]}
                mine={who.id === perms.me}
                can={perms.canMark(who.id)}
                pointName={point.n}
                onSet={(v) =>
                  onPatch((p) => {
                    const o = { ...(p.o || {}) }
                    if (v) o[who.id] = 1
                    else delete o[who.id]
                    p.o = o
                  })
                }
              />
            ))}
          </div>
          <p className="mt-1 text-micro text-muted">
            {riders.length > 0 ? `Едут: ${riders.join(', ')}` : 'Кто едет — никто не отмечен'}
          </p>
        </div>
      )}

      {/* Подробности точки: метка этапа, чем добираемся, расстояние от прошлой
          точки, расстояния по дорогам и координаты. Блок общий с тем, что стоял
          в ленте (`road/RoutePointSetup`), — второй его копии не заведено.
          Свёрнут по умолчанию: карточка стоит НА карте, и раскрытая целиком она
          закрывала бы собой карту, ради которой её открыли. */}
      <div className="mt-1 flex items-center gap-1 border-t border-line pt-1 pl-8">
        <button
          type="button"
          onClick={() => setMore((v) => !v)}
          aria-expanded={more}
          className="flex min-h-11 min-w-0 flex-1 items-center gap-1.5 rounded-lg text-left text-note font-semibold text-accent-text transition-colors hover:bg-zebra"
        >
          <ChevronDown
            size={18}
            strokeWidth={1.75}
            aria-hidden
            className={cn('shrink-0 transition-transform', more && 'rotate-180')}
          />
          Подробности точки
        </button>
        {canEdit && (
          <CardBtn icon={Trash2} label="Убрать точку из маршрута" onClick={onDelete} danger />
        )}
      </div>

      {more && (
        <div className="border-t border-line pt-1 pl-8">
          <RoutePointSetup item={point} canEdit={canEdit} onPatch={onPatch} />
          <RoutePointCoords item={point} canEdit={canEdit} onPatch={onPatch} />
        </div>
      )}
    </div>
  )
}

/**
 * Кнопка карточки. Видимый кружок 28 px, зона нажатия — 44 px невидимым слоем:
 * карточка узкая, кнопка в 44 px заняла бы четверть её ширины, а промахиваться
 * пальцем человек не должен (постулат 7). Тот же приём, что у счётчика в Inline.tsx.
 */
function CardBtn({
  icon: Icon, label, onClick, danger,
}: {
  icon: LucideIcon
  label: string
  onClick: () => void
  danger?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        'relative grid size-7 shrink-0 place-items-center rounded-md transition-colors',
        'text-muted active:scale-95',
        danger ? 'hover:bg-accent-soft hover:text-accent-text' : 'hover:bg-zebra hover:text-ink',
        'before:absolute before:-inset-2 before:content-[""]',
      )}
    >
      <Icon size={18} strokeWidth={1.75} aria-hidden />
    </button>
  )
}

/**
 * Выбор техники для точки. Кружок берёт тон нитки этой техники — тот самый,
 * которым метка и линия нарисованы на карте, поэтому подписи «какой цвет чей»
 * здесь не нужно: она стоит под картой одна на всех.
 */
function TrBtn({
  tone, icon: Icon, label, on, onClick,
}: {
  tone: MapTone
  icon?: LucideIcon
  label: string
  on: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={on}
      title={label}
      className={cn(
        'relative grid size-8 shrink-0 place-items-center rounded-full transition-transform',
        'active:scale-95',
        on ? 'ring-2 ring-accent ring-offset-2 ring-offset-surface' : 'opacity-70',
        'before:absolute before:-inset-1.5 before:content-[""]',
      )}
      style={{ background: tone.fill, color: tone.text }}
    >
      {Icon ? <Icon size={16} strokeWidth={1.75} aria-hidden /> : null}
    </button>
  )
}

/**
 * Едет ли человек этой точкой — кружком в ряду, а не строкой списка.
 *
 * ⛔ Новый орган здесь не изобретён: это та же кнопка, что рядом выбирает технику
 * (`TrBtn`), только внутри неё лицо человека — `PersonHead` из `flops/Inline`,
 * тот же, каким люди подписаны в шапках всех таблиц. Состояние показано кольцом
 * и галочкой, а не одним лишь цветом (WCAG 1.4.1), и продублировано именами
 * в подписи под рядом.
 *
 * Права нет — рисуется только состояние, кнопки не бывает вовсе (постулат 6).
 */
function RiderBtn({
  who, on, mine, can, pointName, onSet,
}: {
  who: Person
  on: boolean
  mine: boolean
  can: boolean
  pointName: string
  onSet: (v: boolean) => void
}) {
  const label = `${who.name} едет точкой «${pointName || 'без названия'}»`
  const лицо = (
    <span className="relative grid size-8 place-items-center">
      <PersonHead name="" photo={who.photo} ini={who.ini || who.name.slice(0, 2)} mine={mine} size={28} />
      {on && (
        <span className="absolute -right-0.5 -bottom-0.5 grid size-4 place-items-center rounded-full bg-accent text-on-accent">
          <Check size={12} strokeWidth={2.5} aria-hidden />
        </span>
      )}
    </span>
  )
  if (!can) {
    return (
      <span role="img" aria-label={`${label}: ${on ? 'да' : 'нет'}`} className={cn(!on && 'opacity-50')}>
        {лицо}
      </span>
    )
  }
  return (
    <button
      type="button"
      onClick={() => onSet(!on)}
      aria-pressed={on}
      aria-label={`${label}. Отметить`}
      title={who.name}
      className={cn(
        'relative grid size-8 shrink-0 place-items-center rounded-full transition-transform',
        'active:scale-95',
        on ? 'ring-2 ring-accent ring-offset-2 ring-offset-surface' : 'opacity-60',
        'before:absolute before:-inset-1.5 before:content-[""]',
      )}
    >
      {лицо}
    </button>
  )
}

/**
 * «＋ Техника» — завести новую машину или лодку прямо от точки.
 *
 * Контуром, а не заливкой: рядом стоят кружки уже заведённой техники, и новый
 * залитый кружок читался бы как ещё одна из них. Размер и невидимая зона нажатия
 * те же, что у соседей, — ряд обязан выглядеть одним рядом.
 */
function AddTrBtn({ onClick }: { onClick: () => void }) {
  const label = 'Добавить технику — заведём её в «Дороге»'
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        'relative grid size-8 shrink-0 place-items-center rounded-full transition-colors',
        'border border-dashed border-line text-muted',
        'hover:border-accent hover:text-accent-text active:scale-95',
        'before:absolute before:-inset-1.5 before:content-[""]',
      )}
    >
      <Plus size={16} strokeWidth={1.75} aria-hidden />
    </button>
  )
}
