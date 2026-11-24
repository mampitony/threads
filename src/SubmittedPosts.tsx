import './submitted-photo.css'
import { ScrapingDayFilter } from './ScrapingDayFilter'
import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Modal } from './Modal'
import { agentScrapingGoal, formatDate, fromKey, scrapingDay, scrapingBucket } from './planning'
import type { SubmittedPost, scrapingProgress } from './planning'
import { publicationKey } from './threads'

function PostPhoto({ src }: { src?: string }) {
  const [failed, setFailed] = useState(false)
  const [open, setOpen] = useState(false)
  useEffect(() => { setFailed(false) }, [src])
  if (!src || failed) return <span className="submitted-photo-empty">Photo indisponible</span>
  return <>
    <button type="button" className="submitted-photo" aria-label="Agrandir la photo du post"
      aria-haspopup="dialog" onClick={() => setOpen(true)}>
      <img src={src} alt="Photo du post Threads" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
    </button>
    {open && <Modal title="Photo du post" onClose={() => setOpen(false)}>
      <img className="submitted-photo-full" src={src} alt="Photo du post Threads" referrerPolicy="no-referrer" />
      <button type="button" className="btn" onClick={() => setOpen(false)}>Fermer</button>
    </Modal>}
  </>
}

function readCopiedLinks(key: string): string[] {
  try {
    const links: unknown = JSON.parse(localStorage.getItem(key) ?? '[]')
    return Array.isArray(links) ? links.filter(link => typeof link === 'string') : []
  } catch {
    return []
  }
}

const reactionFormat = new Intl.NumberFormat('fr-FR')
const addedTimeFormat = new Intl.DateTimeFormat('fr-FR', {
  timeStyle: 'short', timeZone: 'Indian/Antananarivo',
})

function groupPostsByAgent(posts: SubmittedPost[]) {
  const groups = new Map<string, { name: string; posts: SubmittedPost[] }>()
  for (const post of posts) {
    const name = post.agent.normalize('NFC').trim().replace(/\s+/g, ' ')
    const key = name.toLocaleLowerCase('fr')
    const group = groups.get(key)
    if (group) group.posts.push(post)
    else groups.set(key, { name, posts: [post] })
  }
  return [...groups.entries()].sort(([, a], [, b]) => a.name.localeCompare(b.name, 'fr'))
}

export function SubmittedPosts({ today, progress, profileNames, posts, defaultAgentName, storageKey, onSave, onRemove }: {
  today: string
  progress: ReturnType<typeof scrapingProgress>
  profileNames: string[]
  posts: SubmittedPost[]
  defaultAgentName: string
  storageKey: string
  onSave: (post: Pick<SubmittedPost, 'url' | 'agent'>, previous?: SubmittedPost) => Promise<string | { message: string; duplicateUrl: string }>
  onRemove: (post: SubmittedPost) => Promise<string>
}) {
  const [agent, setAgent] = useState('')
  const [url, setUrl] = useState('')
  const [addedOnFilter, setAddedOnFilter] = useState('')
  const [agentFilter, setAgentFilter] = useState('')
  const [saving, setSaving] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<SubmittedPost | null>(null)
  const [removing, setRemoving] = useState('')
  const [error, setError] = useState('')
  const [removeError, setRemoveError] = useState('')
  const [feedback, setFeedback] = useState('')
  const copyStorageKey = storageKey + ':copied-submitted-posts'
  const [copiedLinks, setCopiedLinks] = useState(() => new Set(readCopiedLinks(copyStorageKey)))
  const [duplicateUrl, setDuplicateUrl] = useState('')
  const [highlightedUrl, setHighlightedUrl] = useState('')
  const highlightedRow = useRef<HTMLLIElement>(null)

  useEffect(() => {
    if (!highlightedUrl) return
    const frame = requestAnimationFrame(() => {
      highlightedRow.current?.scrollIntoView({ block: 'center' })
      highlightedRow.current?.focus({ preventScroll: true })
    })
    const timer = window.setTimeout(() => setHighlightedUrl(''), 5000)
    return () => {
      cancelAnimationFrame(frame)
      window.clearTimeout(timer)
    }
  }, [highlightedUrl])
  const lastAddingAgent = useRef('')
  const busy = saving || Boolean(removing)
  const [dayOverride, setDayOverride] = useState<string>()
  const day = dayOverride ?? today
  const agents = groupPostsByAgent(posts)
  const selectedAgent = agents.find(([key]) => key === agentFilter)
  const dayPosts = (selectedAgent?.[1].posts ?? posts).filter(post => !day || scrapingDay(post) === day)
  const filtered = addedOnFilter ? dayPosts.filter(post => post.addedOn === addedOnFilter) : dayPosts
  const groups = groupPostsByAgent(filtered)
  const hasFilters = Boolean(selectedAgent || addedOnFilter)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    setSaving(true)
    setError('')
    setDuplicateUrl('')
    setFeedback('')
    try {
      const message = await onSave({
        url: url.trim(),
        agent: agent.trim(),
      }, editing ?? undefined)
      if (typeof message === 'object') {
        setError(message.message)
        setDuplicateUrl(message.duplicateUrl)
      } else if (message) setError(message)
      else {
        if (!editing) lastAddingAgent.current = agent.trim()
        setUrl('')
        setFeedback(editing ? 'Lien modifié.' : 'Lien ajouté à la liste partagée.')
        setEditing(null)
        setFormOpen(false)
      }
    } finally {
      setSaving(false)
    }
  }

  function openForm(post?: SubmittedPost) {
    setEditing(post ?? null)
    setAgent(post?.agent ?? (defaultAgentName || lastAddingAgent.current))
    setUrl(post?.url ?? '')
    setError('')
    setDuplicateUrl('')
    setFeedback('')
    setFormOpen(true)
  }

  function closeForm() {
    if (saving) return
    setFormOpen(false)
    setEditing(null)
    setUrl('')
    setError('')
    setDuplicateUrl('')
  }

  async function remove(post: SubmittedPost) {
    if (busy || !window.confirm('Supprimer ce lien de la liste partagée ?')) return
    setRemoving(post.url)
    setRemoveError('')
    setFeedback('')
    try {
      const message = await onRemove(post)
      if (message) setRemoveError(message)
      else {
        setFeedback('Lien supprimé.')
      }
    } finally {
      setRemoving('')
    }
  }

  function canCopy(post: SubmittedPost) {
    return Boolean(defaultAgentName.trim())
      && scrapingBucket(post.agent, '') === scrapingBucket(defaultAgentName, '')
  }

  async function copy(post: SubmittedPost) {
    if (!canCopy(post)) return
    const url = post.url
    setFeedback('')
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      setFeedback('Copie le lien avec le menu du navigateur.')
      return
    }
    const updated = new Set([...copiedLinks, ...readCopiedLinks(copyStorageKey), publicationKey(url)])
    setCopiedLinks(updated)
    try {
      localStorage.setItem(copyStorageKey, JSON.stringify([...updated]))
      setFeedback('Lien copié. Tu peux le coller dans ton message au chef.')
    } catch {
      setFeedback('Lien copié. L’indication est visible sur cette page.')
    }
  }

  return <>
    <header className="top">
      <h1>Liens à transmettre</h1>
      <button className="btn primary" type="button" aria-haspopup="dialog" disabled={busy}
        onClick={() => openForm()}>Ajouter un lien</button>
    </header>
    {formOpen && <Modal title={editing ? 'Modifier le lien' : 'Ajouter un lien'} onClose={closeForm}>
      <form onSubmit={submit} onChange={() => { setError(''); setDuplicateUrl(''); setFeedback('') }}>
        <label>Nom de l’agent<input list="agent-names" placeholder="Saisir ou choisir un nom" required maxLength={150} value={agent}
          disabled={busy} onChange={event => setAgent(event.target.value)} /></label>
        <label>Lien du post Threads<input required type="url" maxLength={2000} value={url}
          disabled={busy} onChange={event => setUrl(event.target.value)} /></label>
        <p className="sub">La date de publication et les réactions sont récupérées automatiquement quand Threads les rend accessibles.</p>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="actions">
          {duplicateUrl && <button className="btn" type="button" disabled={busy} onClick={() => {
            const target = duplicateUrl
            closeForm()
            if (!posts.some(post => post.url === target)) {
              setFeedback('Ce lien ne figure plus dans la liste.')
              return
            }
            if (!filtered.some(post => post.url === target)) {
              setDayOverride('')
              setAgentFilter('')
              setAddedOnFilter('')
            }
            setHighlightedUrl(target)
          }}>Voir le lien existant</button>}
          <button className="btn" type="button" disabled={busy} onClick={closeForm}>Annuler</button>
          <button className="btn primary" type="submit" disabled={busy}>
            {saving ? 'Récupération des données…' : editing ? 'Enregistrer la modification' : 'Ajouter le lien'}
          </button>
        </div>
      </form>
    </Modal>}
    <p className="sub" role="status">{feedback}</p>
    <section className="settings" aria-labelledby="submitted-posts-title">
      <h2 id="submitted-posts-title">Liens enregistrés</h2>
      <ScrapingDayFilter today={today} day={day} onChange={setDayOverride} progress={progress} agents={profileNames}>
        <label>Agent<select value={selectedAgent?.[0] ?? ''} onChange={event => setAgentFilter(event.target.value)}>
          <option value="">Tous les agents</option>
          {agents.map(([key, group]) => <option key={key} value={key}>{group.name}</option>)}
        </select></label>
        <label>Date d’ajout<input type="date" value={addedOnFilter}
          onChange={event => setAddedOnFilter(event.target.value)} /></label>
        {hasFilters && <button className="btn" type="button" onClick={() => {
          setAddedOnFilter('')
          setAgentFilter('')
        }}>Effacer les filtres</button>}
      </ScrapingDayFilter>
      {hasFilters && <p className="sub" role="status">{filtered.length} / {posts.length} liens affichés</p>}
      {removeError && <p className="form-error" role="alert">{removeError}</p>}
      {groups.length === 0 && <p className="sub">{hasFilters ? 'Aucun lien ne correspond aux filtres.' : 'Aucun lien pour cette sélection.'}</p>}
      {groups.map(([key, group]) => <section key={key} style={{ marginBlockStart: 16 }}>
        <h3 style={{ overflowWrap: 'anywhere' }}>{group.name} · {group.posts.length} {group.posts.length === 1 ? 'lien' : 'liens'}</h3>
        <ul className="account-list">
          {group.posts.map(post => {
            const number = progress.numbers.get(post)
            return <li key={post.url} tabIndex={-1} ref={post.url === highlightedUrl ? highlightedRow : undefined}
            style={{ flexWrap: 'wrap', backgroundColor: post.url === highlightedUrl ? '#fef3c7' : undefined,
              boxShadow: post.url === highlightedUrl ? 'inset 4px 0 #b45309' : undefined,
              paddingInlineStart: post.url === highlightedUrl ? 10 : undefined,
              transition: 'background-color 350ms ease' }}>
            <div className="submitted-post-content">
            <PostPhoto src={post.imageUrl} />
            <div style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
              {number && <strong>{number} / {agentScrapingGoal(progress.goals, post.agent)} · </strong>}
              <a href={post.url} target="_blank" rel="noopener noreferrer">{post.url}</a>
              <p className="sub">{post.reactions === undefined ? 'Réactions non renseignées'
                : reactionFormat.format(post.reactions) + (post.reactions > 1 ? ' réactions' : ' réaction')}</p>
              <p className="sub">
                {post.addedOn ? 'Ajouté le ' + formatDate(fromKey(post.addedOn), { dateStyle: 'medium' }) : 'Date d’ajout inconnue'}
                {post.addedAt && Number.isFinite(Date.parse(post.addedAt))
                  ? <> à <time dateTime={post.addedAt} style={{
                    display: 'inline-block', padding: '1px 6px', borderRadius: 4,
                    backgroundColor: '#fde68a', color: '#713f12', fontWeight: 700,
                    fontVariantNumeric: 'tabular-nums',
                  }}>{addedTimeFormat.format(new Date(post.addedAt))}</time></> : null}
                {' · '}
                {post.publishedOn ? 'Publié le ' + formatDate(fromKey(post.publishedOn), { dateStyle: 'medium' }) : 'Date de publication inconnue'}
              </p>
            </div>
            </div>
            <div className="account-actions">
              {canCopy(post) && (copiedLinks.has(publicationKey(post.url))
                ? <button className="btn" type="button" onClick={() => void copy(post)}
                    style={{ backgroundColor: '#dcfce7', color: '#14532d', borderColor: '#86b995' }}>
                    ✓ Déjà copié · Recopier
                  </button>
                : <button className="btn" type="button" onClick={() => void copy(post)}>Copier le lien</button>)}
              <button className="btn" type="button" aria-haspopup="dialog" disabled={busy} onClick={() => openForm(post)}>Modifier</button>
              <button className="btn danger" type="button" disabled={busy} onClick={() => void remove(post)}>
                {removing === post.url ? 'Suppression…' : 'Supprimer'}
              </button>
            </div>
          </li>})}
        </ul>
      </section>)}
    </section>
  </>
}
