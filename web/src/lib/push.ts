// Push notifications for this browser (on iPhone: only once Ant is added to the Home Screen).

export type PushState = 'unsupported' | 'needs-install' | 'denied' | 'off' | 'on'

const ios = () => /iPhone|iPad/.test(navigator.userAgent)
const standalone = () => matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true

export async function registerWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator) || !isSecureContext) return null
  try {
    return await navigator.serviceWorker.register('/sw.js')
  } catch {
    return null
  }
}

async function subscription(): Promise<PushSubscription | null> {
  const reg = await navigator.serviceWorker?.getRegistration()
  return (await reg?.pushManager.getSubscription()) ?? null
}

export async function pushState(): Promise<PushState> {
  if (ios() && !standalone()) return 'needs-install'
  if (!('PushManager' in window) || !('serviceWorker' in navigator) || !isSecureContext) return 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  return (await subscription()) ? 'on' : 'off'
}

function key(b64: string): Uint8Array<ArrayBuffer> {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4)
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

const post = (path: string, body: unknown) =>
  fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(async (r) => {
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? 'Request failed')
  })

export async function enablePush(): Promise<void> {
  const reg = (await registerWorker()) ?? (await navigator.serviceWorker.ready)
  if ((await Notification.requestPermission()) !== 'granted') throw new Error('Notifications are blocked for this site.')
  const { publicKey } = await (await fetch('/api/push/key')).json()
  const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key(publicKey) })
  const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } }
  await post('/api/push/subscribe', { endpoint: json.endpoint, keys: json.keys })
  await post('/api/push/test', { endpoint: json.endpoint })
}

export async function disablePush(): Promise<void> {
  const sub = await subscription()
  if (!sub) return
  await post('/api/push/unsubscribe', { endpoint: sub.endpoint }).catch(() => {})
  await sub.unsubscribe()
}
