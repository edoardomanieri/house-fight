// Backend "demo": tutto in localStorage, sincronizzato tra le schede del browser.
// Serve per provare l'app senza configurare Supabase: si può impersonare il partner
// per validare le faccende.
import type { AppData, Backend, ChangeEvent, Chore, Completion, Member } from './types'

const KEY = 'house-fight-demo'
const USER_KEY = 'house-fight-demo-user'
const ME = 'demo-me'
const PARTNER = 'demo-partner'
const HID = 'demo-house'

const uuid = () => crypto.randomUUID()

type DB = AppData

const DEFAULT_CHORES: [string, string, number][] = [
  ['Lavare i piatti', '🍽️', 10], ['Lavastoviglie', '🫧', 5], ['Cucinare', '🍳', 15],
  ['Fare la spesa', '🛒', 15], ['Aspirapolvere', '🧹', 15], ['Lavare i pavimenti', '🪣', 20],
  ['Pulire il bagno', '🚽', 25], ['Lavatrice', '🧺', 10], ['Stendere / ritirare', '👕', 5],
  ['Stirare', '🔥', 20], ['Buttare la spazzatura', '🗑️', 5], ['Cambiare le lenzuola', '🛏️', 10],
]

function seed(): DB {
  const now = new Date()
  const chores: Chore[] = DEFAULT_CHORES.map(([name, emoji, points], i) => ({
    id: `chore-${i}`, household_id: HID, name, emoji, points, archived: false,
    created_by: ME, created_at: new Date(now.getFullYear() - 1, 0, 1).toISOString(),
  }))
  const members: Member[] = [
    { household_id: HID, user_id: ME, display_name: 'Edo', emoji: '🦊', color: '#eb6834' },
    { household_id: HID, user_id: PARTNER, display_name: 'Lei', emoji: '🐼', color: '#2a78d6' },
  ]
  // Storico finto degli ultimi ~10 mesi, con un po' di carattere per ciascuno
  const completions: Completion[] = []
  let r = 42
  const rand = () => ((r = (r * 16807) % 2147483647) / 2147483647)
  const prefs: Record<string, number[]> = { [ME]: [0, 2, 3, 10, 4], [PARTNER]: [1, 6, 7, 5, 9] }
  const start = new Date(now.getFullYear(), now.getMonth() - 9, 1)
  for (let d = new Date(start); d < now; d.setDate(d.getDate() + 1)) {
    for (const u of [ME, PARTNER]) {
      const n = Math.floor(rand() * 3)
      for (let k = 0; k < n; k++) {
        const pool = rand() < 0.6 ? prefs[u] : chores.map((_, i) => i)
        const c = chores[pool[Math.floor(rand() * pool.length)]]
        const when = new Date(d)
        when.setHours(8 + Math.floor(rand() * 14), Math.floor(rand() * 60))
        if (when > now) continue
        const fresh = now.getTime() - when.getTime() < 20 * 3600 * 1000
        const status = fresh ? 'pending' : rand() < 0.95 ? 'approved' : 'rejected'
        completions.push({
          id: uuid(), household_id: HID, chore_id: c.id, chore_name: c.name, chore_emoji: c.emoji,
          points: c.points, user_id: u, done_at: when.toISOString(), note: null, status,
          reviewed_by: status === 'pending' ? null : u === ME ? PARTNER : ME,
          reviewed_at: status === 'pending' ? null : when.toISOString(),
          review_note: status === 'rejected' ? 'Mmm… non mi risulta 🤨' : null,
          created_at: when.toISOString(),
        })
      }
    }
  }
  // Un paio di faccende del partner ancora da validare, per provare subito il flusso
  for (const [i, hoursAgo, note] of [[6, 2, 'Anche lo specchio ✨'], [7, 5, null]] as const) {
    const c = chores[i]
    const when = new Date(now.getTime() - hoursAgo * 3600 * 1000).toISOString()
    completions.push({
      id: uuid(), household_id: HID, chore_id: c.id, chore_name: c.name, chore_emoji: c.emoji, points: c.points,
      user_id: PARTNER, done_at: when, note, status: 'pending', reviewed_by: null, reviewed_at: null, review_note: null, created_at: when,
    })
  }
  completions.sort((a, b) => b.done_at.localeCompare(a.done_at))
  const dinners = [2, 3, 4, 5, 6, 7, 8, 9].map((i) => {
    const m = new Date(now.getFullYear(), now.getMonth() - i, 1)
    return { household_id: HID, month: `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`, paid_at: now.toISOString() }
  })
  return { household: { id: HID, name: 'Casa nostra', invite_code: 'DEMO42' }, members, chores, completions, dinners }
}

export function createDemoBackend(): Backend {
  const channel = 'BroadcastChannel' in window ? new BroadcastChannel('house-fight-demo') : null
  const authListeners = new Set<(u: string | null) => void>()

  const read = (): DB => {
    try {
      const raw = localStorage.getItem(KEY)
      if (raw) return JSON.parse(raw)
    } catch { /* storage non disponibile */ }
    const db = seed()
    write(db)
    return db
  }
  function write(db: DB) {
    try { localStorage.setItem(KEY, JSON.stringify(db)) } catch { /* ignora */ }
  }
  const currentUser = () => {
    try { return localStorage.getItem(USER_KEY) ?? ME } catch { return ME }
  }
  const emit = (e: ChangeEvent) => channel?.postMessage(e)
  const mutate = (fn: (db: DB) => void, e: ChangeEvent = { kind: 'other' }) => {
    const db = read()
    fn(db)
    write(db)
    emit(e)
  }

  return {
    mode: 'demo',
    async getUserId() { return currentUser() },
    onAuthChange(cb) {
      authListeners.add(cb)
      return () => authListeners.delete(cb)
    },
    async signIn() {},
    async signUp() { return { needsConfirmation: false } },
    async signOut() {
      try { localStorage.removeItem(KEY); localStorage.removeItem(USER_KEY) } catch { /* ignora */ }
      authListeners.forEach((cb) => cb(currentUser()))
    },
    async load() { return read() },
    subscribe(_hid, onChange) {
      const handler = (ev: MessageEvent<ChangeEvent>) => onChange(ev.data)
      channel?.addEventListener('message', handler)
      return () => channel?.removeEventListener('message', handler)
    },
    async createHousehold() {},
    async joinHousehold() {},
    async updateProfile(p) {
      const me = currentUser()
      mutate((db) => { db.members = db.members.map((m) => (m.user_id === me ? { ...m, ...p } : m)) })
    },
    async renameHousehold(name) { mutate((db) => { db.household.name = name }) },
    async saveChore({ id, name, emoji, points }) {
      mutate((db) => {
        if (id) db.chores = db.chores.map((c) => (c.id === id ? { ...c, name, emoji, points } : c))
        else db.chores.push({ id: uuid(), household_id: HID, name, emoji, points, archived: false, created_by: currentUser(), created_at: new Date().toISOString() })
      })
    },
    async setChoreArchived(id, archived) {
      mutate((db) => { db.chores = db.chores.map((c) => (c.id === id ? { ...c, archived } : c)) })
    },
    async logCompletion(choreId, { note, doneAt }) {
      const db = read()
      const c = db.chores.find((x) => x.id === choreId)!
      const now = new Date().toISOString()
      const comp: Completion = {
        id: uuid(), household_id: HID, chore_id: c.id, chore_name: c.name, chore_emoji: c.emoji, points: c.points,
        user_id: currentUser(), done_at: (doneAt ?? new Date()).toISOString(), note: note || null, status: 'pending',
        reviewed_by: null, reviewed_at: null, review_note: null, created_at: now,
      }
      mutate((d) => { d.completions.unshift(comp) }, { kind: 'completion_created', completion: comp })
      return comp
    },
    async reviewCompletion(id, approve, note) {
      const db = read()
      const c = db.completions.find((x) => x.id === id)
      if (!c || c.status !== 'pending') throw new Error('Questa faccenda è già stata valutata')
      if (c.user_id === currentUser()) throw new Error('Non puoi validare le tue faccende')
      const upd: Completion = { ...c, status: approve ? 'approved' : 'rejected', reviewed_by: currentUser(), reviewed_at: new Date().toISOString(), review_note: note || null }
      mutate((d) => { d.completions = d.completions.map((x) => (x.id === id ? upd : x)) }, { kind: 'completion_reviewed', completion: upd })
      return upd
    },
    async deleteCompletion(id) {
      mutate((db) => { db.completions = db.completions.filter((x) => x.id !== id) })
    },
    async setDinnerPaid(month, paid) {
      mutate((db) => {
        db.dinners = db.dinners.filter((d) => d.month !== month)
        if (paid) db.dinners.push({ household_id: HID, month, paid_at: new Date().toISOString() })
      })
    },
    async savePushSubscription() {},
    async removePushSubscription() {},
    async notify(req) {
      if (req.type === 'nudge') emit({ kind: 'nudge', from: currentUser() })
    },
    switchUser() {
      const next = currentUser() === ME ? PARTNER : ME
      try { localStorage.setItem(USER_KEY, next) } catch { /* ignora */ }
      authListeners.forEach((cb) => cb(next))
    },
  }
}
