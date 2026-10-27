import { useEffect, useRef, type ReactNode } from 'react'
import type { Member } from '../lib/types'

// Palette validata per daltonismo (vedi README): il partner non può scegliere lo stesso colore
export const PLAYER_COLORS = ['#eb6834', '#2a78d6', '#1baf7a', '#6250d6', '#e87ba4', '#eda100', '#008300', '#e34948']
export const PLAYER_EMOJIS = ['🦊', '🐼', '🐯', '🐸', '🦄', '🐙', '🐨', '🦁', '🐧', '🐻', '🐱', '🐶', '🦖', '🐝', '🦸', '🧙']
export const CHORE_EMOJIS = ['🧹', '🧽', '🪣', '🧺', '👕', '🔥', '🍽️', '🫧', '🍳', '🛒', '🚽', '🛁', '🗑️', '🛏️', '🪴', '🐕',
  '🐈', '🚗', '🧾', '🔧', '💡', '🪟', '🧊', '📦', '👶', '🌿', '🍕', '☕', '🧴', '🪥', '🧦', '♻️']

export function Avatar({ m, size = 40 }: { m?: Member; size?: number }) {
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.55, background: m ? `${m.color}26` : undefined, borderColor: m?.color }}>
      {m?.emoji ?? '❔'}
    </span>
  )
}

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])
  return (
    <dialog ref={ref} className="sheet" onClose={onClose} onClick={(e) => { if (e.target === ref.current) onClose() }}>
      <div className="sheet-body">
        <div className="sheet-handle" />
        <header className="sheet-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Chiudi">✕</button>
        </header>
        {open && children}
      </div>
    </dialog>
  )
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="segmented" role="tablist">
      {options.map(([v, label]) => (
        <button key={v} role="tab" aria-selected={v === value} className={v === value ? 'on' : ''} onClick={() => onChange(v)}>
          {label}
        </button>
      ))}
    </div>
  )
}

export function PeriodNav({ label, onPrev, onNext, nextDisabled }: { label: string; onPrev: () => void; onNext: () => void; nextDisabled?: boolean }) {
  return (
    <div className="period-nav">
      <button className="icon-btn" onClick={onPrev} aria-label="Precedente">‹</button>
      <strong>{label}</strong>
      <button className="icon-btn" onClick={onNext} disabled={nextDisabled} aria-label="Successivo">›</button>
    </div>
  )
}

export function EmojiGrid({ options, value, onChange }: { options: string[]; value: string; onChange: (e: string) => void }) {
  return (
    <div className="emoji-grid">
      {options.map((e) => (
        <button type="button" key={e} className={e === value ? 'on' : ''} onClick={() => onChange(e)}>{e}</button>
      ))}
    </div>
  )
}

export function ColorGrid({ value, onChange, taken }: { value: string; onChange: (c: string) => void; taken?: string }) {
  return (
    <div className="color-grid">
      {PLAYER_COLORS.map((c) => (
        <button type="button" key={c} disabled={c === taken} className={c === value ? 'on' : ''} style={{ background: c }}
          aria-label={c} onClick={() => onChange(c)} />
      ))}
    </div>
  )
}

export function Empty({ emoji, children }: { emoji: string; children: ReactNode }) {
  return <div className="empty"><span>{emoji}</span><p>{children}</p></div>
}

export function StatusChip({ status }: { status: 'pending' | 'approved' | 'rejected' }) {
  const map = { pending: ['⏳', 'In attesa'], approved: ['✓', 'Validata'], rejected: ['✕', 'Rifiutata'] } as const
  return <span className={`chip chip-${status}`}>{map[status][0]} {map[status][1]}</span>
}
