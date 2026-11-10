import { readSharedPlanning, writeSharedPlanning } from './shared-planning.mjs'
import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const derive = promisify(scrypt)
const saltSize = 16
const hashSize = 64
const sessionSeconds = 8 * 60 * 60
const cookieName = 'planning_session'
const authWindow = 15 * 60 * 1000
const accessStates = ['admin', 'approved', 'pending', 'refused']
const invalidCredentials = 'E-mail ou mot de passe incorrect.'

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify(body))
}

function sessionToken(req) {
  const token = (req.headers.cookie ?? '').split(';').map(part => part.trim())
    .find(part => part.startsWith(cookieName + '='))?.slice(cookieName.length + 1)
  return /^[a-f0-9]{64}$/.test(token ?? '') ? token : null
}

function digest(token) {
  return createHash('sha256').update(token).digest('hex')
}

function cookie(req, token, age, secureOnly) {
  const secure = (secureOnly || req.socket?.encrypted) ? '; Secure' : ''
  return `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${secure}`
}

async function readJson(req, limit = 4096) {
  if (req.body !== undefined) {
    const raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body)
    if (!raw || Buffer.byteLength(raw) > limit) return null
    try { return JSON.parse(raw) } catch { return null }
  }
  const buffers = []
  let size = 0
  for await (const chunk of req.iterator({ destroyOnReturn: false })) {
    size += chunk.length
    if (size > limit) {
      req.resume()
      return null
    }
    buffers.push(chunk)
  }
  try {
    return JSON.parse(Buffer.concat(buffers).toString('utf8'))
  } catch {
    return null
  }
}

export function createAuthMiddleware(db, { secureOnly = false, bootstrapEmail = '', bootstrapCode = '' } = {}) {

  const usersByEmail = 'SELECT id, email, salt, hash, access FROM users WHERE email = ?'
  const sessionQuery = `SELECT users.id, users.email, users.access, sessions.expires_at FROM sessions
    JOIN users ON users.id = sessions.user_id
    WHERE token_hash = ? AND expires_at > ? AND users.access IN ('admin', 'approved')`
  const accountsQuery = 'SELECT id, email, access FROM users ORDER BY rowid'
  const firstQuery = 'SELECT id FROM users ORDER BY rowid LIMIT 1'
  const attempts = new Map()
  const dummySalt = randomBytes(saltSize)
  let deriving = 0

  async function publicSession(user, expiresAt) {
    return { id: user.id, email: user.email, firstAccount: user.id === (await db.get(firstQuery))?.id, isAdmin: user.access === 'admin', sharedPlanning: secureOnly, expiresAt: Number(expiresAt) }
  }

  async function handle(req, res, next) {
    const requestPath = req.url ?? '/'
    if (!requestPath.startsWith('/')) return next()
    const { pathname: path } = new URL('http://localhost' + requestPath)
    if (!path.startsWith('/api/')) return next()
    const token = sessionToken(req)
    const hashedToken = token ? digest(token) : null
    const session = hashedToken ? await db.get(sessionQuery, hashedToken, Date.now()) : null

    const origin = req.headers.origin
    const expectedOrigin = ((secureOnly || req.socket?.encrypted) ? 'https://' : 'http://') + req.headers.host
    const fetchSite = req.headers['sec-fetch-site']
    const trustedRequest = req.headers['x-planning-auth'] === '1'
      && (!fetchSite || fetchSite === 'same-origin')
      && (!origin || origin === expectedOrigin || fetchSite === 'same-origin')

    if (secureOnly && path === '/api/planning') {
      if (!session) return json(res, 401, { error: 'Connecte-toi pour accéder au panneau.' })
      if (!trustedRequest) return json(res, 403, { error: 'Requête non autorisée.' })
      try {
        if (req.method === 'GET') return json(res, 200, await readSharedPlanning(db))
        if (req.method !== 'PUT') return json(res, 405, { error: 'Méthode non autorisée.' })
        if (req.headers['content-type']?.split(';')[0] !== 'application/json') {
          return json(res, 400, { error: 'Format du planning invalide.' })
        }
        const body = await readJson(req, 2 * 1024 * 1024)
        const [status, result] = await writeSharedPlanning(db, body)
        return json(res, status, result)
      } catch (error) {
        if (error?.code === '42P01') {
          return json(res, 503, { error: 'Exécute server/schema-planning.sql dans Neon pour activer le planning partagé.' })
        }
        throw error
      }
    }

    if (!path.startsWith('/api/auth/')) {
      if (req.headers['sec-fetch-site'] && req.headers['sec-fetch-site'] !== 'same-origin') {
        return json(res, 403, { error: 'Requête non autorisée.' })
      }
      if (!session) return json(res, 401, { error: 'Connecte-toi pour accéder au panneau.' })
      return next()
    }
    if (path === '/api/auth/session' && req.method === 'GET') {
      return json(res, 200, { user: session ? await publicSession(session, session.expires_at) : null })
    }


    if (path === '/api/auth/accounts') {
      if (!session) return json(res, 401, { error: 'Connecte-toi pour accéder au panneau.' })
      if (session.access !== 'admin' || !trustedRequest) {
        return json(res, 403, { error: 'Accès réservé aux administrateurs.' })
      }
      if (req.method === 'GET') return json(res, 200, { accounts: await db.all(accountsQuery) })
      if (req.method !== 'PATCH') return json(res, 405, { error: 'Méthode non autorisée.' })

      const body = await readJson(req)
      if (typeof body?.id !== 'string' || !/^[a-f0-9-]{36}$/.test(body.id)
        || !accessStates.includes(body.previous) || !['admin', 'approved', 'refused'].includes(body.access)
        || (body.access === 'refused' && body.previous !== 'pending')) {
        return json(res, 400, { error: 'Modification de compte invalide.' })
      }

      const [status, result] = await db.transaction(async transaction => {
        const currentSession = await transaction.get(sessionQuery, hashedToken, Date.now())
        if (currentSession?.access !== 'admin') {
          return [403, { error: 'Tu n’as plus les droits d’administration.' }]
        }
        const target = await transaction.get('SELECT access FROM users WHERE id = ?', body.id)
        if (target?.access !== body.previous) {
          return [409, { error: 'Ce compte a changé. Actualise la liste.' }]
        }
        if (body.previous === 'admin' && body.access !== 'admin') {
          const { total } = await transaction.get("SELECT count(*) AS total FROM users WHERE access = 'admin'")
          if (Number(total) <= 1) return [409, { error: 'Le dernier administrateur doit conserver son rôle.' }]
        }
        await transaction.run('UPDATE users SET access = ? WHERE id = ?', body.access, body.id)
        if (body.access === 'refused') await transaction.run('DELETE FROM sessions WHERE user_id = ?', body.id)
        return [200, { accounts: await transaction.all(accountsQuery) }]
      })
      return json(res, status, result)
    }

    if (req.method !== 'POST' || !['/api/auth/register', '/api/auth/login', '/api/auth/logout'].includes(path)) {
      return json(res, 404, { error: 'Route inconnue.' })
    }
    if (!trustedRequest) return json(res, 403, { error: 'Requête non autorisée.' })
    if (path === '/api/auth/logout') {
      if (hashedToken) await db.run('DELETE FROM sessions WHERE token_hash = ?', hashedToken)
      res.setHeader('Set-Cookie', cookie(req, '', 0, secureOnly))
      return json(res, 200, { user: null })
    }

    const now = Date.now()
    for (const [ip, attempt] of attempts) if (attempt.until <= now) attempts.delete(ip)
    const ip = (secureOnly ? req.headers['x-vercel-forwarded-for'] : req.socket?.remoteAddress) ?? 'local'
    if (deriving >= 2) return json(res, 429, { error: 'Trop de tentatives. Patiente avant de réessayer.' })
    if (db.takeAttempt) {
      if (!await db.takeAttempt(digest(String(ip)), now, authWindow)) {
        return json(res, 429, { error: 'Trop de tentatives. Patiente avant de réessayer.' })
      }
    } else {
      const attempt = attempts.get(ip) ?? { count: 0, until: now + authWindow }
      if (attempt.count >= 12) return json(res, 429, { error: 'Trop de tentatives. Patiente avant de réessayer.' })
      attempt.count++
      attempts.set(ip, attempt)
    }

    if (req.headers['content-type']?.split(';')[0] !== 'application/json') {
      return json(res, 400, { error: 'Données de connexion invalides.' })
    }
    const body = await readJson(req)
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
    const password = body?.password
    const register = path === '/api/auth/register'
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || typeof password !== 'string'
      || password.length > 128 || password.length < (register ? 12 : 1)) {
      return json(res, 400, { error: register
        ? 'Indique un e-mail valide et un mot de passe de 12 à 128 caractères.'
        : invalidCredentials })
    }

    const existing = register ? null : await db.get(usersByEmail, email)
    const salt = register ? randomBytes(saltSize) : existing?.salt ?? dummySalt
    if (deriving >= 2) return json(res, 429, { error: 'Trop de tentatives. Patiente avant de réessayer.' })
    deriving++
    let hash
    try {
      hash = await derive(password, salt, hashSize, { N: 131072, r: 8, p: 1, maxmem: 160 * 1024 * 1024 })
    } finally {
      deriving--
    }

    let user = existing
    if (register) {
      const registration = await db.transaction(async transaction => {
        const first = !await transaction.get(firstQuery)
        const code = typeof body.bootstrapCode === 'string' ? body.bootstrapCode : ''
        if (first && secureOnly && (!bootstrapEmail || bootstrapCode.length < 32
          || email !== bootstrapEmail || !timingSafeEqual(Buffer.from(digest(code)), Buffer.from(digest(bootstrapCode))))) {
          return { blocked: true }
        }
        const user = await transaction.get(`INSERT INTO users (id, email, salt, hash, access)
          VALUES (?, ?, ?, ?, ?) ON CONFLICT(email) DO NOTHING RETURNING id, email, access`,
        randomUUID(), email, salt, hash, first ? 'admin' : 'pending')
        return { user }
      })
      if (registration.blocked) {
        return json(res, 403, { error: 'Le premier administrateur doit utiliser l’e-mail et le code d’installation configurés sur le serveur.' })
      }
      user = registration.user
      if (!user) {
        return json(res, 409, { error: 'Impossible de créer ce compte. Essaie de te connecter ou utilise un autre e-mail.' })
      }
      if (user.access === 'pending') return json(res, 201, { user: null, pending: true })
    } else if (!user || !timingSafeEqual(hash, user.hash)) {
      return json(res, 401, { error: invalidCredentials })
    } else {
      user.access = (await db.get('SELECT access FROM users WHERE id = ?', user.id)).access
      if (user.access === 'pending' || user.access === 'refused') {
        return json(res, 403, { error: user.access === 'pending'
          ? 'Ton compte attend l’approbation d’un administrateur.'
          : 'Ta demande d’accès a été refusée.' })
      }
    }

    await db.run('DELETE FROM sessions WHERE expires_at <= ?', now)
    if (hashedToken) await db.run('DELETE FROM sessions WHERE token_hash = ?', hashedToken)
    const newToken = randomBytes(32).toString('hex')
    const expiresAt = Date.now() + sessionSeconds * 1000
    await db.run('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)', digest(newToken), user.id, expiresAt)
    res.setHeader('Set-Cookie', cookie(req, newToken, sessionSeconds, secureOnly))
    return json(res, register ? 201 : 200, { user: await publicSession(user, expiresAt) })
  }

  return {
    middleware(req, res, next) {
      return handle(req, res, next).catch(() => {
        if (!res.headersSent) json(res, 500, { error: 'Le service de connexion est indisponible.' })
        else res.end()
      })
    },
  }
}
