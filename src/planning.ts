export const slots = ['Matin', 'Midi', 'Soir'] as const
export type Slot = typeof slots[number]
export type Account = { id: string; name: string; handle: string; modelId?: string; createdAt?: string }
export type Model = { id: string; name: string }
export type Post = { count: string; caption: string; url: string; owner: string; likes?: number; comments?: number; imageUrl?: string; author?: string }
export type TylanReference = {
  id: string
  caption: string
  author: string
  url: string
  reactions: number
  agent: string
  addedOn?: string
  addedAt?: string
  quotaDay?: string
}
export type CaptionUse = {
  referenceId: string
  accountId: string
  modelId: string
  modelName: string
}
export type CaptionTarget = { accountId: string; modelId: string; date: string; slot: Slot }

export type SubmittedPost = {
  imageUrl?: string
  addedBy?: string
  url: string
  agent: string
  reactions?: number
  addedOn?: string
  addedAt?: string
  publishedOn?: string
  quotaDay?: string
}

export type Renewal = { id: string; accountId: string; accountName: string; date: string; time?: string; note?: string }

export type Planning = {
  renewals?: Renewal[]
  scrapingGoals?: Record<string, number>
  accounts: Account[]
  models: Model[]
  posts: Record<string, Post>
  references: TylanReference[]
  captionUses: CaptionUse[]
  submittedPosts?: SubmittedPost[]
}

const legacyStorageKey = 'planning-des-publications-v1'

export function planningStorageKey(accountId: string, firstAccount: boolean) {
  const key = legacyStorageKey + ':' + accountId
  try {
    if (firstAccount && localStorage.getItem(key) === null) {
      const previous = localStorage.getItem(legacyStorageKey)
      if (previous !== null) localStorage.setItem(key, previous)
    }
  } catch {
    // Reading or saving later will surface browser storage errors.
  }
  return key
}
export const emptyPost: Post = { count: '', caption: '', url: '', owner: '' }
export const initialPlanning: Planning = {
  accounts: [
    { id: 'lea-1', name: 'Lea 1', handle: 'martinslae' },
    { id: 'lea-2', name: 'Lea 2', handle: 'lea.laventiere' },
    { id: 'lea-3', name: 'Lea 3', handle: 'leaunepetiteprincess' },
  ],
  models: [
    { id: 'model-1', name: 'Modèle 1' },
    { id: 'model-2', name: 'Modèle 2' },
  ],
  posts: {},
  references: [],
  captionUses: [],
}

export function readPlanning(storageKey: string): Planning {
  const saved = localStorage.getItem(storageKey)
  if (!saved) return initialPlanning

  const data: Planning = JSON.parse(saved)
  if (!Array.isArray(data.accounts) || !data.posts || typeof data.posts !== 'object') {
    throw new Error('Sauvegarde locale invalide')
  }
  return {
    ...data,
    models: data.models ?? initialPlanning.models,
    references: data.references ?? [],
    captionUses: data.captionUses ?? [],
  }
}

export function loadPlanning(storageKey: string) {
  try {
    return { data: readPlanning(storageKey), error: '', hasSavedData: localStorage.getItem(storageKey) !== null }
  } catch {
    return { data: initialPlanning, error: 'La sauvegarde locale n’a pas pu être lue.', hasSavedData: false }
  }
}

export const todayKey = (date = new Date()) => new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Indian/Antananarivo',
}).format(date)

export const fromKey = (date: string) => new Date(date + 'T12:00:00Z')
export const dateKey = (date: Date) => date.toISOString().slice(0, 10)
export function isDateKey(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = fromKey(value)
  return Number.isFinite(date.getTime()) && dateKey(date) === value
}
export const formatDate = (date: Date, options: Intl.DateTimeFormatOptions) =>
  date.toLocaleDateString('fr-FR', { ...options, timeZone: 'UTC' })

export function shiftDate(date: Date, days: number) {
  const shifted = new Date(date)
  shifted.setUTCDate(shifted.getUTCDate() + days)
  return shifted
}

export const dailyScrapingGoal = 40
export const firstScrapingGoalDay = '2026-11-16'

export function scrapingDay(entry: SubmittedPost) {
  if (entry.addedOn && entry.addedOn < firstScrapingGoalDay) return entry.addedOn
  return entry.quotaDay ?? entry.addedOn
}

export function agentScrapingGoal(goals: Record<string, number> | undefined, _agent: string) {
  return goals?.['*'] ?? dailyScrapingGoal
}

export function scrapingProgress(entries: SubmittedPost[], goals?: Record<string, number>) {
  const counts = new Map<string, number>()
  const numbers = new Map<SubmittedPost, number>()
  const ordered = [...entries].reverse().sort((a, b) => (a.addedAt ?? '').localeCompare(b.addedAt ?? ''))
  for (const entry of ordered) {
    const day = scrapingDay(entry)
    if (!day) continue
    const key = scrapingBucket(entry.agent, day)
    const number = (counts.get(key) ?? 0) + 1
    counts.set(key, number)
    numbers.set(entry, number)
  }
  return { counts, numbers, goals }
}

export function scrapingBucket(agent: string, day: string) {
  return day + '|' + agent.normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('fr')
}

const scrapingHour = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Indian/Antananarivo',
  hour: '2-digit',
  hourCycle: 'h23',
})

export function scrapingToday(now = new Date()) {
  const today = todayKey(now)
  return today > firstScrapingGoalDay && Number(scrapingHour.format(now)) < 2
    ? dateKey(shiftDate(fromKey(today), -1))
    : today
}

export function nextScrapingDay(planning: Planning, agent: string, now = new Date()) {
  let day = scrapingToday(now)
  if (day < firstScrapingGoalDay) return day
  const { counts } = scrapingProgress(planning.submittedPosts ?? [])
  while ((counts.get(scrapingBucket(agent, day)) ?? 0) >= agentScrapingGoal(planning.scrapingGoals, agent)) {
    day = dateKey(shiftDate(fromKey(day), 1))
  }
  return day
}

export const postKey = (date: string, account: Account, slot: Slot) =>
  [date, account.id, slot].join('|')

export function captionKey(value: string) {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('fr')
}

export function captionAccountsByReference({ references, posts, captionUses }: Planning) {
  const accountsByCaption = new Map<string, Set<string>>()
  for (const [key, post] of Object.entries(posts)) {
    const accountId = key.split('|')[1]
    const caption = captionKey(post.caption ?? '')
    if (!caption || !accountId) continue

    const accounts = accountsByCaption.get(caption) ?? new Set<string>()
    accounts.add(accountId)
    accountsByCaption.set(caption, accounts)
  }

  const accountsByReference = new Map(references.map(reference => [
    reference.id,
    new Set(accountsByCaption.get(captionKey(reference.caption))),
  ]))
  for (const use of captionUses) {
    accountsByReference.get(use.referenceId)?.add(use.accountId)
  }
  return accountsByReference
}

export function webUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : ''
  } catch {
    return ''
  }
}

export function exportCsv(data: Planning) {
  const headers = ['Date', 'Compte', 'Identifiant', 'Créneau', 'Nombre de posts',
    'Légende +1K', 'Lien du post', 'Responsable', 'J’aime', 'Commentaires']
  const accounts = new Map(data.accounts.map(account => [account.id, account]))
  const entries = Object.entries(data.posts).map(([key, post]) => {
    const [date, id, slot] = key.split('|')
    return { date, id, slot: slot as Slot, post }
  }).sort((a, b) =>
    a.date.localeCompare(b.date) || a.id.localeCompare(b.id)
    || slots.indexOf(a.slot) - slots.indexOf(b.slot))

  const rows = [headers]
  for (const { date, id, slot, post } of entries) {
    const account = accounts.get(id)
    if (account) rows.push([date, account.name, account.handle, slot,
      post.count, post.caption, post.url, post.owner, String(post.likes ?? ''), String(post.comments ?? '')])
  }

  const csv = rows.map(row => row.map(value => {
    const safe = /^[\t\r\n]|^\s*[=+\-@]/u.test(value) ? "'" + value : value
    return '"' + safe.replaceAll('"', '""') + '"'
  }).join(';')).join('\r\n')
  const url = URL.createObjectURL(new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = 'planning-publications.csv'
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return rows.length - 1
}
