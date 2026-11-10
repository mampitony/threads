import { useEffect, useState } from 'react'

type Access = 'pending' | 'approved' | 'admin' | 'refused'
type AccountAccess = { id: string; email: string; access: Access }

const labels: Record<Access, string> = {
  pending: 'En attente',
  approved: 'Compte simple',
  admin: 'Administrateur',
  refused: 'Refusé',
}

async function accountRequest(account?: AccountAccess, access?: Access): Promise<AccountAccess[]> {
  const response = await fetch('/api/auth/accounts', {
    method: account ? 'PATCH' : 'GET',
    headers: { 'Content-Type': 'application/json', 'x-planning-auth': '1' },
    body: account ? JSON.stringify({ id: account.id, previous: account.access, access }) : undefined,
  })
  if (response.status === 401) window.dispatchEvent(new Event('planning-session-expired'))
  const result: { accounts?: AccountAccess[]; error?: string } = await response.json()
  if (!response.ok || !result.accounts) throw new Error(result.error || 'Impossible de charger les comptes.')
  return result.accounts
}

export function PendingAccounts({ email }: { email: string }) {
  const [accounts, setAccounts] = useState<AccountAccess[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  async function refresh() {
    setBusy(true)
    setError('')
    setMessage('')
    try {
      setAccounts(await accountRequest())
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Impossible de charger les comptes.')
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => { void refresh() }, [])

  async function changeAccess(account: AccountAccess, access: Access) {
    setBusy(true)
    setError('')
    setMessage('')
    try {
      setAccounts(await accountRequest(account, access))
      if (account.email === email && access !== 'admin') window.location.reload()
      else setMessage('Accès mis à jour pour ' + account.email + '.')
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Impossible de modifier ce compte.')
    } finally {
      setBusy(false)
    }
  }

  const groups = [
    { title: 'Demandes en attente', accounts: accounts.filter(account => account.access === 'pending') },
    { title: 'Comptes autorisés', accounts: accounts.filter(account => account.access === 'approved' || account.access === 'admin') },
    { title: 'Demandes refusées', accounts: accounts.filter(account => account.access === 'refused') },
  ]
  const numberOfAdmins = accounts.filter(account => account.access === 'admin').length

  return <>
    <header className="top">
      <div><p className="eyebrow">Administration</p><h1>Gestion des accès</h1>
        <p className="sub">Approuve les demandes et gère les rôles du panneau.</p></div>
      <button className="btn" disabled={busy} onClick={() => void refresh()}>Actualiser</button>
    </header>
    {error && <p className="form-error" role="alert">{error}</p>}
    {message && <p className="sub" role="status">{message}</p>}
    <div className="model-groups" aria-busy={busy}>
      {groups.map(group => <section className="settings" key={group.title}>
        <h2>{group.title}</h2>
        {group.accounts.length === 0 ? <p className="sub">Aucun compte.</p> :
          <ul className="account-list">
            {group.accounts.map(account => <li key={account.id}>
              <div><strong>{account.email}</strong><p className="sub">{labels[account.access]}</p></div>
              <div className="account-actions">
                {account.access === 'pending' && <button className="btn danger" disabled={busy}
                  aria-label={'Refuser ' + account.email} onClick={() => void changeAccess(account, 'refused')}>Refuser</button>}
                {(account.access === 'pending' || account.access === 'refused') &&
                  <button className="btn primary" disabled={busy} aria-label={'Approuver ' + account.email}
                    onClick={() => void changeAccess(account, 'approved')}>{account.access === 'refused' ? 'Réexaminer et approuver' : 'Approuver'}</button>}
                {account.access === 'approved' && <button className="btn" disabled={busy}
                  aria-label={'Nommer administrateur ' + account.email}
                  onClick={() => void changeAccess(account, 'admin')}>Nommer administrateur</button>}
                {account.access === 'admin' && <button className="btn" disabled={busy || numberOfAdmins <= 1}
                  aria-label={'Passer en compte simple ' + account.email}
                  onClick={() => void changeAccess(account, 'approved')}>Passer en compte simple</button>}
              </div>
            </li>)}
          </ul>}
      </section>)}
    </div>
  </>
}
