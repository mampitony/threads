import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'

export type Profile = { name: string; photo: string; cover: string }

export async function profileRequest(profile?: Profile, signal?: AbortSignal, agentId?: string) {
  const query = agentId ? '?' + new URLSearchParams({ agent: agentId }) : ''
  const response = await fetch('/api/auth/profile' + query, {
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

export async function resizePhoto(file: File, maxSize = 320) {
  const bitmap = await createImageBitmap(file)
  try {
    const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height))
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

function ProfileImages({ profile }: { profile: Profile }) {
  return <div className="agent-profile-images">
    {profile.cover && <img className="agent-cover" src={profile.cover} alt="Photo de couverture" />}
    <ProfileAvatar profile={profile} />
  </div>
}

function ProfileAvatar({ profile }: { profile: Pick<Profile, 'photo' | 'name'> }) {
  return profile.photo
    ? <img className="agent-avatar" src={profile.photo} alt="Photo de profil" />
    : <span className="agent-avatar" aria-hidden="true">{Array.from(profile.name)[0]?.toLocaleUpperCase('fr')}</span>
}

export function AgentProfilePage({ agent, onBack }: { agent: { id: string; name: string }; onBack: () => void }) {
  const [profile, setProfile] = useState<Profile>()
  const [error, setError] = useState('')
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    window.scrollTo(0, 0)
    heading.current?.focus({ preventScroll: true })
    const controller = new AbortController()
    profileRequest(undefined, controller.signal, agent.id).then(result => {
      if (!controller.signal.aborted) setProfile(result)
    }).catch(failure => {
      if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : 'Profil indisponible.')
    })
    return () => controller.abort()
  }, [agent.id])

  const name = profile?.name || agent.name
  return <section className="agent-profile-page settings" aria-labelledby="agent-profile-name">
    {profile?.cover
      ? <img className="agent-cover" src={profile.cover} alt="Photo de couverture" />
      : <div className="agent-cover-placeholder" aria-hidden="true" />}
    <div className="agent-profile-identity">
      <ProfileAvatar profile={{ name, photo: profile?.photo ?? '' }} />
      <h1 ref={heading} tabIndex={-1} id="agent-profile-name">{name}</h1>
      <button type="button" className="btn" onClick={onBack}>Retour</button>
    </div>
    {error && <p className="form-error" role="alert">{error}</p>}
    {!profile && !error && <p className="sub" role="status">Chargement du profil…</p>}
  </section>
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

  async function chooseImage(input: HTMLInputElement, field: 'photo' | 'cover') {
    const file = input.files?.[0]
    if (!file || !profile) return
    input.value = ''
    setError('')
    setMessage('')
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 8_000_000) {
      setError('Choisis une image JPEG, PNG ou WebP de 8 Mo maximum.')
      return
    }
    setBusy(true)
    try {
      const photo = await resizePhoto(file, field === 'cover' ? 1200 : 320)
      if (photo.length > (field === 'cover' ? 450_000 : 200_000)) {
        setError('L’image préparée reste trop volumineuse. Choisis une autre image.')
        return
      }
      setProfile({ ...profile, [field]: photo })
    } catch {
      setError('Impossible de lire cette image.')
    } finally {
      setBusy(false)
    }
  }

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
        <ProfileImages profile={profile} />
        <label>Nom de profil<input value={profile.name} required maxLength={100} disabled={busy}
          onChange={event => setProfile({ ...profile, name: event.target.value })} /></label>
        <label>Photo de profil<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy}
          onChange={event => chooseImage(event.currentTarget, 'photo')} /></label>
        <label>Photo de couverture<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy}
          onChange={event => chooseImage(event.currentTarget, 'cover')} /></label>
        <div className="account-actions">
          {profile.photo && <button type="button" className="btn" disabled={busy}
            onClick={() => setProfile({ ...profile, photo: '' })}>Retirer la photo</button>}
          {profile.cover && <button type="button" className="btn" disabled={busy}
            onClick={() => setProfile({ ...profile, cover: '' })}>Retirer la couverture</button>}
          <button className="btn primary" disabled={busy}>{busy ? 'Traitement…' : 'Enregistrer le profil'}</button>
        </div>
      </form>}
      {error && <p className="form-error" role="alert">{error}</p>}
      {message && <p className="sub" role="status">{message}</p>}
    </section>
  </>
}
