# PhraseRace

Monkeytype for speech-to-text — powered by **Deepgram Nova-3** live streaming.

Speak continuously through a word stream. A live agent paints letter mistakes from interim transcripts; finals commit words for scoring.

## Stack

- Vite + React 19 + TypeScript
- Deepgram Nova-3 WebSocket streaming (`/v1/listen`)
- Short-lived JWT auth via local `/api/deepgram-token` (API key stays server-side)
- Vitest

## Setup

1. Copy env and add your Deepgram key:

```bash
cp .env.example .env
# edit .env → DEEPGRAM_API_KEY=...
```

2. Install & run:

```bash
npm install
npm run dev
```

3. Open the app, allow the microphone, press **tab** to start.

> The long-lived key is only used by the Vite middleware to call  
> `POST https://api.deepgram.com/v1/auth/grant`. The browser receives a ~30s JWT.

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

Auth over the browser WebSocket uses a **single** subprotocol: `Bearer <jwt>`
(not `['bearer', token]` — that form breaks on some browsers/CDNs).

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
