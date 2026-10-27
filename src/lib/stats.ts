import { dayKey, daysInMonth, monthKey, parseMonthKey, weekdayIndex } from './dates'
import type { Completion, Member } from './types'

export type Totals = Record<string, number>

export const approved = (cs: Completion[]) => cs.filter((c) => c.status === 'approved')

export function inMonth(cs: Completion[], key: string) {
  return cs.filter((c) => monthKey(c.done_at) === key)
}

export function inYear(cs: Completion[], year: number) {
  return cs.filter((c) => new Date(c.done_at).getFullYear() === year)
}

export function totals(cs: Completion[], members: Member[]): Totals {
  const t: Totals = Object.fromEntries(members.map((m) => [m.user_id, 0]))
  for (const c of cs) t[c.user_id] = (t[c.user_id] ?? 0) + c.points
  return t
}

export function counts(cs: Completion[], members: Member[]): Totals {
  const t: Totals = Object.fromEntries(members.map((m) => [m.user_id, 0]))
  for (const c of cs) t[c.user_id] = (t[c.user_id] ?? 0) + 1
  return t
}

export interface MonthResult {
  month: string
  totals: Totals
  winner: Member | null // null = pareggio
  loser: Member | null
  margin: number
}

export function monthResult(all: Completion[], members: Member[], month: string): MonthResult {
  const t = totals(approved(inMonth(all, month)), members)
  const [a, b] = [...members].sort((x, y) => t[y.user_id] - t[x.user_id])
  if (!a || !b || t[a.user_id] === t[b.user_id]) return { month, totals: t, winner: null, loser: null, margin: 0 }
  return { month, totals: t, winner: a, loser: b, margin: t[a.user_id] - t[b.user_id] }
}

/** Punti cumulati giorno per giorno nel mese, per ciascun giocatore */
export function cumulativeByDay(cs: Completion[], members: Member[], month: string) {
  const n = daysInMonth(month)
  const { year, month: m } = parseMonthKey(month)
  const perDay: Record<string, number[]> = Object.fromEntries(members.map((x) => [x.user_id, Array(n).fill(0)]))
  for (const c of approved(inMonth(cs, month))) {
    const d = new Date(c.done_at).getDate() - 1
    if (perDay[c.user_id]) perDay[c.user_id][d] += c.points
  }
  const today = new Date()
  const isCurrent = today.getFullYear() === year && today.getMonth() === m
  const isFuture = new Date(year, m, 1) > today
  const lastDay = isFuture ? 0 : isCurrent ? today.getDate() : n
  const out: Record<string, number[]> = {}
  for (const id of Object.keys(perDay)) {
    let acc = 0
    out[id] = perDay[id].slice(0, lastDay).map((v) => (acc += v))
  }
  return { days: n, lastDay, series: out }
}

/** Punti per mese di un anno */
export function byMonth(cs: Completion[], members: Member[], year: number) {
  const rows = Array.from({ length: 12 }, (_, i) => ({ month: i, totals: totals([], members) }))
  for (const c of approved(inYear(cs, year))) {
    const m = new Date(c.done_at).getMonth()
    rows[m].totals[c.user_id] = (rows[m].totals[c.user_id] ?? 0) + c.points
  }
  return rows
}

export interface ChoreStat {
  key: string
  name: string
  emoji: string
  count: Totals
  points: Totals
  total: number
}

export function byChore(cs: Completion[], members: Member[]): ChoreStat[] {
  const map = new Map<string, ChoreStat>()
  for (const c of approved(cs)) {
    const key = c.chore_id ?? c.chore_name
    let s = map.get(key)
    if (!s) {
      s = { key, name: c.chore_name, emoji: c.chore_emoji, count: counts([], members), points: totals([], members), total: 0 }
      map.set(key, s)
    }
    s.count[c.user_id] = (s.count[c.user_id] ?? 0) + 1
    s.points[c.user_id] = (s.points[c.user_id] ?? 0) + c.points
    s.total += c.points
  }
  return [...map.values()].sort((a, b) => b.total - a.total)
}

export function byWeekday(cs: Completion[], members: Member[]) {
  const rows = Array.from({ length: 7 }, () => counts([], members))
  for (const c of approved(cs)) rows[weekdayIndex(new Date(c.done_at))][c.user_id]++
  return rows
}

/** Serie più lunga di giorni consecutivi con almeno una faccenda approvata */
export function bestStreak(cs: Completion[], userId: string): number {
  const days = [...new Set(approved(cs).filter((c) => c.user_id === userId).map((c) => dayKey(c.done_at)))].sort()
  let best = 0, cur = 0, prev = 0
  for (const d of days) {
    const t = new Date(d).getTime()
    cur = prev && t - prev <= 86400000 * 1.5 ? cur + 1 : 1
    best = Math.max(best, cur)
    prev = t
  }
  return best
}

/** Giorni consecutivi fino ad oggi (o ieri) */
export function currentStreak(cs: Completion[], userId: string, now = new Date()): number {
  const days = new Set(approved(cs).filter((c) => c.user_id === userId).map((c) => dayKey(c.done_at)))
  const d = new Date(now)
  if (!days.has(dayKey(d))) d.setDate(d.getDate() - 1)
  let n = 0
  while (days.has(dayKey(d))) { n++; d.setDate(d.getDate() - 1) }
  return n
}
