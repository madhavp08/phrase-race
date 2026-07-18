# PhraseRace

[Monkeytype](https://github.com/monkeytypegame/monkeytype) for speech-to-text.

Speak continuously through a word stream. A **live agent** paints letter mistakes from interim speech as you talk; a **commit agent** finalizes words (and soft-commits when the next word starts — the speech equivalent of Space).

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

1. Continuous word stream, or **custom** mode (editable tongue twister)
2. Dual agents: live interim coloring + commit/soft-commit
3. Time: 15 / 30 / 60 / wrench custom duration
4. **Tab** instantly starts the next test (no click gate)
5. Demo leaderboard (♛) — good runs place as “you”

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
