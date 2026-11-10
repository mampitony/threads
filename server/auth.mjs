import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
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

function cookie(req, token, age) {
  const secure = req.socket.encrypted ? '; Secure' : ''
  return `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${secure}`
}

async function readJson(req) {
  const buffers = []
  let size = 0
  for await (const chunk of req.iterator({ destroyOnReturn: false })) {
    size += chunk.length
    if (size > 4096) {
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

export function createAuthMiddleware(databasePath) {
  mkdirSync(dirname(databasePath), { recursive: true, mode: 0o700 })
  const db = new DatabaseSync(databasePath)
  db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 3000;
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, salt BLOB NOT NULL, hash BLOB NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires_at INTEGER NOT NULL
    );
  `)
  db.exec('PRAGMA foreign_keys = OFF; BEGIN IMMEDIATE')
  try {
    const users = db.prepare("SELECT sql FROM sqlite_schema WHERE type = 'table' AND name = 'users'").get()
    if (!users.sql.includes("'refused'")) {
      const hasAccess = db.prepare('PRAGMA table_info(users)').all().some(column => column.name === 'access')
      const access = hasAccess ? 'access'
        : "CASE WHEN rowid = (SELECT MIN(rowid) FROM users) THEN 'admin' ELSE 'pending' END"
      db.exec(`
        CREATE TABLE users_with_roles (
          id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, salt BLOB NOT NULL, hash BLOB NOT NULL,
          access TEXT NOT NULL CHECK (access IN ('admin', 'approved', 'pending', 'refused'))
        );
        INSERT INTO users_with_roles (id, email, salt, hash, access)
          SELECT id, email, salt, hash, ${access} FROM users ORDER BY rowid;
        DROP TABLE users;
        ALTER TABLE users_with_roles RENAME TO users;
        DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE access = 'pending');
      `)
      if (db.prepare('PRAGMA foreign_key_check').get()) throw new Error('Migration des comptes invalide.')
    }
    db.exec('COMMIT; PRAGMA foreign_keys = ON')
  } catch (error) {
    db.exec('ROLLBACK')
    db.close()
    throw error
  }

  const findUser = db.prepare('SELECT id, email, salt, hash, access FROM users WHERE email = ?')
  const findSession = db.prepare(`SELECT users.id, users.email, users.access, sessions.expires_at FROM sessions
    JOIN users ON users.id = sessions.user_id
    WHERE token_hash = ? AND expires_at > ? AND users.access IN ('admin', 'approved')`)
  const addUser = db.prepare(`INSERT INTO users (id, email, salt, hash, access)
    VALUES (?, ?, ?, ?, CASE WHEN EXISTS(SELECT 1 FROM users) THEN 'pending' ELSE 'admin' END)
    ON CONFLICT(email) DO NOTHING RETURNING id, email, access`)
  const listAccounts = db.prepare('SELECT id, email, access FROM users ORDER BY rowid')
  const findAccess = db.prepare('SELECT access FROM users WHERE id = ?')
  const adminCount = db.prepare("SELECT count(*) AS total FROM users WHERE access = 'admin'")
  const setAccess = db.prepare('UPDATE users SET access = ? WHERE id = ?')
  const revokeSessions = db.prepare('DELETE FROM sessions WHERE user_id = ?')
  const firstUser = db.prepare('SELECT id FROM users ORDER BY rowid LIMIT 1')
  const addSession = db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)')
  const deleteSession = db.prepare('DELETE FROM sessions WHERE token_hash = ?')
  const deleteExpired = db.prepare('DELETE FROM sessions WHERE expires_at <= ?')
  const attempts = new Map()
  const dummySalt = randomBytes(saltSize)
  let deriving = 0

  function publicSession(user, expiresAt) {
    return { id: user.id, email: user.email, firstAccount: user.id === firstUser.get()?.id, isAdmin: user.access === 'admin', expiresAt }
  }

  async function handle(req, res, next) {
    const requestPath = req.url ?? '/'
    if (!requestPath.startsWith('/')) return next()
    const { pathname: path } = new URL('http://localhost' + requestPath)
    if (!path.startsWith('/api/')) return next()
    const token = sessionToken(req)
    const hashedToken = token ? digest(token) : null
    const session = hashedToken ? findSession.get(hashedToken, Date.now()) : null

    if (!path.startsWith('/api/auth/')) {
      if (req.headers['sec-fetch-site'] && req.headers['sec-fetch-site'] !== 'same-origin') {
        return json(res, 403, { error: 'Requête non autorisée.' })
      }
      if (!session) return json(res, 401, { error: 'Connecte-toi pour accéder au panneau.' })
      return next()
    }
    if (path === '/api/auth/session' && req.method === 'GET') {
      return json(res, 200, { user: session ? publicSession(session, session.expires_at) : null })
    }
    const origin = req.headers.origin
    const expectedOrigin = (req.socket.encrypted ? 'https://' : 'http://') + req.headers.host
    const fetchSite = req.headers['sec-fetch-site']
    const trustedRequest = req.headers['x-planning-auth'] === '1'
      && (!fetchSite || fetchSite === 'same-origin')
      && (!origin || origin === expectedOrigin || fetchSite === 'same-origin')

    if (path === '/api/auth/accounts') {
      if (!session) return json(res, 401, { error: 'Connecte-toi pour accéder au panneau.' })
      if (session.access !== 'admin' || !trustedRequest) {
        return json(res, 403, { error: 'Accès réservé aux administrateurs.' })
      }
      if (req.method === 'GET') return json(res, 200, { accounts: listAccounts.all() })
      if (req.method !== 'PATCH') return json(res, 405, { error: 'Méthode non autorisée.' })

      const body = await readJson(req)
      if (typeof body?.id !== 'string' || !/^[a-f0-9-]{36}$/.test(body.id)
        || !accessStates.includes(body.previous) || !['admin', 'approved', 'refused'].includes(body.access)
        || (body.access === 'refused' && body.previous !== 'pending')) {
        return json(res, 400, { error: 'Modification de compte invalide.' })
      }

      db.exec('BEGIN IMMEDIATE')
      try {
        let status = 200
        let result = { accounts: [] }
        if (findSession.get(hashedToken, Date.now())?.access !== 'admin') {
          status = 403
          result = { error: 'Tu n’as plus les droits d’administration.' }
        } else if (findAccess.get(body.id)?.access !== body.previous) {
          status = 409
          result = { error: 'Ce compte a changé. Actualise la liste.' }
        } else if (body.previous === 'admin' && body.access !== 'admin' && adminCount.get().total <= 1) {
          status = 409
          result = { error: 'Le dernier administrateur doit conserver son rôle.' }
        } else {
          setAccess.run(body.access, body.id)
          if (body.access === 'refused') revokeSessions.run(body.id)
          result = { accounts: listAccounts.all() }
        }
        db.exec('COMMIT')
        return json(res, status, result)
      } catch (error) {
        db.exec('ROLLBACK')
        throw error
      }
    }

    if (req.method !== 'POST' || !['/api/auth/register', '/api/auth/login', '/api/auth/logout'].includes(path)) {
      return json(res, 404, { error: 'Route inconnue.' })
    }
    if (!trustedRequest) return json(res, 403, { error: 'Requête non autorisée.' })
    if (path === '/api/auth/logout') {
      if (hashedToken) deleteSession.run(hashedToken)
      res.setHeader('Set-Cookie', cookie(req, '', 0))
      return json(res, 200, { user: null })
    }

    const now = Date.now()
    for (const [ip, attempt] of attempts) if (attempt.until <= now) attempts.delete(ip)
    const ip = req.socket.remoteAddress ?? 'local'
    const attempt = attempts.get(ip) ?? { count: 0, until: now + authWindow }
    if (attempt.count >= 12 || deriving >= 2) {
      return json(res, 429, { error: 'Trop de tentatives. Patiente avant de réessayer.' })
    }
    attempt.count++
    attempts.set(ip, attempt)

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

    const existing = register ? null : findUser.get(email)
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
      user = addUser.get(randomUUID(), email, salt, hash)
      if (!user) {
        return json(res, 409, { error: 'Impossible de créer ce compte. Essaie de te connecter ou utilise un autre e-mail.' })
      }
      if (user.access === 'pending') return json(res, 201, { user: null, pending: true })
    } else if (!user || !timingSafeEqual(hash, user.hash)) {
      return json(res, 401, { error: invalidCredentials })
    } else {
      user.access = findAccess.get(user.id).access
      if (user.access === 'pending' || user.access === 'refused') {
        return json(res, 403, { error: user.access === 'pending'
          ? 'Ton compte attend l’approbation d’un administrateur.'
          : 'Ta demande d’accès a été refusée.' })
      }
    }

    deleteExpired.run(now)
    if (hashedToken) deleteSession.run(hashedToken)
    const newToken = randomBytes(32).toString('hex')
    const expiresAt = Date.now() + sessionSeconds * 1000
    addSession.run(digest(newToken), user.id, expiresAt)
    res.setHeader('Set-Cookie', cookie(req, newToken, sessionSeconds))
    return json(res, register ? 201 : 200, { user: publicSession(user, expiresAt) })
  }

  return {
    middleware(req, res, next) {
      handle(req, res, next).catch(() => {
        if (!res.headersSent) json(res, 500, { error: 'Le service de connexion est indisponible.' })
        else res.end()
      })
    },
    close: () => db.close(),
  }
}
