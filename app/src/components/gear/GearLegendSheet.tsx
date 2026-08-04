import { ResponsiveSheet, StatusDial } from '@/components/flops'
import type { StatusValue } from '@/lib/gearx'
import { ST_NAME } from '@/lib/gearx'

/**
 * Что означают кружки в ячейках. Шторка здесь не редактор, а объяснение правила:
 * значков пять, а места под их подписи в таблице нет. Открывается кнопкой
 * в заголовке раздела и ничего не меняет в документе.
 */
interface Row {
  v: StatusValue
  cant?: boolean
  title: string
  text: string
}

const ROWS: Row[] = [
  { v: 0, title: ST_NAME[0], text: 'Вещь ещё не собрана. В готовность не идёт.' },
  { v: 1, title: ST_NAME[1], text: 'Часть лежит, часть ищется. В готовность не идёт.' },
  { v: 2, title: ST_NAME[2], text: 'Собрано и лежит наготове. Идёт в готовность.' },
  { v: 3, title: ST_NAME[3], text: 'Уже погружено в машину. Идёт в готовность.' },
  {
    v: 0,
    cant: true,
    title: 'не могу взять',
    text: 'Вещь остаётся в списке с пометкой и причиной: владелец увидит её и передаст другому. В готовность не идёт.',
  },
]

export function GearLegendSheet({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Что означают значки"
      subtitle="Собранными считаются «упаковано» и «в машине»"
    >
      <ul className="pb-2">
        {ROWS.map((r) => (
          <li key={r.title} className="flex items-start gap-3 border-b border-line/70 py-2 last:border-b-0">
            <StatusDial value={r.v} cant={r.cant} />
            <span className="min-w-0 flex-1 py-1">
              <span className="block text-body font-semibold text-ink">{r.title}</span>
              <span className="mt-0.5 block text-note leading-snug text-muted">{r.text}</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="text-note leading-snug text-muted">
        Значки идут по кругу: от «не взято» до «не могу взять» и снова к началу.
      </p>
    </ResponsiveSheet>
  )
}
