import { useMemo, useState, type FormEvent } from 'react'
import { CHORE_EMOJIS, EmojiGrid, Empty, Sheet } from '../components/ui'
import { formatPts } from '../lib/stats'
import type { Chore } from '../lib/types'
import { useGame } from '../store'

// Scala: la faccenda più pesante vale 7, una facile tra 0,5 e 1,5
const PRESETS = [0.5, 1, 1.5, 2, 3, 5, 7]

/** Il valore come si scrive nel campo, senza separatore delle migliaia: 2,5 */
const pointsInput = (v: number) => String(v).replace('.', ',')

/** "2,5" o "2.5" → 2.5; NaN se non è un valore valido (più di 0, al massimo 1000, due decimali) */
function parsePoints(text: string) {
  const v = Number(text.trim().replace(',', '.'))
  return text.trim() !== '' && v > 0 && v <= 1000 && Math.abs(Math.round(v * 100) - v * 100) < 1e-6 ? v : NaN
}

export function ChoresScreen() {
  const { data, backend, run } = useGame()
  const [editing, setEditing] = useState<Partial<Chore> | null>(null)
  const [showArchived, setShowArchived] = useState(false)

  const done = useMemo(() => {
    const m = new Map<string, number>()
    for (const c of data.completions) if (c.status === 'approved' && c.chore_id) m.set(c.chore_id, (m.get(c.chore_id) ?? 0) + 1)
    return m
  }, [data.completions])

  const active = data.chores.filter((c) => !c.archived).sort((a, b) => b.points - a.points || a.name.localeCompare(b.name))
  const archived = data.chores.filter((c) => c.archived)

  return (
    <div className="screen">
      <div className="section-head">
        <h2>Faccende</h2>
        <button className="btn small primary" onClick={() => setEditing({ emoji: '🧹', points: 1, name: '' })}>+ Nuova</button>
      </div>
      <p className="muted">Il valore conta per le faccende segnate da ora in poi: quelle già fatte tengono i punti di allora.</p>
      {active.length === 0 ? <Empty emoji="🧹">Ancora nessuna faccenda.</Empty> : (
        <ul className="list">
          {active.map((c) => (
            <li key={c.id} className="row clickable" onClick={() => setEditing(c)}>
              <span className="row-emoji">{c.emoji}</span>
              <div className="row-main"><strong>{c.name}</strong><small>Fatta {done.get(c.id) ?? 0} volte</small></div>
              <span className="pts">{formatPts(c.points)} pt</span>
              <span className="chev">›</span>
            </li>
          ))}
        </ul>
      )}

      {archived.length > 0 && (
        <>
          <button className="link block" onClick={() => setShowArchived(!showArchived)}>
            {showArchived ? '▾' : '▸'} Archiviate ({archived.length})
          </button>
          {showArchived && (
            <ul className="list faded">
              {archived.map((c) => (
                <li key={c.id} className="row">
                  <span className="row-emoji">{c.emoji}</span>
                  <div className="row-main"><strong>{c.name}</strong><small>{formatPts(c.points)} pt</small></div>
                  <button className="btn small" onClick={() => run(() => backend.setChoreArchived(c.id, false), 'Ripristinata')}>Ripristina</button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <ChoreSheet chore={editing} onClose={() => setEditing(null)} />
    </div>
  )
}

function ChoreSheet({ chore, onClose }: { chore: Partial<Chore> | null; onClose: () => void }) {
  return (
    <Sheet open={!!chore} onClose={onClose} title={chore?.id ? 'Modifica faccenda' : 'Nuova faccenda'}>
      {chore && <ChoreForm key={chore.id ?? 'new'} chore={chore} onClose={onClose} />}
    </Sheet>
  )
}

function ChoreForm({ chore, onClose }: { chore: Partial<Chore>; onClose: () => void }) {
  const { backend, run } = useGame()
  const [name, setName] = useState(chore.name ?? '')
  const [emoji, setEmoji] = useState(chore.emoji ?? '🧹')
  const [pointsText, setPointsText] = useState(pointsInput(chore.points ?? 1))
  const points = parsePoints(pointsText)
  const valid = !Number.isNaN(points)
  const setPoints = (v: number) => setPointsText(pointsInput(Math.min(1000, Math.max(0.5, v))))

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!valid) return
    const ok = await run(() => backend.saveChore({ id: chore.id, name: name.trim(), emoji, points }), chore.id ? 'Faccenda aggiornata' : 'Faccenda creata ✨')
    if (ok !== undefined) onClose()
  }

  return (
    <form className="form" onSubmit={submit}>
      <div className="log-hero">
        <span>{emoji}</span>
        <strong>{name || 'Nuova faccenda'}</strong>
        <em>{valid ? `${formatPts(points)} punti` : 'Valore non valido'}</em>
      </div>
      <label>Nome<input required maxLength={60} value={name} onChange={(e) => setName(e.target.value)} placeholder="Es. Pulire il forno" autoFocus={!chore.id} /></label>
      <div className="field-label">Valore</div>
      <div className="stepper">
        <button type="button" onClick={() => setPoints((valid ? points : 0) - 0.5)}>−0,5</button>
        <input inputMode="decimal" aria-label="Punti" aria-invalid={!valid} value={pointsText} onChange={(e) => setPointsText(e.target.value)} />
        <button type="button" onClick={() => setPoints((valid ? points : 0) + 0.5)}>+0,5</button>
      </div>
      <div className="chips">
        {PRESETS.map((p) => <button type="button" key={p} className={points === p ? 'on' : ''} onClick={() => setPoints(p)}>{formatPts(p)}</button>)}
      </div>
      <div className="field-label">Icona</div>
      <EmojiGrid options={CHORE_EMOJIS} value={emoji} onChange={setEmoji} />
      <button className="btn primary big" disabled={!valid}>{chore.id ? 'Salva' : 'Crea faccenda'}</button>
      {chore.id && (
        <button type="button" className="btn ghost danger-text" onClick={async () => {
          await run(() => backend.setChoreArchived(chore.id!, true), 'Faccenda archiviata')
          onClose()
        }}>Archivia faccenda</button>
      )}
    </form>
  )
}
