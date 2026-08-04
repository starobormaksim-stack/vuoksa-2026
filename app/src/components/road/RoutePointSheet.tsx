import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import type { LegMode, RouteLabel, RoutePoint } from '@/lib/types'
import { Btn, NumberSheet, PickSheet, ResponsiveSheet, SheetRow, TextSheet } from '@/components/flops'
import { Switch } from '@/components/ui/switch'
import { coordLabel, kmLabel, labelName, LABEL_OPTIONS, legName } from './roadx'

/**
 * Карточка точки маршрута (docs/v2-ux-redesign.md, 10.6):
 * время, название, заметка, метка, «как добираемся», расстояние и координаты.
 *
 * Координаты здесь не набираются руками: точка ставится и двигается на карте,
 * а карточка показывает то, что получилось.
 */

/** Что открыто вторым уровнем. */
type Level2 = null | 'time' | 'name' | 'note' | 'addr' | 'lab' | 'labT' | 'mode' | 'leg'

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
  const back = () => setLvl(null)
  const go = (l: Level2) => (canEdit ? () => setLvl(l) : undefined)
  const coord = coordLabel(item)

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
        {item.c ? <p className="text-sm leading-snug text-muted">{item.c}</p> : null}

        <div className="mt-2">
          <SheetRow label="Время" value={item.time || 'не поставлено'} empty={!item.time} onClick={go('time')} />
          <SheetRow label="Название" value={item.n || 'без названия'} empty={!item.n} onClick={go('name')} />
          <SheetRow label="Заметка" value={item.c || 'нет'} empty={!item.c} onClick={go('note')} />
          <SheetRow label="Метка" value={labelName(item) || 'без метки'} empty={!item.lab} onClick={go('lab')} />
          {item.lab === 'other' ? (
            <SheetRow label="Своя метка" value={item.labT || 'нет'} empty={!item.labT} onClick={go('labT')} />
          ) : null}
          <SheetRow label="Как добираемся" value={legName(item.mode)} onClick={go('mode')} />
          <SheetRow
            label="От прошлой точки"
            value={item.leg > 0 ? kmLabel(item.leg) : 'не считали'}
            empty={item.leg <= 0}
            hint={item.legSrc === 'osrm' ? 'Посчитано по карте' : undefined}
            onClick={go('leg')}
          />
          <SheetRow label="Адрес" value={item.addr || 'нет'} empty={!item.addr} onClick={go('addr')} />
          <SheetRow
            label="Координаты"
            value={coord || 'не поставлены'}
            empty={!coord}
            hint="Точка ставится и двигается на карте, во вкладке «Маршрут»"
          />

          {canEdit ? (
            <div className="flex min-h-14 items-center gap-3 border-b border-line/70 px-1">
              <label
                htmlFor={`done-${item.i}`}
                className="min-w-0 flex-1 py-2 text-[15px] font-medium text-muted"
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
              <Trash2 size={18} strokeWidth={1.5} aria-hidden />
              Убрать точку
            </Btn>
          </div>
        )}
      </ResponsiveSheet>

      {/* ─── второй уровень ─── */}
      <TextSheet
        open={lvl === 'time'}
        onOpenChange={(v) => !v && back()}
        onBack={back}
        title="Время"
        subtitle="Во сколько мы здесь — часы и минуты"
        value={item.time}
        placeholder="11:00"
        onDone={(v) =>
          onPatch((p) => {
            p.time = v
          })
        }
      />
      <TextSheet
        open={lvl === 'name'}
        onOpenChange={(v) => !v && back()}
        onBack={back}
        title="Название точки"
        subtitle={item.time}
        value={item.n}
        placeholder="Например, Приозерск: закупка"
        onDone={(v) =>
          v &&
          onPatch((p) => {
            p.n = v
          })
        }
      />
      <TextSheet
        open={lvl === 'note'}
        onOpenChange={(v) => !v && back()}
        onBack={back}
        title="Заметка"
        subtitle={item.n}
        value={item.c}
        multiline
        placeholder="Что здесь важно не забыть"
        onDone={(v) =>
          onPatch((p) => {
            p.c = v
          })
        }
      />
      <TextSheet
        open={lvl === 'addr'}
        onOpenChange={(v) => !v && back()}
        onBack={back}
        title="Адрес"
        subtitle={item.n}
        value={item.addr}
        placeholder="Улица, дом или ориентир"
        onDone={(v) =>
          onPatch((p) => {
            p.addr = v
          })
        }
      />
      <TextSheet
        open={lvl === 'labT'}
        onOpenChange={(v) => !v && back()}
        onBack={back}
        title="Своя метка"
        subtitle={item.n}
        value={item.labT}
        onDone={(v) =>
          onPatch((p) => {
            p.labT = v
          })
        }
      />
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
      <NumberSheet
        open={lvl === 'leg'}
        onOpenChange={(v) => !v && back()}
        onBack={back}
        title="От прошлой точки"
        subtitle={item.n}
        value={item.leg}
        kind="km"
        unit="км"
        hint={() => 'Это расстояние показывается в ленте и в расчёт бензина не идёт'}
        onChange={(v) =>
          onPatch((p) => {
            p.leg = v
            p.legSrc = 'hand'
          })
        }
      />
    </>
  )
}
