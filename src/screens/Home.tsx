import { useMemo, useState, type MouseEvent } from 'react'
import { Avatar, Empty, HalfTag, Sheet } from '../components/ui'
import { daysLeftInMonth, monthKey, monthLabel, shiftMonth, timeAgo, relativeDay } from '../lib/dates'
import { confetti, floatPoints, haptic } from '../lib/fx'
import { addPts, approved, currentStreak, dinnerValue, formatEur, formatPts, inMonth, monthResult, totals } from '../lib/stats'
import type { Chore, Completion } from '../lib/types'
import { useGame } from '../store'

export function HomeScreen({ go }: { go: (tab: string) => void }) {
  const { data, me, partner, member, backend, run, toast } = useGame()
  const month = monthKey(new Date())
  const monthComps = useMemo(() => inMonth(data.completions, month), [data.completions, month])
  const score = totals(approved(monthComps), data.members)
  const pending = totals(monthComps.filter((c) => c.status === 'pending'), data.members)

  const toReview = data.completions.filter((c) => c.status === 'pending' && c.user_id !== me.user_id)
  const mine = data.completions.filter((c) => c.status === 'pending' && c.user_id === me.user_id)
  const chores = data.chores.filter((c) => !c.archived)

  // Le faccende più usate da me vanno in cima
  const usage = useMemo(() => {
    const u = new Map<string, number>()
    for (const c of data.completions.slice(0, 300)) if (c.user_id === me.user_id && c.chore_id) u.set(c.chore_id, (u.get(c.chore_id) ?? 0) + 1)
    return u
  }, [data.completions, me.user_id])
  const sortedChores = [...chores].sort((a, b) => (usage.get(b.id) ?? 0) - (usage.get(a.id) ?? 0))

  const [logging, setLogging] = useState<Chore | null>(null)
  const [rejecting, setRejecting] = useState<Completion | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const unpaid = useMemo(() => {
    const paid = new Set(data.dinners.map((d) => d.month))
    const months = new Set(data.completions.map((c) => monthKey(c.done_at)))
    return [1, 2, 3].map((i) => shiftMonth(month, -i))
      .filter((m) => months.has(m) && !paid.has(m))
      .map((m) => monthResult(data.completions, data.members, m, data.household.dinner_rate))
  }, [data, month])

  async function review(c: Completion, ok: boolean, note?: string, ev?: MouseEvent) {
    setBusy(c.id)
    haptic(ok ? 15 : [30, 30, 30])
    const r = await run(() => backend.reviewCompletion(c.id, ok, note))
    setBusy(null)
    if (r) {
      backend.notify({ type: 'completion_reviewed', completion_id: c.id })
      if (ok && ev) floatPoints(`+${formatPts(c.points)}`, ev.clientX, ev.clientY, member(c.user_id)?.color ?? '#888')
      toast(ok ? `Validata: +${formatPts(c.points)} a ${member(c.user_id)?.display_name}` : 'Faccenda rifiutata', ok ? 'ok' : 'info')
    }
  }

  async function approveAll() {
    for (const c of toReview) await backend.reviewCompletion(c.id, true).then(() => backend.notify({ type: 'completion_reviewed', completion_id: c.id })).catch(() => {})
    await run(async () => {}, `Validate tutte (${toReview.length}) ✅`)
    confetti()
  }

  const leader = partner && score[me.user_id] !== score[partner.user_id]
    ? (score[me.user_id] > score[partner.user_id] ? me : partner) : null
  const gap = partner ? Math.abs(addPts(score[me.user_id], -score[partner.user_id])) : 0
  const stake = dinnerValue(gap, data.household.dinner_rate)
  const left = daysLeftInMonth()

  return (
    <div className="screen">
      <section className="card scoreboard">
        <div className="sb-month">{monthLabel(month)} · {left === 0 ? 'ultimo giorno!' : `${left} giorn${left === 1 ? 'o' : 'i'} alla fine`}</div>
        <div className="sb-players">
          {[me, partner].map((m, i) => m ? (
            <div key={m.user_id} className={`sb-player ${leader?.user_id === m.user_id ? 'lead' : ''}`}>
              <Avatar m={m} size={56} />
              <div className="sb-name">{m.display_name}{leader?.user_id === m.user_id && ' 👑'}</div>
              <div className="sb-points" style={{ color: m.color }}>{formatPts(score[m.user_id])}</div>
              {pending[m.user_id] > 0 && <div className="sb-pending">+{pending[m.user_id]} in attesa</div>}
              {currentStreak(data.completions, m.user_id) > 1 && <div className="sb-streak">🔥 {currentStreak(data.completions, m.user_id)} giorni</div>}
            </div>
          ) : (
            <div key={i} className="sb-player ghost"><Avatar size={56} /><div className="sb-name">In attesa…</div></div>
          ))}
        </div>
        {partner && <TugBar a={score[me.user_id]} b={score[partner.user_id]} ca={me.color} cb={partner.color} />}
        <p className="sb-caption">
          {!partner ? 'Invita il tuo avversario per iniziare la sfida'
            : !leader ? (score[me.user_id] ? 'Parità perfetta. Chi farà la prossima mossa? 🤺' : 'Il mese è appena iniziato: fai la prima mossa! 💪')
            : leader.user_id === me.user_id ? `Sei avanti di ${formatPts(gap)} punti 😎` : `${partner.display_name} è avanti di ${formatPts(gap)} punti: rimonta! 💪`}
        </p>
        {leader && stake > 0 && (
          <div className="stake">
            🍽️ Se finisse ora: {leader.user_id === me.user_id ? `${partner!.display_name} ti offre` : 'offri tu'} una cena da <b>{formatEur(stake)}</b>
          </div>
        )}
      </section>

      {!partner && (
        <section className="card invite">
          <h3>📨 Invita il partner</h3>
          <p>Fagli installare l'app, registrarsi e inserire questo codice:</p>
          <button className="invite-code" onClick={() => shareCode(data.household.invite_code, toast)}>{data.household.invite_code}</button>
        </section>
      )}

      {unpaid.map((r) => (
        <section key={r.month} className="card dinner">
          <div className="dinner-emoji">🍽️</div>
          <div className="dinner-text">
            <strong>{monthLabel(r.month)}</strong>
            {r.winner && r.loser ? (
              <span>
                Vince {r.winner.emoji} <b>{r.winner.display_name}</b> di {formatPts(r.margin)} punti ({formatPts(r.totals[r.winner.user_id])} a {formatPts(r.totals[r.loser.user_id])}):{' '}
                {r.loser.user_id === me.user_id ? 'tocca a te offrire una cena da ' : `${r.loser.display_name} ti offre una cena da `}
                <b className="eur">{formatEur(r.amount)}</b>
              </span>
            ) : <span>Pareggio {r.totals[me.user_id]} a {partner ? r.totals[partner.user_id] : 0}: cena alla romana 🍝</span>}
          </div>
          <button className="btn small" onClick={() => run(async () => { await backend.setDinnerPaid(r.month, true, r.amount); return true }, 'Buon appetito! 🍷').then((ok) => ok && confetti())}>Fatto ✓</button>
        </section>
      ))}

      <section>
        <div className="section-head">
          <h2>Da validare {toReview.length > 0 && <span className="count">{toReview.length}</span>}</h2>
          {toReview.length > 1 && <button className="link" onClick={approveAll}>Valida tutte</button>}
        </div>
        {toReview.length === 0 ? <Empty emoji="🧘">Niente da validare. Pace in casa… per ora.</Empty> : (
          <ul className="list">
            {toReview.map((c) => (
              <li key={c.id} className="row review-row">
                <span className="row-emoji">{c.chore_emoji}</span>
                <div className="row-main">
                  <strong>{c.chore_name}{c.half && <HalfTag />}</strong>
                  <small>{member(c.user_id)?.emoji} {member(c.user_id)?.display_name} · {relativeDay(c.done_at)} · {timeAgo(c.created_at)}</small>
                  {c.note && <small className="note">“{c.note}”</small>}
                </div>
                <span className="pts">+{formatPts(c.points)}</span>
                <div className="row-actions">
                  <button className="round bad" disabled={busy === c.id} onClick={() => setRejecting(c)} aria-label="Rifiuta">✕</button>
                  <button className="round ok" disabled={busy === c.id} onClick={(e) => review(c, true, undefined, e)} aria-label="Valida">✓</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {mine.length > 0 && (
        <section>
          <div className="section-head">
            <h2>In attesa di {partner?.display_name ?? 'validazione'}</h2>
            {partner && <button className="link" onClick={() => { haptic(20); backend.notify({ type: 'nudge' }); toast(`🔔 Hai stuzzicato ${partner.display_name}`, 'ok') }}>🔔 Stuzzica</button>}
          </div>
          <ul className="list">
            {mine.map((c) => (
              <li key={c.id} className="row">
                <span className="row-emoji">{c.chore_emoji}</span>
                <div className="row-main"><strong>{c.chore_name}{c.half && <HalfTag />}</strong><small>{relativeDay(c.done_at)} · ⏳ in attesa</small></div>
                <span className="pts muted">+{formatPts(c.points)}</span>
                <button className="icon-btn" onClick={() => confirm('Annullare questa faccenda?') && run(() => backend.deleteCompletion(c.id), 'Annullata')} aria-label="Annulla">🗑️</button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <div className="section-head">
          <h2>Ho appena fatto…</h2>
          <button className="link" onClick={() => go('faccende')}>Gestisci</button>
        </div>
        {chores.length === 0 ? <Empty emoji="🧹">Nessuna faccenda. Creane una!</Empty> : (
          <div className="chore-grid">
            {sortedChores.map((c) => (
              <button key={c.id} className="chore-tile" onClick={() => { haptic(8); setLogging(c) }}>
                <span className="tile-emoji">{c.emoji}</span>
                <span className="tile-name">{c.name}</span>
                <span className="tile-pts">{formatPts(c.points)} pt</span>
              </button>
            ))}
          </div>
        )}
      </section>

      <LogSheet chore={logging} onClose={() => setLogging(null)} />
      <RejectSheet completion={rejecting} onClose={() => setRejecting(null)} onReject={(c, note) => { setRejecting(null); review(c, false, note) }} />
    </div>
  )
}

function TugBar({ a, b, ca, cb }: { a: number; b: number; ca: string; cb: string }) {
  const share = a + b === 0 ? 50 : (a / (a + b)) * 100
  return (
    <div className="tug" role="img" aria-label={`${a} contro ${b}`}>
      <span style={{ width: `${share}%`, background: ca }} />
      <span style={{ width: `${100 - share}%`, background: cb }} />
      <i style={{ left: `${share}%` }}>⚡</i>
    </div>
  )
}

function shareCode(code: string, toast: (t: string, tone?: 'ok') => void) {
  const text = `Sfidami su House Fight 🥊🏠! Codice invito: ${code}\n${location.href.split('#')[0]}`
  if (navigator.share) navigator.share({ text }).catch(() => {})
  else navigator.clipboard?.writeText(code).then(() => toast('Codice copiato!', 'ok'))
}

function LogSheet({ chore, onClose }: { chore: Chore | null; onClose: () => void }) {
  const { backend, run, me, partner } = useGame()
  const [when, setWhen] = useState(0)
  const [note, setNote] = useState('')
  const [half, setHalf] = useState(false)
  const [busy, setBusy] = useState(false)
  const points = chore ? (half ? Math.round(chore.points * 50) / 100 : chore.points) : 0

  async function submit(e: MouseEvent) {
    if (!chore) return
    setBusy(true)
    const doneAt = new Date()
    if (when) { doneAt.setDate(doneAt.getDate() - when); doneAt.setHours(20, 0, 0, 0) }
    const { clientX, clientY } = e
    const c = await run(() => backend.logCompletion(chore.id, { note, doneAt, half }),
      partner ? `Inviata a ${partner.display_name} per la validazione ⏳` : 'Registrata ⏳')
    setBusy(false)
    if (c) {
      haptic([10, 30, 10])
      floatPoints(`+${formatPts(points)}`, clientX, clientY, me.color)
      backend.notify({ type: 'completion_created', completion_id: c.id })
      setNote(''); setWhen(0); setHalf(false)
      onClose()
    }
  }

  return (
    <Sheet open={!!chore} onClose={onClose} title="Faccenda fatta!">
      {chore && (
        <div className="form">
          <div className="log-hero">
            <span>{chore.emoji}</span>
            <strong>{chore.name}</strong>
            <em style={{ color: me.color }}>+{formatPts(points)} punti{half && ' · metà'}</em>
          </div>
          <div className="field-label">Quando?</div>
          <div className="chips">
            {['Oggi', 'Ieri', '2 giorni fa', '3 giorni fa'].map((l, i) => (
              <button key={l} type="button" className={when === i ? 'on' : ''} onClick={() => setWhen(i)}>{l}</button>
            ))}
          </div>
          <div className="field-label">Quanto?</div>
          <div className="chips">
            <button type="button" className={!half ? 'on' : ''} onClick={() => setHalf(false)}>Tutta · {formatPts(chore.points)} pt</button>
            <button type="button" className={half ? 'on' : ''} onClick={() => setHalf(true)}>½ Metà · {formatPts(Math.round(chore.points * 50) / 100)} pt</button>
          </div>
          <label>Nota (facoltativa)<input maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} placeholder={half ? 'Es. solo le camicie' : 'Es. anche il forno!'} /></label>
          <button className="btn primary big" disabled={busy} onClick={submit}>✓ Fatto! Manda a {partner?.display_name ?? 'validare'}</button>
        </div>
      )}
    </Sheet>
  )
}

function RejectSheet({ completion, onClose, onReject }: { completion: Completion | null; onClose: () => void; onReject: (c: Completion, note: string) => void }) {
  const [note, setNote] = useState('')
  const quick = ['Non mi risulta 🤨', 'Fatta a metà', 'Già segnata', 'Da rifare 😅']
  return (
    <Sheet open={!!completion} onClose={onClose} title="Rifiuta faccenda">
      {completion && (
        <div className="form">
          <p className="muted">{completion.chore_emoji} {completion.chore_name}{completion.half && <HalfTag />} · +{formatPts(completion.points)} pt</p>
          <div className="chips">
            {quick.map((q) => <button key={q} type="button" className={note === q ? 'on' : ''} onClick={() => setNote(q)}>{q}</button>)}
          </div>
          <label>Motivo<input maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Perché la rifiuti?" /></label>
          <button className="btn danger big" onClick={() => { onReject(completion, note); setNote('') }}>✕ Rifiuta</button>
        </div>
      )}
    </Sheet>
  )
}
