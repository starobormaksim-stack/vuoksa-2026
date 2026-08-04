import { TriangleAlert } from 'lucide-react'
import { Btn, ResponsiveSheet } from '@/components/flops'
import { nameAcc } from '@/lib/gearx'

/**
 * Отказ по правам, сценарий 2 из раздела 12.2: действие человеку положено,
 * но не в этой строке. Поэтому не тост «в пустоту», как делал needRight() в v1,
 * а объяснение и альтернатива — попросить хозяина списка отметить самому.
 */
export function GearDeniedSheet({
  open,
  onOpenChange,
  personName,
  itemName,
  onAsk,
  onBack,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  personName: string
  itemName: string
  onAsk: () => void
  onBack?: () => void
}) {
  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={onOpenChange}
      onBack={onBack}
      title={`Отмечать за ${nameAcc(personName)} нельзя`}
      subtitle={itemName}
      footer={
        <Btn
          scale="lg"
          className="w-full"
          onClick={() => {
            onAsk()
            onOpenChange(false)
          }}
        >
          Попросить {nameAcc(personName)}
        </Btn>
      }
    >
      <div className="flex gap-3 rounded-2xl border border-accent-text bg-accent-soft p-3">
        <TriangleAlert size={20} strokeWidth={1.75} className="mt-0.5 shrink-0 text-accent-text" aria-hidden />
        <p className="text-sm leading-snug text-ink">
          Это его список. Поставим задачу — {personName} увидит просьбу у себя и отметит сам.
        </p>
      </div>
    </ResponsiveSheet>
  )
}
