# PhraseRace

A 16 kHz speech-to-text benchmark that still plays like Monkeytype.

You read a word stream aloud. PhraseRace captures **one** canonical 16 kHz linear16 PCM stream, fans those identical bytes to three STT models, and scores each model independently. Deepgram Nova-3 remains the live gameplay stream (letter coloring, caret, user WPM). OpenAI and ElevenLabs run as shadow evaluators.

PhraseRace measures **recognition**, not pronunciation. If you said the prompt correctly and a model wrote something else, that is a model error.

## What is measured

Two scoreboards stay separate:

- **Your test** — speaking speed (Monkeytype WPM), accuracy, streaks. Feeds the user leaderboard.
- **Model results** — character accuracy, CER, WER, model-adjusted WPM, and per-word / median latency on the same audio.

Latency is **end-to-end UX latency**: time from the last sent PCM chunk to the transcript event arriving in the browser. It is not isolated model inference time. The ~85 ms figure is the ScriptProcessor **audio chunk size** at 48 kHz (`4096 / 48000`), not recognition latency.

OpenAI Realtime expects 24 kHz PCM. PhraseRace upsamples the 16 kHz canonical stream with nearest-neighbor copies so OpenAI does not receive extra acoustic information.

## Models

| Provider | Model | Role |
| --- | --- | --- |
| Deepgram | `nova-3` | Primary live stream + shadow score |
| OpenAI | `gpt-live-transcribe` | Shadow score (24 kHz upsample) |
| ElevenLabs | `scribe_v2_realtime` | Shadow score |

Set `VITE_BENCH_PROVIDERS=deepgram` to develop without burning the other two APIs. Deepgram is always included.

## Stack

- Vite + React 19 + TypeScript
- Web Audio `ScriptProcessor` → 16 kHz linear16 PCM (not MediaRecorder / WebM)
- Short-lived tokens: Deepgram JWT (45s), OpenAI `client_secrets`, ElevenLabs `realtime_scribe`
- Neon Postgres for completed runs (`POST /api/runs`, `GET /api/models/summary`)
- Vitest + `@vitest/coverage-v8` for `src/core` and `src/speech`

Measured (do not invent resume numbers): **89 tests**. `src/core` is **90.6% lines**. Combined `src/core` + `src/speech` is lower because the live WebSocket clients are not fully unit-tested — that is expected.

## Setup

```bash
cp .env.example .env
npm install
npm run dev
```

Server-only env vars (never `VITE_` except the optional provider list):

| Variable | Used by |
| --- | --- |
| `DEEPGRAM_API_KEY` | `POST /api/deepgram-token` |
| `OPENAI_API_KEY` | `POST /api/openai-realtime-token` |
| `ELEVENLABS_API_KEY` | `POST /api/elevenlabs-token` |
| `DATABASE_URL` | `POST /api/runs`, `GET /api/models/summary` |

A missing OpenAI / ElevenLabs key fails that adapter only. The round still runs on Deepgram. A missing `DATABASE_URL` returns 503 from the persist routes; results still show locally.

### Deepgram key permissions

`/auth/grant` needs a key that can mint JWTs (Member, not a restricted usage-only key). Restart `npm run dev` after editing `.env`.

### Neon

Provision a Neon database (Vercel Marketplace → Neon) and paste the connection string as `DATABASE_URL`. Schema is created automatically on first write.

## Deploy

1. Import the GitHub repo in Vercel.
2. Add the env vars above (Production / Preview).
3. Deploy. `api/*.ts` become serverless functions; `vercel.json` serves the Vite SPA for everything except `/api/*`.

Local `npm run dev` mounts the same routes via `server/devApiPlugin.ts`.

## Speech architecture

```
mic (ScriptProcessor 4096 @ device rate)
        ↓
downsample / convert → 16 kHz linear16 PCM
        ↓
        ├── Deepgram Nova-3  (binary WS, 45s JWT)
        ├── OpenAI gpt-live-transcribe (JSON PCM @ 24 kHz)
        └── ElevenLabs Scribe v2 (JSON PCM @ 16 kHz)
                ↓
        normalized TranscriptEvent
                ↓
        ├── primary (Deepgram) → GameEngine.applyLive / applyFinal
        └── shadow evaluators → CER / WER / latency
                ↓
        POST /api/runs  (partial failure is OK)
```

Deepgram listen params (code is source of truth):

- `encoding=linear16`, `sample_rate=16000`, `channels=1`
- `interim_results=true`, `smart_format=true`
- `endpointing=100`, `utterance_end_ms=1000`
- Auth: subprotocols `['bearer', jwt]` (RFC 6455 forbids spaces in one token)

Prompts: shuffled 220-word streams from a 400-word frequency list, plus 20 tongue-twister stress phrases.

## Gameplay shortcuts

- **tab** (idle) → start
- **tab** (playing / results) → home
- **board** → user leaderboard (net WPM)
- **models** → aggregate model comparison (from saved runs)

## Scripts

```bash
npm run dev
npm run test
npm run test:coverage
npm run build
```
