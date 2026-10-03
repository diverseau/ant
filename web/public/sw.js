// Ant service worker: shows push notifications and opens the right chat when one is tapped.
// No offline caching: antd serves the app and data, and a stale cached app would only confuse.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))

self.addEventListener('push', (e) => {
  let p = { title: 'Ant', body: '' }
  try {
    p = e.data.json()
  } catch {}
  e.waitUntil(
    self.registration.showNotification(p.title || 'Ant', {
      body: p.body || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: p.tag,
      renotify: !!p.tag,
      data: { url: p.url || '/' },
    }),
  )
})

self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  const url = new URL(e.notification.data?.url || '/', self.location.origin).href
  e.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const win = wins.find((w) => new URL(w.url).origin === self.location.origin)
      if (win) {
        await win.focus()
        win.postMessage({ type: 'open', url })
      } else await self.clients.openWindow(url)
    })(),
  )
})
