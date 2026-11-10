import { createAuthMiddleware } from './auth.mjs'
import { openPostgresAuth } from './auth-postgres.mjs'
import { threadsLikesMiddleware } from './threads-likes.mjs'

let auth
const threads = threadsLikesMiddleware(process.env.SCRAPEATLAS_API_KEY, fetch, true)

export default function handler(req, res) {
  if (!process.env.DATABASE_URL) {
    res.writeHead(503, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
    return res.end(JSON.stringify({ error: 'Configure DATABASE_URL dans Vercel.' }))
  }
  auth ??= createAuthMiddleware(openPostgresAuth(process.env.DATABASE_URL), {
    secureOnly: true,
    bootstrapEmail: process.env.ADMIN_EMAIL?.trim().toLowerCase(),
    bootstrapCode: process.env.ADMIN_SETUP_CODE,
  })
  const notFound = () => {
    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Route inconnue.' }))
  }
  return auth.middleware(req, res, () => threads(req, res, notFound))
}
