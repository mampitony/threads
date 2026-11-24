import { useState } from 'react'
import { agentScrapingGoal } from './planning'

export function ScrapingGoals({ goals, onSave }: {
  goals?: Record<string, number>
  onSave: (goals: Record<string, number>) => Promise<boolean>
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const value = draft ?? String(agentScrapingGoal(goals, ''))
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  return <details className="settings" style={{ marginBlockEnd: 16 }}>
    <summary style={{ cursor: 'pointer', fontWeight: 700 }}>Configurer l’objectif commun des agents</summary>
    <p className="sub">Un seul réglage pour tous les agents actuels et futurs. Les liens déjà attribués à une journée restent à leur date.</p>
    <form className="account-actions" style={{ alignItems: 'end', marginBlockStart: 12 }} onSubmit={async event => {
      event.preventDefault()
      const goal = Number(value)
      if (busy || !Number.isSafeInteger(goal) || goal < 1 || goal > 10000) return
      setBusy(true)
      setMessage('')
      try {
        const saved = await onSave({ '*': goal })
        setMessage(saved ? 'Objectif enregistré pour tous les agents.' : 'Enregistrement impossible. Réessaie.')
        if (saved) setDraft(null)
      } catch { setMessage('Enregistrement impossible. Réessaie.') }
      finally { setBusy(false) }
    }}>
      <label>Liens par jour pour chaque agent<input type="number" min="1" max="10000" step="1" required disabled={busy}
        value={value} onChange={event => { setDraft(event.target.value); setMessage('') }} /></label>
      <button type="submit" className="btn primary" disabled={busy}>{busy ? 'Enregistrement…' : 'Appliquer à tous les agents'}</button>
    </form>
    <p className="sub" role="status">{message}</p>
  </details>
}
