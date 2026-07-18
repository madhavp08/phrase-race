import cors from 'cors'
import dotenv from 'dotenv'
import express from 'express'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { grantDeepgramToken } from './token.ts'

dotenv.config()

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const port = Number(process.env.PORT) || 3001
const apiKey = process.env.DEEPGRAM_API_KEY?.trim()

const app = express()
app.use(cors())
app.use(express.json())

app.post('/api/deepgram-token', async (_req, res) => {
  if (!apiKey) {
    res.status(500).json({
      error:
        'DEEPGRAM_API_KEY is not set. Add it to .env and restart the server.',
    })
    return
  }

  try {
    const token = await grantDeepgramToken(apiKey)
    res.json(token)
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to grant Deepgram token'
    console.error(message)
    res.status(502).json({ error: message })
  }
})

const isProd = process.env.NODE_ENV === 'production'
if (isProd) {
  const distDir = path.join(rootDir, 'dist')
  app.use(express.static(distDir))
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(path.join(distDir, 'index.html'))
  })
}

app.listen(port, () => {
  console.log(
    `PhraseRace API listening on http://localhost:${port}` +
      (isProd ? ' (serving dist/)' : ''),
  )
  if (!apiKey) {
    console.warn('Warning: DEEPGRAM_API_KEY is not set')
  }
})
