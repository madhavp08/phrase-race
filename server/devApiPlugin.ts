import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'
import deepgramHandler from '../api/deepgram-token.ts'
import elevenLabsHandler from '../api/elevenlabs-token.ts'
import summaryHandler from '../api/models/summary.ts'
import openaiHandler from '../api/openai-realtime-token.ts'
import runsHandler from '../api/runs.ts'

type VercelRes = {
  statusCode: number
  status: (code: number) => VercelRes
  json: (body: unknown) => void
  setHeader: (key: string, value: string) => void
}

function vercelRes(res: ServerResponse): VercelRes {
  const wrapper: VercelRes = {
    statusCode: 200,
    status(code: number) {
      wrapper.statusCode = code
      res.statusCode = code
      return wrapper
    },
    setHeader(key: string, value: string) {
      res.setHeader(key, value)
    },
    json(body: unknown) {
      res.statusCode = wrapper.statusCode
      res.setHeader('Content-Type', 'application/json')
      res.setHeader('Cache-Control', 'no-store')
      res.end(JSON.stringify(body))
    },
  }
  return wrapper
}

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => {
      chunks.push(chunk)
    })
    req.on('end', () => {
      if (chunks.length === 0) {
        resolve(undefined)
        return
      }
      const raw = Buffer.concat(chunks).toString('utf8')
      try {
        resolve(JSON.parse(raw))
      } catch {
        resolve(raw)
      }
    })
    req.on('error', reject)
  })
}

function mount(
  server: { middlewares: { use: (path: string, handler: (req: IncomingMessage, res: ServerResponse) => void) => void } },
  path: string,
  handler: (
    req: { method?: string; body?: unknown },
    res: VercelRes,
  ) => Promise<void> | void,
) {
  server.middlewares.use(path, (req, res) => {
    void (async () => {
      const body = await readBody(req)
      await handler({ method: req.method, body }, vercelRes(res))
    })()
  })
}

export function devApiPlugin(): Plugin {
  const attach = (server: {
    middlewares: {
      use: (
        path: string,
        handler: (req: IncomingMessage, res: ServerResponse) => void,
      ) => void
    }
  }) => {
    mount(server, '/api/deepgram-token', deepgramHandler)
    mount(server, '/api/openai-realtime-token', openaiHandler)
    mount(server, '/api/elevenlabs-token', elevenLabsHandler)
    mount(server, '/api/runs', runsHandler)
    mount(server, '/api/models/summary', summaryHandler)
  }

  return {
    name: 'phraserace-dev-api',
    configureServer(server) {
      attach(server)
    },
    configurePreviewServer(server) {
      attach(server)
    },
  }
}
