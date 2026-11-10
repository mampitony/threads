const threadsHosts = new Set(['threads.com', 'www.threads.com', 'threads.net', 'www.threads.net'])
const postPath = /^\/@[\w.]+\/post\/([\w-]+)\/?$/
const sharePath = /^\/share\/[\w-]+\/?$/
const redirectStatuses = new Set([301, 302, 303, 307, 308])

function parseThreadsLink(input, base) {
  if (!input || input.length > 2000) return null
  try {
    const url = new URL(input.trim(), base)
    if (!threadsHosts.has(url.hostname) || url.protocol !== 'https:' || url.port
      || url.username || url.password) return null

    const code = postPath.exec(url.pathname)?.[1]
    if (!code && !sharePath.test(url.pathname)) return null
    url.search = ''
    url.hash = ''
    return { url, code }
  } catch {
    return null
  }
}

async function resolveSharedPost(post, fetcher) {
  const signal = AbortSignal.timeout(8000)
  for (let hops = 0; hops < 4; hops++) {
    const response = await fetcher(post.url, { redirect: 'manual', signal })
    const location = response.headers.get('location')
    await response.body?.cancel()
    if (!redirectStatuses.has(response.status) || !location) return null

    const destination = parseThreadsLink(location, post.url)
    if (!destination || destination.code) return destination
    post = destination
  }
  return null
}

function reply(response, status, payload) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  })
  response.end(JSON.stringify(payload))
}

export function threadsLikesMiddleware(apiKey, fetcher = fetch, deployed = false) {
  return async (request, response, next) => {
    const path = request.url ?? '/'
    if (!path.startsWith('/')) return next()
    const incoming = new URL('http://localhost' + path)
    if (incoming.pathname !== '/api/threads-likes') return next()
    if (request.method !== 'GET') {
      response.setHeader('Allow', 'GET')
      return reply(response, 405, { error: 'Méthode non autorisée.' })
    }
    if (request.headers['x-threads-lookup'] !== '1' || request.headers['sec-fetch-site'] === 'cross-site') {
      return reply(response, 403, { error: 'Requête non autorisée.' })
    }

    const link = parseThreadsLink(incoming.searchParams.get('url'))
    if (!link) return reply(response, 400, { error: 'Colle un lien HTTPS de publication ou de partage Threads.' })
    const resolveOnly = incoming.searchParams.get('resolve') === '1'


    let post = link
    if (!post.code) {
      try {
        post = await resolveSharedPost(link, fetcher)
      } catch {
        post = null
      }
      if (!post) {
        return reply(response, 422, {
          error: 'Ce lien de partage ne mène pas à une publication publique accessible. Ouvre-le dans ton navigateur et copie l’adresse directe de la publication.',
        })
      }
    }

    if (resolveOnly) return reply(response, 200, { url: post.url.href })
    if (!apiKey?.trim()) {
      return reply(response, 503, { error: deployed
        ? 'Ajoute SCRAPEATLAS_API_KEY dans les variables Production de Vercel, puis redéploie le projet.'
        : 'Configure SCRAPEATLAS_API_KEY dans .env.local, puis redémarre le serveur.' })
    }

    const endpoint = new URL('https://api.scrapeatlas.com/v1/threads/post')
    endpoint.search = new URLSearchParams({ url: post.url.href, trim: 'false', include_comments: 'false' })
    try {
      const upstream = await fetcher(endpoint, {
        headers: { 'x-api-key': apiKey.trim(), Accept: 'application/json' },
        signal: AbortSignal.timeout(20000),
        redirect: 'error',
      })
      if (upstream.status === 401) {
        return reply(response, 502, { error: 'ScrapeAtlas a refusé l’accès. Vérifie ta clé et tes permissions.' })
      }
      if (upstream.status === 402 || upstream.status === 429) {
        return reply(response, 503, { error: 'Vérifie les crédits ou les limites de ton compte ScrapeAtlas, ou complète les champs manuellement.' })
      }
      if (upstream.status === 404 || upstream.status === 403) {
        return reply(response, 404, { error: 'Cette publication Threads est introuvable ou inaccessible.' })
      }
      if (!upstream.ok) {
        return reply(response, 502, { error: 'ScrapeAtlas est indisponible. Réessaie ou complète les champs manuellement.' })
      }

      const payload = await upstream.json()
      const source = payload?.post
      if (payload?.success !== true || source?.code !== post.code) {
        return reply(response, 502, { error: 'Les données de cette publication sont indisponibles.' })
      }

      const likes = Number.isSafeInteger(source.like_count) && source.like_count >= 0 ? source.like_count : null
      const replyCount = source.text_post_app_info?.direct_reply_count
      const comments = Number.isSafeInteger(replyCount) && replyCount >= 0 ? replyCount : null
      const caption = typeof source.caption?.text === 'string' ? source.caption.text.trim() : ''
      const username = typeof source.user?.username === 'string' ? source.user.username.trim() : ''
      const author = username ? '@' + username.replace(/^@/, '') : null
      if (likes === null && comments === null && !caption && !author) {
        return reply(response, 502, { error: 'Les données de cette publication sont indisponibles.' })
      }
      return reply(response, 200, { likes, comments, caption: caption || null, author })
    } catch {
      return reply(response, 502, { error: 'Impossible de récupérer les données de la publication. Réessaie ou complète les champs manuellement.' })
    }
  }
}
