# PhraseRace

[Monkeytype](https://github.com/monkeytypegame/monkeytype) for speech-to-text.

Speak continuously through a word stream. A **live agent** paints letter mistakes from interim speech as you talk; a **commit agent** finalizes words (and soft-commits when the next word starts — the speech equivalent of Space).

## Stack

- Vite + React 19 + TypeScript
- Plain CSS (Monkeytype `serika_dark` palette)
- [Deepgram](https://deepgram.com/) Nova-3 live streaming STT
- Tiny Express API to mint short-lived Deepgram tokens (API key stays on the server)
- Vitest

## Setup

1. Create a Deepgram API key at [console.deepgram.com](https://console.deepgram.com/).
2. Copy env template and add your key:

```bash
cp .env.example .env
```

```bash
# .env
DEEPGRAM_API_KEY=your_key_here
```

3. Install and run:

```bash
npm install
npm run dev
```

This starts the token API on `:3001` and Vite on `:5173` (Vite proxies `/api` → the API).

Open the app, click **Click here to speak**, allow the microphone, and keep talking.

## Production

```bash
npm run build
npm start
```

`npm start` serves `dist/` and `POST /api/deepgram-token` from the same Express process.

## How it works

1. Continuous word stream, or **custom** mode (editable tongue twister)
2. Browser asks `POST /api/deepgram-token` → server grants a short-lived JWT via Deepgram `/v1/auth/grant`
3. Browser opens Deepgram Listen WebSocket with that JWT (mic audio streamed via MediaRecorder)
4. Dual agents: live interim coloring from partial transcripts + commit/soft-commit on finals
5. Time: 15 / 30 / 60 / wrench custom duration — or phrase mode (no timer)
6. **Tab** instantly starts the next test (no click gate)
7. Demo leaderboard (♛) — good runs place as "you"
8. Results: wpm, acc, raw, characters, streak, word history

## Scripts

```bash
npm run dev      # API + Vite
npm run build
npm start        # serve dist + token API
npm run test
```

## Ownership split

| Person | Owns |
| --- | --- |
| Person 1 | `src/types.ts`, `src/core/`, `src/data/` |
| Person 2 | `src/speech/`, `src/components/`, `src/App.tsx`, `server/` |
