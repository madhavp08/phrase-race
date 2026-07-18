# PhraseRace

[Monkeytype](https://github.com/monkeytypegame/monkeytype) for speech-to-text.

Speak continuously through a word stream. Letters turn correct/incorrect as Chrome’s Web Speech API recognizes what you say — same live feedback loop as typing on Monkeytype, adapted for voice.

## Stack

- Vite + React 19 + TypeScript
- Plain CSS (Monkeytype `serika_dark` palette)
- Chrome Web Speech API (no backend)
- Vitest

## Run

```bash
npm install
npm run dev
```

Open in **Chrome**, click **Click here to speak**, allow the microphone, and keep talking.

## How it works

1. A continuous word stream fills the screen (3-line viewport)
2. Speech recognition runs continuously (`continuous: true`)
3. Interim results color the active word letter-by-letter
4. Final words commit as correct or incorrect and advance the caret
5. Timer modes: 15 / 30 / 60 seconds
6. Results show wpm, acc, raw, characters, streak, and word history

## Scripts

```bash
npm run dev
npm run test
npm run build
```

## Ownership split

| Person | Owns |
| --- | --- |
| Person 1 | `src/types.ts`, `src/core/`, `src/data/` |
| Person 2 | `src/speech/`, `src/components/`, `src/App.tsx` |
