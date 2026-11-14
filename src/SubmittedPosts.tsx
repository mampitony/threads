import { useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Modal } from './Modal'
import { formatDate, fromKey, todayKey } from './planning'
import type { SubmittedPost } from './planning'

const reactionFormat = new Intl.NumberFormat('fr-FR')
const addedTimeFormat = new Intl.DateTimeFormat('fr-FR', {
  timeStyle: 'short', timeZone: 'Indian/Antananarivo',
})
const millisecondsPerDay = 86_400_000

function filterPosts(posts: SubmittedPost[], today: string, addedOn: string, maxAge: string, minReactions: string) {
  const todayTime = fromKey(today).getTime()
  return posts.filter(post => {
    if (addedOn && post.addedOn !== addedOn) return false
    if (maxAge !== '') {
      if (!post.publishedOn) return false
      const age = (todayTime - fromKey(post.publishedOn).getTime()) / millisecondsPerDay
      if (!(age >= 0 && age <= Number(maxAge))) return false
    }
    return minReactions === '' || (post.reactions !== undefined && post.reactions >= Number(minReactions))
  })
}

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

export function SubmittedPosts({ posts, onSave, onRemove }: {
  posts: SubmittedPost[]
  onSave: (post: Pick<SubmittedPost, 'url' | 'agent'>, previous?: SubmittedPost) => Promise<string>
  onRemove: (post: SubmittedPost) => Promise<string>
}) {
  const [agent, setAgent] = useState('')
  const [url, setUrl] = useState('')
  const [addedOnFilter, setAddedOnFilter] = useState('')
  const [agentFilter, setAgentFilter] = useState('')
  const [maxAgeFilter, setMaxAgeFilter] = useState('')
  const [minReactionsFilter, setMinReactionsFilter] = useState('')
  const [saving, setSaving] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<SubmittedPost | null>(null)
  const [removing, setRemoving] = useState('')
  const [error, setError] = useState('')
  const [removeError, setRemoveError] = useState('')
  const [feedback, setFeedback] = useState('')
  const lastAddingAgent = useRef('')
  const busy = saving || Boolean(removing)
  const today = todayKey()
  const agents = groupPostsByAgent(posts)
  const selectedAgent = agents.find(([key]) => key === agentFilter)
  const filtered = filterPosts(selectedAgent?.[1].posts ?? posts, today, addedOnFilter, maxAgeFilter, minReactionsFilter)
  const groups = groupPostsByAgent(filtered)
  const hasFilters = Boolean(selectedAgent || addedOnFilter || maxAgeFilter || minReactionsFilter)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    setSaving(true)
    setError('')
    setFeedback('')
    try {
      const message = await onSave({
        url: url.trim(),
        agent: agent.trim(),
      }, editing ?? undefined)
      if (message) setError(message)
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
    setAgent(post?.agent ?? lastAddingAgent.current)
    setUrl(post?.url ?? '')
    setError('')
    setFeedback('')
    setFormOpen(true)
  }

  function closeForm() {
    if (saving) return
    setFormOpen(false)
    setEditing(null)
    setUrl('')
    setError('')
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

  async function copy(url: string) {
    setFeedback('')
    try {
      await navigator.clipboard.writeText(url)
      setFeedback('Lien copié. Tu peux le coller dans ton message au chef.')
    } catch {
      setFeedback('Copie le lien avec le menu du navigateur.')
    }
  }

  return <>
    <header className="top">
      <h1>Liens à transmettre</h1>
      <button className="btn primary" type="button" aria-haspopup="dialog" disabled={busy}
        onClick={() => openForm()}>Ajouter un lien</button>
    </header>
    {formOpen && <Modal title={editing ? 'Modifier le lien' : 'Ajouter un lien'} onClose={closeForm}>
      <form onSubmit={submit} onChange={() => { setError(''); setFeedback('') }}>
        <label>Nom de l’agent<input required maxLength={150} value={agent}
          disabled={busy} onChange={event => setAgent(event.target.value)} /></label>
        <label>Lien du post Threads<input required type="url" maxLength={2000} value={url}
          disabled={busy} onChange={event => setUrl(event.target.value)} /></label>
        <p className="sub">La date de publication et les réactions sont récupérées automatiquement quand Threads les rend accessibles.</p>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="actions">
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
      <div className="account-actions" role="group" aria-label="Filtrer les liens" style={{ alignItems: 'end', marginBlock: 12 }}>
        <label>Agent<select value={selectedAgent?.[0] ?? ''} onChange={event => setAgentFilter(event.target.value)}>
          <option value="">Tous les agents</option>
          {agents.map(([key, group]) => <option key={key} value={key}>{group.name}</option>)}
        </select></label>
        <label>Date d’ajout<input type="date" value={addedOnFilter}
          onChange={event => setAddedOnFilter(event.target.value)} /></label>
        <label>Âge maximal du post (jours)<input type="number" min="0" step="1" value={maxAgeFilter}
          onChange={event => setMaxAgeFilter(event.target.value)} /></label>
        <label>Réactions minimum<input type="number" min="0" step="1" value={minReactionsFilter}
          onChange={event => setMinReactionsFilter(event.target.value)} /></label>
        {hasFilters && <button className="btn" type="button" onClick={() => {
          setAddedOnFilter('')
          setAgentFilter('')
          setMaxAgeFilter('')
          setMinReactionsFilter('')
        }}>Effacer les filtres</button>}
      </div>
      {hasFilters && <p className="sub" role="status">{filtered.length} / {posts.length} liens affichés</p>}
      {removeError && <p className="form-error" role="alert">{removeError}</p>}
      {groups.length === 0 && <p className="sub">{hasFilters ? 'Aucun lien ne correspond aux filtres.' : 'Aucun lien enregistré.'}</p>}
      {groups.map(([key, group]) => <section key={key} style={{ marginBlockStart: 16 }}>
        <h3 style={{ overflowWrap: 'anywhere' }}>{group.name} · {group.posts.length} {group.posts.length === 1 ? 'lien' : 'liens'}</h3>
        <ul className="account-list">
          {group.posts.map(post => <li key={post.url} style={{ flexWrap: 'wrap' }}>
            <div style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
              <a href={post.url} target="_blank" rel="noopener noreferrer">{post.url}</a>
              <p className="sub">{post.reactions === undefined ? 'Réactions non renseignées'
                : reactionFormat.format(post.reactions) + (post.reactions > 1 ? ' réactions' : ' réaction')}</p>
              <p className="sub">
                {post.addedOn ? 'Ajouté le ' + formatDate(fromKey(post.addedOn), { dateStyle: 'medium' }) : 'Date d’ajout inconnue'}
                {post.addedAt && Number.isFinite(Date.parse(post.addedAt))
                  ? ' à ' + addedTimeFormat.format(new Date(post.addedAt)) : ''}
                {' · '}
                {post.publishedOn ? 'Publié le ' + formatDate(fromKey(post.publishedOn), { dateStyle: 'medium' }) : 'Date de publication inconnue'}
              </p>
            </div>
            <div className="account-actions">
              <button className="btn" type="button" onClick={() => void copy(post.url)}>Copier le lien</button>
              <button className="btn" type="button" aria-haspopup="dialog" disabled={busy} onClick={() => openForm(post)}>Modifier</button>
              <button className="btn danger" type="button" disabled={busy} onClick={() => void remove(post)}>
                {removing === post.url ? 'Suppression…' : 'Supprimer'}
              </button>
            </div>
          </li>)}
        </ul>
      </section>)}
    </section>
  </>
}
