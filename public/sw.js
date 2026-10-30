// House Fight – service worker: cache offline dell'app + notifiche push
const CACHE = 'house-fight-v1'
const SHELL = ['./', './manifest.webmanifest', './icons/icon-192.png', './icons/badge-96.png']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  const url = new URL(req.url)
  if (req.method !== 'GET' || url.origin !== self.location.origin) return

  // Pagina: rete prima (per avere sempre l'ultima versione), cache se offline
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => { caches.open(CACHE).then((c) => c.put('./', res.clone())); return res })
        .catch(() => caches.match('./')),
    )
    return
  }

  // Asset (hanno l'hash nel nome): cache prima
  event.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)) }
      return res
    })),
  )
})

self.addEventListener('push', (event) => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch { data = { title: 'House Fight', body: event.data?.text() } }
  const title = data.title || 'House Fight'
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      tag: data.tag,
      renotify: !!data.tag,
      icon: './icons/icon-192.png',
      badge: './icons/badge-96.png',
      data: { url: data.url || './' },
      vibrate: [40, 60, 40],
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = new URL(event.notification.data?.url || './', self.registration.scope).href
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if (w.url.startsWith(self.registration.scope)) {
          w.navigate?.(target).catch(() => {})
          return w.focus()
        }
      }
      return self.clients.openWindow(target)
    }),
  )
})
