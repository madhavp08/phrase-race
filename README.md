# PhraseRace

A 16 kHz speech-to-text benchmark that still plays like Monkeytype.

You read a word stream aloud. PhraseRace captures **one** canonical 16 kHz linear16 PCM stream, fans those identical bytes to three STT models, and scores each model independently.

The live caret follows the current top model (highest average model WPM on the PhraseRace board). If the board is empty, it uses a dated public-ranking fallback (OpenAI, then Deepgram, then ElevenLabs) — not a hardcoded Deepgram judge. After each round, **your test** WPM/accuracy come from whichever model posted the highest WPM on that audio.

PhraseRace measures **recognition**, not pronunciation. If you said the prompt correctly and a model wrote something else, that is a model error.

## What is measured

Two scoreboards stay separate:

- **Your test** — speaking speed and accuracy according to the round judge (highest WPM that round). Feeds the user leaderboard (registered username, or `guest #N` if you skip).
- **Model results** — character accuracy, CER, WER, model-adjusted WPM, and per-word / median latency on the same audio.

Latency is **end-to-end UX latency**: time from the last sent PCM chunk to the transcript event arriving in the browser. It is not isolated model inference time. The ~85 ms figure is the ScriptProcessor **audio chunk size** at 48 kHz (`4096 / 48000`), not recognition latency.

OpenAI Realtime expects 24 kHz PCM. PhraseRace upsamples the 16 kHz canonical stream with nearest-neighbor copies so OpenAI does not receive extra acoustic information.

## Models

| Provider | Model | Role |
| --- | --- | --- |
| OpenAI | `gpt-live-transcribe` | Live or shadow (24 kHz upsample) |
| Deepgram | `nova-3` | Live or shadow |
| ElevenLabs | `scribe_v2_realtime` | Live or shadow |

Which one drives the caret is chosen at round start from `/api/models/summary`. Set `VITE_BENCH_PROVIDERS=deepgram` to develop without burning the other two APIs.

## Stack

- Vite + React 19 + TypeScript
- Web Audio `ScriptProcessor` → 16 kHz linear16 PCM (not MediaRecorder / WebM)
- Short-lived tokens: Deepgram JWT (45s), OpenAI `client_secrets`, ElevenLabs `realtime_scribe`
- Neon Postgres for runs, accounts, and the live leaderboard (`POST /api/runs`, `GET /api/models/summary`, `GET /api/leaderboard`)
- Vitest + `@vitest/coverage-v8` for `src/core` and `src/speech`

Postgres is the right store here: unique email/username constraints, joins from runs → model results → word timings, and a ranked leaderboard. Neon is serverless Postgres that matches the Vercel deploy.

## Setup (what you need to do)

Do **not** put secrets in the git branch. `.env` is gitignored. Only `.env.example` is committed (placeholders). Fill a local `.env` on your machine, and set the same keys in the Vercel project.

1. **Pull this branch**

   ```bash
   git fetch origin
   git checkout multi-model-stt-benchmark
   git pull
   ```

2. **Local `.env`** (your laptop, never committed)

   ```bash
   cp .env.example .env
   ```

   | Variable | Where to get it | Used by |
   | --- | --- | --- |
   | `DEEPGRAM_API_KEY` | Deepgram console. Needs **Member** (or equivalent) so `/auth/grant` can mint JWTs — a usage-only key will fail. | `POST /api/deepgram-token` |
   | `OPENAI_API_KEY` | OpenAI dashboard, realtime / transcription access. | `POST /api/openai-realtime-token` |
   | `ELEVENLABS_API_KEY` | ElevenLabs dashboard, Scribe realtime. | `POST /api/elevenlabs-token` |
   | `DATABASE_URL` | Neon pooled connection string (see Vercel steps below). | `/api/runs`, `/api/models/summary`, `/api/leaderboard` |

   Optional: `VITE_BENCH_PROVIDERS=deepgram` while you only have one key.

3. **Find the Neon connection string (you already created the database in Vercel)**

   Easiest path, since the store was created through Vercel:

   1. [Vercel Dashboard](https://vercel.com/dashboard) → your **phrase-race** project.
   2. **Storage** → click the Neon database.
   3. Copy **`.env.local`** or the **`DATABASE_URL`** connection string (the pooled one is fine; it often has `-pooler` in the host).
   4. Paste it into your local `.env` as `DATABASE_URL=...`.

   Alternative: **Settings → Environment Variables**. If you used **Connect Project** when creating the store, Vercel already injected `DATABASE_URL`. Reveal it there and copy it locally.

   Alternative: [Neon Console](https://console.neon.tech) (org named like `Vercel: …`) → project → **Connect** → copy the connection string.

   Schema (users, accounts, test_runs, model_results, word_results, leaderboard_scores) is applied automatically on the first API hit. You do not run SQL by hand.

4. **What to do in Vercel** (so production/preview actually work)

   1. Import this GitHub repo if the project is not connected yet (**Add New… → Project** → `madhavp08/phrase-race`). Set the Production branch to `main` (or this PR branch if you want to preview it before merge).
   2. **Storage → your Neon database → Connect Project** → select this Vercel project and check **Production** and **Preview** (and **Development** if you use `vercel env pull`). That injects `DATABASE_URL` into Vercel. You should not need to paste the string again on Vercel if Connect Project already did it.
   3. **Settings → Environment Variables** — confirm `DATABASE_URL` is present, then **add** (Production + Preview):
      - `DEEPGRAM_API_KEY`
      - `OPENAI_API_KEY`
      - `ELEVENLABS_API_KEY`
      Never prefix these with `VITE_`.
   4. **Redeploy** (**Deployments → … → Redeploy**) so the new env vars are picked up. Env changes do not apply to an already-running deployment.
   5. After deploy, open the live URL, press Tab, finish a test. Skip should show `guest #0` on **board**.

5. **Install and run locally**

   ```bash
   npm install
   npm run dev
   ```

   Restart `npm run dev` after any `.env` change. Allow the microphone. **Tab** starts a round.

6. **Play a round.** After the test, register a unique username + email, or skip to post as `guest #0` / `guest #1` / …. The public board shows that name only. The same email cannot register a second username; a taken username is rejected. Skip reuses the same guest name on the same browser.

## Deploy

`api/*.ts` become serverless functions; `vercel.json` serves the Vite SPA for everything except `/api/*`. Local `npm run dev` mounts the same routes via `server/devApiPlugin.ts`.

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
        ├── locked primary → GameEngine.applyLive / applyFinal
        └── shadow evaluators → CER / WER / latency
                ↓
        POST /api/runs  (optional username/email → leaderboard)
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
- **board** → live username leaderboard (empty until someone registers)
- **models** → aggregate model comparison (from saved runs)

## Scripts

```bash
npm run test
npm run test:coverage
npm run build
```
