export type Status = 'pending' | 'approved' | 'rejected'

export interface Household {
  id: string
  name: string
  invite_code: string
  /** € per ogni punto di distacco a fine mese */
  dinner_rate: number
}

export interface Member {
  household_id: string
  user_id: string
  display_name: string
  emoji: string
  color: string
}

export interface Chore {
  id: string
  household_id: string
  name: string
  emoji: string
  points: number
  archived: boolean
  created_by: string | null
  created_at: string
}

export interface Completion {
  id: string
  household_id: string
  chore_id: string | null
  chore_name: string
  chore_emoji: string
  points: number
  /** Fatta a metà: vale metà dei punti della faccenda */
  half: boolean
  /** Una tantum: non viene da una faccenda salvata (chore_id è null), nome e punti li ha scelti chi l'ha fatta */
  one_off: boolean
  user_id: string
  done_at: string
  note: string | null
  status: Status
  reviewed_by: string | null
  reviewed_at: string | null
  review_note: string | null
  created_at: string
}

export interface Dinner {
  household_id: string
  month: string
  amount: number | null
  paid_at: string
}

export interface AppData {
  household: Household
  members: Member[]
  chores: Chore[]
  completions: Completion[]
  dinners: Dinner[]
}

export interface Profile {
  display_name: string
  emoji: string
  color: string
}

export type ChangeEvent =
  | { kind: 'completion_created'; completion: Completion }
  | { kind: 'completion_reviewed'; completion: Completion }
  | { kind: 'nudge'; from: string }
  | { kind: 'other' }

export type NotifyRequest =
  | { type: 'completion_created' | 'completion_reviewed'; completion_id: string }
  | { type: 'nudge' }
  | { type: 'test' }

export interface Backend {
  mode: 'demo' | 'cloud'
  getUserId(): Promise<string | null>
  onAuthChange(cb: (uid: string | null) => void): () => void
  signIn(email: string, password: string): Promise<void>
  signUp(email: string, password: string): Promise<{ needsConfirmation: boolean }>
  signOut(): Promise<void>

  /** null = l'utente non fa ancora parte di una casa */
  load(): Promise<AppData | null>
  subscribe(householdId: string, onChange: (e: ChangeEvent) => void): () => void

  createHousehold(name: string, profile: Profile): Promise<void>
  joinHousehold(code: string, profile: Profile): Promise<void>
  updateProfile(profile: Profile): Promise<void>
  renameHousehold(name: string): Promise<void>
  setDinnerRate(rate: number): Promise<void>

  saveChore(chore: { id?: string; name: string; emoji: string; points: number }): Promise<void>
  setChoreArchived(id: string, archived: boolean): Promise<void>

  logCompletion(choreId: string, opts: { note?: string; doneAt?: Date; half?: boolean }): Promise<Completion>
  /** Faccenda una tantum: va validata come le altre ma non finisce tra le faccende salvate */
  logOneOff(chore: { name: string; emoji: string; points: number }, opts: { note?: string; doneAt?: Date }): Promise<Completion>
  reviewCompletion(id: string, approve: boolean, note?: string): Promise<Completion>
  deleteCompletion(id: string): Promise<void>
  setDinnerPaid(month: string, paid: boolean, amount?: number): Promise<void>

  savePushSubscription(sub: PushSubscriptionJSON): Promise<void>
  removePushSubscription(endpoint: string): Promise<void>
  notify(req: NotifyRequest): Promise<void>

  /** Solo demo: impersona l'altro giocatore per provare la validazione */
  switchUser?(): void
}
