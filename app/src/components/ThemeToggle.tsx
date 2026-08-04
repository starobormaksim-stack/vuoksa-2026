import { Moon, Sun } from 'lucide-react'

/** Переключатель темы. Тема — личная настройка браузера (см. src/theme.ts). */
export function ThemeToggle({ dark, onToggle }: { dark: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={dark ? 'Включить светлую тему' : 'Включить тёмную тему'}
      className="grid size-11 place-items-center rounded-md text-muted transition-colors hover:bg-zebra/70 active:scale-[0.98]"
    >
      {dark ? <Sun size={20} strokeWidth={1.75} /> : <Moon size={20} strokeWidth={1.75} />}
    </button>
  )
}
