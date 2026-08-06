import type { Notes } from '@/lib/types'
import { InlineText } from '@/components/flops'

/**
 * Подписи чисел из документа заказчика: заголовок, единица и пояснение.
 *
 * В расчёте у числа стоит имя столбца (на 1280) или подпись полки (на 390),
 * а СВОЯ подпись строки — та, что стоит в его таблице, — живёт здесь
 * и правится, как всё остальное (постулат 1: видно — значит правится).
 *
 * ⚠️ Приехал сюда из `TransportSheet.tsx`, когда обе шторки расчёта были
 * упразднены (06.08.2026). Файл общий: подписи чисел есть и у техники,
 * и у аренды, и форма у них одна.
 */
export function DocNotes({
  nt, can, onSave,
}: {
  nt: Notes | undefined
  can: boolean
  onSave: (key: string, part: 't' | 'u' | 'c', v: string) => void
}) {
  const list = Object.entries(nt ?? {})
  if (list.length === 0) return null
  return (
    <div className="mt-4 rounded-xl border border-line bg-bg p-3">
      {/* Заголовок набран как подписи остальных групп раскрытия (`SetupGroup`):
          четыре группы позиции обязаны выглядеть одинаково. */}
      <div className="text-micro font-bold tracking-wider text-muted uppercase">
        Как подписано в документе
      </div>
      {list.map(([key, n]) => (
        <div key={key} className="mt-2">
          <InlineText
            value={n.t}
            onSave={(v) => onSave(key, 't', v)}
            can={can}
            label="Подпись числа"
            placeholder="Подпись"
            className="text-body leading-snug text-ink"
          />
          <InlineText
            value={n.u ?? ''}
            onSave={(v) => onSave(key, 'u', v)}
            can={can}
            label="Единица измерения"
            placeholder="Единица"
            className="text-note text-muted"
          />
          <InlineText
            value={n.c ?? ''}
            onSave={(v) => onSave(key, 'c', v)}
            can={can}
            multiline
            label="Пояснение"
            placeholder="Пояснение"
            className="text-note leading-snug text-muted"
          />
        </div>
      ))}
    </div>
  )
}
