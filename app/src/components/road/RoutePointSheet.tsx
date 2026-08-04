import { useState } from 'react'
import { MapPinned, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import type { LegMode, RouteLabel, RoutePoint } from '@/lib/types'
import { Btn, InlineNum, InlineText, PickSheet, ResponsiveSheet, SheetRow } from '@/components/flops'
import { Switch } from '@/components/ui/switch'
import { plural } from '@/format'
import { calcLegsByMap } from './legs'
import { coordLabel, dg, kmLabel, labelName, LABEL_OPTIONS, legName } from './roadx'

/**
 * Карточка точки маршрута — только то, что выбирается из списка.
 *
 * ⚠️ Время, название, описание и адрес отсюда ушли: они правятся прямо в строке
 * ленты (RouteTiming). Здесь осталась метка этапа, чем добираемся до точки,
 * расстояние от прошлой точки и снятие точки с карты.
 *
 * Координаты руками не набираются: точка ставится и двигается на карте,
 * а карточка показывает то, что получилось.
 *
 * Карточку открывает и лента, и карта — поэтому она живёт отдельным файлом.
 */

/** Что открыто вторым уровнем. */
type Level2 = null | 'lab' | 'mode'

interface Props {
  item: RoutePoint
  /** порядковый номер в ленте — им же подписан маркер на карте */
  index: number
  canEdit: boolean
  canDelete: boolean
  onPatch: (f: (p: RoutePoint) => void) => void
  onDelete: () => void
  onClose: () => void
}

export function RoutePointSheet({
  item, index, canEdit, canDelete, onPatch, onDelete, onClose,
}: Props) {
  const [lvl, setLvl] = useState<Level2>(null)
  /** идёт запрос к маршрутизатору */
  const [busy, setBusy] = useState(false)
  const back = () => setLvl(null)
  const go = (l: Level2) => (canEdit ? () => setLvl(l) : undefined)
  const coord = coordLabel(item)

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

  const sub = [item.time, labelName(item)].filter(Boolean).join(' · ')

  return (
    <>
      <ResponsiveSheet
        open={lvl === null}
        onOpenChange={(v) => !v && onClose()}
        title={item.n || 'Точка маршрута'}
        subtitle={sub || `Точка ${index}`}
        footer={
          <Btn scale="lg" className="w-full" onClick={onClose}>
            Готово
          </Btn>
        }
      >
        <div>
          <SheetRow
            label="Метка"
            value={labelName(item) || 'без метки'}
            empty={!item.lab}
            onClick={go('lab')}
          />
          {item.lab === 'other' ? (
            <div className="border-b border-line py-2">
              <div className="text-note font-semibold text-muted">Своя метка</div>
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
            </div>
          ) : null}
          <SheetRow label="Как добираемся" value={legName(item.mode)} onClick={go('mode')} />

          <div className="flex min-h-14 items-center gap-3 border-b border-line px-1">
            <span className="min-w-0 flex-1 text-body font-medium text-muted">
              От прошлой точки
            </span>
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
          </div>
          <p className="-mt-1 pb-3 pl-1 text-note text-muted">
            {item.legSrc === 'osrm'
              ? 'Посчитано по карте. В расчёт бензина это расстояние не идёт'
              : 'В расчёт бензина это расстояние не идёт — оно только показывается в ленте'}
          </p>

          {canEdit && (
            <div className="border-b border-line py-2">
              <Btn tone="secondary" disabled={busy} onClick={() => void byMap()}>
                <MapPinned size={18} strokeWidth={1.75} aria-hidden />
                {busy ? 'Считаем по карте…' : 'Посчитать по карте'}
              </Btn>
              <p className="mt-1 text-note leading-snug text-muted">
                Расстояния между всеми точками возьмём по дорогам. Руками вписанное
                число встанет поверх.
              </p>
            </div>
          )}

          <SheetRow
            label="Координаты"
            value={coord || 'не поставлены'}
            empty={!coord}
            hint="Точка ставится и двигается на карте"
          />

          {canEdit ? (
            <div className="flex min-h-14 items-center gap-3 border-b border-line px-1">
              <label
                htmlFor={`done-${item.i}`}
                className="min-w-0 flex-1 py-2 text-body font-medium text-muted"
              >
                Этап пройден
              </label>
              <Switch
                id={`done-${item.i}`}
                checked={!!item.done}
                onCheckedChange={(v) =>
                  onPatch((p) => {
                    p.done = v
                  })
                }
              />
            </div>
          ) : (
            <SheetRow label="Этап пройден" value={item.done ? 'да' : 'нет'} />
          )}
        </div>

        {canEdit && coord && (
          <Btn
            tone="ghost"
            className="mt-2 -ml-3"
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
        )}

        {canDelete && (
          <div className="mt-6 border-t border-line pt-4">
            <Btn
              tone="danger"
              className="w-full"
              onClick={() => {
                onDelete()
                onClose()
              }}
            >
              <Trash2 size={18} strokeWidth={1.75} aria-hidden />
              Убрать точку
            </Btn>
          </div>
        )}
      </ResponsiveSheet>

      {/* ─── второй уровень: выбор из списка ─── */}
      <PickSheet
        open={lvl === 'lab'}
        onOpenChange={(v) => !v && back()}
        onBack={back}
        title="Метка"
        subtitle={item.n}
        value={item.lab}
        options={LABEL_OPTIONS.map((o) => ({ id: o.id, title: o.title }))}
        onPick={(id) =>
          onPatch((p) => {
            p.lab = id as RouteLabel
          })
        }
      />
      <PickSheet
        open={lvl === 'mode'}
        onOpenChange={(v) => !v && back()}
        onBack={back}
        title="Как добираемся"
        subtitle={`До точки «${item.n}»`}
        value={item.mode}
        options={[
          { id: 'road', title: 'По дороге', hint: 'этот кусок едем на машинах' },
          { id: 'water', title: 'По воде', hint: 'идём на лодке' },
          { id: 'walk', title: 'Пешком', hint: 'несём вещи руками' },
        ]}
        onPick={(id) =>
          onPatch((p) => {
            p.mode = id as LegMode
          })
        }
      />
    </>
  )
}
