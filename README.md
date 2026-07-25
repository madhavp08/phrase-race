# PhraseRace

Monkeytype for speech-to-text — powered by **Deepgram Nova-3** live streaming.

Speak continuously through a word stream. A live agent paints letter mistakes from interim transcripts; finals commit words for scoring.

## Stack

- Vite + React 19 + TypeScript
- Deepgram Nova-3 WebSocket streaming (`/v1/listen`)
- Short-lived JWT auth via local `/api/deepgram-token` (API key stays server-side)
- Vitest

## Setup

### 1. Deepgram API key

1. Create a free key at [console.deepgram.com](https://console.deepgram.com/).
2. Copy env and paste your key (no `VITE_` prefix — server-only):

```bash
cp .env.example .env
# edit .env → DEEPGRAM_API_KEY=your_real_key_here
```

3. Install and run:

```bash
npm install
npm run dev
```

4. Open the app, allow the microphone, press **tab** to start.

> The long-lived key is only used server-side to call  
> `POST https://api.deepgram.com/v1/auth/grant`. The browser receives a ~45s JWT.

**Local troubleshooting**

- If you see **“DEEPGRAM_API_KEY is not set”**, restart `npm run dev` after editing `.env`. The placeholder `your_deepgram_api_key_here` is rejected on purpose.
- If you see **“Insufficient permissions.”**, your key can call speech APIs but **cannot mint temporary JWTs**. `/auth/grant` requires a key with at least **Member** role:
  1. Open [Deepgram Console → API Keys](https://console.deepgram.com/)
  2. **Create a new key** → open **Advanced** options
  3. Set permissions to **Member** (not a restricted “Member”/usage-only key with fewer scopes)
  4. Paste the new key into `.env` and **restart** `npm run dev`

### 2. Deploy to Vercel (GitHub)

The repo is set up for [Vercel](https://vercel.com) + GitHub:

| Piece | Role |
| --- | --- |
| `api/deepgram-token.ts` | Production token endpoint (serverless) |
| `server/deepgramTokenPlugin.ts` | Same logic in local `npm run dev` |
| `vercel.json` | Vite build + SPA fallback routing |

**Steps:**

1. Push this repo to GitHub (`madhavp08/phrase-race`).
2. In [Vercel → New Project](https://vercel.com/new), import the GitHub repo.
3. Under **Environment Variables**, add:
   - Name: `DEEPGRAM_API_KEY`
   - Value: your Deepgram API key
   - Environments: Production (and Preview if you want PR deploys)
4. Deploy. Vercel runs `npm run build` and serves `dist/`; `/api/deepgram-token` runs as a serverless function.
5. On each push to `main`, Vercel redeploys automatically.

**Production check:** Open your site → DevTools → Network → start a round → confirm `POST /api/deepgram-token` returns `{ access_token, expires_in }`.

## Speech architecture

```
mic (MediaRecorder webm/opus)
        ↓
DeepgramSpeechSession  ←→  wss://api.deepgram.com/v1/listen
        ↓
TranscriptAssembler (interim / is_final / UtteranceEnd)
        ↓
useSpeechRecognition → App → GameEngine.applyLive / applyFinal
```

| Module | Role |
| --- | --- |
| `server/deepgramTokenPlugin.ts` | Mints temp JWTs |
| `src/speech/mic.ts` | `getUserMedia` + chunked capture |
| `src/speech/deepgramClient.ts` | WebSocket lifecycle, keepalive, reconnect |
| `src/speech/transcriptAssembler.ts` | Interim vs final / UtteranceEnd |
| `src/speech/useSpeechRecognition.ts` | React hook (same API as before) |

### Deepgram query params

- `model=nova-3`
- `encoding=linear16` + `sample_rate=16000` + `channels=1`
- `interim_results=true`
- `smart_format=true` (no separate `punctuate`)
- `endpointing=300`
- `utterance_end_ms=1000`
- `language=en-US`

Auth over the browser WebSocket uses subprotocols `['bearer', jwt]`  
(RFC 6455 forbids spaces, so `"Bearer ${jwt}"` as one string is invalid).

## Gameplay shortcuts

- **tab** (idle) → start
- **tab** (playing / results) → home
- **♛** → leaderboard

## Scripts

```bash
npm run dev
npm run test
npm run build
```
