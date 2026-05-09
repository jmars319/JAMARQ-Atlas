import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { githubApiMiddleware } from './server/githubApi'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'jamarq-atlas-github-api',
      configureServer(server) {
        server.middlewares.use((request, response, next) => {
          void githubApiMiddleware(request, response, next)
        })
      },
      configurePreviewServer(server) {
        server.middlewares.use((request, response, next) => {
          void githubApiMiddleware(request, response, next)
        })
      },
    },
  ],
})
