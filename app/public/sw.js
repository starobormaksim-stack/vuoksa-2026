/* Служебный работник Pine-to-Pine: приложение открывается и работает без интернета.
   Стратегия «сначала сеть» для разметки и «сначала кеш» для собранных ресурсов
   (у них хеш в имени, значит содержимое неизменно). Чужие домены — Supabase,
   погода, тайлы карты — не кешируем: они уходят мимо работника. */
var CACHE = 'pine-to-pine-v2-1'
var CORE = ['./', './index.html', './manifest.webmanifest', './favicon.svg']

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches
      .open(CACHE)
      .then(function (c) {
        return c.addAll(CORE)
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
            if (k !== CACHE) return caches.delete(k)
          }),
        )
      })
      .then(function () {
        return self.clients.claim()
      }),
  )
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

  /* Собранные файлы с хешем в имени неизменны — отдаём из кеша сразу. */
  var immutable = /\/assets\/.+\.(js|css|woff2?|ttf|png|svg|jpe?g)$/.test(url.pathname)
  if (immutable) {
    e.respondWith(
      caches.match(req).then(function (hit) {
        return (
          hit ||
          fetch(req).then(function (res) {
            var copy = res.clone()
            caches.open(CACHE).then(function (c) {
              c.put(req, copy)
            })
            return res
          })
        )
      }),
    )
    return
  }

  /* Всё остальное: свежее из сети, без сети — из кеша. */
  e.respondWith(
    fetch(req)
      .then(function (res) {
        var copy = res.clone()
        caches.open(CACHE).then(function (c) {
          c.put(req, copy)
        })
        return res
      })
      .catch(function () {
        return caches.match(req).then(function (hit) {
          return hit || caches.match('./index.html')
        })
      }),
  )
})
