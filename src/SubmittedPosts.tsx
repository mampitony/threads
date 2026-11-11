import { useRef, useState } from 'react'
import type { FormEvent } from 'react'
import type { SubmittedPost } from './planning'

export function SubmittedPosts({ posts, onSave, onRemove }: {
  posts: SubmittedPost[]
  onSave: (post: SubmittedPost, previous?: SubmittedPost) => Promise<string>
  onRemove: (post: SubmittedPost) => Promise<string>
}) {
  const [agent, setAgent] = useState('')
  const [url, setUrl] = useState('')
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState<SubmittedPost | null>(null)
  const [removing, setRemoving] = useState('')
  const [error, setError] = useState('')
  const [removeError, setRemoveError] = useState('')
  const [feedback, setFeedback] = useState('')
  const linkInput = useRef<HTMLInputElement>(null)
  const busy = saving || Boolean(removing)

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
        setUrl('')
        setFeedback(editing ? 'Lien modifié.' : 'Lien ajouté à la liste partagée.')
        setEditing(null)
      }
    } finally {
      setSaving(false)
    }
  }

  function startEdit(post: SubmittedPost) {
    setEditing(post)
    setAgent(post.agent)
    setUrl(post.url)
    setError('')
    setFeedback('')
    linkInput.current?.focus()
  }

  function cancelEdit() {
    setEditing(null)
    setUrl('')
    setAgent('')
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
        if (editing?.url === post.url) cancelEdit()
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
    <header className="top"><h1>Liens à transmettre</h1></header>
    <section className="settings" aria-label={editing ? 'Modifier un lien' : 'Ajouter un lien'}>
      {editing && <h2>Modifier le lien</h2>}
      <form onSubmit={submit} onChange={() => { setError(''); setFeedback('') }}>
        <label>Nom de l’agent<input required maxLength={150} value={agent}
          disabled={busy} onChange={event => setAgent(event.target.value)} /></label>
        <label>Lien du post Threads<input ref={linkInput} required type="url" maxLength={2000} value={url}
          disabled={busy} onChange={event => setUrl(event.target.value)} /></label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="actions">
          {editing && <button className="btn" type="button" disabled={busy} onClick={cancelEdit}>Annuler</button>}
          <button className="btn primary" type="submit" disabled={busy}>
            {saving ? 'Vérification…' : editing ? 'Enregistrer la modification' : 'Ajouter le lien'}
          </button>
        </div>
      </form>
    </section>
    <p className="sub" role="status">{feedback}</p>
    <section className="settings" aria-labelledby="submitted-posts-title">
      <h2 id="submitted-posts-title">Liens enregistrés</h2>
      {removeError && <p className="form-error" role="alert">{removeError}</p>}
      {posts.length === 0 ? <p className="sub">Aucun lien enregistré.</p> : <ul className="account-list">
        {posts.map(post => <li key={post.url} style={{ flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
            <a href={post.url} target="_blank" rel="noopener noreferrer">{post.url}</a>
            <p className="sub">Enregistré par {post.agent}</p>
          </div>
          <div className="account-actions">
            <button className="btn" type="button" onClick={() => void copy(post.url)}>Copier le lien</button>
            <button className="btn" type="button" disabled={busy} onClick={() => startEdit(post)}>Modifier</button>
            <button className="btn danger" type="button" disabled={busy} onClick={() => void remove(post)}>
              {removing === post.url ? 'Suppression…' : 'Supprimer'}
            </button>
          </div>
        </li>)}
      </ul>}
    </section>
  </>
}
