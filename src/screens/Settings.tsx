import { useEffect, useState } from 'react'
import { Avatar, ColorGrid, EmojiGrid, PLAYER_EMOJIS } from '../components/ui'
import { currentPushSubscription, disableNotifications, enableNotifications, isIOS, isStandalone, pushSupported, showLocalNotification } from '../lib/notifications'
import { dinnerValue, formatEur } from '../lib/stats'
import { useGame } from '../store'

const RATES = [1, 2, 3, 5]

export function SettingsScreen() {
  const { data, me, partner, backend, run, toast } = useGame()
  const [name, setName] = useState(me.display_name)
  const [emoji, setEmoji] = useState(me.emoji)
  const [color, setColor] = useState(me.color)
  const [house, setHouse] = useState(data.household.name)
  const [rate, setRate] = useState(String(data.household.dinner_rate))
  const rateNum = Number(rate.replace(',', '.'))
  const rateValid = rate.trim() !== '' && Number.isFinite(rateNum) && rateNum >= 0 && rateNum <= 100
  const [notif, setNotif] = useState<'on' | 'off' | 'denied' | 'unsupported'>('off')

  useEffect(() => {
    (async () => {
      if (!('Notification' in window)) return setNotif('unsupported')
      if (Notification.permission === 'denied') return setNotif('denied')
      if (Notification.permission !== 'granted') return setNotif('off')
      if (backend.mode === 'cloud') setNotif((await currentPushSubscription()) ? 'on' : 'off')
      else setNotif('on')
    })()
  }, [backend.mode])

  const dirty = name !== me.display_name || emoji !== me.emoji || color !== me.color

  async function toggleNotif() {
    if (notif === 'on') {
      await disableNotifications(backend)
      setNotif('off')
      return toast('Notifiche disattivate su questo dispositivo')
    }
    try {
      const r = await enableNotifications(backend)
      if (r === 'denied') { setNotif(Notification.permission === 'denied' ? 'denied' : 'off'); return toast('Permesso negato', 'bad') }
      setNotif('on')
      if (r === 'push') await backend.notify({ type: 'test' })
      else await showLocalNotification('🔔 Notifiche attive!', 'House Fight ti avviserà qui.', 'test')
      toast('Notifiche attive 🔔', 'ok')
    } catch (e) {
      toast(`Impossibile attivare le notifiche: ${(e as Error).message}`, 'bad')
    }
  }

  const iosNeedsInstall = isIOS() && !isStandalone()

  return (
    <div className="screen">
      <section className="card form">
        <h3>👤 Il tuo profilo</h3>
        <div className="profile-head"><Avatar m={{ ...me, emoji, color }} size={64} /><strong>{name}</strong></div>
        <label>Nome<input maxLength={24} value={name} onChange={(e) => setName(e.target.value)} /></label>
        <div className="field-label">Avatar</div>
        <EmojiGrid options={PLAYER_EMOJIS} value={emoji} onChange={setEmoji} />
        <div className="field-label">Colore</div>
        <ColorGrid value={color} onChange={setColor} taken={partner?.color} />
        <button className="btn primary" disabled={!dirty || !name.trim()} onClick={() => run(() => backend.updateProfile({ display_name: name.trim(), emoji, color }), 'Profilo salvato')}>Salva profilo</button>
      </section>

      <section className="card form">
        <h3>🔔 Notifiche</h3>
        <p className="muted">
          Ricevi un avviso quando {partner?.display_name ?? 'il partner'} segna una faccenda da validare, quando le tue vengono validate e a fine mese.
        </p>
        {iosNeedsInstall && <p className="hint">📱 Su iPhone le notifiche funzionano solo dall'app installata: tocca <b>Condividi</b> → <b>Aggiungi alla schermata Home</b>, poi aprila da lì.</p>}
        {notif === 'denied' && <p className="hint">Hai bloccato le notifiche: riattivale dalle impostazioni del browser/telefono.</p>}
        {notif === 'unsupported' && <p className="hint">Questo browser non supporta le notifiche.</p>}
        {backend.mode === 'demo' && <p className="hint">In modalità demo le notifiche sono solo locali (con l'app aperta in un'altra scheda).</p>}
        {backend.mode === 'cloud' && !pushSupported() && <p className="hint">Push non disponibile su questo browser: riceverai avvisi solo con l'app aperta.</p>}
        <button className={`btn ${notif === 'on' ? '' : 'primary'}`} disabled={notif === 'denied' || notif === 'unsupported'} onClick={toggleNotif}>
          {notif === 'on' ? 'Disattiva notifiche' : 'Attiva notifiche'}
        </button>
      </section>

      <section className="card form">
        <h3>🍽️ Valore della cena</h3>
        <p className="muted">A fine mese chi perde offre una cena che vale la <b>differenza di punti × il moltiplicatore</b>.</p>
        <div className="chips">
          {RATES.map((r) => (
            <button key={r} type="button" className={rateNum === r ? 'on' : ''} onClick={() => setRate(String(r))}>{formatEur(r)} / pt</button>
          ))}
        </div>
        <label>€ per punto di distacco<input inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} /></label>
        {rateValid && (
          <p className="hint">Esempio: 10 punti di distacco → cena da <b>{formatEur(dinnerValue(10, rateNum))}</b></p>
        )}
        {rateValid && rateNum !== data.household.dinner_rate && (
          <button className="btn primary" onClick={() => run(() => backend.setDinnerRate(rateNum), 'Moltiplicatore aggiornato')}>Salva moltiplicatore</button>
        )}
      </section>

      <section className="card form">
        <h3>🏠 Casa</h3>
        <label>Nome della casa<input maxLength={40} value={house} onChange={(e) => setHouse(e.target.value)} /></label>
        {house !== data.household.name && <button className="btn" onClick={() => run(() => backend.renameHousehold(house.trim() || 'Casa'), 'Salvato')}>Salva nome</button>}
        <div className="members">
          {data.members.map((m) => (
            <div key={m.user_id} className="member"><Avatar m={m} size={36} /><span>{m.display_name}{m.user_id === me.user_id && ' (tu)'}</span></div>
          ))}
        </div>
        {!partner && (
          <p>Codice invito: <b className="invite-code inline">{data.household.invite_code}</b></p>
        )}
      </section>

      <section className="card form">
        <h3>ℹ️ Regole</h3>
        <ul className="rules">
          <li>Segna una faccenda appena l'hai fatta: i punti arrivano solo quando l'altro la <b>valida</b>.</li>
          <li>A fine mese chi ha più punti vince: chi perde <b>offre una cena</b> 🍽️ che vale la differenza di punti × {formatEur(data.household.dinner_rate)}.</li>
          <li>In caso di pareggio, cena alla romana.</li>
        </ul>
      </section>

      {backend.mode === 'demo' && (
        <section className="card form">
          <h3>🧪 Modalità demo</h3>
          <p className="muted">I dati sono salvati solo su questo dispositivo. Impersona l'altro giocatore per provare la validazione.</p>
          <button className="btn" onClick={() => backend.switchUser?.()}>🔄 Gioca come {partner?.display_name}</button>
          <button className="btn ghost danger-text" onClick={() => confirm('Rigenerare i dati demo?') && backend.signOut()}>Azzera dati demo</button>
        </section>
      )}
      {backend.mode === 'cloud' && <button className="btn ghost danger-text" onClick={() => backend.signOut()}>Esci</button>}
      <p className="muted center small">House Fight · v1.0</p>
    </div>
  )
}
