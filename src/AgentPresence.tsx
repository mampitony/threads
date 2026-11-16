import { useEffect, useRef, useState } from 'react'
import { AgentProfileCard } from './AgentProfile'

type Presence = {
  visible: boolean
  agents: {
    id: string
    name: string
    status: 'online' | 'offline' | 'hidden'
    lastSeenAt: number | null
  }[]
}

async function presenceRequest(method: 'GET' | 'POST' | 'PUT', signal?: AbortSignal, visible?: boolean) {
  const response = await fetch('/api/auth/presence', {
    method,
    headers: { 'x-planning-auth': '1', 'Content-Type': 'application/json' },
    body: method === 'PUT' ? JSON.stringify({ visible }) : undefined,
    signal,
  })
  const result: Presence & { error?: string } = await response.json()
  if (response.status === 401) window.dispatchEvent(new Event('planning-session-expired'))
  if (!response.ok) throw new Error(result.error || 'Les statuts sont indisponibles.')
  return result
}

export function useAgentPresence() {
  const [presence, setPresence] = useState<Presence>()
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const polling = useRef<AbortController | null>(null)
  const updating = useRef(false)
  const visibleSetting = useRef<boolean | undefined>(undefined)

  useEffect(() => {
    async function refresh() {
      if (document.hidden || polling.current || updating.current) return
      const controller = new AbortController()
      polling.current = controller
      try {
        const result = await presenceRequest(visibleSetting.current === false ? 'GET' : 'POST', controller.signal)
        if (controller.signal.aborted) return
        visibleSetting.current = result.visible
        setPresence(result)
        setError('')
      } catch (failure) {
        if (!controller.signal.aborted) {
          setError(failure instanceof Error ? failure.message : 'Les statuts sont indisponibles.')
        }
      } finally {
        if (polling.current === controller) polling.current = null
      }
    }

    void refresh()
    const timer = window.setInterval(refresh, 30_000)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', refresh)
      polling.current?.abort()
      polling.current = null
    }
  }, [])

  async function setVisible(visible: boolean) {
    if (updating.current) return
    updating.current = true
    polling.current?.abort()
    setSaving(true)
    setError('')
    try {
      const result = await presenceRequest('PUT', undefined, visible)
      visibleSetting.current = result.visible
      setPresence(result)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Impossible de modifier ton statut.')
    } finally {
      updating.current = false
      setSaving(false)
    }
  }

  return { presence, error, saving, setVisible }
}

type PresenceControls = ReturnType<typeof useAgentPresence>

export function PresenceSettings({ presence, error, saving, setVisible }: PresenceControls) {
  return <section className="settings">
    <h2>Statut en ligne</h2>
    <label className="presence-toggle">
      <input type="checkbox" role="switch" checked={presence?.visible ?? false}
        disabled={!presence || saving} onChange={event => { void setVisible(event.target.checked) }} />
      Afficher mon statut en ligne
    </label>
    <p className="sub">L’équipe pourra voir si tu es en ligne et quand tu as été actif pour la dernière fois.</p>
    {saving && <p className="sub" role="status">Enregistrement…</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
  </section>
}

const lastSeenFormat = new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'medium', timeStyle: 'short', timeZone: 'Indian/Antananarivo',
})

export function AgentPresence({ presence, error }: Pick<PresenceControls, 'presence' | 'error'>) {
  const [selected, setSelected] = useState<{ id: string; name: string }>()
  const agents = [...(presence?.agents ?? [])].sort((a, b) =>
    Number(b.status === 'online') - Number(a.status === 'online') || a.name.localeCompare(b.name, 'fr'))
  return <>
    <header className="top"><h1>Statut des agents</h1></header>
    <section className="settings">
      {error ? <p className="form-error" role="alert">{error}</p>
        : !presence ? <p role="status">Chargement des statuts…</p>
        : <ul className="account-list">
          {agents.map(agent => <li key={agent.id}>
            <button className="btn" aria-haspopup="dialog" aria-label={'Voir le profil de ' + agent.name}
              onClick={() => setSelected(agent)}>{agent.name}</button>
            <div>
              <span className="presence-status" data-status={agent.status}>
                {agent.status === 'online' ? 'En ligne' : agent.status === 'offline' ? 'Hors ligne' : 'Statut masqué'}
              </span>
              {agent.status === 'offline' && agent.lastSeenAt !== null && <p className="sub">
                Dernière activité le {lastSeenFormat.format(agent.lastSeenAt)}
              </p>}
            </div>
          </li>)}
        </ul>}
    </section>
    {selected && <AgentProfileCard key={selected.id} agent={selected} onClose={() => setSelected(undefined)} />}
  </>
}
