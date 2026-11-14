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
    if (response.status === 429) throw Object.assign(new Error('Threads limite temporairement les demandes.'), { status: 429 })
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

function postImageUrl(post) {
  const media = Array.isArray(post.carousel_media) && post.carousel_media.length
    ? post.carousel_media : [post]
  for (const item of media) {
    const candidates = item?.image_versions2?.candidates
    if (!Array.isArray(candidates)) continue
    for (const candidate of candidates) {
      if (typeof candidate?.url !== 'string') continue
      try {
        const url = new URL(candidate.url)
        const isMediaHost = /(^|\.)(cdninstagram\.com|fbcdn\.net)$/i.test(url.hostname)
        if (isMediaHost && url.protocol === 'https:' && !url.username && !url.password && !url.port) {
          return url.href
        }
      } catch {
        // Try the next candidate if the URL is malformed.
      }
    }
  }
  return null
}

function publicPostFields(html, code) {
  let caption = null
  let author = null
  let likes = null
  let comments = null
  let publishedOn = null
  for (const script of html.matchAll(/<script\b[^>]*\btype=["']application\/json["'][^>]*>([\s\S]*?)<\/script\s*>/gi)) {
    if (!script[1].includes(code)) continue
    let root
    try { root = JSON.parse(script[1]) } catch { continue }
    const pending = [root]
    while (pending.length) {
      const item = pending.pop()
      if (!item || typeof item !== 'object') continue
      if (item.code === code || item.shortcode === code) {
        if (Number.isSafeInteger(item.like_count) && item.like_count >= 0) likes ??= item.like_count
        if (typeof item.caption?.text === 'string') caption ??= item.caption.text.trim() || null
        if (typeof item.user?.username === 'string') author ??= item.user.username.trim() || null
        const replyCount = item.text_post_app_info?.direct_reply_count
        if (Number.isSafeInteger(replyCount) && replyCount >= 0) comments ??= replyCount
        if (Number.isSafeInteger(item.taken_at) && item.taken_at > 0 && item.taken_at < 253402300800) {
          publishedOn ??= new Intl.DateTimeFormat('sv-SE', { timeZone: 'Indian/Antananarivo' })
            .format(new Date(item.taken_at * 1000))
        }
        if (likes !== null && comments !== null && publishedOn !== null && caption !== null && author !== null) return { likes, comments, publishedOn, caption, author }
      }
      for (const value of Object.values(item)) {
        if (value && typeof value === 'object') pending.push(value)
      }
    }
  }
  return { likes, comments, publishedOn, caption, author }
}

async function readPublicPost(post, fetcher) {
  const signal = AbortSignal.timeout(6000)
  let url = post.url
  for (let hops = 0; hops < 3; hops++) {
    const response = await fetcher(url, { redirect: 'manual', signal, headers: { Accept: 'text/html' } })
    if (response.status === 429) {
      await response.body?.cancel()
      return null
    }
    if (redirectStatuses.has(response.status)) {
      await response.body?.cancel()
      const location = response.headers.get('location')
      const next = location ? parseThreadsLink(location, url) : null
      if (next?.code !== post.code) break
      url = next.url
      continue
    }
    if (!response.ok || !response.body) {
      await response.body?.cancel()
      break
    }
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let html = ''
    let bytes = 0
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) return publicPostFields(html + decoder.decode(), post.code)
        bytes += value.byteLength
        if (bytes > 6_000_000) return publicPostFields(html, post.code)
        html += decoder.decode(value, { stream: true })
      }
    } finally {
      await reader.cancel().catch(() => {})
      reader.releaseLock()
    }
  }
  return { likes: null, comments: null, publishedOn: null }
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
      } catch (error) {
        if (error?.status === 429) return reply(response, 429, { error: 'Threads limite temporairement les demandes. Réessaie plus tard.' })
        post = null
      }
      if (!post) {
        return reply(response, 422, {
          error: 'Ce lien de partage ne mène pas à une publication publique accessible. Ouvre-le dans ton navigateur et copie l’adresse directe de la publication.',
        })
      }
    }

    if (resolveOnly) return reply(response, 200, { url: post.url.href })
    if (incoming.searchParams.get('public') === '1') {
      const fields = await readPublicPost(post, fetcher).catch(() => ({ likes: null, comments: null, publishedOn: null }))
      if (!fields) return reply(response, 429, { error: 'Threads limite temporairement les demandes. Réessaie plus tard.' })
      const author = ('author' in fields && fields.author) || post.url.pathname.split('/')[1].slice(1)
      return reply(response, 200, { url: post.url.href, ...fields, author })
    }
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
      const imageUrl = postImageUrl(source)
      if (likes === null && comments === null && !caption && !author && !imageUrl) {
        return reply(response, 502, { error: 'Les données de cette publication sont indisponibles.' })
      }
      return reply(response, 200, { likes, comments, caption: caption || null, author, imageUrl })
    } catch {
      return reply(response, 502, { error: 'Impossible de récupérer les données de la publication. Réessaie ou complète les champs manuellement.' })
    }
  }
}
