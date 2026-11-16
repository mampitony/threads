import { useState } from 'react'
import type { Account, Planning } from './planning'

const numberFormat = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 })
const categories = {
  good: { label: 'Good · Efa matanjaka', color: '#24834b', background: '#dcfce7', ink: '#14532d' },
  medium: { label: 'Moyen', color: '#2563a6', background: '#dbeafe', ink: '#193b72' },
  low: { label: 'Faible', color: '#b77900', background: '#fef3c7', ink: '#713f12' },
  unknown: { label: 'Sans statistiques', color: '#687784', background: '#edf1f4', ink: '#334155' },
}

function accountStatistics(accounts: Account[], posts: Planning['posts']) {
  const byId = new Map(accounts.map(account => [account.id, {
    account, likes: 0, comments: 0, measured: 0, complete: 0, entries: 0,
  }]))
  for (const [key, post] of Object.entries(posts)) {
    const stats = byId.get(key.split('|')[1])
    if (!stats || (!post.url && post.likes == null && post.comments == null)) continue
    stats.entries++
    if (post.likes == null && post.comments == null) continue
    stats.measured++
    if (post.likes != null && post.comments != null) stats.complete++
    stats.likes += post.likes ?? 0
    stats.comments += post.comments ?? 0
  }
  return [...byId.values()].map(stats => ({
    ...stats,
    average: stats.measured ? (stats.likes + stats.comments) / stats.measured : null,
  }))
}

export function AccountPerformance({ data }: { data: Planning }) {
  const [modelId, setModelId] = useState<string>()
  const models = new Set(data.models.map(model => model.id))
  const hasUnassigned = data.accounts.some(account => !account.modelId || !models.has(account.modelId))
  const groups = [
    ...data.models.map(model => ({ id: model.id, label: model.name })),
    ...(hasUnassigned ? [{ id: '', label: 'Sans modèle' }] : []),
  ]
  const selected = groups.find(group => group.id === modelId) ?? groups[0]
  const accounts = selected
    ? data.accounts.filter(account => selected.id
      ? account.modelId === selected.id
      : !account.modelId || !models.has(account.modelId))
    : []
  const stats = accountStatistics(accounts, data.posts).sort((a, b) =>
    (b.average ?? -1) - (a.average ?? -1)
    || a.account.name.localeCompare(b.account.name, 'fr', { numeric: true }))
  const measured = stats.filter(item => item.average !== null)
  const benchmark = measured.length
    ? measured.reduce((total, item) => total + (item.average ?? 0), 0) / measured.length
    : 0
  const maximum = Math.max(1, ...measured.map(item => item.average ?? 0))

  return <>
    <header className="top">
      <div>
        <h1>Performance des comptes</h1>
        <p className="sub">Tout l’historique enregistré dans le planning.</p>
      </div>
      {selected && <label>Modèle<select value={selected.id} onChange={event => setModelId(event.target.value)}>
        {groups.map(group => <option key={group.id} value={group.id}>{group.label}</option>)}
      </select></label>}
    </header>
    <section className="settings" aria-labelledby="performance-title">
      <h2 id="performance-title">Interactions moyennes par créneau mesuré</h2>
      <p className="sub">J’aime et commentaires disponibles ÷ créneaux avec au moins un compteur.</p>
      {measured.length > 0 && <p className="sub">
        Moyenne du modèle : <strong>{numberFormat.format(benchmark)}</strong>.
        Vert dès 125 % de cette moyenne, bleu dès 75 %, jaune en dessous ou à zéro interaction.
      </p>}
      {stats.length === 0 && <p className="empty">Aucun compte dans ce modèle.</p>}
      {stats.length > 0 && <ol className="account-list">
        {stats.map(item => {
          const category = item.average === null ? categories.unknown
            : item.average === 0 ? categories.low
            : item.average >= benchmark * 1.25 ? categories.good
            : item.average >= benchmark * .75 ? categories.medium : categories.low
          return <li key={item.account.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 6 }}>
            <div className="account-actions" style={{ alignItems: 'center', justifyContent: 'space-between' }}>
              <strong>{item.account.name} <span className="sub">@{item.account.handle}</span></strong>
              <span style={{ background: category.background, color: category.ink, borderRadius: 6, padding: '3px 8px' }}>
                {category.label}
              </span>
            </div>
            {item.average !== null && <>
              <div aria-hidden="true" style={{ height: 9, background: '#edf1f4', borderRadius: 8, overflow: 'hidden' }}>
                <div style={{ width: item.average / maximum * 100 + '%', height: '100%', background: category.color }} />
              </div>
              <p className="sub"><strong>{numberFormat.format(item.average)} interactions par créneau</strong>
                {' · '}{numberFormat.format(item.likes)} J’aime · {numberFormat.format(item.comments)} commentaires</p>
            </>}
            <p className="sub">{item.measured} / {item.entries} créneaux mesurés
              {item.measured > item.complete && ' · ' + (item.measured - item.complete) + ' avec un seul compteur'}</p>
          </li>
        })}
      </ol>}
    </section>
  </>
}
