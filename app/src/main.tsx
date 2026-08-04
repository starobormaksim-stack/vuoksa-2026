import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

/**
 * Приложение на экране «Домой»: служебный работник кеширует оболочку,
 * и без сети страница открывается как обычно.
 *
 * В офлайн-файле (открыт по file://) работника нет и быть не может — там
 * самодостаточность обеспечена тем, что весь код и данные лежат в одном HTML.
 */
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    /* Путь от корня сборки, а не от страницы: по красивому адресу
       `/vuoksa2026/Maks` относительный './sw.js' искался бы в несуществующей
       папке `/vuoksa2026/` и работник не поднимался бы вовсе. */
    navigator.serviceWorker.register(import.meta.env.BASE_URL + 'sw.js').catch(() => {
      /* без работника приложение просто работает как обычный сайт */
    })
  })
}
