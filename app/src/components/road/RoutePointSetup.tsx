import { useState } from 'react'
import { Check, MapPinned } from 'lucide-react'
import { toast } from 'sonner'
import type { LegMode, RouteLabel, RoutePoint } from '@/lib/types'
import { Btn, InlineNum, InlinePick, InlineText, StripField } from '@/components/flops'
import { cn } from '@/lib/utils'
import { calcLegsByMap, legsWords } from './legs'
import { coordLabel, dg, LABEL_OPTIONS } from './roadx'

/**
 * Настройка точки маршрута — то, что выбирается из готового списка, и то, что
 * приходит с карты.
 *
 * ─── Откуда это здесь ───
 * Прежде метка этапа, способ передвижения, расстояние от прошлой точки,
 * координаты и снятие точки с карты жили в шторке `RoutePointSheet.tsx`
 * (два вложенных `PickSheet`). Заказчик 06.08.2026: «всё, что связано
 * с настройками по конкретным позициям, выпадающим списком, чтобы принцип был
 * везде единообразен». Шторка упразднена, а её содержимое стоит здесь — одним
 * блоком, который показывается и в раскрытой полоске ленты на телефоне
 * (`RouteStrip`), и в панели ПОД строкой матрицы на широком экране
 * (`RouteTiming`, кнопка ⚙). Один блок на оба вида: разойтись им нельзя,
 * документ-то один.
 *
 * ⛔ Ничего нового не написано: полка — `flops/StripField`, выбор из списка —
 * `flops/InlinePick` (список раскрывается ПОД значением и толкает содержимое
 * вниз, а не всплывает поверх), число — `flops/InlineNum`, кнопка — `flops/Btn`.
 * Образец расстановки — `road/RoadSetup.tsx`, сделанный тем же заходом.
 *
 * ⚠️ «Этап пройден» и удаление точки в САМ блок настройки не входят, и это
 * не потеря: кружок этапа и «убрать точку» стоят прямо в карточке метки, рядом,
 * а не внутри её подробностей. Двух органов на одно значение не бывает (У-53).
 * Сами органы — `Dot` и `Rider` — живут здесь же, внизу файла: они нужны и
 * карточке метки, и списку точек, а общий дом у них один.
 *
 * Координаты руками не набираются: точка ставится и двигается на карте,
 * а настройка показывает то, что получилось.
 */

interface Props {
  item: RoutePoint
  canEdit: boolean
  onPatch: (f: (p: RoutePoint) => void) => void
}

/** Чем добираемся до точки. Слова те же, что стояли в шторке. */
const MODE_OPTIONS: { id: LegMode; title: string; note: string }[] = [
  { id: 'road', title: 'По дороге', note: 'этот кусок едем на машинах' },
  { id: 'water', title: 'По воде', note: 'идём на лодке' },
  { id: 'walk', title: 'Пешком', note: 'несём вещи руками' },
]

export function RoutePointSetup({ item, canEdit, onPatch }: Props) {
  /** идёт запрос к маршрутизатору */
  const [busy, setBusy] = useState(false)

  /**
   * Посчитать расстояния между точками по дорогам (lib/osrm.ts).
   * Считается сразу весь маршрут: участок этой точки — часть цепочки,
   * в одиночку его не посчитать. Пробег поездки от этого молча не меняется.
   */
  const byMap = async () => {
    setBusy(true)
    const r = await calcLegsByMap()
    setBusy(false)
    if (r.ok) {
      toast(legsWords(r), { description: `Участков посчитано: ${r.legs}` })
      return
    }
    toast(
      r.why === 'few'
        ? 'На карте меньше двух точек — считать нечего'
        : 'Карта не ответила: похоже, нет сети. Расстояние можно вписать руками',
    )
  }

  return (
    <>
      <StripField label="Метка" wide>
        <InlinePick
          value={item.lab}
          can={canEdit}
          label={`${item.n || 'Точка'}: метка этапа`}
          placeholder="без метки"
          className="text-body text-ink"
          options={LABEL_OPTIONS.map((o) => ({ id: o.id, title: o.title }))}
          onPick={(id) =>
            onPatch((p) => {
              p.lab = id as RouteLabel
            })
          }
        />
      </StripField>

      {/* Своё название этапа есть только у метки «другое» — иначе полка молчала бы
          о том, куда это слово встанет. */}
      {item.lab === 'other' ? (
        <StripField label="Своя метка" wide>
          <InlineText
            value={item.labT}
            onSave={(v) =>
              onPatch((p) => {
                p.labT = v
              })
            }
            can={canEdit}
            label="Своя метка"
            placeholder="Как назвать этот этап"
            className="text-body text-ink"
          />
        </StripField>
      ) : null}

      <StripField label="Как добираемся" wide>
        <InlinePick
          value={item.mode}
          can={canEdit}
          label={`${item.n || 'Точка'}: чем добираемся`}
          placeholder="не указано"
          className="text-body text-ink"
          options={MODE_OPTIONS}
          onPick={(id) =>
            onPatch((p) => {
              p.mode = id as LegMode
            })
          }
        />
      </StripField>

      <StripField label="От прошлой точки" wide>
        <InlineNum
          value={item.leg}
          onSave={(v) =>
            onPatch((p) => {
              p.leg = v
              p.legSrc = 'hand'
            })
          }
          can={canEdit}
          kind="plain"
          digits={dg(item.leg)}
          unit="км"
          label="Расстояние от прошлой точки"
          className="text-body font-semibold text-ink"
        />
        <p className="mt-0.5 text-note leading-snug text-muted">
          {item.legSrc === 'osrm'
            ? 'Посчитано по дорогам. Входит в пробег своей техники'
            : item.legSrc === 'line'
              ? 'По воде и пешком дорог нет — расстояние по прямой'
              : 'Расстояние от прошлой точки этой же техники'}
        </p>
      </StripField>

      {canEdit ? (
        <StripField label="Расстояния по дорогам" wide>
          <Btn tone="secondary" disabled={busy} onClick={() => void byMap()}>
            <MapPinned size={18} strokeWidth={1.75} aria-hidden />
            {busy ? 'Считаем по карте…' : 'Посчитать по карте'}
          </Btn>
          <p className="mt-1 text-note leading-snug text-muted">
            Расстояния между всеми точками возьмём по дорогам. Руками вписанное
            число встанет поверх.
          </p>
        </StripField>
      ) : null}
    </>
  )
}

/**
 * Координаты точки и снятие её с карты.
 *
 * Полка отдельная, а не внутри общего блока: в ленте она стоит сразу под
 * строкой места (адрес и «на карте» — про то же самое), а в панели матрицы —
 * вместе с остальной настройкой.
 */
export function RoutePointCoords({ item, canEdit, onPatch }: Props) {
  const coord = coordLabel(item)

  return (
    <StripField label="Координаты" wide>
      <span className={coord ? 'tnum block text-body text-ink' : 'block text-body text-muted'}>
        {coord || 'не поставлены'}
      </span>
      <p className="mt-0.5 text-note leading-snug text-muted">
        Точка ставится и двигается на карте
      </p>
      {canEdit && coord ? (
        <Btn
          tone="ghost"
          className="mt-1 -ml-3"
          onClick={() => {
            const lat = item.lat
            const lon = item.lon
            onPatch((p) => {
              p.lat = undefined
              p.lon = undefined
            })
            toast('Точка убрана с карты', {
              action: {
                label: 'Отменить',
                onClick: () =>
                  onPatch((p) => {
                    p.lat = lat
                    p.lon = lon
                  }),
              },
            })
          }}
        >
          Убрать точку с карты
        </Btn>
      ) : null}
    </StripField>
  )
}

/**
 * Кружок этапа: 32 px внутри цели касания 44 px (правило 8).
 *
 * ⚠️ Стоял в `road/RouteTiming.tsx` — там, где жила матрица маршрута. Переехал
 * сюда 06.08.2026 вместе с переселением полей точки на карту: список точек
 * в «Дороге» заказчик отменил («не нужна вообще, просто список точек на карте»),
 * а орган остался нужен карточке метки.
 */
export function Dot({ done }: { done: boolean }) {
  return (
    <span
      className={cn(
        'grid size-8 place-items-center rounded-full border-2 bg-surface',
        done ? 'border-accent bg-accent text-on-accent' : 'border-line-strong',
      )}
      aria-hidden
    >
      {done && <Check size={18} strokeWidth={1.75} />}
    </span>
  )
}

/**
 * Едет ли человек этой точкой. Пусто — точка общая, поэтому пустая ячейка
 * не кричит: тире. Одно нажатие ставит отметку, второе снимает.
 * Права нет — рисуется только состояние, без кнопки (постулат 6).
 */
export function Rider({
  on, can, label, onSet,
}: {
  on: boolean
  can: boolean
  label: string
  onSet: (v: boolean) => void
}) {
  const mark = (
    <span
      className={cn(
        'grid size-6 place-items-center rounded-full border-[1.5px]',
        on ? 'border-accent bg-accent text-on-accent' : 'border-line-strong',
      )}
    >
      {on && <Check size={16} strokeWidth={1.75} aria-hidden />}
    </span>
  )
  if (!can) {
    return on ? (
      <span role="img" aria-label={label} className="grid size-11 place-items-center">
        {mark}
      </span>
    ) : (
      <span className="text-note text-muted">&#8212;</span>
    )
  }
  return (
    <button
      type="button"
      onClick={() => onSet(!on)}
      aria-pressed={on}
      aria-label={`${label}. Отметить`}
      className="grid size-11 place-items-center rounded-md transition-colors hover:bg-zebra/70 active:scale-[0.98]"
    >
      {on ? mark : <span className="text-note text-muted">&#8212;</span>}
    </button>
  )
}
