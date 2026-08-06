/* Служебный работник Pine-to-Pine: приложение открывается и работает без интернета.

   ─── Почему файл переписан 04.08.2026 ───
   У заказчика на телефоне держалась старая версия сайта, и жёсткая перезагрузка
   не помогала. Виноват был прежний работник, и сразу по трём причинам:

   1. Имя кеша было вшито строкой и никогда не менялось. Значит, `activate` ничего
      не удалял, а сам работник браузер не перекачивал: сценарий по тому же адресу
      с тем же содержимым — обновлять нечего.
   2. Файлы из `/assets/` отдавались «сначала кеш» без единой проверки, ЧТО именно
      туда положили. А сразу после выкладки Cloudflare успевает ответить на запрос
      кода правилом `_redirects` — то есть отдать index.html вместо файла кода.
      Такой ответ ложился в кеш навсегда, и вылечить это перезагрузкой было нельзя.
   3. Никто не говорил странице, что приехала новая версия. Даже забрав свежий код,
      работник ждал закрытия всех вкладок.

   Теперь: версия сборки приходит в адресе работника (`sw.js?v=…`), от неё зависит
   имя кеша; ответы проверяются перед укладкой в кеш; страница сама перезагружается,
   когда новый работник встал у руля (см. `src/main.tsx`).

   Чужие домены — Supabase, погода, тайлы карты — работник не трогает вовсе. */

/* Версия сборки. Другой адрес сценария = браузер обязан его перекачать и поставить. */
var VERSION = new URL(self.location.href).searchParams.get('v') || 'dev'
var CACHE = 'pine-to-pine-' + VERSION
var SHELL = './index.html'
var CORE = ['./', SHELL, './manifest.webmanifest', './favicon.svg']

/** Файлы сборки: в имени хеш, содержимое неизменно. */
function isBuilt(url) {
  return /\/assets\/.+\.(js|css|woff2?|ttf|png|svg|jpe?g)$/.test(url.pathname)
}

/** Ответ пришёл разметкой — для файла кода это подмена от `_redirects`. */
function isHtml(res) {
  return (res.headers.get('content-type') || '').indexOf('text/html') !== -1
}

/** Такой ответ можно класть в кеш: свой домен, честные 200, не ошибка и не заглушка. */
function storable(res) {
  return !!res && res.status === 200 && res.type === 'basic'
}

/** Сеть с ограничением по времени: без него плохая связь вешает страницу насмерть. */
function fromNetwork(req, ms) {
  return new Promise(function (ok, fail) {
    var done = false
    var timer = setTimeout(function () {
      if (!done) {
        done = true
        fail(new Error('timeout'))
      }
    }, ms)
    fetch(req).then(
      function (res) {
        if (done) return
        done = true
        clearTimeout(timer)
        ok(res)
      },
      function (err) {
        if (done) return
        done = true
        clearTimeout(timer)
        fail(err)
      },
    )
  })
}

function keep(req, res) {
  var copy = res.clone()
  caches.open(CACHE).then(function (c) {
    c.put(req, copy)
  })
}

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches
      .open(CACHE)
      .then(function (c) {
        /* `cache: 'reload'` — мимо обычного кеша браузера: иначе в новую версию
           переезжает старая оболочка, и весь смысл смены версии пропадает. */
        return c.addAll(
          CORE.map(function (u) {
            return new Request(u, { cache: 'reload' })
          }),
        )
      })
      .catch(function () {})
      .then(function () {
        return self.skipWaiting()
      }),
  )
})

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches
      .keys()
      .then(function (keys) {
        return Promise.all(
          keys.map(function (k) {
            /* ⛔ Кеш `pine-me` не трогаем. В нём лежит личная ссылка, и это
               единственное хранилище, общее у Safari и у значка на домашнем
               экране iPhone (localStorage у них разный — У-107). Снести его
               при выкладке значит вернуть человеку экран входа. */
            if (k.indexOf('pine-me') === 0) return
            if (k !== CACHE) return caches.delete(k)
          }),
        )
      })
      .then(function () {
        return self.clients.claim()
      }),
  )
})

/* Подстраховка поверх собственного skipWaiting() из install. Свой вызов должен
   срабатывать всегда, но страница (src/main.tsx) на всякий случай умеет
   попросить об этом ещё раз явным сообщением — так работник не должен
   остаться висеть в состоянии «жду», пока никто не закрыл все вкладки. */
self.addEventListener('message', function (e) {
  if (e.data === 'SKIP_WAITING') self.skipWaiting()
})

self.addEventListener('fetch', function (e) {
  var req = e.request
  if (req.method !== 'GET') return
  var url
  try {
    url = new URL(req.url)
  } catch (err) {
    return
  }
  if (url.origin !== self.location.origin) return

  /* ── Файлы сборки: сначала кеш, но кладём в него только настоящий файл ── */
  if (isBuilt(url)) {
    e.respondWith(
      caches.match(req).then(function (hit) {
        if (hit) return hit
        return fetch(req).then(function (res) {
          /* Разметка вместо кода = файл ещё не разъехался по краям Cloudflare.
             В кеш такое класть нельзя: там оно осталось бы навсегда. */
          if (storable(res) && !isHtml(res)) keep(req, res)
          return res
        })
      }),
    )
    return
  }

  /* ── Сети заведомо нет — идём в кеш сразу ──
     Иначе человек, открывший значок в лесу, шесть секунд смотрит в пустоту,
     прежде чем увидит свой лист. Заказчик 06.08.2026: «если интернет пропадает,
     то офлайн-версия остаётся просто офлайн, и всё — в этом вся разница». */
  if (self.navigator && self.navigator.onLine === false) {
    e.respondWith(
      caches.match(req).then(function (hit) {
        if (hit) return hit
        return caches.match(SHELL).then(function (shell) {
          /* Оболочки нет вовсе — значит работника поставили только что и кеш
             ещё пуст. Тогда честная попытка сети: пусть браузер сам скажет. */
          return shell || fetch(req)
        })
      }),
    )
    return
  }

  /* ── Всё остальное (в первую очередь сама страница): сначала сеть ── */
  e.respondWith(
    fromNetwork(req, 6000)
      .then(function (res) {
        if (storable(res)) keep(req, res)
        return res
      })
      .catch(function () {
        return caches.match(req).then(function (hit) {
          return hit || caches.match(SHELL)
        })
      }),
  )
})
