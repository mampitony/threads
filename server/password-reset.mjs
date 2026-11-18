import nodemailer from 'nodemailer'
import { createHash, randomBytes, scrypt } from 'node:crypto'
import { promisify } from 'node:util'

const derive = promisify(scrypt)
const digest = value => createHash('sha256').update(value).digest('hex')
const genericMessage = 'Si un compte autorisé correspond à cette adresse, un lien de réinitialisation sera envoyé.'
const invalidLink = 'Ce lien est invalide ou expiré. Demande un nouveau lien.'
let hashing = 0

export function createPasswordReset(db, { sendEmail = sendResetEmail } = {}) {
  return async function passwordReset(path, body, ip) {
    if (path.endsWith('/forgot-password')) {
      const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
        return [400, { error: 'Renseigne une adresse e-mail valide.' }]
      }
      const gmailConfigured = process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD
      const configured = process.env.APP_URL && (gmailConfigured
        || (process.env.RESEND_API_KEY && process.env.RESET_EMAIL_FROM))
      if (sendEmail === sendResetEmail && !configured) {
        return [503, { error: 'L’envoi des e-mails de réinitialisation est indisponible.' }]
      }
      const token = randomBytes(32).toString('hex')
      const now = Date.now()
      const target = await db.transaction(async transaction => {
        await transaction.run('DELETE FROM password_reset_limits WHERE expires_at <= ?', now)
        for (const key of ['ip:' + ip, 'email:' + email]) {
          const count = await transaction.get(
            'SELECT count FROM password_reset_limits WHERE key_hash = ?', digest(key))
          if (Number(count?.count ?? 0) >= 5) return null
        }
        for (const key of ['ip:' + ip, 'email:' + email]) {
          await transaction.run(`INSERT INTO password_reset_limits (key_hash, count, expires_at) VALUES (?, 1, ?)
            ON CONFLICT (key_hash) DO UPDATE SET count = password_reset_limits.count + 1`,
          digest(key), now + 15 * 60_000)
        }
        const user = await transaction.get(
          "SELECT id, email FROM users WHERE email = ? AND access IN ('admin', 'approved')", email)
        if (!user) return null
        await transaction.run(`INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES (?, ?, ?)
          ON CONFLICT (user_id) DO UPDATE SET token_hash = excluded.token_hash, expires_at = excluded.expires_at`,
        user.id, digest(token), now + 30 * 60_000)
        return user
      })
      if (target) {
        try {
          await sendEmail(target.email, token)
        } catch {
          await db.run('DELETE FROM password_resets WHERE token_hash = ?', digest(token))
          return [503, { error: 'L’envoi est temporairement indisponible. Réessaie plus tard.' }]
        }
      }
      return [200, { message: genericMessage }]
    }

    const token = body?.token
    const password = body?.password
    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return [400, { error: invalidLink }]
    if (typeof password !== 'string' || password.length < 12 || password.length > 128) {
      return [400, { error: 'Utilise un mot de passe de 12 à 128 caractères.' }]
    }
    const tokenHash = digest(token)
    const existing = await db.get('SELECT user_id FROM password_resets WHERE token_hash = ? AND expires_at > ?',
      tokenHash, Date.now())
    if (!existing) return [400, { error: invalidLink }]
    if (hashing >= 2) return [429, { error: 'Le service est occupé. Réessaie dans quelques instants.' }]
    hashing++
    try {
      const salt = randomBytes(16)
      const hash = await derive(password, salt, 64, { N: 131072, r: 8, p: 1, maxmem: 160 * 1024 * 1024 })
      const saved = await db.transaction(async transaction => {
        const reset = await transaction.get(`SELECT r.user_id FROM password_resets r
          JOIN users u ON u.id = r.user_id WHERE r.token_hash = ? AND r.expires_at > ?
          AND u.access IN ('admin', 'approved')`, tokenHash, Date.now())
        if (!reset) return false
        await transaction.run('UPDATE users SET salt = ?, hash = ? WHERE id = ?', salt, hash, reset.user_id)
        await transaction.run('DELETE FROM sessions WHERE user_id = ?', reset.user_id)
        await transaction.run('DELETE FROM password_resets WHERE user_id = ?', reset.user_id)
        return true
      })
      return saved ? [200, { message: 'Mot de passe modifié. Tu peux maintenant te connecter.' }]
        : [400, { error: invalidLink }]
    } finally {
      hashing--
    }
  }
}

async function sendResetEmail(email, token) {
  const url = new URL(process.env.APP_URL)
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Invalid application URL')
  url.pathname = '/'
  url.search = ''
  url.hash = 'reset-password=' + token
  const message = {
    to: email,
    subject: 'Réinitialiser ton mot de passe · Gestion de publications',
    text: 'Pour choisir un nouveau mot de passe, ouvre ce lien valable 30 minutes et utilisable une seule fois.\n\n'
      + url.href + '\n\nSi tu n’as pas demandé ce changement, tu peux ignorer cet e-mail.',
  }
  if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: {
        user: process.env.GMAIL_USER.trim(),
        pass: process.env.GMAIL_APP_PASSWORD.replace(/\s/g, ''),
      },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    })
    await transporter.sendMail({ ...message, from: process.env.GMAIL_USER.trim() })
    return
  }
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...message, from: process.env.RESET_EMAIL_FROM }),
    signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) throw new Error('Email delivery failed')
}
