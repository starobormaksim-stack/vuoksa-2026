import { Toaster as Sonner, type ToasterProps } from 'sonner'
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from 'lucide-react'
import { useTheme } from '@/theme'

/**
 * Тосты Pine-to-Pine. Компонент shadcn, переведённый на нашу тему (next-themes не ставим —
 * тема живёт в src/theme.ts как личная настройка браузера).
 * Снизу, 6 секунд, отступ 76 px — чтобы не перекрывать нижнюю панель на мобайле.
 */
const Toaster = ({ ...props }: ToasterProps) => {
  const { dark } = useTheme()

  return (
    <Sonner
      theme={dark ? 'dark' : 'light'}
      position="bottom-center"
      duration={6000}
      visibleToasts={3}
      offset={{ bottom: 'calc(76px + env(safe-area-inset-bottom))' }}
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          '--normal-bg': 'var(--surface)',
          '--normal-text': 'var(--ink)',
          '--normal-border': 'var(--line)',
          '--border-radius': 'var(--radius)',
        } as React.CSSProperties
      }
      toastOptions={{ classNames: { toast: 'cn-toast' } }}
      {...props}
    />
  )
}

export { Toaster }
