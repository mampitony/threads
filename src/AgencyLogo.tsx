import { useState } from 'react'
import { resizePhoto } from './AgentProfile'

export async function agencyLogoRequest(logo?: string, signal?: AbortSignal) {
  const response = await fetch('/api/auth/agency-logo', {
    method: logo === undefined ? 'GET' : 'PUT',
    headers: { 'x-planning-auth': '1', 'Content-Type': 'application/json' },
    body: logo === undefined ? undefined : JSON.stringify({ logo }),
    signal,
  })
  if (response.status === 401 && !signal?.aborted) window.dispatchEvent(new Event('planning-session-expired'))
  const result: { logo: string; error?: string } = await response.json()
  if (!response.ok) throw new Error(result.error || 'Le logo est indisponible.')
  return result.logo
}

export function AgencyLogoSettings({ onSave }: { onSave: (logo: string) => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  async function save(file?: File) {
    if (busy) return
    setBusy(true)
    setError('')
    setMessage('')
    try {
      if (file && (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 8_000_000)) {
        throw new Error('Choisis une image JPEG, PNG ou WebP de 8 Mo maximum.')
      }
      const logo = file ? await resizePhoto(file) : ''
      onSave(await agencyLogoRequest(logo))
      setMessage(file ? 'Logo enregistré pour toute l’équipe.' : 'Logo d’origine rétabli.')
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Impossible d’enregistrer le logo.')
    } finally {
      setBusy(false)
    }
  }

  return <section className="settings" aria-labelledby="agency-logo-title">
    <h2 id="agency-logo-title">Logo de l’agence</h2>
    <label>Remplacer le logo<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy}
      onChange={event => {
        const input = event.currentTarget
        const file = input.files?.[0]
        input.value = ''
        if (file) void save(file)
      }} /></label>
    <button type="button" className="btn" disabled={busy} onClick={() => void save()}>Rétablir le logo d’origine</button>
    {busy && <p role="status">Enregistrement du logo…</p>}
    {message && <p role="status">{message}</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
  </section>
}
