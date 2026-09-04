import react from '@vitejs/plugin-react'
import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'
import { devApiPlugin } from './server/devApiPlugin.ts'

const SERVER_KEYS = [
  'DEEPGRAM_API_KEY',
  'OPENAI_API_KEY',
  'ELEVENLABS_API_KEY',
  'DATABASE_URL',
  'POSTGRES_URL',
  'NEON_DATABASE_URL',
] as const

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  for (const key of SERVER_KEYS) {
    if (env[key]) process.env[key] = env[key]
  }

  return {
    plugins: [react(), devApiPlugin()],
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: './src/test/setup.ts',
      coverage: {
        provider: 'v8',
        include: ['src/core/**/*.ts', 'src/speech/**/*.ts'],
        exclude: [
          'src/speech/useSpeechRecognition.ts',
          'src/**/*.test.ts',
        ],
        reporter: ['text', 'json-summary'],
      },
    },
  }
})
