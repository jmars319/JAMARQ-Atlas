import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { dispatchApiMiddleware } from './server/dispatchApi'
import { githubApiMiddleware } from './server/githubApi'
import { syncApiMiddleware } from './server/syncApi'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'jamarq-atlas-github-api',
      configureServer(server) {
        server.middlewares.use((request, response, next) => {
          void dispatchApiMiddleware(request, response, () => {
            void githubApiMiddleware(request, response, () => {
              void syncApiMiddleware(request, response, next)
            })
          })
        })
      },
      configurePreviewServer(server) {
        server.middlewares.use((request, response, next) => {
          void dispatchApiMiddleware(request, response, () => {
            void githubApiMiddleware(request, response, () => {
              void syncApiMiddleware(request, response, next)
            })
          })
        })
      },
    },
  ],
})
