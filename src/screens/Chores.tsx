import { useMemo, useState, type FormEvent } from 'react'
import { CHORE_EMOJIS, EmojiGrid, Empty, Sheet } from '../components/ui'
import type { Chore } from '../lib/types'
import { useGame } from '../store'

const PRESETS = [5, 10, 15, 20, 25, 30, 50]

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
        <button className="btn small primary" onClick={() => setEditing({ emoji: '🧹', points: 10, name: '' })}>+ Nuova</button>
      </div>
      <p className="muted">Il valore conta per le faccende segnate da ora in poi: quelle già fatte tengono i punti di allora.</p>
      {active.length === 0 ? <Empty emoji="🧹">Ancora nessuna faccenda.</Empty> : (
        <ul className="list">
          {active.map((c) => (
            <li key={c.id} className="row clickable" onClick={() => setEditing(c)}>
              <span className="row-emoji">{c.emoji}</span>
              <div className="row-main"><strong>{c.name}</strong><small>Fatta {done.get(c.id) ?? 0} volte</small></div>
              <span className="pts">{c.points} pt</span>
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
                  <div className="row-main"><strong>{c.name}</strong><small>{c.points} pt</small></div>
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
  const [points, setPoints] = useState(chore.points ?? 10)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const ok = await run(() => backend.saveChore({ id: chore.id, name: name.trim(), emoji, points }), chore.id ? 'Faccenda aggiornata' : 'Faccenda creata ✨')
    if (ok !== undefined) onClose()
  }

  return (
    <form className="form" onSubmit={submit}>
      <div className="log-hero">
        <span>{emoji}</span>
        <strong>{name || 'Nuova faccenda'}</strong>
        <em>{points} punti</em>
      </div>
      <label>Nome<input required maxLength={60} value={name} onChange={(e) => setName(e.target.value)} placeholder="Es. Pulire il forno" autoFocus={!chore.id} /></label>
      <div className="field-label">Valore</div>
      <div className="stepper">
        <button type="button" onClick={() => setPoints(Math.max(1, points - 5))}>−5</button>
        <input type="number" min={1} max={1000} value={points} onChange={(e) => setPoints(Math.min(1000, Math.max(1, Number(e.target.value) || 1)))} />
        <button type="button" onClick={() => setPoints(Math.min(1000, points + 5))}>+5</button>
      </div>
      <div className="chips">
        {PRESETS.map((p) => <button type="button" key={p} className={points === p ? 'on' : ''} onClick={() => setPoints(p)}>{p}</button>)}
      </div>
      <div className="field-label">Icona</div>
      <EmojiGrid options={CHORE_EMOJIS} value={emoji} onChange={setEmoji} />
      <button className="btn primary big">{chore.id ? 'Salva' : 'Crea faccenda'}</button>
      {chore.id && (
        <button type="button" className="btn ghost danger-text" onClick={async () => {
          await run(() => backend.setChoreArchived(chore.id!, true), 'Faccenda archiviata')
          onClose()
        }}>Archivia faccenda</button>
      )}
    </form>
  )
}
