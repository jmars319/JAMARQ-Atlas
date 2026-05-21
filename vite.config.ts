import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { dispatchApiMiddleware } from './server/dispatchApi'
import { githubAuthApiMiddleware } from './server/githubAuth'
import { githubApiMiddleware } from './server/githubApi'
import { githubWriteApiMiddleware } from './server/githubWriteApi'
import { localGitApiMiddleware } from './server/localGitApi'
import { syncApiMiddleware } from './server/syncApi'
import { vercelApiMiddleware } from './server/vercelApi'
import { writingApiMiddleware } from './server/writingApi'

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
          server.middlewares.use((request, response, next) => {
            void dispatchApiMiddleware(request, response, () => {
              void vercelApiMiddleware(request, response, () => {
                void githubAuthApiMiddleware(request, response, () => {
                  void githubWriteApiMiddleware(request, response, () => {
                    void githubApiMiddleware(request, response, () => {
                      void localGitApiMiddleware(request, response, () => {
                        void syncApiMiddleware(request, response, () => {
                          void writingApiMiddleware(request, response, next)
                        })
                      })
                    })
                  })
                })
              })
            })
          })
        },
        configurePreviewServer(server) {
          server.middlewares.use((request, response, next) => {
            void dispatchApiMiddleware(request, response, () => {
              void vercelApiMiddleware(request, response, () => {
                void githubAuthApiMiddleware(request, response, () => {
                  void githubWriteApiMiddleware(request, response, () => {
                    void githubApiMiddleware(request, response, () => {
                      void localGitApiMiddleware(request, response, () => {
                        void syncApiMiddleware(request, response, () => {
                          void writingApiMiddleware(request, response, next)
                        })
                      })
                    })
                  })
                })
              })
            })
          })
        },
      },
    ],
  }
})
