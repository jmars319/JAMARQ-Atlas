import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { atlasApiMiddleware } from './server/apiServer'

function loadServerEnv(mode: string) {
  const env = loadEnv(mode, process.cwd(), '')

  for (const [key, value] of Object.entries(env)) {
    process.env[key] ??= value
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  loadServerEnv(mode)

  return {
    plugins: [
      react(),
      {
        name: 'jamarq-atlas-github-api',
        configureServer(server) {
          server.middlewares.use((request, response, next) =>
            atlasApiMiddleware(request, response, next),
          )
        },
        configurePreviewServer(server) {
          server.middlewares.use((request, response, next) =>
            atlasApiMiddleware(request, response, next),
          )
        },
      },
    ],
  }
})
