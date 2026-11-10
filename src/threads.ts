const threadsHost = /^(www\.)?threads\.(com|net)$/

export function threadsLink(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && threadsHost.test(url.hostname) ? url : null
  } catch {
    return null
  }
}

export function publicationKey(value: string) {
  const threads = threadsLink(value)
  if (threads) {
    const code = /^\/@[\w.]+\/post\/([\w-]+)\/?$/.exec(threads.pathname)?.[1]
    if (code) return 'threads:post:' + code
    const share = /^\/share\/([\w-]+)\/?$/.exec(threads.pathname)?.[1]
    if (share) return 'threads:share:' + share
  }

  const url = new URL(value)
  url.hash = ''
  return url.href
}

export async function lookupThreads(url: string, resolveOnly = false, signal?: AbortSignal) {
  const query = new URLSearchParams({ url })
  if (resolveOnly) query.set('resolve', '1')
  const response = await fetch('/api/threads-likes?' + query, {
    headers: { 'x-threads-lookup': '1' },
    signal,
  })
  const result: {
    url?: string
    likes?: number | null
    comments?: number | null
    caption?: string | null
    author?: string | null
    error?: string
  } = await response.json()
  if (response.status === 401) window.dispatchEvent(new Event('planning-session-expired'))
  if (!response.ok) throw new Error(result.error || 'Les données Threads sont indisponibles.')
  return result
}

export async function canonicalPublication(value: string) {
  if (!publicationKey(value).startsWith('threads:share:')) return value
  const { url } = await lookupThreads(value, true)
  if (!url || !publicationKey(url).startsWith('threads:post:')) {
    throw new Error('Ouvre le lien de partage et colle l’adresse directe du post Threads.')
  }
  return url
}
