import type { SectionDef } from '../sections'

/** Пустое состояние раздела, который ещё переезжает из v1. */
export function Placeholder({ section }: { section: SectionDef }) {
  const Icon = section.icon
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-xl border border-line bg-surface px-6 py-16 text-center shadow-sm">
      <span className="grid size-16 place-items-center rounded-full bg-zebra text-muted">
        <Icon size={28} strokeWidth={1.75} aria-hidden />
      </span>
      <div>
        <h2 className="text-head font-[700] text-ink">{section.title}</h2>
        <p className="mt-1 text-note text-muted">Раздел переезжает из первой версии.</p>
      </div>
    </div>
  )
}
