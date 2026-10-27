import { useState, type PointerEvent } from 'react'
import type { Member } from '../lib/types'
import type { ChoreStat, Totals } from '../lib/stats'

const W = 340
const niceMax = (v: number) => {
  if (v <= 0) return 10
  const p = 10 ** Math.floor(Math.log10(v))
  const n = v / p
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p
}

function Legend({ members }: { members: Member[] }) {
  return (
    <div className="legend">
      {members.map((m) => (
        <span key={m.user_id}><i style={{ background: m.color }} />{m.display_name}</span>
      ))}
    </div>
  )
}

function Tip({ x, y, children }: { x: number; y: number; children: React.ReactNode }) {
  // x,y in percentuale del contenitore
  return (
    <div className="chart-tip" style={{ left: `${Math.min(Math.max(x, 18), 82)}%`, top: `${y}%` }}>
      {children}
    </div>
  )
}

function TipRows({ members, values, suffix = 'pt' }: { members: Member[]; values: Totals; suffix?: string }) {
  return (
    <>
      {members.map((m) => (
        <div key={m.user_id} className="tip-row">
          <i style={{ background: m.color }} />{m.display_name}<b>{values[m.user_id] ?? 0} {suffix}</b>
        </div>
      ))}
    </>
  )
}

/** Gara del mese: punti cumulati giorno per giorno */
export function RaceChart({ members, days, series, lastDay }: { members: Member[]; days: number; lastDay: number; series: Record<string, number[]> }) {
  const H = 180, padL = 30, padR = 12, padT = 12, padB = 22
  const max = niceMax(Math.max(1, ...Object.values(series).flat()))
  const x = (d: number) => padL + (d / Math.max(1, days - 1)) * (W - padL - padR)
  const y = (v: number) => padT + (1 - v / max) * (H - padT - padB)
  const [hover, setHover] = useState<number | null>(null)

  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const px = ((e.clientX - r.left) / r.width) * W
    const d = Math.round(((px - padL) / (W - padL - padR)) * (days - 1))
    setHover(lastDay ? Math.min(Math.max(d, 0), lastDay - 1) : null)
  }

  return (
    <figure className="chart">
      <Legend members={members} />
      <div className="chart-wrap">
        <svg viewBox={`0 0 ${W} ${H}`} onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setHover(null)} role="img"
          aria-label="Punti cumulati nel mese">
          {[0, 0.5, 1].map((t) => (
            <g key={t}>
              <line className="grid" x1={padL} x2={W - padR} y1={y(max * t)} y2={y(max * t)} />
              <text className="axis" x={padL - 6} y={y(max * t) + 3} textAnchor="end">{Math.round(max * t)}</text>
            </g>
          ))}
          {[1, 10, 20, days].map((d) => (
            <text key={d} className="axis" x={x(d - 1)} y={H - 6} textAnchor="middle">{d}</text>
          ))}
          {hover !== null && <line className="crosshair" x1={x(hover)} x2={x(hover)} y1={padT} y2={H - padB} />}
          {members.map((m) => {
            const s = series[m.user_id] ?? []
            if (!s.length) return null
            const d = s.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('')
            return (
              <g key={m.user_id}>
                <path d={d} fill="none" stroke={m.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                <circle cx={x(s.length - 1)} cy={y(s[s.length - 1])} r={4} fill={m.color} className="ring" />
                {hover !== null && <circle cx={x(hover)} cy={y(s[hover])} r={4} fill={m.color} className="ring" />}
              </g>
            )
          })}
        </svg>
        {hover !== null && (
          <Tip x={(x(hover) / W) * 100} y={4}>
            <div className="tip-title">Giorno {hover + 1}</div>
            <TipRows members={members} values={Object.fromEntries(members.map((m) => [m.user_id, series[m.user_id]?.[hover] ?? 0]))} />
          </Tip>
        )}
      </div>
    </figure>
  )
}

/** Barre raggruppate (es. punti per mese o per giorno della settimana) */
export function GroupedBars({ members, labels, rows, suffix = 'pt', titles }: {
  members: Member[]; labels: string[]; rows: Totals[]; suffix?: string; titles?: string[]
}) {
  const H = 170, padL = 30, padB = 22, padT = 10, padR = 6
  const max = niceMax(Math.max(1, ...rows.flatMap((r) => Object.values(r))))
  const gw = (W - padL - padR) / labels.length
  const bw = Math.min(14, (gw - 6) / members.length - 2)
  const y = (v: number) => padT + (1 - v / max) * (H - padT - padB)
  const [hover, setHover] = useState<number | null>(null)

  return (
    <figure className="chart">
      <Legend members={members} />
      <div className="chart-wrap">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Grafico a barre" onPointerLeave={() => setHover(null)}>
          {[0, 0.5, 1].map((t) => (
            <g key={t}>
              <line className="grid" x1={padL} x2={W - padR} y1={y(max * t)} y2={y(max * t)} />
              <text className="axis" x={padL - 6} y={y(max * t) + 3} textAnchor="end">{Math.round(max * t)}</text>
            </g>
          ))}
          {labels.map((l, i) => {
            const gx = padL + i * gw
            const total = members.length * bw + (members.length - 1) * 2
            return (
              <g key={l}>
                {hover === i && <rect className="hover-band" x={gx + 1} y={padT} width={gw - 2} height={H - padT - padB} rx={4} />}
                {members.map((m, k) => {
                  const v = rows[i][m.user_id] ?? 0
                  const bx = gx + (gw - total) / 2 + k * (bw + 2)
                  const h = (H - padT - padB) - (y(v) - padT)
                  return v > 0 ? <path key={m.user_id} d={roundTop(bx, y(v), bw, h)} fill={m.color} /> : null
                })}
                <text className="axis" x={gx + gw / 2} y={H - 6} textAnchor="middle">{l}</text>
                <rect x={gx} y={0} width={gw} height={H} fill="transparent"
                  onPointerEnter={() => setHover(i)} onPointerDown={() => setHover(i)} />
              </g>
            )
          })}
        </svg>
        {hover !== null && (
          <Tip x={((padL + hover * gw + gw / 2) / W) * 100} y={2}>
            <div className="tip-title">{titles?.[hover] ?? labels[hover]}</div>
            <TipRows members={members} values={rows[hover]} suffix={suffix} />
          </Tip>
        )}
      </div>
    </figure>
  )
}

function roundTop(x: number, y: number, w: number, h: number) {
  const r = Math.min(4, w / 2, h)
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`
}

/** Classifica faccende: barra divisa per giocatore */
export function ChoreBars({ members, stats, metric }: { members: Member[]; stats: ChoreStat[]; metric: 'points' | 'count' }) {
  const val = (s: ChoreStat) => members.reduce((a, m) => a + (s[metric][m.user_id] ?? 0), 0)
  const max = Math.max(1, ...stats.map(val))
  return (
    <div className="chore-bars">
      {stats.map((s) => (
        <div key={s.key} className="chore-bar">
          <div className="chore-bar-head">
            <span>{s.emoji} {s.name}</span>
            <b>{val(s)}{metric === 'points' ? ' pt' : '×'}</b>
          </div>
          <div className="chore-bar-track">
            {members.map((m) => {
              const v = s[metric][m.user_id] ?? 0
              return v > 0 ? <span key={m.user_id} style={{ width: `${(v / max) * 100}%`, background: m.color }} /> : null
            })}
          </div>
          <div className="chore-bar-foot">
            {members.map((m) => <span key={m.user_id}>{m.emoji} {s.count[m.user_id] ?? 0}× · {s.points[m.user_id] ?? 0} pt</span>)}
          </div>
        </div>
      ))}
    </div>
  )
}
