export const MONTHS = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto',
  'Settembre', 'Ottobre', 'Novembre', 'Dicembre']
export const MONTHS_SHORT = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic']
export const WEEKDAYS_SHORT = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom']

const pad = (n: number) => String(n).padStart(2, '0')

/** 'YYYY-MM' in ora locale */
export function monthKey(d: Date | string): string {
  const x = typeof d === 'string' ? new Date(d) : d
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}`
}

export function dayKey(d: Date | string): string {
  const x = typeof d === 'string' ? new Date(d) : d
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`
}

export function parseMonthKey(key: string): { year: number; month: number } {
  const [y, m] = key.split('-').map(Number)
  return { year: y, month: m - 1 }
}

export function shiftMonth(key: string, delta: number): string {
  const { year, month } = parseMonthKey(key)
  return monthKey(new Date(year, month + delta, 1))
}

export function monthLabel(key: string): string {
  const { year, month } = parseMonthKey(key)
  return `${MONTHS[month]} ${year}`
}

export function daysInMonth(key: string): number {
  const { year, month } = parseMonthKey(key)
  return new Date(year, month + 1, 0).getDate()
}

export function daysLeftInMonth(now = new Date()): number {
  return daysInMonth(monthKey(now)) - now.getDate()
}

/** Lunedì = 0 */
export function weekdayIndex(d: Date): number {
  return (d.getDay() + 6) % 7
}

export function relativeDay(iso: string, now = new Date()): string {
  const d = new Date(iso)
  const diff = Math.round((new Date(dayKey(now)).getTime() - new Date(dayKey(d)).getTime()) / 86400000)
  if (diff === 0) return 'Oggi'
  if (diff === 1) return 'Ieri'
  if (diff < 7) return d.toLocaleDateString('it-IT', { weekday: 'long' }).replace(/^./, (c) => c.toUpperCase())
  return d.toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' })
}

export function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
}

export function timeAgo(iso: string, now = new Date()): string {
  const s = Math.max(0, (now.getTime() - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'adesso'
  if (s < 3600) return `${Math.floor(s / 60)} min fa`
  if (s < 86400) return `${Math.floor(s / 3600)} h fa`
  return relativeDay(iso, now).toLowerCase()
}
