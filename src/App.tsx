import { useEffect, useState } from 'react'
import { ChoresScreen } from './screens/Chores'
import { HistoryScreen } from './screens/History'
import { HomeScreen } from './screens/Home'
import { SettingsScreen } from './screens/Settings'
import { StatsScreen } from './screens/Stats'
import { AuthScreen, OnboardingScreen } from './screens/Welcome'
import { useStore } from './store'

const TABS = [
  ['', '🏠', 'Sfida'],
  ['faccende', '🧹', 'Faccende'],
  ['storico', '📜', 'Storico'],
  ['statistiche', '📊', 'Statistiche'],
  ['impostazioni', '⚙️', 'Profilo'],
] as const

const readHash = () => location.hash.replace(/^#\/?/, '')

export default function App() {
  const { ready, userId, data, me, partner, backend, toasts } = useStore()
  const [tab, setTab] = useState(readHash())

  useEffect(() => {
    const onHash = () => { setTab(readHash()); window.scrollTo({ top: 0 }) }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  const go = (t: string) => { location.hash = `/${t}` }

  const toReview = data?.completions.filter((c) => c.status === 'pending' && c.user_id !== userId).length ?? 0

  let body
  if (!ready) body = <div className="splash">🥊</div>
  else if (!userId) body = <AuthScreen />
  else if (!data || !me) body = <OnboardingScreen />
  else {
    body = (
      <>
        <header className="topbar">
          <div className="brand">🥊 House Fight</div>
          <div className="topbar-right">
            {backend.mode === 'demo' && (
              <button className="demo-pill" onClick={() => backend.switchUser?.()} title="Cambia giocatore">
                DEMO · sei {me.emoji} {me.display_name} ⇄ {partner?.emoji}
              </button>
            )}
          </div>
        </header>
        <main>
          {tab === 'faccende' ? <ChoresScreen />
            : tab === 'storico' ? <HistoryScreen />
            : tab === 'statistiche' ? <StatsScreen />
            : tab === 'impostazioni' ? <SettingsScreen />
            : <HomeScreen go={go} />}
        </main>
        <nav className="tabbar">
          {TABS.map(([t, icon, label]) => (
            <a key={t} href={`#/${t}`} className={tab === t ? 'on' : ''} aria-current={tab === t ? 'page' : undefined}>
              <span className="tab-icon">{icon}{t === '' && toReview > 0 && <i className="badge">{toReview}</i>}</span>
              <span>{label}</span>
            </a>
          ))}
        </nav>
      </>
    )
  }

  return (
    <div className="app">
      {body}
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => <div key={t.id} className={`toast ${t.tone}`}>{t.text}</div>)}
      </div>
    </div>
  )
}
