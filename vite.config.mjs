import { resolve } from 'node:path'
import { defineConfig, loadEnv } from 'vite'
import { createAuthMiddleware } from './server/auth.mjs'
import { threadsLikesMiddleware } from './server/threads-likes.mjs'

export default defineConfig(({ mode }) => {
  const { SCRAPEATLAS_API_KEY } = loadEnv(mode, process.cwd(), 'SCRAPEATLAS_')
  const likesMiddleware = threadsLikesMiddleware(SCRAPEATLAS_API_KEY)
  function configure(server) {
    const auth = createAuthMiddleware(resolve('.data', 'auth.sqlite'))
    server.middlewares.use(auth.middleware)
    server.middlewares.use(likesMiddleware)
    server.httpServer?.once('close', auth.close)
  }

  return {
    server: {
      fs: { deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/.data/**'] },
    },
    plugins: [{
      name: 'planning-api',
      configureServer: configure,
      configurePreviewServer: configure,
    }],
  }
})
