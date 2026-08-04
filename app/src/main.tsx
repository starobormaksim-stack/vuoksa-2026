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
 * ─── Сайт обязан обновляться сам (правка 04.08.2026, усилена в тот же день) ───
 * Заказчику нельзя объяснять про Ctrl+Shift+R, а на телефоне такого и нет вовсе.
 * Поэтому здесь несколько вещей, которых раньше не было:
 *
 * 1. Версия сборки в адресе работника (`sw.js?v=…`). Для браузера это другой
 *    сценарий, значит он его перекачивает и ставит новым. Без версии адрес не
 *    менялся никогда — и работник жил вечно вместе со старым кешем.
 * 2. Проверка обновления при каждом возврате к вкладке, раз в час, и
 *    дополнительно — при восстановлении страницы из «заднего» кеша браузера
 *    (bfcache, событие `pageshow`): туда страница попадает целым снимком без
 *    единого сетевого запроса, и `visibilitychange` при этом не всегда стреляет,
 *    если вкладка не переключалась, а вернулись «назад» внутри неё же.
 * 3. Перезагрузка страницы, когда новый работник встал у руля. Иначе свежий код
 *    лежит рядом, а человек по-прежнему смотрит старую версию.
 * 4. Явная просьба «встань к рулю» новому работнику (`SKIP_WAITING`), а не
 *    только надежда на его собственный `self.skipWaiting()`: если старый
 *    работник был поставлен ещё до этой правки и вкладку неделями не
 *    закрывали целиком, лишняя подстраховка ничего не стоит.
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

  /** Попросить работника, который «ждёт», встать к рулю немедленно. */
  const nudge = (w: ServiceWorker | null) => w?.postMessage('SKIP_WAITING')

  window.addEventListener('load', () => {
    /* Путь от корня сборки, а не от страницы: по красивому адресу
       `/vuoksa2026/Maks` относительный './sw.js' искался бы в несуществующей
       папке `/vuoksa2026/` и работник не поднимался бы вовсе. */
    navigator.serviceWorker
      .register(import.meta.env.BASE_URL + 'sw.js?v=' + __BUILD__)
      .then((reg) => {
        /* Уже есть кто-то в состоянии «ждёт» с прошлого визита — не ждём,
           подталкиваем сразу. */
        nudge(reg.waiting)
        reg.addEventListener('updatefound', () => {
          const fresh = reg.installing
          fresh?.addEventListener('statechange', () => {
            if (fresh.state === 'installed') nudge(reg.waiting)
          })
        })

        const check = () => {
          if (document.visibilityState === 'visible') void reg.update()
        }
        document.addEventListener('visibilitychange', check)
        /* Раз в час — на случай вкладки, которую не закрывают неделями. */
        window.setInterval(check, 60 * 60 * 1000)
        /* Возврат из bfcache — тоже повод проверить версию немедленно. */
        window.addEventListener('pageshow', (e) => {
          if (e.persisted) void reg.update()
        })
      })
      .catch(() => {
        /* Без работника приложение просто работает как обычный сайт: свежесть
           тогда полностью на HTTP-заголовках `_headers` (`no-cache` для
           `index.html`), а не на этом коде. */
      })
  })
}
