import { useState } from 'react'
import type { FormEvent } from 'react'
import { Modal } from './Modal'
import { slots } from './planning'
import type { Account, CaptionTarget, Model, Slot, TylanReference } from './planning'

export function CaptionUseEditor({ reference, accounts, models, selectedDate, onUse, onClose }: {
  reference: TylanReference
  accounts: Account[]
  models: Model[]
  selectedDate: string
  onUse: (reference: TylanReference, target: CaptionTarget) => string
  onClose: () => void
}) {
  const [modelId, setModelId] = useState('')
  const [error, setError] = useState('')
  const availableAccounts = modelId === 'unassigned'
    ? accounts.filter(account => !models.some(model => model.id === account.modelId))
    : accounts.filter(account => account.modelId === modelId)

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const fields = new FormData(event.currentTarget)
    const target = {
      modelId: modelId === 'unassigned' ? '' : modelId,
      accountId: String(fields.get('account') ?? ''),
      date: String(fields.get('date') ?? ''),
      slot: fields.get('slot') as Slot,
    }
    if (!availableAccounts.some(account => account.id === target.accountId)
      || !/^\d{4}-\d{2}-\d{2}$/.test(target.date) || !slots.includes(target.slot)) {
      setError('Choisis un compte, une date et un créneau valides.')
      return
    }
    const message = onUse(reference, target)
    if (message) setError(message)
    else onClose()
  }

  return <Modal title="Utiliser cette légende" onClose={onClose}>
    <p className="sub">La légende de {reference.author} sera copiée dans le planning du compte choisi.</p>
    <form onSubmit={submit} onChange={() => setError('')}>
      <label>Modèle<select required value={modelId} onChange={event => setModelId(event.target.value)}>
        <option value="">Choisir un modèle</option>
        {models.map(model => <option key={model.id} value={model.id}>{model.name}</option>)}
        <option value="unassigned">Sans modèle</option>
      </select></label>
      <label>Compte<select name="account" key={modelId} required disabled={!modelId || !availableAccounts.length}>
        <option value="">{modelId && !availableAccounts.length ? 'Aucun compte dans ce groupe' : 'Choisir un compte'}</option>
        {availableAccounts.map(account => <option key={account.id} value={account.id}>{account.name} · @{account.handle}</option>)}
      </select></label>
      <label>Date<input name="date" type="date" required max="9999-12-31" defaultValue={selectedDate} /></label>
      <label>Créneau<select name="slot" required defaultValue="">
        <option value="">Choisir un créneau</option>
        {slots.map(slot => <option key={slot}>{slot}</option>)}
      </select></label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="actions">
        <button className="btn" type="button" onClick={onClose}>Annuler</button>
        <button className="btn primary" type="submit" disabled={!modelId || !availableAccounts.length}>Ajouter au planning</button>
      </div>
    </form>
  </Modal>
}
