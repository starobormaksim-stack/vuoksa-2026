/**
 * Кольцо готовности сборов.
 * TODO: считать процент из статусов позиций «Сборов» (упаковано/в машине к общему числу).
 * Пока значение — заглушка, чтобы поставить композицию обложки.
 */
const READY_STUB = 0

export function ReadyRing({ value = READY_STUB }: { value?: number }) {
  const v = Math.max(0, Math.min(100, value))
  const r = 52
  const c = 2 * Math.PI * r

  return (
    <div className="flex items-center gap-4 rounded-2xl border border-line bg-card p-4 shadow-sm">
      <svg
        width="120"
        height="120"
        viewBox="0 0 120 120"
        role="img"
        aria-label={`Готовность сборов ${v} процентов`}
        className="shrink-0 -rotate-90"
      >
        <circle cx="60" cy="60" r={r} fill="none" stroke="var(--zebra)" strokeWidth="10" />
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          stroke="var(--pine)"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - v / 100)}
        />
        <text
          x="60"
          y="60"
          textAnchor="middle"
          dominantBaseline="central"
          transform="rotate(90 60 60)"
          className="tnum"
          style={{ fill: 'var(--ink)', fontSize: 26, fontWeight: 700 }}
        >
          {v}%
        </text>
      </svg>
      <div>
        <div className="text-base font-semibold">Готовность</div>
        <p className="mt-0.5 text-sm text-muted">
          Считается по статусам «Сборов» — подключим вместе с разделом.
        </p>
      </div>
    </div>
  )
}
