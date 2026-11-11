export const slots = ['Matin', 'Midi', 'Soir'] as const
export type Slot = typeof slots[number]
export type Account = { id: string; name: string; handle: string; modelId?: string }
export type Model = { id: string; name: string }
export type Post = { count: string; caption: string; url: string; owner: string; likes?: number; comments?: number; imageUrl?: string }
export type TylanReference = {
  id: string
  caption: string
  author: string
  url: string
  reactions: number
  agent: string
}
export type CaptionUse = {
  referenceId: string
  accountId: string
  modelId: string
  modelName: string
}
export type CaptionTarget = { accountId: string; modelId: string; date: string; slot: Slot }

export type SubmittedPost = { url: string; agent: string }

export type Planning = {
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

export const todayKey = () => new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Indian/Antananarivo',
}).format(new Date())

export const fromKey = (date: string) => new Date(date + 'T12:00:00Z')
export const dateKey = (date: Date) => date.toISOString().slice(0, 10)
export const formatDate = (date: Date, options: Intl.DateTimeFormatOptions) =>
  date.toLocaleDateString('fr-FR', { ...options, timeZone: 'UTC' })

export function shiftDate(date: Date, days: number) {
  const shifted = new Date(date)
  shifted.setUTCDate(shifted.getUTCDate() + days)
  return shifted
}

export const postKey = (date: string, account: Account, slot: Slot) =>
  [date, account.id, slot].join('|')

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
