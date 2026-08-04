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

/**
 * Цвет полоски браузера над страницей — `<meta name="theme-color">`.
 *
 * Встроенный браузер Телеграма на iOS красит по нему свою полоску (крестик, адрес,
 * «⋯»). Без этого полоска полупрозрачная и показывает сквозь себя содержимое
 * страницы — заказчик видел там карту и называл это «сквозным отверстием».
 * Значения — ровно фон сайта из index.css: крем в светлой теме, хвоя в тёмной.
 * Тег ищем без `media`: вариант с `media` слушает системную тему, а не выбранную
 * человеком внутри сайта.
 */
function setThemeColor(dark: boolean): void {
  const el = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]:not([media])')
  if (el) el.setAttribute('content', dark ? '#2B391A' : '#F9F3D4')
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
    setThemeColor(dark)
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
