import type { Backend } from './types'

const VAPID = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined

export const pushSupported = () =>
  'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

export const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true

export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent)

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || import.meta.env.DEV) return
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('SW', e))
  })
}

function urlBase64ToUint8Array(base64: string) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

async function registration() {
  if (!('serviceWorker' in navigator)) return null
  return (await navigator.serviceWorker.getRegistration()) ?? null
}

export async function currentPushSubscription() {
  const reg = await registration()
  return (await reg?.pushManager.getSubscription()) ?? null
}

/** Chiede il permesso e registra il dispositivo per le notifiche push. */
export async function enableNotifications(backend: Backend): Promise<'push' | 'local' | 'denied'> {
  if (!('Notification' in window)) return 'denied'
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') return 'denied'
  const reg = await registration()
  if (backend.mode === 'cloud' && VAPID && reg && 'PushManager' in window) {
    const sub = (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID) }))
    await backend.savePushSubscription(sub.toJSON())
    return 'push'
  }
  return 'local'
}

export async function disableNotifications(backend: Backend) {
  const sub = await currentPushSubscription()
  if (sub) {
    await backend.removePushSubscription(sub.endpoint)
    await sub.unsubscribe()
  }
}

/**
 * Notifica locale (quando l'app è aperta ma in background). Usa lo stesso `tag`
 * delle push del server, così non si vedono doppioni.
 */
export async function showLocalNotification(title: string, body: string, tag: string) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return
  const reg = await registration()
  const opts: NotificationOptions = { body, tag, icon: './icons/icon-192.png', badge: './icons/badge-96.png' }
  if (reg) await reg.showNotification(title, opts)
  else new Notification(title, opts)
}

export function setBadge(n: number) {
  const nav = navigator as Navigator & { setAppBadge?: (n: number) => Promise<void>; clearAppBadge?: () => Promise<void> }
  try {
    if (n > 0) nav.setAppBadge?.(n)?.catch(() => {})
    else nav.clearAppBadge?.()?.catch(() => {})
  } catch { /* non supportato */ }
}
