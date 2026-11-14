import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

export function openSqliteAuth(databasePath) {
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


  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_profiles (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      display_name TEXT NOT NULL,
      photo TEXT NOT NULL
    )
  `)

  db.exec(`CREATE TABLE IF NOT EXISTS agency_branding (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  logo TEXT NOT NULL
);`)

  const sqlite = {
    get: (sql, ...params) => db.prepare(sql).get(...params),
    all: (sql, ...params) => db.prepare(sql).all(...params),
    run: (sql, ...params) => db.prepare(sql).run(...params),
  }
  let queue = Promise.resolve()
  function serialize(work) {
    const task = queue.then(work)
    queue = task.catch(() => {})
    return task
  }
  return {
    get: (...args) => serialize(() => sqlite.get(...args)),
    all: (...args) => serialize(() => sqlite.all(...args)),
    run: (...args) => serialize(() => sqlite.run(...args)),
    transaction: work => serialize(async () => {
      db.exec('BEGIN IMMEDIATE')
      try {
        const result = await work(sqlite)
        db.exec('COMMIT')
        return result
      } catch (error) {
        db.exec('ROLLBACK')
        throw error
      }
    }),
    close: () => serialize(() => db.close()),
  }
}
