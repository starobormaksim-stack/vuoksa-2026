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
 * Служебный работник: приложение открывается и без сети, как обычное приложение
 * с экрана «Домой».
 *
 * ─── Сайт обязан обновляться сам (правка 04.08.2026) ───
 * Заказчику нельзя объяснять про Ctrl+Shift+R, а на телефоне такого и нет вовсе.
 * Поэтому здесь три вещи, которых раньше не было:
 *
 * 1. Версия сборки в адресе работника (`sw.js?v=…`). Для браузера это другой
 *    сценарий, значит он его перекачивает и ставит новым. Без версии адрес не
 *    менялся никогда — и работник жил вечно вместе со старым кешем.
 * 2. Проверка обновления при каждом возврате к вкладке. Телефон держит вкладку
 *    в памяти неделями и сам за обновлением не ходит.
 * 3. Перезагрузка страницы, когда новый работник встал у руля. Иначе свежий код
 *    лежит рядом, а человек по-прежнему смотрит старую версию.
 *
 * В офлайн-файле (открыт по file://) работника нет и быть не может — там
 * самодостаточность обеспечена тем, что весь код и данные лежат в одном HTML.
 */
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  /* Был ли работник у руля в момент загрузки. Если не было — это первая
     установка, и перезагружаться после неё не нужно: код и так свежий. */
  const hadController = !!navigator.serviceWorker.controller
  let reloading = false

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return
    reloading = true
    location.reload()
  })

  window.addEventListener('load', () => {
    /* Путь от корня сборки, а не от страницы: по красивому адресу
       `/vuoksa2026/Maks` относительный './sw.js' искался бы в несуществующей
       папке `/vuoksa2026/` и работник не поднимался бы вовсе. */
    navigator.serviceWorker
      .register(import.meta.env.BASE_URL + 'sw.js?v=' + __BUILD__)
      .then((reg) => {
        const check = () => {
          if (document.visibilityState === 'visible') void reg.update()
        }
        document.addEventListener('visibilitychange', check)
        /* Раз в час — на случай вкладки, которую не закрывают неделями. */
        window.setInterval(check, 60 * 60 * 1000)
      })
      .catch(() => {
        /* без работника приложение просто работает как обычный сайт */
      })
  })
}
