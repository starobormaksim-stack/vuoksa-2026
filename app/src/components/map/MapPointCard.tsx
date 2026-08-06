import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { Car, Footprints, Plus, Sailboat, Trash2, X, type LucideIcon } from 'lucide-react'
import type { LegMode, RoutePoint, Transport } from '@/lib/types'
import { InlineText } from '@/components/flops'
import { requestAdd } from '@/lib/addnew'
import { travels } from '@/components/road/roadx'
import { cn } from '@/lib/utils'
import { toneAt, COMMON_TONE, type MapTone } from './marks'

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
 */

interface Props {
  point: RoutePoint
  /** номер точки в маршруте — тот же, что нарисован в метке */
  index: number
  canEdit: boolean
  /** техника поездки: из неё выбирают, чья это точка */
  transports: Transport[]
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
  /** точка перестала быть новой: название сохранили, Esc её больше не убирает */
  onKeep: () => void
  onDelete: () => void
  onClose: () => void
  /** карточку трогают — держать её открытой, даже если курсор ушёл с метки */
  onPin: () => void
  onPointerEnter: () => void
  onPointerLeave: () => void
}

/** Значок участка — тот же, что карта рисует в углу метки. */
const LEG_ICONS: Record<LegMode, LucideIcon> = {
  road: Car,
  water: Sailboat,
  walk: Footprints,
}

export function MapPointCard({
  point, index, canEdit, transports, busy, fresh, flat,
  onPatch, onKeep, onDelete, onClose, onPin, onPointerEnter, onPointerLeave,
}: Props) {
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
   * месту в этом списке (`toneAt`), и после фильтра кружок в карточке взял бы
   * чужой цвет — тот, каким на карте нарисована другая техника.
   *
   * Уже выбранная техника остаётся в ряду всегда, даже если ездить она перестала:
   * иначе снять привязку было бы нечем (постулат 4).
   */
  const offered = transports
    .map((t, idx) => ({ t, idx }))
    .filter(({ t }) => travels(t) || chosen?.i === t.i)

  return (
    <div
      onKeyDownCapture={keys}
      onPointerDown={onPin}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      className={cn(
        'bg-surface p-2',
        flat ? 'w-full' : 'w-64 rounded-xl border border-line shadow-lg',
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

      {/* Адрес не правится: он следует за координатами, а координаты — за меткой. */}
      <p className="mt-1 pl-8 text-micro leading-snug text-muted">
        {busy ? 'Адрес ищем…' : point.addr || 'Адрес не нашёлся — метку можно подвинуть'}
      </p>

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
                tone={toneAt(idx)}
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

      {canEdit && (
        <div className="mt-1 flex justify-end">
          <CardBtn icon={Trash2} label="Убрать точку из маршрута" onClick={onDelete} danger />
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
