import type { Person } from '@/lib/types'

/**
 * Аватар участника в «Сборах»: квадрат со скруглением, а не круг —
 * фирменная черта дизайн-системы (docs/v2-ux-redesign.md, 5.2, строка `avatar`).
 * Фотографии нет — показываем инициал, чтобы строка не «проваливалась».
 */
export function GearAvatar({ p, size = 32 }: { p: Person; size?: 32 | 24 }) {
  return (
    <span
      className="grid shrink-0 place-items-center overflow-hidden rounded-lg bg-zebra text-[12px] font-semibold text-ink"
      style={{ width: size, height: size }}
      aria-hidden
    >
      {p.photo ? <img src={p.photo} alt="" className="size-full object-cover" /> : p.ini}
    </span>
  )
}
