import { useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Modal } from './Modal'
import type { SubmittedPost } from './planning'

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
  onSave: (post: SubmittedPost, previous?: SubmittedPost) => Promise<string>
  onRemove: (post: SubmittedPost) => Promise<string>
}) {
  const [agent, setAgent] = useState('')
  const [url, setUrl] = useState('')
  const [saving, setSaving] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<SubmittedPost | null>(null)
  const [removing, setRemoving] = useState('')
  const [error, setError] = useState('')
  const [removeError, setRemoveError] = useState('')
  const [feedback, setFeedback] = useState('')
  const lastAddingAgent = useRef('')
  const busy = saving || Boolean(removing)
  const groups = groupPostsByAgent(posts)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    setSaving(true)
    setError('')
    setFeedback('')
    try {
      const message = await onSave({ url: url.trim(), agent: agent.trim() }, editing ?? undefined)
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
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="actions">
          <button className="btn" type="button" disabled={busy} onClick={closeForm}>Annuler</button>
          <button className="btn primary" type="submit" disabled={busy}>
            {saving ? 'Vérification…' : editing ? 'Enregistrer la modification' : 'Ajouter le lien'}
          </button>
        </div>
      </form>
    </Modal>}
    <p className="sub" role="status">{feedback}</p>
    <section className="settings" aria-labelledby="submitted-posts-title">
      <h2 id="submitted-posts-title">Liens enregistrés</h2>
      {removeError && <p className="form-error" role="alert">{removeError}</p>}
      {groups.length === 0 && <p className="sub">Aucun lien enregistré.</p>}
      {groups.map(([key, group]) => <section key={key} style={{ marginBlockStart: 16 }}>
        <h3 style={{ overflowWrap: 'anywhere' }}>{group.name} · {group.posts.length} {group.posts.length === 1 ? 'lien' : 'liens'}</h3>
        <ul className="account-list">
          {group.posts.map(post => <li key={post.url} style={{ flexWrap: 'wrap' }}>
            <a href={post.url} target="_blank" rel="noopener noreferrer"
              style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{post.url}</a>
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
