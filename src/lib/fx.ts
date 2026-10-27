export function haptic(pattern: number | number[] = 12) {
  try { navigator.vibrate?.(pattern) } catch { /* non supportato */ }
}

const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** Piccola esplosione di coriandoli su un canvas temporaneo. */
export function confetti(colors: string[] = ['#eb6834', '#2a78d6', '#eda100', '#1baf7a'], origin?: { x: number; y: number }) {
  if (reduceMotion()) return
  const canvas = document.createElement('canvas')
  const dpr = window.devicePixelRatio || 1
  canvas.width = innerWidth * dpr
  canvas.height = innerHeight * dpr
  Object.assign(canvas.style, { position: 'fixed', inset: '0', width: '100vw', height: '100vh', pointerEvents: 'none', zIndex: '100' })
  document.body.appendChild(canvas)
  const ctx = canvas.getContext('2d')!
  ctx.scale(dpr, dpr)
  const ox = origin?.x ?? innerWidth / 2
  const oy = origin?.y ?? innerHeight / 3
  const parts = Array.from({ length: 90 }, () => {
    const a = Math.random() * Math.PI * 2
    const v = 4 + Math.random() * 7
    return {
      x: ox, y: oy, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 4,
      r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.4,
      w: 6 + Math.random() * 6, h: 4 + Math.random() * 4,
      c: colors[Math.floor(Math.random() * colors.length)],
    }
  })
  const t0 = performance.now()
  const tick = (t: number) => {
    const life = (t - t0) / 1600
    ctx.clearRect(0, 0, innerWidth, innerHeight)
    for (const p of parts) {
      p.vy += 0.25; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.r += p.vr
      ctx.save()
      ctx.globalAlpha = Math.max(0, 1 - life)
      ctx.translate(p.x, p.y); ctx.rotate(p.r)
      ctx.fillStyle = p.c
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h)
      ctx.restore()
    }
    if (life < 1) requestAnimationFrame(tick)
    else canvas.remove()
  }
  requestAnimationFrame(tick)
}

/** "+15" che vola verso l'alto dal punto toccato */
export function floatPoints(text: string, x: number, y: number, color: string) {
  if (reduceMotion()) return
  const el = document.createElement('div')
  el.className = 'float-points'
  el.textContent = text
  Object.assign(el.style, { left: `${x}px`, top: `${y}px`, color })
  document.body.appendChild(el)
  el.addEventListener('animationend', () => el.remove())
}
