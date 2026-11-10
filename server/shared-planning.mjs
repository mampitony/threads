const text = value => typeof value === 'string'
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const count = value => Number.isSafeInteger(value) && value >= 0
const optionalCount = value => value === undefined || count(value)
const webLink = value => {
  try { return text(value) && ['http:', 'https:'].includes(new URL(value).protocol) }
  catch { return false }
}

function validPlanning(data) {
  return object(data)
    && Array.isArray(data.accounts) && data.accounts.every(item =>
      object(item) && text(item.id) && text(item.name) && text(item.handle)
      && (item.modelId === undefined || text(item.modelId)))
    && Array.isArray(data.models) && data.models.every(item => object(item) && text(item.id) && text(item.name))
    && object(data.posts) && Object.values(data.posts).every(item =>
      object(item) && text(item.count) && text(item.caption) && text(item.url) && text(item.owner)
      && optionalCount(item.likes) && optionalCount(item.comments))
    && Array.isArray(data.references) && data.references.every(item =>
      object(item) && text(item.id) && text(item.caption) && text(item.author) && webLink(item.url)
      && count(item.reactions) && text(item.agent))
    && Array.isArray(data.captionUses) && data.captionUses.every(item =>
      object(item) && text(item.referenceId) && text(item.accountId) && text(item.modelId) && text(item.modelName))
}

export async function readSharedPlanning(db) {
  return await db.get('SELECT revision, data FROM shared_planning WHERE id = 1')
    ?? { revision: 0, data: null }
}

export async function writeSharedPlanning(db, body) {
  const { revision, data } = body ?? {}
  if (!count(revision) || revision >= 2147483647 || !validPlanning(data)) {
    return [400, { error: 'Données de planning invalides ou trop volumineuses.' }]
  }
  const serialized = JSON.stringify(data)
  const saved = revision === 0
    ? await db.get('INSERT INTO shared_planning (id, revision, data) VALUES (1, 1, ?) ON CONFLICT (id) DO NOTHING RETURNING revision, data', serialized)
    : await db.get('UPDATE shared_planning SET revision = revision + 1, data = ? WHERE id = 1 AND revision = ? RETURNING revision, data', serialized, revision)
  return saved ? [200, saved] : [409, { error: 'Le planning a été modifié par un autre utilisateur.' }]
}
