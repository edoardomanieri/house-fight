import { useState, type FormEvent } from 'react'
import { ColorGrid, EmojiGrid, PLAYER_COLORS, PLAYER_EMOJIS } from '../components/ui'
import { useStore } from '../store'

export function AuthScreen() {
  const { backend, toast } = useStore()
  const [mode, setMode] = useState<'in' | 'up'>('in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      if (mode === 'in') await backend.signIn(email, password)
      else {
        const r = await backend.signUp(email, password)
        if (r.needsConfirmation) toast('Ti abbiamo mandato una mail: conferma l’indirizzo e poi accedi 📬', 'info')
      }
    } catch (err) {
      toast((err as Error).message, 'bad')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="welcome">
      <div className="hero">
        <div className="hero-logo">🥊🏠</div>
        <h1>House Fight</h1>
        <p>Chi fa più faccende vince. Chi perde offre la cena.</p>
      </div>
      <form className="card form" onSubmit={submit}>
        <label>Email<input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label>Password<input type="password" autoComplete={mode === 'in' ? 'current-password' : 'new-password'} minLength={6} required value={password} onChange={(e) => setPassword(e.target.value)} /></label>
        <button className="btn primary" disabled={busy}>{mode === 'in' ? 'Entra' : 'Crea account'}</button>
        <button type="button" className="btn ghost" onClick={() => setMode(mode === 'in' ? 'up' : 'in')}>
          {mode === 'in' ? 'Non hai un account? Registrati' : 'Hai già un account? Entra'}
        </button>
      </form>
    </div>
  )
}

export function OnboardingScreen() {
  const { backend, run } = useStore()
  const [tab, setTab] = useState<'create' | 'join'>('create')
  const [name, setName] = useState('')
  const [emoji, setEmoji] = useState(PLAYER_EMOJIS[0])
  const [color, setColor] = useState(PLAYER_COLORS[0])
  const [house, setHouse] = useState('Casa nostra')
  const [code, setCode] = useState('')

  async function submit(e: FormEvent) {
    e.preventDefault()
    const profile = { display_name: name.trim(), emoji, color }
    if (tab === 'create') await run(() => backend.createHousehold(house, profile), 'Casa creata! Ora invita il tuo avversario 🥊')
    else await run(() => backend.joinHousehold(code, profile), 'Sei dentro! Che la sfida abbia inizio 🥊')
  }

  return (
    <div className="welcome">
      <div className="hero small">
        <div className="hero-logo">{emoji}</div>
        <h1>Chi sei?</h1>
      </div>
      <form className="card form" onSubmit={submit}>
        <label>Il tuo nome<input required maxLength={24} value={name} onChange={(e) => setName(e.target.value)} placeholder="Es. Edo" /></label>
        <div className="field-label">Avatar</div>
        <EmojiGrid options={PLAYER_EMOJIS} value={emoji} onChange={setEmoji} />
        <div className="field-label">Colore</div>
        <ColorGrid value={color} onChange={setColor} />

        <div className="tabs-inline">
          <button type="button" className={tab === 'create' ? 'on' : ''} onClick={() => { setTab('create'); setColor(PLAYER_COLORS[0]) }}>Crea una casa</button>
          <button type="button" className={tab === 'join' ? 'on' : ''} onClick={() => { setTab('join'); setColor(PLAYER_COLORS[1]); setEmoji(PLAYER_EMOJIS[1]) }}>Ho un codice</button>
        </div>
        {tab === 'create'
          ? <label>Nome della casa<input maxLength={40} value={house} onChange={(e) => setHouse(e.target.value)} /></label>
          : <label>Codice invito<input required value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="ABC123" className="code-input" maxLength={6} /></label>}
        <button className="btn primary">{tab === 'create' ? 'Crea e inizia' : 'Unisciti'}</button>
      </form>
    </div>
  )
}
