import { sharedPlanningRequest } from './sharedPlanning'
import type { PlanningSnapshot } from './sharedPlanning'
import { PendingAccounts } from './PendingAccounts'
import { canonicalPublication, lookupPublicPost, publicationKey, threadsLink } from './threads'
import { SubmittedPosts } from './SubmittedPosts'
import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, FormEvent } from 'react'
import { Modal } from './Modal'
import { Tylan } from './Tylan'
import { ModelEditor } from './Models'
import {
  dateKey, emptyPost, exportCsv, formatDate, fromKey, loadPlanning, postKey, initialPlanning as emptyWorkspace,
  isDateKey, readPlanning, shiftDate, slots, todayKey, webUrl,
} from './planning'
import type { Account, CaptionTarget, Model, Planning, Post, Slot, SubmittedPost, TylanReference } from './planning'

const symbols = {
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18m-13 5h2m4 0h2m-8 3h2" /></>,
  people: <><circle cx="9" cy="8" r="3" /><path d="M3 20v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2M16 5a3 3 0 0 1 0 6m2 3a4 4 0 0 1 3 4v2" /></>,
  Matin: <path d="M3 18h18M5 14h2m10 0h2M12 4v3m-5 3L5 8m12 2 2-2M8 14a4 4 0 0 1 8 0" />,
  Midi: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l2 2m10 10 2 2m0-14-2 2M7 17l-2 2" /></>,
  Soir: <path d="M20 15A9 9 0 0 1 9 4a9 9 0 1 0 11 11Z" />,
  references: <><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M9 8h6m-6 4h6m-6 4h4" /></>,
  export: <path d="M12 3v12m-4-4 4 4 4-4M4 16v4h16v-4" />,
  stats: <path d="M4 4v16h16M8 16v-3m5 3V9m5 7V6" />,
}

function Icon({ name }: { name: keyof typeof symbols }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{symbols[name]}</svg>
}

function WeekPicker({ selected, onSelect }: { selected: string; onSelect: (day: string) => void }) {
  const date = fromKey(selected)
  const start = shiftDate(date, -((date.getUTCDay() + 6) % 7))
  const end = shiftDate(start, 6)
  const sameMonth = start.getUTCMonth() === end.getUTCMonth()
  const sameYear = start.getUTCFullYear() === end.getUTCFullYear()
  const startLabel = sameMonth ? start.getUTCDate() : formatDate(start, {
    day: 'numeric', month: 'short', year: sameYear ? undefined : 'numeric',
  })
  const today = todayKey()

  return <section className="week" aria-label="Choisir une date">
    <div className="week-head">
      <strong>{startLabel} – {formatDate(end, { day: 'numeric', month: 'long', year: 'numeric' })}</strong>
      <div className="week-actions">
        <button className="icon" aria-label="Semaine précédente" onClick={() => onSelect(dateKey(shiftDate(date, -7)))}>‹</button>
        <button className="btn" onClick={() => onSelect(today)}>Aujourd’hui</button>
        <button className="icon" aria-label="Semaine suivante" onClick={() => onSelect(dateKey(shiftDate(date, 7)))}>›</button>
      </div>
    </div>
    <div className="days">
      {Array.from({ length: 7 }, (_, index) => {
        const day = shiftDate(start, index)
        const key = dateKey(day)
        return <button key={key} className="day" aria-pressed={key === selected}
          aria-current={key === today ? 'date' : undefined}
          aria-label={formatDate(day, { weekday: 'long', day: 'numeric', month: 'long' })}
          onClick={() => onSelect(key)}>
          <small>{formatDate(day, { weekday: 'short' }).replace('.', '')}</small>
          <b>{day.getUTCDate()}</b>
        </button>
      })}
    </div>
  </section>
}

function AccountCard({ account, date, posts, onEdit }: {
  account: Account
  date: string
  posts: Planning['posts']
  onEdit: (slot: Slot) => void
}) {
  const initials = account.name.split(/\s+/).slice(0, 2).map(word => word[0]).join('').toUpperCase()
  const accountHue = Array.from(account.id).reduce((hash, char) => Math.imul(hash, 31) + char.charCodeAt(0) | 0, 0)
  const hue = (Math.imul(accountHue, 137) >>> 0) % 360
  return <article className="account" style={{ '--account-hue': hue } as CSSProperties}>
    <header className="account-head">
      <span className="avatar" aria-hidden="true">{initials}</span>
      <div><h3>{account.name}</h3><p className="handle">@{account.handle}</p></div>
    </header>
    <div className="slots">
      {slots.map(slot => {
        const post = posts[postKey(date, account, slot)]
        const url = post ? webUrl(post.url) : ''
        const likes = post?.likes
        const comments = post?.comments
        const count = post?.count ? post.count + (Number(post.count) === 1 ? ' post' : ' posts') : ''
        const details = [count, post?.owner].filter(Boolean).join(' · ')
        const action = post ? 'Modifier' : 'Saisir'
        return <div key={slot} className="slot">
          <div className="slot-top">
            <span className="slot-name"><Icon name={slot} />{slot}</span>
            <button className="edit" aria-label={action + ' le créneau ' + slot + ' de ' + account.name}
              onClick={() => onEdit(slot)}>{post ? action : '+ Saisir'}</button>
          </div>
          {post ? <>
            {details && <div className="slot-detail">{details}</div>}
            {(likes != null || comments != null) && <div className="slot-detail">
              {[
                likes != null ? likes + ' J’aime' : '',
                comments != null ? comments + (comments === 1 ? ' commentaire' : ' commentaires') : '',
              ].filter(Boolean).join(' · ')}
            </div>}
            {post.caption && <div className="slot-detail caption">{post.caption}</div>}
            {url && <a className="slot-detail" href={url} target="_blank" rel="noopener noreferrer">Ouvrir le post ↗</a>}
          </> : <div className="slot-detail">À renseigner</div>}
        </div>
      })}
    </div>
  </article>
}

function PostEditor({ account, slot, date, post, owners, onClose, onSave }: {
  account: Account
  slot: Slot
  date: string
  post?: Post
  owners: string[]
  onClose: () => void
  onSave: (post: Post) => Promise<string>
}) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [url, setUrl] = useState(post?.url ?? '')
  const link = url.trim()

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving) return
    const form = event.currentTarget
    const values = new FormData(form)
    const rawCount = String(values.get('count')).trim()
    if (link && !webUrl(link)) {
      const input = form.elements.namedItem('url') as HTMLInputElement
      input.setCustomValidity('Utilise une adresse commençant par http:// ou https://.')
      input.reportValidity()
      return
    }
    const readCount = (name: string) => {
      const value = String(values.get(name) ?? '').trim()
      return value ? Number(value) : undefined
    }
    const likes = readCount('likes')
    const comments = readCount('comments')
    if ([likes, comments].some(value => value !== undefined && (!Number.isSafeInteger(value) || value < 0))) {
      setError('Saisis des compteurs entiers et positifs ou nuls.')
      return
    }
    const imageUrl = String(values.get('imageUrl') ?? '').trim()
    if (imageUrl && !webUrl(imageUrl).startsWith('https://')) {
      setError('Utilise une URL d’image directe commençant par https://.')
      return
    }
    const next: Post = {
      count: rawCount ? String(Number(rawCount)) : link ? '1' : '',
      caption: String(values.get('caption') ?? '').trim(),
      imageUrl: imageUrl || undefined,
      url: link,
      owner: String(values.get('owner')).trim(),
      likes,
      comments,
    }
    setSaving(true)
    setError(await onSave(next))
    setSaving(false)
  }

  return <Modal title="Modifier le créneau" onClose={() => { if (!saving) onClose() }}>
    <p className="sub">{account.name} · {slot} · {formatDate(fromKey(date), {
      day: 'numeric', month: 'long', year: 'numeric',
    })}</p>
    <p className="sub">Relève les compteurs sur Threads et saisis-les ici.</p>
    <form onSubmit={submit}>
      <label>Lien du post<input name="url" disabled={saving} type="url" maxLength={2000}
        placeholder="https://www.threads.com/…" value={url} onChange={event => {
          event.currentTarget.setCustomValidity('')
          setUrl(event.target.value)
        }} /></label>
      {webUrl(link) && <a href={webUrl(link)} target="_blank" rel="noopener noreferrer">Ouvrir le post ↗</a>}
      <label>J’aime<input name="likes" disabled={saving} type="number" min="0" max={Number.MAX_SAFE_INTEGER}
        step="1" defaultValue={post?.likes} /></label>
      <label>Commentaires<input name="comments" disabled={saving} type="number" min="0" max={Number.MAX_SAFE_INTEGER}
        step="1" defaultValue={post?.comments} /></label>
      <label>URL directe de la photo (facultatif)<input name="imageUrl" disabled={saving} type="url" maxLength={2000}
        placeholder="https://…" defaultValue={post?.imageUrl} /></label>
      <label>Légende +1K<textarea name="caption" disabled={saving} maxLength={5000} placeholder="Saisir une légende"
        defaultValue={post?.caption} /></label>
      <label>Nombre de posts<input name="count" disabled={saving} type="number" min="0" max="999999" step="1"
        placeholder={link ? '1' : '0'} defaultValue={post?.count} /></label>
      <label>Responsable<input name="owner" disabled={saving} maxLength={100} list="owners" placeholder="Saisir ou choisir un nom" defaultValue={post?.owner} /></label>
      <datalist id="owners">{owners.map(owner => <option key={owner} value={owner} />)}</datalist>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="actions">
        {post && <button className="btn danger" type="button" disabled={saving} onClick={async () => {
          if (!window.confirm('Effacer les données de ce créneau ?')) return
          setSaving(true)
          setError(await onSave(emptyPost))
          setSaving(false)
        }}>Effacer</button>}
        <button className="btn" type="button" disabled={saving} onClick={onClose}>Annuler</button>
        <button className="btn primary" type="submit" disabled={saving}>{saving ? 'Enregistrement…' : 'Enregistrer'}</button>
      </div>
    </form>
  </Modal>
}

function AccountEditor({ account, models, modelId, onClose, onSave }: {
  account?: Account
  onClose: () => void
  models: Model[]
  modelId?: string
  onSave: (name: string, handle: string, modelId: string) => Promise<string>
}) {
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving) return
    const form = event.currentTarget
    const nameInput = form.elements.namedItem('name') as HTMLInputElement
    const handleInput = form.elements.namedItem('handle') as HTMLInputElement
    const name = nameInput.value.trim()
    const handle = handleInput.value.trim().replace(/^@/, '')
    if (!name) {
      nameInput.setCustomValidity('Saisis un nom de compte.')
      nameInput.reportValidity()
      return
    }
    if (!handle || /\s/u.test(handle)) {
      handleInput.setCustomValidity('Saisis un identifiant sans espace.')
      handleInput.reportValidity()
      return
    }
    const modelInput = form.elements.namedItem('modelId') as HTMLSelectElement
    setSaving(true)
    setError(await onSave(name, handle, modelInput.value))
    setSaving(false)
  }

  return <Modal title={account ? 'Modifier le compte' : 'Ajouter un compte'} onClose={() => { if (!saving) onClose() }}>
    <form onSubmit={submit} onChange={() => setError('')}>
      <label>Nom du compte<input name="name" required maxLength={60} placeholder="Ex. Lea 4" defaultValue={account?.name}
        onInput={event => event.currentTarget.setCustomValidity('')} /></label>
      <label>Identifiant du profil<input name="handle" required maxLength={100} placeholder="Ex. nom.du.profil" defaultValue={account?.handle}
        onInput={event => event.currentTarget.setCustomValidity('')} /></label>
      <label>Modèle<select name="modelId" defaultValue={account?.modelId ?? modelId ?? ''}>
        <option value="">Sans modèle</option>
        {models.map(model => <option key={model.id} value={model.id}>{model.name}</option>)}
      </select></label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="actions">
        <button className="btn" type="button" disabled={saving} onClick={onClose}>Annuler</button>
        <button className="btn primary" type="submit" disabled={saving}>Enregistrer</button>
      </div>
    </form>
  </Modal>
}

function captionKey(value: string) {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('fr')
}

function captionRecipients(data: Planning, caption: string, sourceId: string) {
  const key = captionKey(caption)
  if (!key) return []
  const used = new Set([sourceId])
  for (const [postId, post] of Object.entries(data.posts)) {
    if (captionKey(post.caption) === key) used.add(postId.split('|')[1])
  }
  const references = new Set(data.references.filter(reference => captionKey(reference.caption) === key)
    .map(reference => reference.id))
  for (const use of data.captionUses) {
    if (references.has(use.referenceId)) used.add(use.accountId)
  }
  return data.accounts.filter(account => !used.has(account.id))
}

function freeCaptionSlot(post?: Post) {
  return !post?.caption && !post?.url && !post?.count
}

function CaptionSuggestion({ data, caption, sourceId, onClose, onSave }: {
  data: Planning
  caption: string
  sourceId: string
  onClose: () => void
  onSave: (accountId: string, date: string, slot: Slot) => Promise<string>
}) {
  const recipients = captionRecipients(data, caption, sourceId)
  const [targetId, setTargetId] = useState('')
  const [date, setDate] = useState(todayKey)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const target = recipients.find(account => account.id === targetId)
  const available = target && date ? slots.filter(slot => freeCaptionSlot(data.posts[postKey(date, target, slot)])) : []

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const slot = new FormData(event.currentTarget).get('slot')
    if (!target || saving || !available.some(option => option === slot)) return
    setSaving(true)
    setError(await onSave(target.id, date, slot as Slot))
    setSaving(false)
  }

  return <Modal title="Réutiliser la légende" onClose={() => { if (!saving) onClose() }}>
    <p className="caption">{caption}</p>
    <form onSubmit={submit} onChange={() => setError('')}>
      <label>Compte
        <select required value={targetId} disabled={saving} onChange={event => setTargetId(event.target.value)}>
          <option value="">Choisir un compte</option>
          {recipients.map(account => <option key={account.id} value={account.id}>{account.name} · @{account.handle}</option>)}
        </select>
      </label>
      <label>Date<input type="date" required value={date} disabled={saving} onChange={event => setDate(event.target.value)} /></label>
      {target && date && available.length === 0 && <p className="sub">Aucun créneau libre pour ce compte à cette date.</p>}
      <label>Créneau
        <select name="slot" key={targetId + '|' + date} required disabled={saving || !available.length}>
          {available.map(slot => <option key={slot}>{slot}</option>)}
        </select>
      </label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="actions">
        <button type="button" className="btn" disabled={saving} onClick={onClose}>Fermer</button>
        <button className="btn primary" disabled={saving || !available.length}>Ajouter au planning</button>
      </div>
    </form>
  </Modal>
}

function Dashboard({ data, date, onEdit, onSuggest }: {
  data: Planning
  date: string
  onEdit: (account: Account, slot: Slot) => void
  onSuggest: (key: string, caption: string, sourceId: string) => void
}) {
  const publications = data.accounts.flatMap(account => slots.flatMap(slot => {
    const key = postKey(date, account, slot)
    const post = data.posts[key]
    const url = webUrl(post?.url ?? '')
    if (!url) return []
    const likes = post.likes
    const comments = post.comments
    return [{ key, account, slot, url, caption: post.caption, likes, comments, imageUrl: webUrl(post.imageUrl ?? ''),
      total: (likes ?? 0) + (comments ?? 0) }]
  }))
  const ranked = publications.filter(post => post.likes != null || post.comments != null)
    .sort((a, b) => b.total - a.total || (b.likes ?? 0) - (a.likes ?? 0))
  const unranked = publications.filter(post => post.likes == null && post.comments == null)
  const totals = ranked.reduce((sum, post) => ({
    likes: sum.likes + (post.likes ?? 0),
    comments: sum.comments + (post.comments ?? 0),
  }), { likes: 0, comments: 0 })

  return <>
    <div className="stats">
      <div className="stat"><b>{ranked.length} / {publications.length}</b><span>Publications avec statistiques</span></div>
      <div className="stat"><b>{totals.likes}</b><span>J’aime relevés</span></div>
      <div className="stat"><b>{totals.comments}</b><span>Commentaires relevés</span></div>
    </div>
    <section className="settings" aria-labelledby="ranking-title">
      <h2 id="ranking-title">Publications les plus engageantes</h2>
      <p className="sub">Classement selon les J’aime et les commentaires saisis dans le planning.</p>
      {ranked.length === 0 && <p className="empty">Aucune statistique disponible pour cette date.</p>}
      {publications.length > 0 && <ol className="account-list">
        {[...ranked, ...unranked].map((post, index) => {
          const recipients = post.total > 0 ? captionRecipients(data, post.caption, post.account.id) : []
          return <li key={post.key} style={{ justifyContent: 'flex-start', alignItems: 'flex-start', gap: 16 }}>
            {post.imageUrl && <img key={post.imageUrl} src={post.imageUrl} alt={'Aperçu du post de ' + post.account.name}
              loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={event => { event.currentTarget.hidden = true }}
              style={{ width: 'clamp(64px, 17vw, 120px)', aspectRatio: '1', flexShrink: 0, objectFit: 'cover', borderRadius: 8 }} />}
            <div style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
              <strong>{post.account.name} · {post.slot} · {index < ranked.length ? post.total + ' interactions relevées' : 'Compteurs à saisir'}</strong>
              <p className="sub">{post.likes ?? '—'} J’aime · {post.comments ?? '—'} commentaires</p>
              {post.caption && <p className="caption">{post.caption}</p>}
              <div className="account-actions">
                <a className="btn" href={post.url} target="_blank" rel="noopener noreferrer">Ouvrir le post ↗</a>
                <button className="btn" onClick={() => onEdit(post.account, post.slot)}>Saisir les compteurs</button>
                {recipients.length > 0 && <button className="btn" onClick={() => onSuggest(post.key, post.caption, post.account.id)}>
                  Réutiliser la légende ({recipients.length} {recipients.length === 1 ? 'compte' : 'comptes'})
                </button>}
              </div>
            </div>
          </li>
        })}
      </ol>}
    </section>
  </>
}

type Editor = { type: 'post'; account: Account; slot: Slot; date: string }
  | { type: 'account'; account?: Account; modelId?: string }
  | { type: 'model'; model?: Model }
  | { type: 'group'; modelId: string | null }
  | { type: 'suggestion'; key: string; caption: string; sourceId: string }

export function App({ storageKey, email, isAdmin, shared, onLogout }: {
  storageKey: string
  email: string
  isAdmin: boolean
  shared: boolean
  onLogout: () => void
}) {
  const [initial] = useState(() => loadPlanning(storageKey))
  const [data, setData] = useState(initial.data)
  const [revision, setRevision] = useState<number | null>(null)
  const latestRevision = useRef(-1)
  const [syncError, setSyncError] = useState('')
  const [importing, setImporting] = useState(false)
  const [selected, setSelected] = useState('2026-11-10')
  const [filter, setFilter] = useState('')
  const [modelFilter, setModelFilter] = useState('')
  const [page, setPage] = useState<'planning' | 'dashboard' | 'accounts' | 'tylan' | 'approvals' | 'submissions'>('dashboard')
  const [editor, setEditor] = useState<Editor | null>(null)
  const [message, setMessage] = useState(initial.error)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  function applySnapshot(snapshot: PlanningSnapshot) {
    if (snapshot.revision < latestRevision.current) return
    setSyncError('')
    if (snapshot.revision === latestRevision.current) return
    latestRevision.current = snapshot.revision
    setRevision(snapshot.revision)
    setData(snapshot.data ?? emptyWorkspace)
  }

  useEffect(() => {
    if (!shared) {
      function updateFromStorage(event: StorageEvent) {
        if (event.key === storageKey || event.key === null) setData(loadPlanning(storageKey).data)
      }
      window.addEventListener('storage', updateFromStorage)
      return () => {
        window.removeEventListener('storage', updateFromStorage)
        clearTimeout(timer.current)
      }
    }

    const controller = new AbortController()
    async function refresh() {
      try {
        const snapshot = await sharedPlanningRequest(undefined, controller.signal)
        if (snapshot && !controller.signal.aborted) applySnapshot(snapshot)
      } catch (error) {
        if (!controller.signal.aborted) {
          setSyncError(error instanceof Error ? error.message : 'Le planning partagé est indisponible.')
        }
      }
    }
    void refresh()
    const interval = window.setInterval(refresh, 5000)
    window.addEventListener('focus', refresh)
    return () => {
      controller.abort()
      window.clearInterval(interval)
      window.removeEventListener('focus', refresh)
      clearTimeout(timer.current)
    }
  }, [shared, storageKey])

  function notice(text: string) {
    clearTimeout(timer.current)
    setMessage(text)
    timer.current = setTimeout(() => setMessage(''), 6000)
  }

  async function readCurrent() {
    if (!shared) return readPlanning(storageKey)
    const snapshot = await sharedPlanningRequest()
    if (snapshot) applySnapshot(snapshot)
    return snapshot?.data ?? emptyWorkspace
  }

  async function commit(update: (current: Planning) => Planning | null) {
    try {
      if (!shared) {
        const next = update(readPlanning(storageKey))
        if (!next) return 'conflict'
        localStorage.setItem(storageKey, JSON.stringify(next))
        setData(next)
        return 'saved'
      }

      for (let attempt = 0; attempt < 3; attempt++) {
        const snapshot = await sharedPlanningRequest()
        if (!snapshot) break
        applySnapshot(snapshot)
        const next = update(snapshot.data ?? emptyWorkspace)
        if (!next) return 'conflict'

        const saved = await sharedPlanningRequest({ revision: snapshot.revision, data: next })
        if (saved) {
          applySnapshot(saved)
          return 'saved'
        }
      }
      notice('Le planning a changé plusieurs fois. Réessaie.')
      return 'error'
    } catch (error) {
      notice(shared && error instanceof Error ? error.message : 'Impossible d’enregistrer les données.')
      return 'error'
    }
  }

  async function importPreviousPlanning() {
    if (importing) return
    setImporting(true)
    try {
      const saved = await sharedPlanningRequest({ revision: 0, data: readPlanning(storageKey) })
      if (saved) {
        applySnapshot(saved)
        notice('Ton ancien planning est maintenant partagé.')
      } else {
        await readCurrent()
        notice('Le planning partagé est déjà initialisé.')
      }
    } catch (error) {
      notice(error instanceof Error ? error.message : 'Import impossible.')
    } finally {
      setImporting(false)
    }
  }

  async function savePost(target: Extract<Editor, { type: 'post' }>, post: Post) {
    const key = postKey(target.date, target.account, target.slot)
    const filled = Boolean(post.count || post.caption || post.url || post.owner || post.imageUrl || post.likes != null || post.comments != null)
    const result = await commit(current => {
      const posts = { ...current.posts }
      if (filled) posts[key] = post
      else delete posts[key]
      return { ...current, posts }
    })
    if (result === 'saved') {
      setEditor(null)
      notice(filled ? 'Créneau enregistré.' : 'Créneau vidé.')
      return ''
    }
    return 'Impossible d’enregistrer ce créneau. Réessaie.'
  }

  async function saveSuggestion(source: Extract<Editor, { type: 'suggestion' }>, accountId: string, date: string, slot: Slot) {
    let conflict = ''
    const result = await commit(current => {
      if (current.posts[source.key]?.caption !== source.caption) {
        conflict = 'La légende source a changé. Rouvre la suggestion.'
        return null
      }
      const account = captionRecipients(current, source.caption, source.sourceId).find(item => item.id === accountId)
      if (!account) {
        conflict = 'Ce compte est indisponible ou a déjà utilisé cette légende.'
        return null
      }
      const key = postKey(date, account, slot)
      const post = current.posts[key]
      if (!freeCaptionSlot(post)) {
        conflict = 'Ce créneau est déjà occupé. Choisis un autre créneau.'
        return null
      }
      return { ...current, posts: { ...current.posts, [key]: { ...(post ?? emptyPost), caption: source.caption } } }
    })
    if (result !== 'saved') return conflict || 'Impossible d’ajouter la légende. Réessaie.'
    setEditor(null)
    notice('Légende ajoutée au planning.')
    return ''
  }

  async function saveAccount(previous: Account | undefined, name: string, handle: string, modelId: string) {
    let conflict = 'Cet identifiant est déjà utilisé.'
    const result = await commit(current => {
      const duplicate = current.accounts.some(account =>
        account.id !== previous?.id && account.handle.toLowerCase() === handle.toLowerCase())
      if (duplicate) return null
      if (modelId && !current.models.some(model => model.id === modelId)) {
        conflict = 'Ce modèle n’est plus disponible. Choisis un autre modèle.'
        return null
      }
      const account = { id: previous?.id ?? crypto.randomUUID(), name, handle, modelId: modelId || undefined }
      const accounts = previous
        ? current.accounts.map(item => item.id === account.id ? account : item)
        : [...current.accounts, account]
      return { ...current, accounts }
    })
    if (result === 'saved') {
      setEditor(null)
      notice('Compte enregistré.')
    }
    if (result === 'error') return 'Impossible d’enregistrer ce compte dans le planning.'
    return result === 'conflict' ? conflict : ''
  }

  async function saveModel(name: string, model?: Model) {
    const result = await commit(current => {
      if (current.models.some(item => item.id !== model?.id && item.name.toLowerCase() === name.toLowerCase())) return null
      if (model && !current.models.some(item => item.id === model.id)) return null

      const updated = { id: model?.id ?? crypto.randomUUID(), name }
      const models = model
        ? current.models.map(item => item.id === model.id ? updated : item)
        : [...current.models, updated]
      return { ...current, models }
    })
    if (result === 'saved') {
      setEditor(null)
      notice('Modèle enregistré.')
    }
    if (result === 'error') return 'Impossible d’enregistrer ce modèle dans le planning.'
    return result === 'conflict' ? 'Le nom est déjà utilisé ou le modèle a été supprimé.' : ''
  }

  async function removeModel(model: Model) {
    const result = await commit(current => {
      if (current.accounts.some(account => account.modelId === model.id)) return null
      return { ...current, models: current.models.filter(item => item.id !== model.id) }
    })
    if (result === 'saved') {
      setEditor(null)
      notice('Modèle supprimé.')
    }
    if (result === 'error') return 'Impossible de supprimer ce modèle dans le planning.'
    return result === 'conflict' ? 'Rattache d’abord les comptes de ce modèle à un autre groupe.' : ''
  }

  async function saveSubmittedPost({ url, agent }: Pick<SubmittedPost, 'url' | 'agent'>, previous?: SubmittedPost) {
    if (!agent || agent.length > 150) return 'Renseigne le nom de l’agent.'
    const today = todayKey()
    const link = threadsLink(url)
    if (!link || link.username || link.password || link.port || url.length > 2000
      || !publicationKey(link.href).startsWith('threads:')) {
      return 'Colle un lien de publication ou de partage Threads valide.'
    }
    link.search = ''
    link.hash = ''
    const publicPost = await lookupPublicPost(link.href).catch(() => null)
    const canonicalUrl = publicPost?.url ?? link.href
    const key = publicationKey(canonicalUrl)
    if (!key.startsWith('threads:post:')) {
      return 'Ouvre le lien de partage dans Threads et colle l’adresse directe du post.'
    }
    const samePost = previous && publicationKey(previous.url) === key
    const reactions = publicPost?.likes ?? (samePost ? previous.reactions : undefined)
    const receivedDate = publicPost?.publishedOn
    const publishedOn = receivedDate && isDateKey(receivedDate) && receivedDate <= today
      ? receivedDate : samePost ? previous.publishedOn : undefined
    let conflict = ''
    const result = await commit(current => {
      const submittedPosts = current.submittedPosts ?? []
      const index = previous ? submittedPosts.findIndex(post =>
        post.url === previous.url && post.agent === previous.agent && post.reactions === previous.reactions
        && post.addedOn === previous.addedOn && post.publishedOn === previous.publishedOn) : -1
      if (previous && index === -1) {
        conflict = 'Ce lien a été modifié ou supprimé. Rouvre la fiche depuis la liste.'
        return null
      }
      const duplicate = submittedPosts.find((post, position) => position !== index && publicationKey(post.url) === key)
      if (duplicate) {
        conflict = 'Ce post est déjà enregistré par ' + duplicate.agent + '.'
        return null
      }
      const updated = { url: canonicalUrl, agent, reactions, publishedOn, addedOn: previous ? previous.addedOn : today }
      return {
        ...current,
        submittedPosts: previous
          ? submittedPosts.map((post, position) => position === index ? updated : post)
          : [updated, ...submittedPosts],
      }
    })
    return result === 'saved' ? '' : conflict || 'Impossible d’enregistrer le lien. Réessaie.'
  }

  async function removeSubmittedPost(previous: SubmittedPost) {
    const result = await commit(current => {
      const submittedPosts = current.submittedPosts ?? []
      const remaining = submittedPosts.filter(post =>
        post.url !== previous.url || post.agent !== previous.agent || post.reactions !== previous.reactions
        || post.addedOn !== previous.addedOn || post.publishedOn !== previous.publishedOn)
      if (remaining.length === submittedPosts.length) return null
      return { ...current, submittedPosts: remaining }
    })
    if (result === 'saved') return ''
    return result === 'conflict'
      ? 'Ce lien a déjà été modifié ou supprimé. Vérifie la liste.'
      : 'Impossible de supprimer le lien. Réessaie.'
  }

  async function saveReference(fields: Omit<TylanReference, 'id'>, id?: string) {
    let url: string
    const resolved = new Map<string, string>()
    try {
      url = await canonicalPublication(fields.url)
      if (publicationKey(url).startsWith('threads:post:')) {
        const oldShares = (await readCurrent()).references.filter(reference => reference.id !== id
          && publicationKey(reference.url).startsWith('threads:share:'))
        for (const reference of oldShares) {
          try {
            resolved.set(reference.url, await canonicalPublication(reference.url))
          } catch {
            // An obsolete share link can still be edited or deleted from the library.
          }
        }
      }
    } catch (error) {
      return error instanceof Error && error.name === 'Error' ? error.message
        : 'Le lien de partage est indisponible. Essaie avec l’adresse directe de la publication.'
    }

    const key = publicationKey(url)
    let conflict = 'Cette publication n’est plus disponible dans la liste.'
    const result = await commit(current => {
      if (id && !current.references.some(reference => reference.id === id)) return null

      const duplicate = current.references.some(reference => reference.id !== id
        && publicationKey(resolved.get(reference.url) ?? reference.url) === key)
      if (duplicate) {
        conflict = 'Cette publication est déjà enregistrée dans Scrapping Tylan.'
        return null
      }
      const unresolved = key.startsWith('threads:post:') && current.references.some(reference =>
        reference.id !== id && publicationKey(reference.url).startsWith('threads:share:') && !resolved.has(reference.url))
      if (unresolved) {
        conflict = 'Un ancien lien de partage empêche la vérification. Corrige son adresse ou supprime sa fiche, puis réessaie.'
        return null
      }

      const reference = { ...fields, url, id: id ?? crypto.randomUUID() }
      const existing = current.references.map(item => {
        if (item.id === id) return reference
        const canonicalUrl = resolved.get(item.url)
        return canonicalUrl ? { ...item, url: canonicalUrl } : item
      })
      const references = id ? existing : [reference, ...existing]
      return { ...current, references }
    })
    if (result === 'saved') {
      notice('Publication de référence enregistrée.')
      return ''
    }
    return result === 'conflict' ? conflict : 'Impossible d’enregistrer cette publication.'
  }

  async function removeReference(id: string) {
    const result = await commit(current => ({
      ...current,
      references: current.references.filter(reference => reference.id !== id),
      captionUses: current.captionUses.filter(use => use.referenceId !== id),
    }))
    if (result === 'saved') notice('Publication de référence supprimée.')
  }

  async function useCaption(reference: TylanReference, target: CaptionTarget) {
    let conflict = ''
    const result = await commit(current => {
      const source = current.references.find(item => item.id === reference.id)
      if (!source?.caption || source.caption !== reference.caption) {
        conflict = 'La légende a changé. Ferme la fenêtre et ouvre de nouveau la fiche.'
        return null
      }

      const account = current.accounts.find(item => item.id === target.accountId)
      const model = current.models.find(item => item.id === account?.modelId)
      if (!account || (model?.id ?? '') !== target.modelId) {
        conflict = 'Le compte ou son modèle a changé. Choisis de nouveau le compte.'
        return null
      }

      const key = postKey(target.date, account, target.slot)
      const post = current.posts[key] ?? emptyPost
      if (post.caption && post.caption !== source.caption) {
        conflict = 'Ce créneau a déjà une autre légende. Choisis un autre créneau ou modifie-le dans le planning.'
        return null
      }

      const alreadyUsed = current.captionUses.some(use => use.referenceId === source.id
        && use.accountId === account.id && use.modelId === target.modelId)
      const use = { referenceId: source.id, accountId: account.id, modelId: target.modelId,
        modelName: model?.name ?? 'Sans modèle' }
      return {
        ...current,
        posts: { ...current.posts, [key]: { ...post, caption: source.caption } },
        captionUses: alreadyUsed ? current.captionUses : [...current.captionUses, use],
      }
    })
    if (result === 'saved') {
      notice('Légende ajoutée au planning.')
      return ''
    }
    return conflict || 'Impossible d’enregistrer cette utilisation dans le planning.'
  }

  const modelIds = new Set(data.models.map(model => model.id))
  const activeModel = modelFilter === 'unassigned' || modelIds.has(modelFilter) ? modelFilter : ''
  const unassigned = data.accounts.filter(account => !account.modelId || !modelIds.has(account.modelId))
  const modelAccounts = activeModel === 'unassigned' ? unassigned : data.accounts.filter(account =>
    !activeModel || account.modelId === activeModel)
  const activeFilter = modelAccounts.some(account => account.id === filter) ? filter : ''
  const accounts = modelAccounts.filter(account => !activeFilter || account.id === activeFilter)
  const posts = accounts.flatMap(account => slots
    .map(slot => data.posts[postKey(selected, account, slot)]).filter(Boolean))
  const planningReady = !shared || revision !== null
  const groups = [
    ...data.models.map(model => ({ id: model.id, name: model.name, accounts: data.accounts.filter(account => account.modelId === model.id) })),
    { id: null, name: 'Sans modèle', accounts: unassigned },
  ]
  const openGroup = editor?.type === 'group' ? groups.find(group => group.id === editor.modelId) : undefined

  if (!planningReady) {
    return <main className="auth-page">
      <section className="settings auth-card">
        <h2>Planning partagé</h2>
        <p role={syncError ? 'alert' : 'status'}>{syncError || 'Chargement du planning partagé…'}</p>
        <button className="btn" onClick={onLogout}>Se déconnecter</button>
      </section>
    </main>
  }

  return <div className="layout">
    <header className="app-banner">GESTION DE PUBLICATIONS</header>
    <aside>
      <div className="brand"><span className="brand-icon"><Icon name="calendar" /></span>Plan de posts</div>
      <nav aria-label="Navigation principale">
        <span className="nav-label">Espace de travail</span>
        <button aria-current={page === 'dashboard' ? 'page' : undefined} onClick={() => setPage('dashboard')}><Icon name="stats" />Tableau de bord</button>
        <button aria-current={page === 'planning' ? 'page' : undefined} onClick={() => setPage('planning')}><Icon name="calendar" />Planning</button>
        <button aria-current={page === 'accounts' ? 'page' : undefined} onClick={() => setPage('accounts')}><Icon name="people" />Comptes</button>
        <button aria-current={page === 'tylan' ? 'page' : undefined} onClick={() => setPage('tylan')}><Icon name="references" />Scrapping Tylan</button>
        <button aria-current={page === 'submissions' ? 'page' : undefined} onClick={() => setPage('submissions')}><Icon name="references" />Liens à transmettre</button>
        {isAdmin && <button aria-current={page === 'approvals' ? 'page' : undefined}
          onClick={() => setPage('approvals')}><Icon name="people" />Gestion des accès</button>}
      </nav>
      <div className="account-session">
        <span className="sub">{email}</span>
        <button className="btn" type="button" onClick={onLogout}>Se déconnecter</button>
      </div>
      <div className="aside-foot"><span className="dot" /><span>{shared ? 'Planning partagé avec l’équipe' : 'Données enregistrées dans ce navigateur'}</span></div>
    </aside>
    <main>
      {syncError && <p className="empty" role="status">{syncError} La synchronisation reprendra automatiquement.</p>}
      {shared && revision === 0 && isAdmin && initial.hasSavedData && <div className="section-head">
        <p className="sub">Un ancien planning est disponible dans ce navigateur.</p>
        <button className="btn" disabled={importing} onClick={() => {
          if (window.confirm('Rendre ce planning accessible à tous les comptes approuvés ?')) void importPreviousPlanning()
        }}>Importer mon ancien planning</button>
      </div>}
      {page === 'planning' ? <>
        <WeekPicker selected={selected} onSelect={setSelected} />
        <div className="stats">
          <div className="stat"><b>{accounts.length}</b><span>Comptes affichés</span></div>
          <div className="stat"><b>{posts.length} / {accounts.length * slots.length}</b><span>Créneaux renseignés</span></div>
          <div className="stat"><b>{posts.reduce((sum, post) => sum + Number(post.count), 0)}</b><span>Posts saisis</span></div>
        </div>
        <section aria-labelledby="date-title">
          <div className="section-head">
            <h2 id="date-title">{formatDate(fromKey(selected), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</h2>
            <div className="account-filters">
              <select aria-label="Filtrer par modèle" value={activeModel} onChange={event => {
                setModelFilter(event.target.value)
                setFilter('')
              }}>
                <option value="">Tous les modèles</option>
                {data.models.map(model => <option key={model.id} value={model.id}>{model.name}</option>)}
                <option value="unassigned">Sans modèle</option>
              </select>
              <select aria-label="Filtrer par compte" value={activeFilter} onChange={event => setFilter(event.target.value)}>
                <option value="">Tous les comptes</option>
                {modelAccounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}
              </select>
            </div>
          </div>
          {accounts.length === 0 && <p className="empty">Aucun compte pour ce modèle.</p>}
          <div className="accounts">
            {accounts.map(account => <AccountCard key={account.id} account={account} date={selected} posts={data.posts}
              onEdit={slot => setEditor({ type: 'post', account, slot, date: selected })} />)}
          </div>
        </section>
        <footer className="actions" style={{ marginBlockStart: 24 }}>
          <button className="btn" onClick={() => notice(exportCsv(data) ? 'Planning exporté.' : 'Fichier CSV exporté avec les en-têtes.')}>
            <Icon name="export" />Exporter en CSV
          </button>
        </footer>
      </> : page === 'dashboard' ? <>
        <header className="top"><h1>Tableau de bord</h1></header>
        <WeekPicker selected={selected} onSelect={setSelected} />
        <Dashboard data={data} date={selected}
          onEdit={(account, slot) => setEditor({ type: 'post', account, slot, date: selected })}
          onSuggest={(key, caption, sourceId) => setEditor({ type: 'suggestion', key, caption, sourceId })} />
      </> : page === 'accounts' ? <>
        <header className="top">
          <div><p className="eyebrow">Gestion des publications</p><h1>Comptes</h1>
            <p className="sub">Rattache plusieurs comptes à chaque modèle.</p></div>
          <div className="account-actions">
            <button className="btn" onClick={() => setEditor({ type: 'model' })}>Ajouter un modèle</button>
            <button className="btn primary" onClick={() => setEditor({ type: 'account' })}>Ajouter un compte</button>
          </div>
        </header>
        <div className="model-groups">
          {groups.map(group => <section className="settings" key={group.id ?? 'unassigned'}>
            <div className="section-head" style={{ marginBlockEnd: 0 }}>
              <div>
                <h2>{group.name}</h2>
                <p className="sub">{group.accounts.length} {group.accounts.length === 1 ? 'compte' : 'comptes'}</p>
              </div>
              <button className="btn" aria-haspopup="dialog" aria-label={'Voir les comptes · ' + group.name}
                onClick={() => setEditor({ type: 'group', modelId: group.id })}>Voir les comptes</button>
            </div>
          </section>)}
        </div>
      </> : page === 'submissions' ? <SubmittedPosts posts={data.submittedPosts ?? []}
        onSave={saveSubmittedPost} onRemove={removeSubmittedPost} />
        : page === 'approvals' && isAdmin ? <PendingAccounts email={email} />
        : <Tylan data={data} selectedDate={selected} onSave={saveReference} onDelete={removeReference} onUse={useCaption} />}
    </main>
    {openGroup && <Modal title={openGroup.name} onClose={() => setEditor(null)}>
      <div className="account-actions">
        <button className="btn" onClick={() => setEditor({ type: 'account', modelId: openGroup.id ?? undefined })}>Ajouter un compte</button>
        {openGroup.id && <button className="btn" onClick={() => {
          const model = data.models.find(item => item.id === openGroup.id)
          if (model) setEditor({ type: 'model', model })
        }}>Modifier le modèle</button>}
      </div>
      {openGroup.accounts.length ? <ul className="account-list">
        {openGroup.accounts.map(account => <li key={account.id}>
          <div><strong>{account.name}</strong><p className="handle">@{account.handle}</p></div>
          <button className="btn" aria-label={'Modifier le compte ' + account.name}
            onClick={() => setEditor({ type: 'account', account })}>Modifier</button>
        </li>)}
      </ul> : <p className="sub">Aucun compte dans ce groupe.</p>}
      <div className="actions" style={{ marginBlockStart: 16 }}>
        <button className="btn" onClick={() => setEditor(null)}>Fermer</button>
      </div>
    </Modal>}
    {editor?.type === 'suggestion' && <CaptionSuggestion data={data} caption={editor.caption} sourceId={editor.sourceId}
      onClose={() => setEditor(null)} onSave={(accountId, date, slot) => saveSuggestion(editor, accountId, date, slot)} />}
    {editor?.type === 'post' && <PostEditor account={editor.account} slot={editor.slot} date={editor.date}
      post={data.posts[postKey(editor.date, editor.account, editor.slot)]}
      owners={[...new Set(Object.values(data.posts).map(post => post.owner).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr'))}
      onClose={() => setEditor(null)} onSave={post => savePost(editor, post)} />}
    {editor?.type === 'account' && <AccountEditor account={editor.account} models={data.models} modelId={editor.modelId}
      onClose={() => setEditor(null)} onSave={(name, handle, modelId) => saveAccount(editor.account, name, handle, modelId)} />}
    {editor?.type === 'model' && <ModelEditor model={editor.model}
      onClose={() => setEditor(null)} onSave={name => saveModel(name, editor.model)}
      onRemove={editor.model && !data.accounts.some(account => account.modelId === editor.model?.id)
        ? () => removeModel(editor.model!) : undefined} />}
    <div className="toast" role="status" hidden={!message}>{message}</div>
  </div>
}
