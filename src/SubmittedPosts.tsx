import { useState } from 'react'
import type { FormEvent } from 'react'
import type { SubmittedPost } from './planning'

export function SubmittedPosts({ posts, onSave }: {
  posts: SubmittedPost[]
  onSave: (post: SubmittedPost) => Promise<string>
}) {
  const [agent, setAgent] = useState('')
  const [url, setUrl] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving) return
    setSaving(true)
    setError('')
    setFeedback('')
    try {
      const message = await onSave({ url: url.trim(), agent: agent.trim() })
      if (message) setError(message)
      else {
        setUrl('')
        setFeedback('Lien ajouté à la liste partagée.')
      }
    } finally {
      setSaving(false)
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
    <section className="settings" aria-label="Ajouter un lien">
      <form onSubmit={submit} onChange={() => { setError(''); setFeedback('') }}>
        <label>Nom de l’agent<input required maxLength={150} value={agent}
          disabled={saving} onChange={event => setAgent(event.target.value)} /></label>
        <label>Lien du post Threads<input required type="url" maxLength={2000} value={url}
          disabled={saving} onChange={event => setUrl(event.target.value)} /></label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="actions">
          <button className="btn primary" type="submit" disabled={saving}>{saving ? 'Vérification…' : 'Ajouter le lien'}</button>
        </div>
      </form>
    </section>
    <p className="sub" role="status">{feedback}</p>
    <section className="settings" aria-labelledby="submitted-posts-title">
      <h2 id="submitted-posts-title">Liens enregistrés</h2>
      {posts.length === 0 ? <p className="sub">Aucun lien enregistré.</p> : <ul className="account-list">
        {posts.map(post => <li key={post.url} style={{ flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
            <a href={post.url} target="_blank" rel="noopener noreferrer">{post.url}</a>
            <p className="sub">Enregistré par {post.agent}</p>
          </div>
          <button className="btn" type="button" onClick={() => void copy(post.url)}>Copier le lien</button>
        </li>)}
      </ul>}
    </section>
  </>
}
