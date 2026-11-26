import { isDateKey } from './planning'
import type { Account, Renewal } from './planning'

export function renewalInstant(entry: Pick<Renewal, 'date' | 'time'>) {
  if (!isDateKey(entry.date) || !entry.time || !/^([01]\d|2[0-3]):[0-5]\d$/.test(entry.time)) return null
  // Heure locale de Madagascar, indépendante du fuseau du navigateur.
  const timestamp = Date.parse(entry.date + 'T' + entry.time + ':00+03:00')
  return Number.isFinite(timestamp) ? timestamp : null
}

export function renewalAgeLabel(entry: Pick<Renewal, 'date' | 'time'>, now: Date) {
  const start = renewalInstant(entry)
  if (start === null) return 'Renseigne l’heure de renouvellement pour calculer l’âge.'
  const elapsed = now.getTime() - start
  if (elapsed < 0) return 'Renouvellement prévu, pas encore effectué.'
  const days = Math.floor(elapsed / 86400000)
  return 'Âge depuis le renouvellement : ' + days + (days === 1 ? ' jour' : ' jours')
}

export function accountRenewalAge(entries: Renewal[], accountId: string, now: Date) {
  const latest = entries.filter(entry => entry.accountId === accountId && isDateKey(entry.date))
    .filter(entry => entry.time ? (renewalInstant(entry) ?? Infinity) <= now.getTime()
      : Date.parse(entry.date + 'T00:00:00+03:00') <= now.getTime())
    .sort((a, b) => b.date.localeCompare(a.date) || (b.time ?? '').localeCompare(a.time ?? ''))[0]
  if (!latest) return null
  const start = renewalInstant(latest)
  return start === null ? null : Math.floor((now.getTime() - start) / 86400000)
}

export function activityEntries(accounts: Account[], renewals: Renewal[]) {
  const entries = [...renewals]
  for (const account of accounts) {
    if (!account.createdAt || entries.some(entry => entry.accountId === account.id)) continue
    const timestamp = Date.parse(account.createdAt)
    if (!Number.isFinite(timestamp)) continue
    const local = new Date(timestamp + 3 * 3600000).toISOString()
    entries.push({ id: 'creation-' + account.id, accountId: account.id, accountName: account.name,
      date: local.slice(0, 10), time: local.slice(11, 16) })
  }
  return entries
}
