import react from '@vitejs/plugin-react'
import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'
import { deepgramTokenPlugin } from './server/deepgramTokenPlugin.ts'

export default defineConfig(({ mode }) => {
  // Expose DEEPGRAM_API_KEY to the Vite Node process (not the browser bundle).
  const env = loadEnv(mode, process.cwd(), '')
  if (env.DEEPGRAM_API_KEY) {
    process.env.DEEPGRAM_API_KEY = env.DEEPGRAM_API_KEY
  }

  return {
    plugins: [react(), deepgramTokenPlugin()],
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: './src/test/setup.ts',
    },
  }
})
