// House Fight – invio notifiche push (Web Push / VAPID)
//
// Chiamate dall'app (con il token dell'utente):
//   { type: 'completion_created',  completion_id }  → avvisa il partner che c'è da validare
//   { type: 'completion_reviewed', completion_id }  → avvisa chi l'ha fatta dell'esito
//   { type: 'nudge' }                                → "stuzzica" il partner
//   { type: 'test' }                                 → notifica di prova a se stessi
// Chiamata programmata (header x-cron-secret):
//   { type: 'monthly' }                              → risultato del mese appena concluso

import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const VAPID_PUBLIC = Deno.env.get('VAPID_PUBLIC_KEY')!
const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY')!
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:house-fight@example.com'
const CRON_SECRET = Deno.env.get('CRON_SECRET') ?? ''

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE)
const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
}

type Payload = { title: string; body: string; tag?: string; url?: string }
type Member = { user_id: string; household_id: string; display_name: string; emoji: string }

const MONTHS = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto',
  'settembre', 'ottobre', 'novembre', 'dicembre']

/** Punti all'italiana: 10 oppure 2,5 */
const pts = (v: number) => new Intl.NumberFormat('it-IT', { maximumFractionDigits: 2 }).format(v)

async function pushTo(userIds: string[], payload: Payload) {
  if (!userIds.length) return 0
  const { data: subs } = await admin.from('push_subscriptions').select('*').in('user_id', userIds)
  let sent = 0
  await Promise.all((subs ?? []).map(async (s) => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify(payload),
        { TTL: 60 * 60 * 24 },
      )
      sent++
    } catch (err) {
      const code = (err as { statusCode?: number }).statusCode
      if (code === 404 || code === 410) await admin.from('push_subscriptions').delete().eq('endpoint', s.endpoint)
      else console.error('push error', code, err)
    }
  }))
  return sent
}

async function membersOf(householdId: string): Promise<Member[]> {
  const { data } = await admin.from('members').select('*').eq('household_id', householdId)
  return data ?? []
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
}

async function monthly() {
  const now = new Date()
  // Mese appena concluso (confini in UTC: approssimazione sufficiente per un riepilogo)
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const monthName = MONTHS[start.getUTCMonth()]

  const fmt = (v: number) => new Intl.NumberFormat('it-IT', {
    style: 'currency', currency: 'EUR', minimumFractionDigits: Number.isInteger(v) ? 0 : 2, maximumFractionDigits: 2,
  }).format(v)
  const { data: households } = await admin.from('households').select('id, dinner_rate')
  for (const h of households ?? []) {
    const members = await membersOf(h.id)
    if (members.length < 2) continue
    const { data: rows } = await admin.from('completions').select('user_id, points')
      .eq('household_id', h.id).eq('status', 'approved')
      .gte('done_at', start.toISOString()).lt('done_at', end.toISOString())
    const totals = new Map(members.map((m) => [m.user_id, 0]))
    for (const r of rows ?? []) totals.set(r.user_id, Math.round(((totals.get(r.user_id) ?? 0) + Number(r.points)) * 100) / 100)
    const [a, b] = [...members].sort((x, y) => (totals.get(y.user_id)! - totals.get(x.user_id)!))
    const pa = totals.get(a.user_id)!, pb = totals.get(b.user_id)!
    // stessa formula dell'app: distacco × €/punto, arrotondato ai 50 centesimi
    const amount = fmt(Math.round((pa - pb) * Number(h.dinner_rate) * 2) / 2)
    if (pa === pb) {
      await pushTo(members.map((m) => m.user_id), {
        title: `🤝 Pareggio a ${monthName}!`,
        body: `${pts(pa)} a ${pts(pb)}: cena alla romana 🍝`, tag: `month-${start.toISOString().slice(0, 7)}`, url: './#/',
      })
    } else {
      await pushTo([a.user_id], {
        title: `🏆 Hai vinto ${monthName}!`,
        body: `${pts(pa)} a ${pts(pb)}: ${b.display_name} ti offre una cena da ${amount} 🍽️`, tag: `month-${start.toISOString().slice(0, 7)}`, url: './#/',
      })
      await pushTo([b.user_id], {
        title: `😅 ${a.display_name} ha vinto ${monthName}`,
        body: `${pts(pa)} a ${pts(pb)}: tocca a te offrire una cena da ${amount} 🍽️. Rifatti questo mese!`, tag: `month-${start.toISOString().slice(0, 7)}`, url: './#/',
      })
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  let body: { type?: string; completion_id?: string }
  try { body = await req.json() } catch { return json({ error: 'JSON non valido' }, 400) }

  if (body.type === 'monthly') {
    if (!CRON_SECRET || req.headers.get('x-cron-secret') !== CRON_SECRET) return json({ error: 'forbidden' }, 403)
    await monthly()
    return json({ ok: true })
  }

  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  const { data: auth } = await admin.auth.getUser(token)
  const user = auth?.user
  if (!user) return json({ error: 'unauthorized' }, 401)

  const { data: me } = await admin.from('members').select('*').eq('user_id', user.id).maybeSingle()
  if (!me) return json({ error: 'nessuna casa' }, 403)
  const members = await membersOf(me.household_id)
  const others = members.filter((m) => m.user_id !== user.id).map((m) => m.user_id)

  if (body.type === 'test') {
    const sent = await pushTo([user.id], { title: '🔔 Notifiche attive!', body: 'House Fight ti avviserà qui.', tag: 'test' })
    return json({ sent })
  }

  if (body.type === 'nudge') {
    const { count } = await admin.from('completions').select('id', { count: 'exact', head: true })
      .eq('household_id', me.household_id).eq('user_id', user.id).eq('status', 'pending')
    const sent = await pushTo(others, {
      title: `${me.emoji} ${me.display_name} ti stuzzica!`,
      body: count ? `Hai ${count} faccend${count === 1 ? 'a' : 'e'} da validare 👀` : 'Ehi, è ora di fare qualche faccenda! 💪',
      tag: 'nudge', url: './#/',
    })
    return json({ sent })
  }

  if (body.type === 'completion_created' || body.type === 'completion_reviewed') {
    const { data: c } = await admin.from('completions').select('*').eq('id', body.completion_id ?? '').maybeSingle()
    if (!c || c.household_id !== me.household_id) return json({ error: 'not found' }, 404)

    if (body.type === 'completion_created') {
      if (c.user_id !== user.id) return json({ error: 'forbidden' }, 403)
      const sent = await pushTo(others, {
        title: `${me.emoji} ${me.display_name}: ${c.chore_emoji} ${c.chore_name}${c.half ? ' (metà)' : ''}`,
        body: `+${pts(Number(c.points))} punti in attesa della tua validazione ✅`,
        tag: `c-${c.id}`, url: './#/',
      })
      return json({ sent })
    }

    if (c.reviewed_by !== user.id || c.status === 'pending') return json({ error: 'forbidden' }, 403)
    const ok = c.status === 'approved'
    const sent = await pushTo([c.user_id], {
      title: ok ? `✅ ${c.chore_name}: +${pts(Number(c.points))} punti!` : `❌ ${c.chore_name} rifiutata`,
      body: ok
        ? `${me.display_name} ha validato la tua faccenda 💪`
        : `${me.display_name}: ${c.review_note || 'non ci siamo…'}`,
      tag: `c-${c.id}`, url: './#/storico',
    })
    return json({ sent })
  }

  return json({ error: 'tipo sconosciuto' }, 400)
})
