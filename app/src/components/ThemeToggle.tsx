import { Moon, Sun } from 'lucide-react'

/** Переключатель темы. Тема — личная настройка браузера (см. src/theme.ts). */
export function ThemeToggle({ dark, onToggle }: { dark: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={dark ? 'Включить светлую тему' : 'Включить тёмную тему'}
      className="grid size-11 place-items-center rounded-xl text-muted transition-colors hover:bg-zebra hover:text-ink"
    >
      {dark ? <Sun size={21} strokeWidth={1.5} /> : <Moon size={21} strokeWidth={1.5} />}
    </button>
  )
}
