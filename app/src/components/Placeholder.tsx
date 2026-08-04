import type { SectionDef } from '../sections'

/** Пустое состояние раздела, который ещё переезжает из v1. */
export function Placeholder({ section }: { section: SectionDef }) {
  const Icon = section.icon
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-2xl border border-line bg-surface px-6 py-16 text-center shadow-sm">
      <span className="grid size-14 place-items-center rounded-2xl bg-accent-soft text-accent-deep">
        <Icon size={26} strokeWidth={1.5} aria-hidden />
      </span>
      <div>
        <h2 className="text-xl font-bold">{section.title}</h2>
        <p className="mt-1 text-muted">Раздел переезжает из первой версии.</p>
      </div>
    </div>
  )
}
