import { renewalInstant } from './renewalAge'
import type { Renewal } from './planning'

export function publicationRule(renewals: Renewal[], accountId: string, now: Date) {
  const latest = renewals.filter(entry => entry.accountId === accountId)
    .sort((a, b) => b.date.localeCompare(a.date) || (b.time ?? '').localeCompare(a.time ?? ''))[0]
  if (!latest) return { blocked: false, message: '' }
  const start = renewalInstant(latest)
  if (start === null) return { blocked: true, message: 'Renseigne la date et l’heure de renouvellement.' }
  if (now.getTime() < start) return { blocked: true, message: 'Renouvellement prévu : publication en attente.' }
  const days = Math.floor((now.getTime() - start) / 86400000)
  if (days === 0) return { blocked: true, message: 'J0 · Aucune publication. Photo de profil, bio et environ 1 h d’activité répartie. Aucun commentaire.' }
  if (days === 1) return { blocked: false, message: 'J1 · 1 post éphémère et 1 photo en soirée avant 20 h. Activité : 30 à 45 min.' }
  if (days === 2) return { blocked: false, message: 'J2 · 1 post éphémère et 1 photo. Répondre aux commentaires sous vos posts.' }
  if (days === 3) return { blocked: false, message: 'J3 · Vérifier les abonnés : plus de 10, jusqu’à 2 photos ; sinon 1 photo.' }
  return { blocked: false, message: 'J' + days + ' · Suivre la progression des abonnés et adapter la routine. Photos avant 20 h.' }
}
