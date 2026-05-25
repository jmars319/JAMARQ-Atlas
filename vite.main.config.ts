import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    rollupOptions: {
      external: ['electron', 'node:sqlite', '@supabase/supabase-js', 'openai', 'ssh2-sftp-client'],
      output: {
        format: 'es',
      },
    },
  },
})
