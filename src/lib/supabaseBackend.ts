import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { AppData, Backend, ChangeEvent, Completion, Profile } from './types'

const PAGE = 1000

function fail(error: { message: string } | null) {
  if (error) throw new Error(error.message)
}

export function createSupabaseBackend(url: string, key: string): Backend {
  const sb: SupabaseClient = createClient(url, key, {
    auth: { persistSession: true, autoRefreshToken: true, storageKey: 'house-fight-auth' },
  })

  async function uid() {
    const { data } = await sb.auth.getSession()
    return data.session?.user.id ?? null
  }

  async function myHouseholdId() {
    const id = await uid()
    const { data, error } = await sb.from('members').select('household_id').eq('user_id', id!).maybeSingle()
    fail(error)
    if (!data) throw new Error('Nessuna casa')
    return data.household_id as string
  }

  // numeric di Postgres può arrivare come stringa
  const withPoints = <T extends { points: unknown }>(x: T) => ({ ...x, points: Number(x.points) })

  async function allCompletions(hid: string) {
    const out: Completion[] = []
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await sb.from('completions').select('*').eq('household_id', hid)
        .order('done_at', { ascending: false }).range(from, from + PAGE - 1)
      fail(error)
      out.push(...(data as Completion[]).map(withPoints))
      if (!data || data.length < PAGE) return out
    }
  }

  return {
    mode: 'cloud',
    getUserId: uid,
    onAuthChange(cb) {
      const { data } = sb.auth.onAuthStateChange((_e, session) => cb(session?.user.id ?? null))
      return () => data.subscription.unsubscribe()
    },
    async signIn(email, password) {
      const { error } = await sb.auth.signInWithPassword({ email, password })
      fail(error)
    },
    async signUp(email, password) {
      const { data, error } = await sb.auth.signUp({ email, password })
      fail(error)
      return { needsConfirmation: !data.session }
    },
    async signOut() {
      await sb.auth.signOut()
    },

    async load(): Promise<AppData | null> {
      const id = await uid()
      if (!id) return null
      const { data: me, error } = await sb.from('members').select('household_id').eq('user_id', id).maybeSingle()
      fail(error)
      if (!me) return null
      const hid = me.household_id as string
      const [h, m, c, d, comps] = await Promise.all([
        sb.from('households').select('*').eq('id', hid).single(),
        sb.from('members').select('*').eq('household_id', hid).order('joined_at'),
        sb.from('chores').select('*').eq('household_id', hid).order('created_at'),
        sb.from('dinners').select('*').eq('household_id', hid),
        allCompletions(hid),
      ])
      fail(h.error); fail(m.error); fail(c.error); fail(d.error)
      const household = { ...h.data, dinner_rate: Number(h.data.dinner_rate) }
      const dinners = d.data!.map((x) => ({ ...x, amount: x.amount == null ? null : Number(x.amount) }))
      return { household, members: m.data!, chores: c.data!.map(withPoints), dinners, completions: comps }
    },

    subscribe(hid, onChange) {
      const filter = `household_id=eq.${hid}`
      const ch = sb.channel(`hf-${hid}`)
      for (const table of ['members', 'chores', 'dinners']) {
        ch.on('postgres_changes', { event: '*', schema: 'public', table, filter }, () => onChange({ kind: 'other' }))
      }
      ch.on('postgres_changes', { event: '*', schema: 'public', table: 'households', filter: `id=eq.${hid}` },
        () => onChange({ kind: 'other' }))
      ch.on('postgres_changes', { event: '*', schema: 'public', table: 'completions', filter }, (p) => {
        let e: ChangeEvent = { kind: 'other' }
        if (p.eventType === 'INSERT') e = { kind: 'completion_created', completion: withPoints(p.new as Completion) }
        else if (p.eventType === 'UPDATE' && (p.new as Completion).status !== 'pending')
          e = { kind: 'completion_reviewed', completion: withPoints(p.new as Completion) }
        onChange(e)
      })
      ch.subscribe()
      return () => { sb.removeChannel(ch) }
    },

    async createHousehold(name, p: Profile) {
      const { error } = await sb.rpc('create_household', {
        p_name: name, p_display_name: p.display_name, p_emoji: p.emoji, p_color: p.color,
      })
      fail(error)
    },
    async joinHousehold(code, p) {
      const { error } = await sb.rpc('join_household', {
        p_code: code, p_display_name: p.display_name, p_emoji: p.emoji, p_color: p.color,
      })
      fail(error)
    },
    async updateProfile(p) {
      const { error } = await sb.from('members').update(p).eq('user_id', (await uid())!)
      fail(error)
    },
    async renameHousehold(name) {
      const { error } = await sb.from('households').update({ name }).eq('id', await myHouseholdId())
      fail(error)
    },

    async setDinnerRate(rate) {
      const { error } = await sb.from('households').update({ dinner_rate: rate }).eq('id', await myHouseholdId())
      fail(error)
    },

    async saveChore({ id, name, emoji, points }) {
      if (id) {
        const { error } = await sb.from('chores').update({ name, emoji, points }).eq('id', id)
        fail(error)
      } else {
        const { error } = await sb.from('chores').insert({ household_id: await myHouseholdId(), name, emoji, points })
        fail(error)
      }
    },
    async setChoreArchived(id, archived) {
      const { error } = await sb.from('chores').update({ archived }).eq('id', id)
      fail(error)
    },

    async logCompletion(choreId, { note, doneAt, half }) {
      // household_id, nome e punti (dimezzati se half) vengono impostati dal trigger sul database
      const { data, error } = await sb.from('completions').insert({
        chore_id: choreId,
        household_id: await myHouseholdId(),
        chore_name: '', chore_emoji: '', points: 0, half: !!half,
        note: note || null,
        done_at: (doneAt ?? new Date()).toISOString(),
      }).select().single()
      fail(error)
      return withPoints(data as Completion)
    },
    async reviewCompletion(id, approve, note) {
      const { data, error } = await sb.from('completions')
        .update({ status: approve ? 'approved' : 'rejected', review_note: note || null })
        .eq('id', id).select().single()
      fail(error)
      return withPoints(data as Completion)
    },
    async deleteCompletion(id) {
      const { error } = await sb.from('completions').delete().eq('id', id)
      fail(error)
    },
    async setDinnerPaid(month, paid, amount) {
      const hid = await myHouseholdId()
      const { error } = paid
        ? await sb.from('dinners').upsert({ household_id: hid, month, amount: amount ?? null })
        : await sb.from('dinners').delete().eq('household_id', hid).eq('month', month)
      fail(error)
    },

    async savePushSubscription(sub) {
      const { error } = await sb.from('push_subscriptions').upsert({
        endpoint: sub.endpoint, p256dh: sub.keys!.p256dh, auth: sub.keys!.auth, user_id: await uid(),
      })
      fail(error)
    },
    async removePushSubscription(endpoint) {
      await sb.from('push_subscriptions').delete().eq('endpoint', endpoint)
    },
    async notify(req) {
      // Le notifiche sono "best effort": un errore qui non deve bloccare l'app
      const { error } = await sb.functions.invoke('notify', { body: req })
      if (error) console.warn('notify', error)
    },
  }
}
