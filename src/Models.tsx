import { useState } from 'react'
import type { FormEvent } from 'react'
import { Modal } from './Modal'
import type { Account, Model } from './planning'

export function ModelEditor({ model, onClose, onSave, onRemove }: {
  model?: Model
  onClose: () => void
  onSave: (name: string) => Promise<string>
  onRemove?: () => Promise<string>
}) {
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving) return
    const name = String(new FormData(event.currentTarget).get('name') ?? '').trim()
    setSaving(true)
    setError(name ? await onSave(name) : 'Saisis un nom de modèle.')
    setSaving(false)
  }

  return <Modal title={model ? 'Modifier le modèle' : 'Ajouter un modèle'} onClose={() => { if (!saving) onClose() }}>
    <form onSubmit={submit} onChange={() => setError('')}>
      <label>Nom du modèle<input name="name" required maxLength={60} defaultValue={model?.name} /></label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="actions">
        {onRemove && <button className="btn danger" type="button" disabled={saving} onClick={async () => {
          if (!window.confirm('Supprimer ce modèle vide ?')) return
          setSaving(true)
          setError(await onRemove())
          setSaving(false)
        }}>Supprimer</button>}
        <button className="btn" type="button" disabled={saving} onClick={onClose}>Annuler</button>
        <button className="btn primary" type="submit" disabled={saving}>Enregistrer</button>
      </div>
    </form>
  </Modal>
}

export function AccountGroup({ name, accounts, onEditAccount, onAdd, onEditModel }: {
  name: string
  accounts: Account[]
  onEditAccount: (account: Account) => void
  onAdd?: () => void
  onEditModel?: () => void
}) {
  return <section className="settings">
    <div className="section-head">
      <div>
        <h2>{name}</h2>
        <p className="sub">{accounts.length} {accounts.length === 1 ? 'compte' : 'comptes'}</p>
      </div>
      {onEditModel && <div className="account-actions">
        <button className="btn" aria-label={'Modifier le modèle ' + name} onClick={onEditModel}>Modifier le modèle</button>
        <button className="btn" aria-label={'Ajouter un compte à ' + name} onClick={onAdd}>Ajouter un compte</button>
      </div>}
    </div>
    {accounts.length ? <ul className="account-list">
      {accounts.map(account => <li key={account.id}>
        <div><strong>{account.name}</strong><p className="handle">@{account.handle}</p></div>
        <button className="btn" aria-label={'Modifier le compte ' + account.name}
          onClick={() => onEditAccount(account)}>Modifier</button>
      </li>)}
    </ul> : <p className="sub">Aucun compte dans ce groupe.</p>}
  </section>
}
