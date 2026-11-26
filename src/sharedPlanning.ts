import type { Planning } from './planning'

export type PlanningSnapshot = { revision: number; data: Planning | null; unchanged?: boolean }

export async function sharedPlanningRequest(update?: PlanningSnapshot, signal?: AbortSignal, since?: number) {
  const url = '/api/planning' + (!update && since !== undefined ? '?since=' + since : '')
  const response = await fetch(url, {
    method: update ? 'PUT' : 'GET',
    headers: { 'Content-Type': 'application/json', 'x-planning-auth': '1' },
    body: update ? JSON.stringify(update) : undefined,
    signal,
  })
  if (response.status === 401) window.dispatchEvent(new Event('planning-session-expired'))
  if (response.status === 409 && update) return null
  const payload: PlanningSnapshot & { error?: string } = await response.json()
  if (!response.ok) throw new Error(payload.error || 'Le planning partagé est indisponible.')
  return payload
}
