const text = value => typeof value === 'string'
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const count = value => Number.isSafeInteger(value) && value >= 0
const optionalCount = value => value === undefined || count(value)
const optionalDate = value => {
  if (value === undefined) return true
  if (!text(value) || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(value + 'T12:00:00Z')
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}
const optionalTimestamp = value => {
  if (value === undefined) return true
  if (!text(value) || value.length !== 24) return false
  const instant = new Date(value)
  return Number.isFinite(instant.getTime()) && instant.toISOString() === value
}

const webLink = value => {
  try { return text(value) && ['http:', 'https:'].includes(new URL(value).protocol) }
  catch { return false }
}

function validSubmittedPosts(posts) {
  if (!Array.isArray(posts)) return false
  const codes = new Set()
  return posts.every(post => {
    if (!object(post) || !text(post.agent) || !post.agent.trim() || post.agent.length > 150
      || !webLink(post.url) || post.url.length > 2000 || !optionalCount(post.reactions)
      || !optionalDate(post.addedOn) || !optionalDate(post.publishedOn)
      || !optionalDate(post.quotaDay) || !optionalTimestamp(post.addedAt)) return false
    const url = new URL(post.url)
    const code = /^\/@[\w.]+\/post\/([\w-]+)\/?$/.exec(url.pathname)?.[1]
    if (url.protocol !== 'https:' || !/^(www\.)?threads\.(com|net)$/.test(url.hostname)
      || url.port || url.username || url.password || !code || codes.has(code)) return false
    codes.add(code)
    return true
  })
}

function validPlanning(data) {
  return object(data)
    && (data.renewals === undefined || (Array.isArray(data.renewals) && data.renewals.length <= 10000
      && new Set(data.renewals.map(item => item?.id)).size === data.renewals.length
      && data.renewals.every(item => object(item) && text(item.id) && item.id.length > 0 && item.id.length <= 100
        && text(item.accountId) && item.accountId.length > 0 && item.accountId.length <= 150
        && text(item.accountName) && item.accountName.trim().length > 0 && item.accountName.length <= 150
        && text(item.date) && optionalDate(item.date)
        && (item.time === undefined || (text(item.time) && /^([01]\d|2[0-3]):[0-5]\d$/.test(item.time)))
        && (item.note === undefined || (text(item.note) && item.note.length <= 2000)))))
    && (data.scrapingGoals === undefined || (object(data.scrapingGoals)
      && Object.keys(data.scrapingGoals).length <= 1000
      && Object.entries(data.scrapingGoals).every(([agent, goal]) =>
        (agent === '*' || (agent.startsWith('|') && agent.length <= 151 && agent.length > 1))
        && Number.isSafeInteger(goal) && goal >= 1 && goal <= 10000)))
    && (data.submittedPosts === undefined || validSubmittedPosts(data.submittedPosts))
    && Array.isArray(data.accounts) && data.accounts.every(item =>
      object(item) && text(item.id) && text(item.name) && text(item.handle)
      && (item.modelId === undefined || text(item.modelId)))
    && Array.isArray(data.models) && data.models.every(item => object(item) && text(item.id) && text(item.name))
    && object(data.posts) && Object.values(data.posts).every(item =>
      object(item) && text(item.count) && text(item.caption) && text(item.url) && text(item.owner)
      && optionalCount(item.likes) && optionalCount(item.comments)
      && (item.author === undefined || (text(item.author) && item.author.length <= 150))
      && (item.imageUrl === undefined || (webLink(item.imageUrl) && item.imageUrl.length <= 2000
        && new URL(item.imageUrl).protocol === 'https:')))
    && Array.isArray(data.references) && data.references.every(item =>
      object(item) && text(item.id) && text(item.caption) && text(item.author) && webLink(item.url)
      && count(item.reactions) && text(item.agent) && optionalDate(item.addedOn)
      && optionalDate(item.quotaDay) && optionalTimestamp(item.addedAt))
    && Array.isArray(data.captionUses) && data.captionUses.every(item =>
      object(item) && text(item.referenceId) && text(item.accountId) && text(item.modelId) && text(item.modelName))
}

export async function readSharedPlanning(db) {
  return await db.get('SELECT revision, data FROM shared_planning WHERE id = 1')
    ?? { revision: 0, data: null }
}

export async function writeSharedPlanning(db, body, isAdmin = false) {
  const { revision, data } = body ?? {}
  if (!count(revision) || revision >= 2147483647 || !validPlanning(data)) {
    return [400, { error: 'Données de planning invalides ou trop volumineuses.' }]
  }
  const previous = await readSharedPlanning(db)
  const previousData = typeof previous.data === 'string' ? JSON.parse(previous.data) : previous.data
  const canonicalGoals = goals => JSON.stringify(Object.entries(goals ?? {}).sort(([a], [b]) => a.localeCompare(b)))
  if (!isAdmin && canonicalGoals(previousData?.scrapingGoals) !== canonicalGoals(data.scrapingGoals)) {
    return [403, { error: 'Seul un administrateur peut modifier les objectifs des agents.' }]
  }
  // Refuser uniquement les nouvelles légendes ou leur remplacement, sans bloquer les anciennes données.
  for (const [key, post] of Object.entries(data.posts)) {
    if (!post.caption || post.caption === previousData?.posts?.[key]?.caption) continue
    const accountId = key.split('|')[1]
    const entries = [...(previousData?.renewals ?? []), ...(data.renewals ?? [])]
      .filter(entry => entry.accountId === accountId)
      .sort((a, b) => b.date.localeCompare(a.date) || (b.time ?? '').localeCompare(a.time ?? ''))
    const latest = entries[0]
    if (!latest) continue
    const start = latest.time && /^([01]\d|2[0-3]):[0-5]\d$/.test(latest.time)
      ? Date.parse(latest.date + 'T' + latest.time + ':00+03:00') : NaN
    if (!Number.isFinite(start) || Date.now() - start < 86400000) {
      return [403, { error: 'Publication bloquée : ce compte doit atteindre 24 heures depuis son renouvellement. Vérifie sa date et son heure.' }]
    }
  }
  const serialized = JSON.stringify(data)
  const saved = revision === 0
    ? await db.get('INSERT INTO shared_planning (id, revision, data) VALUES (1, 1, ?) ON CONFLICT (id) DO NOTHING RETURNING revision, data', serialized)
    : await db.get('UPDATE shared_planning SET revision = revision + 1, data = ? WHERE id = 1 AND revision = ? RETURNING revision, data', serialized, revision)
  return saved ? [200, saved] : [409, { error: 'Le planning a été modifié par un autre utilisateur.' }]
}
