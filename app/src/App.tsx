import { motion } from 'motion/react'
import { TentTree } from 'lucide-react'

// Технологическая проба PackFlow v2: React + Tailwind + Motion + Lucide.
// Настоящий интерфейс собирается после утверждения схемы разделов (docs/v2-architecture.md)
// и дизайн-системы (docs/v2-design-system.md).
function App() {
  return (
    <main className="min-h-svh flex flex-col items-center justify-center gap-4 p-6 text-center">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.2, 0.8, 0.2, 1] }}
        className="flex flex-col items-center gap-4"
      >
        <span
          className="grid size-16 place-items-center rounded-full"
          style={{ background: 'var(--brand-pine)', color: 'var(--brand-parchment)' }}
        >
          <TentTree size={30} strokeWidth={1.5} aria-hidden />
        </span>
        <h1 className="font-serif text-4xl" style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}>
          PackFlow
        </h1>
        <p className="max-w-md text-balance opacity-70">
          Здесь строится вторая версия сборного листа. Рабочая версия «Вуокса‑2026» живёт по прежнему
          адресу и продолжает работать.
        </p>
      </motion.div>
    </main>
  )
}

export default App
