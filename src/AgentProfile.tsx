import { useState } from 'react'
import type { FormEvent } from 'react'

export type Profile = { name: string; photo: string }

export async function profileRequest(profile?: Profile, signal?: AbortSignal) {
  const response = await fetch('/api/auth/profile', {
    method: profile ? 'PUT' : 'GET',
    headers: { 'x-planning-auth': '1', 'Content-Type': 'application/json' },
    body: profile ? JSON.stringify(profile) : undefined,
    signal,
  })
  const result = await response.json() as Profile & { error?: string }
  if (response.status === 401) window.dispatchEvent(new Event('planning-session-expired'))
  if (!response.ok) throw new Error(result.error || 'Le profil est indisponible.')
  return result
}

async function resizePhoto(file: File) {
  const bitmap = await createImageBitmap(file)
  try {
    const scale = Math.min(1, 320 / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Impossible de préparer la photo.')
    context.fillStyle = '#fff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/jpeg', 0.8)
  } finally {
    bitmap.close()
  }
}

export function AgentProfile({ email, savedProfile, loadError, onSave }: {
  email: string
  savedProfile: Profile | null
  loadError: string
  onSave: (profile: Profile) => void
}) {
  const [draft, setProfile] = useState<Profile | null>(null)
  const profile = draft ?? (savedProfile && { ...savedProfile, name: savedProfile.name || email.split('@')[0] })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!profile || busy) return
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const saved = await profileRequest(profile)
      onSave(saved)
      setProfile(null)
      setMessage('Profil enregistré.')
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Impossible d’enregistrer le profil.')
    } finally {
      setBusy(false)
    }
  }

  return <>
    <header className="top"><h1>Mon profil</h1></header>
    <section className="settings">
      <p className="sub">{email}</p>
      {!profile && !loadError && <p role="status">Chargement du profil…</p>}
      {!profile && loadError && <p className="form-error" role="alert">{loadError}</p>}
      {profile && <form onSubmit={save}>
        {profile.photo && <img src={profile.photo} alt="Ta photo de profil" width={96} height={96}
          style={{ objectFit: 'cover', borderRadius: '50%' }} />}
        <label>Nom de profil<input value={profile.name} required maxLength={100} disabled={busy}
          onChange={event => setProfile({ ...profile, name: event.target.value })} /></label>
        <label>Photo de profil<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy}
          onChange={async event => {
            const input = event.currentTarget
            const file = input.files?.[0]
            if (!file) return
            input.value = ''
            setError('')
            setMessage('')
            if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 8_000_000) {
              setError('Choisis une image JPEG, PNG ou WebP de 8 Mo maximum.')
              return
            }
            setBusy(true)
            try {
              const photo = await resizePhoto(file)
              setProfile({ ...profile, photo })
            } catch {
              setError('Impossible de lire cette image.')
            } finally {
              setBusy(false)
            }
          }} /></label>
        <div className="account-actions">
          {profile.photo && <button type="button" className="btn" disabled={busy}
            onClick={() => setProfile({ ...profile, photo: '' })}>Retirer la photo</button>}
          <button className="btn primary" disabled={busy}>{busy ? 'Traitement…' : 'Enregistrer le profil'}</button>
        </div>
      </form>}
      {error && <p className="form-error" role="alert">{error}</p>}
      {message && <p className="sub" role="status">{message}</p>}
    </section>
  </>
}
