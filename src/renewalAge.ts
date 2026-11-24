import { fromKey, isDateKey } from './planning'
import type { Renewal } from './planning'

export function accountRenewalAge(entries: Renewal[], accountId: string, today: string) {
  const latest = entries.filter(entry => entry.accountId === accountId && isDateKey(entry.date) && entry.date <= today)
    .sort((a, b) => b.date.localeCompare(a.date) || (b.time ?? '').localeCompare(a.time ?? ''))[0]
  if (!latest) return null
  return Math.round((fromKey(today).getTime() - fromKey(latest.date).getTime()) / 86400000)
}
