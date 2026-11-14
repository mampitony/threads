import { ImportThreadsButton } from './ImportThreadsButton'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { Modal } from './Modal'
import { CaptionUseEditor } from './CaptionUseEditor'
import { webUrl } from './planning'
import type { CaptionTarget, Planning, TylanReference } from './planning'

const reactionFormat = new Intl.NumberFormat('fr-FR')
type SaveReference = (
  fields: Omit<TylanReference, 'id'>,
  id?: string,
) => Promise<string>

function ReferenceEditor({ reference, defaultAgentName, onClose, onSave }: {
  reference?: TylanReference
  defaultAgentName: string
  onClose: () => void
  onSave: SaveReference
}) {
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [importing, setImporting] = useState(false)
  const busy = saving || importing

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    const form = event.currentTarget
    const data = new FormData(form)
    const read = (name: string) => String(data.get(name) ?? '').trim()
    const fields = {
      caption: read('caption'),
      author: read('author'),
      url: webUrl(read('url')),
      reactions: Number(read('reactions')),
      agent: read('agent'),
    }
    if (!fields.author || !fields.agent) {
      setError('Renseigne le nom de l’auteur et celui de l’agent.')
      return
    }
    if (!fields.url) {
      setError('Le lien doit commencer par https:// ou http://.')
      return
    }
    if (!read('reactions') || !Number.isSafeInteger(fields.reactions) || fields.reactions < 0) {
      setError('Saisis un nombre entier de réactions supérieur ou égal à zéro.')
      return
    }

    setSaving(true)
    const message = await onSave(fields, reference?.id)
    setSaving(false)
    if (message) setError(message)
    else onClose()
  }

  return <Modal title={reference ? 'Modifier la publication' : 'Ajouter une publication de référence'} onClose={() => { if (!busy) onClose() }}>
    <form onSubmit={submit} onChange={() => setError('')}>
      <label>Légende<textarea name="caption" disabled={busy} maxLength={5000}
        defaultValue={reference?.caption} placeholder="Texte de la publication" /></label>
      <label>Auteur<input name="author" disabled={busy} required maxLength={150}
        defaultValue={reference?.author} placeholder="Nom ou @identifiant de l’auteur" /></label>
      <label>Lien de la publication<input name="url" disabled={busy} type="url" required maxLength={2000}
        defaultValue={reference?.url} placeholder="https://…" /></label>
      <ImportThreadsButton reactionField="reactions" disabled={busy} onBusy={setImporting} />
      <label>Nombre de réactions<input name="reactions" disabled={busy} type="number" required min="0" step="1"
        defaultValue={reference?.reactions} placeholder="0" /></label>
      <label>Agent qui a enregistré la publication<input name="agent" disabled={busy} required maxLength={150}
        list="agent-names" defaultValue={reference?.agent || defaultAgentName} placeholder="Saisir ou choisir un nom" /></label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="actions">
        <button className="btn" type="button" disabled={busy} onClick={onClose}>Annuler</button>
        <button className="btn primary" type="submit" disabled={busy}>{saving ? 'Vérification…' : 'Enregistrer'}</button>
      </div>
    </form>
  </Modal>
}

export function Tylan({ data, selectedDate, defaultAgentName, onSave, onDelete, onUse }: {
  data: Planning
  selectedDate: string
  defaultAgentName: string
  onSave: SaveReference
  onDelete: (id: string) => void
  onUse: (reference: TylanReference, target: CaptionTarget) => Promise<string>
}) {
  const [editor, setEditor] = useState<{ reference?: TylanReference } | null>(null)
  const [selected, setSelected] = useState<TylanReference | null>(null)
  const { references, accounts, models, captionUses } = data
  const accountNames = new Map(accounts.map(account => [account.id, account.name]))
  const modelNames = new Map(models.map(model => [model.id, model.name]))
  const usesByReference = new Map<string, string[]>()
  for (const use of captionUses) {
    const accountName = accountNames.get(use.accountId)
    if (!accountName) continue

    const label = accountName + ' · ' + (modelNames.get(use.modelId) ?? use.modelName)
    const labels = usesByReference.get(use.referenceId) ?? []
    labels.push(label)
    usesByReference.set(use.referenceId, labels)
  }
  return <>
    <header className="top">
      <div><p className="eyebrow">Publications de référence</p><h1>Scrapping Tylan</h1>
        <p className="sub">Rassemble les publications qui peuvent servir de modèle.</p></div>
      <button className="btn primary" onClick={() => setEditor({})}>Ajouter une publication</button>
    </header>
    <section aria-labelledby="tylan-list-title">
      <div className="section-head">
        <h2 id="tylan-list-title">Publications enregistrées</h2>
        <span className="sub">{references.length} publication{references.length === 1 ? '' : 's'}</span>
      </div>
      {references.length === 0 ? <p className="empty">Ajoute ta première publication de référence pour la retrouver ici.</p> :
        <ul className="reference-list">
          {references.map(reference => {
            const url = webUrl(reference.url)
            const uses = usesByReference.get(reference.id) ?? []
            return <li key={reference.id} className="settings reference-card">
              <div className="section-head">
                <div><p className="eyebrow">Auteur</p><h3>{reference.author}</h3></div>
                <button className="btn" aria-label={'Modifier la publication de ' + reference.author}
                  onClick={() => setEditor({ reference })}>Modifier</button>
              </div>
              {reference.caption && <p className="caption reference-caption">{reference.caption}</p>}
              <dl className="reference-meta">
                <div><dt>Réactions</dt><dd>{reactionFormat.format(reference.reactions)}</dd></div>
                <div><dt>Enregistrée par</dt><dd>{reference.agent}</dd></div>
              </dl>
              <div className="reference-uses">
                {uses.length > 0 ? <>
                  <h4>Utilisée par</h4>
                  <ul>{uses.map((use, index) => <li key={index}>{use}</li>)}</ul>
                </> : <p className="sub">Aucune utilisation dans le planning.</p>}
              </div>
              <div className="reference-actions">
                {url && <a href={url} target="_blank" rel="noopener noreferrer">Ouvrir la publication ↗</a>}
                <button className="btn danger" type="button" onClick={() => {
                  if (window.confirm('Supprimer cette fiche Scrapping Tylan ?')) onDelete(reference.id)
                }}>Supprimer</button>
                {reference.caption && <button className="btn primary" onClick={() => setSelected(reference)}>Utiliser la légende</button>}
              </div>
            </li>
          })}
        </ul>}
    </section>
    {selected && <CaptionUseEditor reference={selected} accounts={accounts} models={models}
      selectedDate={selectedDate} onUse={onUse} onClose={() => setSelected(null)} />}
    {editor && <ReferenceEditor reference={editor.reference} defaultAgentName={defaultAgentName} onClose={() => setEditor(null)} onSave={onSave} />}
  </>
}
