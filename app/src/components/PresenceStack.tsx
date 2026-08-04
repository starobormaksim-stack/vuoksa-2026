import type { Person } from '../lib/types'

/**
 * Стопка аватарок «сейчас здесь». Пока заглушка: показывает участников из документа,
 * без реального присутствия. TODO: онлайн-присутствие появится вместе с синхронизацией.
 */
export function PresenceStack({ people }: { people: Person[] }) {
  const shown = people.slice(0, 4)
  const rest = people.length - shown.length
  return (
    <div className="flex items-center" aria-label="Участники поездки">
      {shown.map((p, idx) => (
        <span
          key={p.id}
          title={p.name}
          className="grid size-7 place-items-center overflow-hidden rounded-lg border-2 border-bg bg-zebra text-xs font-semibold text-ink"
          style={{ marginLeft: idx === 0 ? 0 : -8, zIndex: shown.length - idx }}
        >
          {p.photo ? (
            <img src={p.photo} alt={p.name} className="size-full object-cover" />
          ) : (
            p.ini
          )}
        </span>
      ))}
      {rest > 0 && (
        <span className="ml-1 text-xs font-semibold text-muted">+{rest}</span>
      )}
    </div>
  )
}
