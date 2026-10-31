import { useMemo, useState } from 'react'
import { Empty, PeriodNav, StatusChip } from '../components/ui'
import { dayKey, monthKey, monthLabel, relativeDay, shiftMonth, timeLabel } from '../lib/dates'
import { addPts, formatPts, inMonth } from '../lib/stats'
import type { Status } from '../lib/types'
import { useGame } from '../store'

export function HistoryScreen() {
  const { data, member } = useGame()
  const [month, setMonth] = useState(monthKey(new Date()))
  const [who, setWho] = useState<string>('all')
  const [status, setStatus] = useState<Status | 'all'>('all')

  const groups = useMemo(() => {
    const list = inMonth(data.completions, month)
      .filter((c) => (who === 'all' || c.user_id === who) && (status === 'all' || c.status === status))
      .sort((a, b) => b.done_at.localeCompare(a.done_at))
    const g = new Map<string, typeof list>()
    for (const c of list) {
      const k = dayKey(c.done_at)
      g.set(k, [...(g.get(k) ?? []), c])
    }
    return [...g.entries()]
  }, [data.completions, month, who, status])

  return (
    <div className="screen">
      <PeriodNav label={monthLabel(month)} onPrev={() => setMonth(shiftMonth(month, -1))} onNext={() => setMonth(shiftMonth(month, 1))}
        nextDisabled={month >= monthKey(new Date())} />
      <div className="filters">
        <div className="chips">
          <button className={who === 'all' ? 'on' : ''} onClick={() => setWho('all')}>Tutti</button>
          {data.members.map((m) => (
            <button key={m.user_id} className={who === m.user_id ? 'on' : ''} onClick={() => setWho(m.user_id)}>{m.emoji} {m.display_name}</button>
          ))}
        </div>
        <div className="chips">
          {([['all', 'Tutte'], ['approved', 'Validate'], ['pending', 'In attesa'], ['rejected', 'Rifiutate']] as const).map(([v, l]) => (
            <button key={v} className={status === v ? 'on' : ''} onClick={() => setStatus(v)}>{l}</button>
          ))}
        </div>
      </div>

      {groups.length === 0 ? <Empty emoji="📭">Nessuna faccenda in questo periodo.</Empty> : groups.map(([day, items]) => {
        const pts = items.filter((c) => c.status === 'approved')
        return (
          <section key={day}>
            <div className="day-head">
              <span>{relativeDay(items[0].done_at)}</span>
              <span className="muted">
                {data.members.map((m) => {
                  const p = pts.filter((c) => c.user_id === m.user_id).reduce((a, c) => addPts(a, c.points), 0)
                  return p ? <span key={m.user_id} className="day-pts">{m.emoji} {formatPts(p)}</span> : null
                })}
              </span>
            </div>
            <ul className="list">
              {items.map((c) => {
                const m = member(c.user_id)
                return (
                  <li key={c.id} className={`row ${c.status === 'rejected' ? 'faded' : ''}`}>
                    <span className="row-emoji">{c.chore_emoji}</span>
                    <div className="row-main">
                      <strong>{c.chore_name}</strong>
                      <small><span className="dot" style={{ background: m?.color }} />{m?.display_name} · {timeLabel(c.done_at)}</small>
                      {c.note && <small className="note">“{c.note}”</small>}
                      {c.review_note && <small className="note">↳ {member(c.reviewed_by)?.display_name}: “{c.review_note}”</small>}
                    </div>
                    <div className="row-side">
                      <span className={`pts ${c.status !== 'approved' ? 'muted' : ''}`}>{c.status === 'rejected' ? <s>+{formatPts(c.points)}</s> : `+${formatPts(c.points)}`}</span>
                      <StatusChip status={c.status} />
                    </div>
                  </li>
                )
              })}
            </ul>
          </section>
        )
      })}
    </div>
  )
}
