import pg from 'pg'

function queries(connection) {
  function query(sql, params) {
    let index = 0
    return connection.query(sql.replace(/\?/g, () => '$' + ++index), params)
  }
  return {
    get: async (sql, ...params) => (await query(sql, params)).rows[0],
    all: async (sql, ...params) => (await query(sql, params)).rows,
    run: (sql, ...params) => query(sql, params),
  }
}

export function openPostgresAuth(connectionString) {
  const pool = new pg.Pool({
    connectionString, max: 3, idleTimeoutMillis: 5000, connectionTimeoutMillis: 5000,
  })
  pool.on('error', error => console.error('Connexion PostgreSQL inactive interrompue:', error.code))
  return {
    ...queries(pool),
    async transaction(work) {
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        // Serialize account changes across function instances.
        await client.query('LOCK TABLE users IN SHARE ROW EXCLUSIVE MODE')
        const result = await work(queries(client))
        await client.query('COMMIT')
        return result
      } catch (error) {
        await client.query('ROLLBACK')
        throw error
      } finally {
        client.release()
      }
    },
    async takeAttempt(key, now, interval) {
      await pool.query('DELETE FROM auth_attempts WHERE expires_at <= $1', [now])
      const result = await pool.query(`
        INSERT INTO auth_attempts (address_hash, count, expires_at) VALUES ($1, 1, $2)
        ON CONFLICT (address_hash) DO UPDATE SET count = auth_attempts.count + 1
        WHERE auth_attempts.count < 12 RETURNING count
      `, [key, now + interval])
      return result.rowCount === 1
    },
    close: () => pool.end(),
  }
}
