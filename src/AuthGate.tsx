import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { App } from './App'
import { planningStorageKey } from './planning'

type Session = { id: string; email: string; firstAccount: boolean; isAdmin: boolean; sharedPlanning: boolean; expiresAt: number }

async function authRequest(action: 'session' | 'login' | 'register' | 'logout', fields?: object) {
  const response = await fetch('/api/auth/' + action, action === 'session' ? undefined : {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-planning-auth': '1' },
    body: JSON.stringify(fields ?? {}),
  })
  const data: { user: Session | null; pending?: boolean; error?: string } = await response.json()
  if (!response.ok) throw new Error(data.error || 'Le service de connexion est indisponible.')
  return data
}

function LoginForm({ onConnect }: { onConnect: (user: Session) => void }) {
  const [register, setRegister] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const password = form.get('password')
    if (register && password !== form.get('confirmation')) {
      setError('Les deux mots de passe doivent être identiques.')
      return
    }
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const { user, pending } = await authRequest(register ? 'register' : 'login', { email: form.get('email'), password, bootstrapCode: form.get('bootstrapCode') })
      if (user) onConnect(user)
      else if (pending) {
        setRegister(false)
        setMessage('Demande envoyée. Tu pourras te connecter après l’approbation d’un administrateur.')
      }
    } catch (failure) {
      setError(failure instanceof Error && failure.name === 'Error' ? failure.message
        : 'Impossible de joindre le serveur de connexion.')
    } finally {
      setBusy(false)
    }
  }

  return <main className="auth-page">
    <section className="settings auth-card" aria-labelledby="auth-title">
      <p className="eyebrow">Planning des publications</p>
      <h1 id="auth-title">{register ? 'Créer un compte' : 'Connexion'}</h1>
      <p className="sub">{register ? 'Crée ton accès au panneau.' : 'Connecte-toi pour ouvrir ton planning.'}</p>
      {message && <p className="sub" role="status">{message}</p>}
      <form key={String(register)} onSubmit={submit}>
        <label>Adresse e-mail<input name="email" type="email" required maxLength={254} autoComplete="email" /></label>
        <label>Mot de passe<input name="password" type="password" required minLength={register ? 12 : undefined}
          maxLength={128} autoComplete={register ? 'new-password' : 'current-password'} /></label>
        {register && <>
          <p className="sub">Utilise au moins 12 caractères.</p>
          <label>Confirmer le mot de passe<input name="confirmation" type="password" required
            maxLength={128} autoComplete="new-password" /></label>
          <details>
            <summary>Premier administrateur sur Vercel</summary>
            <label>Code d’installation<input name="bootstrapCode" type="password" maxLength={128} autoComplete="off" /></label>
          </details>
        </>}
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="btn primary" type="submit" disabled={busy}>
          {busy ? 'Veuillez patienter…' : register ? 'Créer mon compte' : 'Se connecter'}
        </button>
      </form>
      <button className="btn auth-switch" type="button" disabled={busy} onClick={() => {
        setError('')
        setMessage('')
        setRegister(!register)
      }}>{register ? 'J’ai déjà un compte' : 'Créer un compte'}</button>
    </section>
  </main>
}

export function AuthGate() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [serviceError, setServiceError] = useState('')
  const [logoutError, setLogoutError] = useState('')
  const [workspaceKey, setWorkspaceKey] = useState('')

  function connect(user: Session) {
    setWorkspaceKey(planningStorageKey(user.id, user.firstAccount))
    setSession(user)
  }

  useEffect(() => {
    let active = true
    authRequest('session').then(({ user }) => {
      if (!active) return
      if (user) connect(user)
      else setSession(null)
    }).catch(() => {
      if (active) setServiceError('Impossible de vérifier la connexion. Vérifie que le serveur local est lancé, puis recharge la page.')
    })
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!session) return
    const expire = () => setSession(null)
    const timer = window.setTimeout(expire, Math.max(0, session.expiresAt - Date.now()))
    window.addEventListener('planning-session-expired', expire)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('planning-session-expired', expire)
    }
  }, [session])

  async function logout() {
    setLogoutError('')
    try {
      await authRequest('logout')
      setSession(null)
    } catch {
      setLogoutError('Impossible de te déconnecter. Réessaie.')
    }
  }

  if (session === undefined) {
    return <main className="auth-page">
      <p role={serviceError ? 'alert' : 'status'}>{serviceError || 'Vérification de la connexion…'}</p>
    </main>
  }
  if (!session) return <LoginForm onConnect={connect} />
  return <>
    {logoutError && <p className="toast" role="alert">{logoutError}</p>}
    <App key={session.id} storageKey={workspaceKey} email={session.email} isAdmin={session.isAdmin} shared={session.sharedPlanning} onLogout={logout} />
  </>
}
