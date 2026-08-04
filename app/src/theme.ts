import { useCallback, useEffect, useState } from 'react'

/**
 * Тема — личная настройка браузера, НЕ поле документа.
 * localStorage 'flops.theme': 'light' | 'dark' | null (null — следовать системе).
 * Класс .dark вешается на <html>; до загрузки React это делает инлайн-скрипт в index.html.
 */
export type ThemePref = 'light' | 'dark' | null

const KEY = 'flops.theme'

function readPref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' ? v : null
  } catch {
    return null
  }
}

export function useTheme(): { dark: boolean; toggle: () => void } {
  const [pref, setPref] = useState<ThemePref>(readPref)
  const [sysDark, setSysDark] = useState<boolean>(
    () => window.matchMedia('(prefers-color-scheme: dark)').matches,
  )

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (e: MediaQueryListEvent) => setSysDark(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const dark = pref ? pref === 'dark' : sysDark

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
  }, [dark])

  const toggle = useCallback(() => {
    const next: ThemePref = dark ? 'light' : 'dark'
    try {
      localStorage.setItem(KEY, next)
    } catch {
      /* приватный режим — тема просто не переживёт перезагрузку */
    }
    setPref(next)
  }, [dark])

  return { dark, toggle }
}
