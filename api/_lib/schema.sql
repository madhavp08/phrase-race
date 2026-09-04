-- Applied automatically on first persist/summary/leaderboard request.
-- Provision Neon (Vercel Marketplace) and set DATABASE_URL.

CREATE TABLE IF NOT EXISTS users (
  anonymous_id TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  email TEXT,
  username TEXT NOT NULL,
  anonymous_id TEXT,
  guest_number INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE accounts ALTER COLUMN email DROP NOT NULL;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS anonymous_id TEXT;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS guest_number INTEGER;

CREATE UNIQUE INDEX IF NOT EXISTS accounts_email_lower_idx
  ON accounts (lower(email));
CREATE UNIQUE INDEX IF NOT EXISTS accounts_username_lower_idx
  ON accounts (lower(username));
CREATE UNIQUE INDEX IF NOT EXISTS accounts_anonymous_id_idx
  ON accounts (anonymous_id) WHERE anonymous_id IS NOT NULL;

CREATE SEQUENCE IF NOT EXISTS guest_number_seq AS BIGINT START WITH 0 MINVALUE 0;

CREATE TABLE IF NOT EXISTS test_runs (
  id TEXT PRIMARY KEY,
  anonymous_id TEXT NOT NULL REFERENCES users(anonymous_id),
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ NOT NULL,
  test_type TEXT NOT NULL,
  duration_sec INTEGER NOT NULL,
  reference_words TEXT[] NOT NULL,
  prompt_set_id TEXT NOT NULL,
  benchmark_version TEXT NOT NULL,
  scorer_version TEXT NOT NULL,
  audio_format TEXT NOT NULL,
  sample_rate INTEGER NOT NULL,
  openai_input_hz INTEGER NOT NULL,
  outcome TEXT NOT NULL,
  raw_wpm DOUBLE PRECISION NOT NULL,
  net_wpm DOUBLE PRECISION NOT NULL,
  accuracy DOUBLE PRECISION NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE test_runs ADD COLUMN IF NOT EXISTS account_id TEXT;
ALTER TABLE test_runs ADD COLUMN IF NOT EXISTS judge_provider TEXT;

CREATE TABLE IF NOT EXISTS model_results (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES test_runs(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  name TEXT NOT NULL,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  transcript TEXT NOT NULL DEFAULT '',
  character_accuracy DOUBLE PRECISION,
  cer DOUBLE PRECISION,
  wer DOUBLE PRECISION,
  model_net_wpm DOUBLE PRECISION,
  median_word_latency_ms DOUBLE PRECISION,
  p95_word_latency_ms DOUBLE PRECISION,
  status TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS word_results (
  id TEXT PRIMARY KEY,
  model_result_id TEXT NOT NULL REFERENCES model_results(id) ON DELETE CASCADE,
  word_index INTEGER NOT NULL,
  expected TEXT NOT NULL,
  heard TEXT NOT NULL,
  correct BOOLEAN NOT NULL,
  interim_latency_ms DOUBLE PRECISION,
  final_latency_ms DOUBLE PRECISION
);

CREATE TABLE IF NOT EXISTS leaderboard_scores (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  run_id TEXT REFERENCES test_runs(id) ON DELETE SET NULL,
  wpm DOUBLE PRECISION NOT NULL,
  accuracy DOUBLE PRECISION NOT NULL,
  mode_label TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE leaderboard_scores ADD COLUMN IF NOT EXISTS display_name TEXT;

CREATE INDEX IF NOT EXISTS model_results_provider_idx
  ON model_results (provider, model, status);
CREATE INDEX IF NOT EXISTS test_runs_type_idx
  ON test_runs (test_type, created_at DESC);
CREATE INDEX IF NOT EXISTS leaderboard_scores_rank_idx
  ON leaderboard_scores (wpm DESC, accuracy DESC, created_at ASC);
