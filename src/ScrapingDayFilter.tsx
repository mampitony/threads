import { dailyScrapingGoal, scrapingBucket } from './planning'
import type { scrapingProgress } from './planning'

export function ScrapingDayFilter({ today, day, onChange, agents, progress }: {
  today: string
  day: string
  onChange: (day: string | undefined) => void
  agents: string[]
  progress: ReturnType<typeof scrapingProgress>
}) {
  const uniqueAgents = new Map(agents.map(agent => [scrapingBucket(agent, day), agent]))
  return <>
    <div className="account-actions" style={{ alignItems: 'end', marginBlock: 12 }}>
      <label>Jour de l’objectif<input type="date" value={day} onChange={event => onChange(event.target.value)} /></label>
      <button type="button" className="btn" onClick={() => onChange(undefined)} disabled={day === today}>Aujourd’hui</button>
      <button type="button" className="btn" onClick={() => onChange('')} disabled={!day}>Tout l’historique</button>
    </div>
    {day && uniqueAgents.size > 0 && <ul className="reference-uses" aria-label="Progression par agent"
      style={{ display: 'flex', flexWrap: 'wrap', gap: 12, listStyle: 'none', paddingInlineStart: 0 }}>
      {[...uniqueAgents].map(([key, agent]) => <li key={key}>
        <strong>{agent}</strong> · {progress.counts.get(key) ?? 0} / {dailyScrapingGoal} liens
      </li>)}
    </ul>}
  </>
}
