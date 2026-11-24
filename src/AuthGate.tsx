import { useEffect, useId, useState } from 'react'
import type { FormEvent, InputHTMLAttributes } from 'react'
import { App } from './App'
import './login.css'
import { planningStorageKey } from './planning'

type Session = { id: string; email: string; firstAccount: boolean; isAdmin: boolean; sharedPlanning: boolean; expiresAt: number }

async function authRequest(action: 'session' | 'login' | 'register' | 'logout' | 'forgot-password' | 'reset-password', fields?: object) {
  const response = await fetch('/api/auth/' + action, action === 'session' ? undefined : {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-planning-auth': '1' },
    body: JSON.stringify(fields ?? {}),
  })
  const data: { user: Session | null; pending?: boolean; message?: string; error?: string } | null =
    await response.json().catch(() => null)
  if (!response.ok || !data) {
    if (response.status === 404) throw new Error('Le service demandé est introuvable sur le serveur (404).')
    if (!data) throw new Error('Le serveur a renvoyé une réponse invalide (' + response.status + ').')
    throw new Error(data.error || 'Le service de connexion est indisponible.')
  }
  return data
}

function PasswordField({ label, ...inputProps }: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  const [visible, setVisible] = useState(false)
  const id = useId()
  return <div>
    <label className="sr-only" htmlFor={id}>{label}</label>
    <div className="login-field">
      <span aria-hidden="true">▣</span>
      <input {...inputProps} id={id} type={visible ? 'text' : 'password'} placeholder={label} />
      <button className="password-toggle" type="button" disabled={inputProps.disabled}
        aria-controls={id} aria-label={(visible ? 'Masquer ' : 'Afficher ') + label.toLocaleLowerCase('fr')}
        title={visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
        onClick={() => setVisible(current => !current)}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
          <circle cx="12" cy="12" r="3" />
          {visible && <path d="m3 3 18 18" />}
        </svg>
      </button>
    </div>
  </div>
}

function LoginForm({ onConnect }: { onConnect: (user: Session) => void }) {
  const [register, setRegister] = useState(false)
  const [resetToken, setResetToken] = useState(() => {
    const token = new URLSearchParams(window.location.hash.slice(1)).get('reset-password') ?? ''
    if (token) window.history.replaceState(null, '', window.location.pathname + window.location.search)
    return token
  })
  const [forgot, setForgot] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const resetLinkSent = forgot && Boolean(message)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    const form = new FormData(event.currentTarget)
    const password = form.get('password')
    if ((register || resetToken) && password !== form.get('confirmation')) {
      setError('Les deux mots de passe doivent être identiques.')
      return
    }
    setBusy(true)
    setError('')
    setMessage('')
    try {
      if (forgot || resetToken) {
        const result = await authRequest(resetToken ? 'reset-password' : 'forgot-password',
          resetToken ? { token: resetToken, password } : { email: form.get('email') })
        setMessage(result.message || 'Demande enregistrée.')
        if (resetToken) setResetToken('')
        return
      }
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

  return <main className="auth-page login-page">
    <section className="settings auth-card login-card" aria-labelledby="auth-title">
      <div className="login-art">
        <span className="login-orb login-orb-top" aria-hidden="true" />
        <div><h2>Bienvenue</h2><p>Gestion de publications</p></div>
        <span className="login-orb login-orb-bottom" aria-hidden="true" />
      </div>
      <div className="login-form-panel">
      <p className="eyebrow">Planning des publications</p>
      <h1 id="auth-title">{resetToken ? 'Nouveau mot de passe' : forgot ? 'Mot de passe oublié' : register ? 'Créer un compte' : 'Connexion'}</h1>
      {!resetLinkSent && <p className="sub">{resetToken ? 'Choisis ton nouveau mot de passe.' : forgot ? 'Reçois un lien de réinitialisation par e-mail.' : register ? 'Crée ton accès au panneau.' : 'Connecte-toi pour ouvrir ton planning.'}</p>}
      {message && <p className="sub" role="status">{message}</p>}
      {!resetLinkSent && <form key={String(register)} onSubmit={submit}>
        {!resetToken && <label className="login-field"><span aria-hidden="true">✉</span><span className="sr-only">Adresse e-mail</span>
          <input name="email" type="email" placeholder="Adresse e-mail" required maxLength={254} autoComplete="email" disabled={busy} /></label>}
        {!forgot && <PasswordField label="Mot de passe" name="password" required
          minLength={register || resetToken ? 12 : undefined} maxLength={128}
          autoComplete={register || resetToken ? 'new-password' : 'current-password'} disabled={busy} />}
        {(register || resetToken) && <>
          <p className="sub">Utilise au moins 12 caractères.</p>
          <PasswordField label="Confirmer le mot de passe" name="confirmation" required
            minLength={12} maxLength={128} autoComplete="new-password" disabled={busy} />
          {register && <details>
            <summary>Premier administrateur sur Vercel</summary>
            <label>Code d’installation<input name="bootstrapCode" type="password" maxLength={128} autoComplete="off" /></label>
          </details>}
        </>}
        {!register && !forgot && !resetToken && <button className="login-forgot" type="button" disabled={busy}
          onClick={() => { setForgot(true); setError(''); setMessage('') }}>Mot de passe oublié ?</button>}
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="btn primary login-submit" type="submit" disabled={busy}>
          {busy ? 'Veuillez patienter…' : resetToken ? 'Enregistrer le mot de passe' : forgot ? 'Envoyer le lien' : register ? 'Créer mon compte' : 'Se connecter'}
        </button>
      </form>}
      <button className="btn auth-switch" type="button" disabled={busy} onClick={() => {
        setError('')
        setMessage('')
        if (forgot || resetToken) {
          setForgot(false)
          setResetToken('')
          setRegister(false)
        } else setRegister(!register)
      }}>{forgot || resetToken || register ? 'Retour à la connexion' : 'Créer un compte'}</button>
      </div>
    </section>
  </main>
}

export function AuthGate() {
  const [resetRequested] = useState(() => new URLSearchParams(window.location.hash.slice(1)).has('reset-password'))
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

  if (resetRequested) return <LoginForm onConnect={connect} />
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
