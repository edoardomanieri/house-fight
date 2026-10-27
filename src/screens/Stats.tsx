import { useMemo, useState } from 'react'
import { ChoreBars, GroupedBars, RaceChart } from '../components/charts'
import { Empty, PeriodNav, Segmented } from '../components/ui'
import { MONTHS, MONTHS_SHORT, WEEKDAYS_SHORT, dayKey, monthKey, monthLabel, shiftMonth } from '../lib/dates'
import { approved, bestStreak, byChore, byMonth, byWeekday, counts, cumulativeByDay, inMonth, inYear, monthResult, totals } from '../lib/stats'
import type { Completion, Member } from '../lib/types'
import { useGame } from '../store'

type View = 'month' | 'year' | 'all'

export function StatsScreen() {
  const { data } = useGame()
  const now = new Date()
  const [view, setView] = useState<View>('month')
  const [month, setMonth] = useState(monthKey(now))
  const [year, setYear] = useState(now.getFullYear())
  const [metric, setMetric] = useState<'points' | 'count'>('points')

  const members = data.members
  const scope = useMemo(() => view === 'month' ? inMonth(data.completions, month)
    : view === 'year' ? inYear(data.completions, year) : data.completions, [data.completions, view, month, year])
  const ok = useMemo(() => approved(scope), [scope])

  const monthsInScope = useMemo(() => {
    const keys = [...new Set(approved(data.completions).map((c) => monthKey(c.done_at)))].sort().reverse()
    const cur = monthKey(new Date())
    return keys.filter((k) => k < cur && (view === 'all' || (view === 'year' && k.startsWith(String(year)))))
  }, [data.completions, view, year])
  const results = useMemo(() => monthsInScope.map((m) => monthResult(data.completions, members, m)), [monthsInScope, data.completions, members])

  return (
    <div className="screen">
      <Segmented value={view} onChange={setView} options={[['month', 'Mese'], ['year', 'Anno'], ['all', 'Sempre']]} />
      {view === 'month' && (
        <PeriodNav label={monthLabel(month)} onPrev={() => setMonth(shiftMonth(month, -1))} onNext={() => setMonth(shiftMonth(month, 1))}
          nextDisabled={month >= monthKey(now)} />
      )}
      {view === 'year' && (
        <PeriodNav label={String(year)} onPrev={() => setYear(year - 1)} onNext={() => setYear(year + 1)} nextDisabled={year >= now.getFullYear()} />
      )}

      <Tiles members={members} ok={ok} scope={scope} results={view === 'month' ? null : results} />

      {ok.length === 0 ? <Empty emoji="📊">Nessuna faccenda validata in questo periodo.</Empty> : (
        <>
          {view === 'month' && (
            <section className="card">
              <h3>🏁 La gara del mese</h3>
              <RaceChart members={members} {...cumulativeByDay(data.completions, members, month)} />
            </section>
          )}
          {view !== 'month' && (
            <section className="card">
              <h3>📅 Punti per mese</h3>
              {view === 'year'
                ? <GroupedBars members={members} labels={MONTHS_SHORT.map((m) => m[0])} titles={MONTHS.map((m) => `${m} ${year}`)} rows={byMonth(data.completions, members, year).map((r) => r.totals)} />
                : <AllTimeMonths completions={data.completions} members={members} />}
            </section>
          )}

          <section className="card">
            <div className="section-head">
              <h3>🏆 Classifica faccende</h3>
              <Segmented value={metric} onChange={setMetric} options={[['points', 'Punti'], ['count', 'Volte']]} />
            </div>
            <ChoreBars members={members} stats={byChore(scope, members)} metric={metric} />
          </section>

          <section className="card">
            <h3>🗓️ Giorni della settimana</h3>
            <GroupedBars members={members} labels={WEEKDAYS_SHORT} rows={byWeekday(scope, members)} suffix="faccende" />
          </section>

          <Records members={members} ok={ok} />
        </>
      )}

      {results.length > 0 && (
        <section className="card">
          <h3>🍽️ Albo d'oro</h3>
          <ul className="list plain">
            {results.map((r) => {
              const paid = data.dinners.some((d) => d.month === r.month)
              return (
                <li key={r.month} className="row">
                  <span className="row-emoji">{r.winner ? r.winner.emoji : '🤝'}</span>
                  <div className="row-main">
                    <strong>{monthLabel(r.month)}</strong>
                    <small>{r.winner ? `${r.winner.display_name} vince di ${r.margin} pt · cena offerta da ${r.loser!.display_name}` : 'Pareggio'}</small>
                  </div>
                  <span className={`chip ${paid ? 'chip-approved' : 'chip-pending'}`}>{paid ? '✓ Pagata' : '⏳ Da pagare'}</span>
                </li>
              )
            })}
          </ul>
        </section>
      )}
    </div>
  )
}

function Tiles({ members, ok, scope, results }: { members: Member[]; ok: Completion[]; scope: Completion[]; results: ReturnType<typeof monthResult>[] | null }) {
  const pts = totals(ok, members)
  const n = counts(ok, members)
  const rejected = counts(scope.filter((c) => c.status === 'rejected'), members)
  const wins = Object.fromEntries(members.map((m) => [m.user_id, results?.filter((r) => r.winner?.user_id === m.user_id).length ?? 0]))
  return (
    <div className="tiles">
      {members.map((m) => (
        <div key={m.user_id} className="tile" style={{ borderTopColor: m.color }}>
          <div className="tile-who">{m.emoji} {m.display_name}</div>
          <div className="tile-big">{pts[m.user_id]}<small> pt</small></div>
          <div className="tile-sub">{n[m.user_id]} faccende{rejected[m.user_id] ? ` · ${rejected[m.user_id]} rifiutate` : ''}</div>
          {results && <div className="tile-sub">🏆 {wins[m.user_id]} mesi vinti</div>}
        </div>
      ))}
    </div>
  )
}

function AllTimeMonths({ completions, members }: { completions: Completion[]; members: Member[] }) {
  // Ultimi 12 mesi
  const cur = monthKey(new Date())
  const keys = Array.from({ length: 12 }, (_, i) => shiftMonth(cur, i - 11))
  const rows = keys.map((k) => totals(approved(inMonth(completions, k)), members))
  return <GroupedBars members={members} labels={keys.map((k) => MONTHS_SHORT[Number(k.slice(5)) - 1][0])} titles={keys.map(monthLabel)} rows={rows} />
}

function Records({ members, ok }: { members: Member[]; ok: Completion[] }) {
  const recs = members.map((m) => {
    const mine = ok.filter((c) => c.user_id === m.user_id)
    const perDay = new Map<string, number>()
    for (const c of mine) perDay.set(dayKey(c.done_at), (perDay.get(dayKey(c.done_at)) ?? 0) + c.points)
    const best = [...perDay.entries()].sort((a, b) => b[1] - a[1])[0]
    const fav = byChore(mine, [m])[0]
    return { m, streak: bestStreak(mine, m.user_id), best, fav }
  })
  return (
    <section className="card">
      <h3>⭐ Record</h3>
      <div className="records">
        {recs.map(({ m, streak, best, fav }) => (
          <div key={m.user_id} className="record">
            <div className="tile-who">{m.emoji} {m.display_name}</div>
            <div>🔥 Serie migliore: <b>{streak} giorni</b></div>
            {best && <div>⚡ Giorno top: <b>{best[1]} pt</b> <span className="muted">({new Date(best[0]).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })})</span></div>}
            {fav && <div>💛 Preferita: <b>{fav.emoji} {fav.name}</b></div>}
          </div>
        ))}
      </div>
    </section>
  )
}
