import { useState } from 'react'
import { MapPinned } from 'lucide-react'
import { toast } from 'sonner'
import type { LegMode, RouteLabel, RoutePoint } from '@/lib/types'
import { Btn, InlineNum, InlinePick, InlineText, StripField } from '@/components/flops'
import { plural } from '@/format'
import { calcLegsByMap } from './legs'
import { coordLabel, dg, kmLabel, LABEL_OPTIONS } from './roadx'

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
 * ⚠️ «Этап пройден» и удаление точки сюда НЕ переехали, и это не потеря: кружок
 * этапа стоит прямо в строке (колонка «Пройдено» в матрице, полка «Пройдено»
 * в ленте), а «убрать точку» — действие самой строки (`RowActions`). Двух
 * органов на одно значение не бывает (У-53).
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
      toast(
        `Посчитали по карте: ${r.legs} ${plural(r.legs, 'участок', 'участка', 'участков')} · ${kmLabel(r.km)} по дороге`,
      )
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
            ? 'Посчитано по карте. В расчёт бензина это расстояние не идёт'
            : 'В расчёт бензина это расстояние не идёт — оно только показывается в ленте'}
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
