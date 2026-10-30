import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createDemoBackend } from './lib/demoBackend'
import { confetti, haptic } from './lib/fx'
import { setBadge, showLocalNotification } from './lib/notifications'
import { createSupabaseBackend } from './lib/supabaseBackend'
import type { AppData, Backend, ChangeEvent, Member } from './lib/types'

const URL_ = import.meta.env.VITE_SUPABASE_URL as string | undefined
const KEY_ = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const backend: Backend = URL_ && KEY_ ? createSupabaseBackend(URL_, KEY_) : createDemoBackend()

export interface Toast {
  id: number
  text: string
  tone?: 'ok' | 'bad' | 'info'
}

interface Store {
  backend: Backend
  ready: boolean
  userId: string | null
  data: AppData | null
  me: Member | null
  partner: Member | null
  member: (id: string | null | undefined) => Member | undefined
  reload: () => Promise<void>
  /** Esegue un'azione mostrando eventuali errori e ricaricando i dati */
  run: <T>(fn: () => Promise<T>, okText?: string) => Promise<T | undefined>
  toasts: Toast[]
  toast: (text: string, tone?: Toast['tone']) => void
}

const Ctx = createContext<Store | null>(null)

export function useStore() {
  const s = useContext(Ctx)
  if (!s) throw new Error('StoreProvider mancante')
  return s
}

/** Come useStore ma garantisce che dati e giocatore esistano (schermate interne) */
export function useGame() {
  const s = useStore()
  return { ...s, data: s.data!, me: s.me! }
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [data, setData] = useState<AppData | null>(null)
  const [toasts, setToasts] = useState<Toast[]>([])
  const toastId = useRef(0)

  const toast = useCallback((text: string, tone: Toast['tone'] = 'info') => {
    const id = ++toastId.current
    setToasts((t) => [...t.slice(-2), { id, text, tone }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3800)
  }, [])

  const reload = useCallback(async () => {
    try {
      const uid = await backend.getUserId()
      setUserId(uid)
      setData(uid ? await backend.load() : null)
    } catch (e) {
      console.error(e)
      toast(`Errore di caricamento: ${(e as Error).message}`, 'bad')
    } finally {
      setReady(true)
    }
  }, [toast])

  useEffect(() => {
    reload()
    return backend.onAuthChange(() => { reload() })
  }, [reload])

  // Ricarica quando l'app torna in primo piano e periodicamente
  useEffect(() => {
    const onVis = () => { if (document.visibilityState === 'visible') reload() }
    document.addEventListener('visibilitychange', onVis)
    const t = setInterval(() => { if (document.visibilityState === 'visible') reload() }, 60_000)
    return () => { document.removeEventListener('visibilitychange', onVis); clearInterval(t) }
  }, [reload])

  const members = data?.members ?? []
  const me = members.find((m) => m.user_id === userId) ?? null
  const partner = members.find((m) => m.user_id !== userId) ?? null

  // Realtime: aggiorna i dati e avvisa con toast / notifiche locali
  const latest = useRef({ me, partner })
  latest.current = { me, partner }
  const hid = data?.household.id
  useEffect(() => {
    if (!hid) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const unsub = backend.subscribe(hid, (e: ChangeEvent) => {
      const { me, partner } = latest.current
      clearTimeout(timer)
      timer = setTimeout(reload, 250)
      if (!me) return
      const who = partner ? `${partner.emoji} ${partner.display_name}` : 'Il partner'
      if (e.kind === 'completion_created' && e.completion.user_id !== me.user_id) {
        const c = e.completion
        const text = `${who} ha fatto ${c.chore_emoji} ${c.chore_name}: da validare!`
        toast(text, 'info'); haptic([20, 40, 20])
        if (document.hidden) showLocalNotification(`${who}: ${c.chore_emoji} ${c.chore_name}`, `+${c.points} punti in attesa della tua validazione ✅`, `c-${c.id}`)
      } else if (e.kind === 'completion_reviewed' && e.completion.user_id === me.user_id && e.completion.reviewed_by !== me.user_id) {
        const c = e.completion
        if (c.status === 'approved') {
          toast(`✅ ${who} ha validato ${c.chore_name}: +${c.points}!`, 'ok')
          if (!document.hidden) confetti([me.color, '#eda100', '#1baf7a'])
          else showLocalNotification(`✅ ${c.chore_name}: +${c.points} punti!`, `${who} ha validato la tua faccenda 💪`, `c-${c.id}`)
        } else {
          toast(`❌ ${who} ha rifiutato ${c.chore_name}${c.review_note ? `: “${c.review_note}”` : ''}`, 'bad')
          if (document.hidden) showLocalNotification(`❌ ${c.chore_name} rifiutata`, c.review_note ?? '', `c-${c.id}`)
        }
        haptic([30, 50, 30])
      } else if (e.kind === 'nudge' && e.from !== me.user_id) {
        toast(`🔔 ${who} ti stuzzica: dai un'occhiata!`, 'info'); haptic([60, 60, 60])
        if (document.hidden) showLocalNotification(`${who} ti stuzzica!`, 'Ci sono faccende da validare 👀', 'nudge')
      }
    })
    return () => { clearTimeout(timer); unsub() }
  }, [hid, reload, toast])

  // Badge dell'icona = faccende da validare
  const toReview = data?.completions.filter((c) => c.status === 'pending' && c.user_id !== userId).length ?? 0
  useEffect(() => { setBadge(toReview) }, [toReview])

  const run = useCallback(async <T,>(fn: () => Promise<T>, okText?: string) => {
    try {
      const r = await fn()
      if (okText) toast(okText, 'ok')
      await reload()
      return r
    } catch (e) {
      toast((e as Error).message, 'bad')
      haptic([80, 40, 80])
      return undefined
    }
  }, [reload, toast])

  const value = useMemo<Store>(() => ({
    backend, ready, userId, data, me, partner,
    member: (id) => data?.members.find((m) => m.user_id === id),
    reload, run, toasts, toast,
  }), [ready, userId, data, me, partner, reload, run, toasts, toast])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
