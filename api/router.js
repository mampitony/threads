import handler from '../server/vercel-api.mjs'

export default function router(req, res) {
  const url = new URL(req.url, 'https://panel.invalid')
  const path = url.searchParams.get('__path') ?? req.query?.__path

  if (typeof path === 'string') {
    if (!/^[a-z-]+(?:\/[a-z-]+)*$/.test(path)) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      return res.end(JSON.stringify({ error: 'Route invalide.' }))
    }
    url.pathname = '/api/' + path
    url.searchParams.delete('__path')
    req.url = url.pathname + url.search
  }

  return handler(req, res)
}
