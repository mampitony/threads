import { useState } from 'react'
import { Modal } from './Modal'
import { formatDate, fromKey, isDateKey, todayKey } from './planning'
import type { Planning, Renewal } from './planning'

export function Renewals({ data, onSave, onRemove }: {
  data: Planning
  onSave: (entry: Renewal, previous?: Renewal) => Promise<boolean>
  onRemove: (entry: Renewal) => Promise<boolean>
}) {
  const [editing, setEditing] = useState<Renewal | null>(null)
  const [open, setOpen] = useState(false)
  const [accountId, setAccountId] = useState('')
  const [date, setDate] = useState(todayKey())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const accounts = [...data.accounts].sort((a, b) => a.name.localeCompare(b.name, 'fr', { numeric: true }))
  const entries = [...(data.renewals ?? [])].sort((a, b) => a.date.localeCompare(b.date))
  function edit(entry?: Renewal) {
    setEditing(entry ?? null)
    setAccountId(entry?.accountId ?? accounts[0]?.id ?? '')
    setDate(entry?.date ?? todayKey())
    setError('')
    setMessage('')
    setOpen(true)
  }
  return <>
    <header className="top">
      <div><h1>Renouvellement de compte</h1><p className="sub">Le compte concerné et sa date de renouvellement.</p></div>
      <button className="btn primary" type="button" disabled={busy || !accounts.length} onClick={() => edit()}>Ajouter un renouvellement</button>
    </header>
    <p role="status" className="sub">{message}</p>
    {!accounts.length && <p className="empty">Ajoute d’abord un compte dans la section Comptes.</p>}
    <section className="settings" aria-label="Renouvellements enregistrés">
      {!entries.length ? <p className="sub">Aucun renouvellement enregistré.</p> : <ul className="account-list">
        {entries.map(entry => {
          const account = data.accounts.find(item => item.id === entry.accountId)
          const model = data.models.find(item => item.id === account?.modelId)
          return <li key={entry.id} style={{ flexWrap: 'wrap', gap: 12 }}>
            <div><strong>{account?.name ?? entry.accountName}</strong>
              {model && <p className="sub">{model.name}</p>}
              <p className="sub">Date de renouvellement : <time dateTime={entry.date}>{formatDate(fromKey(entry.date), { dateStyle: 'long' })}</time></p>
            </div>
            <div className="account-actions">
              <button className="btn" type="button" disabled={busy} onClick={() => edit(entry)}>Modifier</button>
              <button className="btn danger" type="button" disabled={busy} onClick={async () => {
                if (!window.confirm('Supprimer ce renouvellement ?')) return
                setBusy(true)
                try { setMessage(await onRemove(entry) ? 'Renouvellement supprimé.' : 'Suppression impossible. Actualise puis réessaie.') }
                catch { setMessage('Suppression impossible. Réessaie.') }
                finally { setBusy(false) }
              }}>Supprimer</button>
            </div>
          </li>
        })}
      </ul>}
    </section>
    {open && <Modal title={editing ? 'Modifier le renouvellement' : 'Ajouter un renouvellement'} onClose={() => { if (!busy) setOpen(false) }}>
      <form onSubmit={async event => {
        event.preventDefault()
        if (busy) return
        const account = data.accounts.find(item => item.id === accountId)
        if ((!account && accountId !== editing?.accountId) || !isDateKey(date)) {
          setError('Choisis un compte et une date valides.')
          return
        }
        setBusy(true)
        setError('')
        try {
          const entry = { id: editing?.id ?? crypto.randomUUID(), accountId,
            accountName: account?.name ?? editing!.accountName, date }
          if (await onSave(entry, editing ?? undefined)) {
            setOpen(false)
            setMessage('Renouvellement enregistré.')
          } else setError('Enregistrement impossible. Ce renouvellement a peut-être été modifié. Rouvre la fiche puis réessaie.')
        } catch { setError('Enregistrement impossible. Réessaie.') }
        finally { setBusy(false) }
      }}>
        <label>Compte concerné<select required disabled={busy} value={accountId} onChange={event => setAccountId(event.target.value)}>
          {editing && !accounts.some(item => item.id === editing.accountId) && <option value={editing.accountId}>{editing.accountName}</option>}
          {accounts.map(account => <option key={account.id} value={account.id}>
            {account.name}{data.models.find(model => model.id === account.modelId)?.name ? ' · ' + data.models.find(model => model.id === account.modelId)!.name : ''}
          </option>)}
        </select></label>
        <label>Date de renouvellement<input type="date" required value={date} disabled={busy} onChange={event => setDate(event.target.value)} /></label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="actions">
          <button className="btn" type="button" disabled={busy} onClick={() => setOpen(false)}>Annuler</button>
          <button className="btn primary" type="submit" disabled={busy}>{busy ? 'Enregistrement…' : 'Enregistrer'}</button>
        </div>
      </form>
    </Modal>}
  </>
}
