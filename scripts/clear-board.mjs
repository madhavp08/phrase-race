#!/usr/bin/env node
/**
 * Wipe public scores so the live board starts empty.
 * Usage: npm run clear-board
 * Reads DATABASE_URL from the environment or local .env.
 */
import { existsSync, readFileSync } from 'node:fs'
import { neon } from '@neondatabase/serverless'

if (!process.env.DATABASE_URL && existsSync('.env')) {
  for (const line of readFileSync('.env', 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq)
    let value = trimmed.slice(eq + 1)
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (!process.env[key]) process.env[key] = value
  }
}

const url = process.env.DATABASE_URL?.trim()
if (!url || url.includes('user:pass@host')) {
  console.error('Set a real DATABASE_URL before clearing the board.')
  process.exit(1)
}

const sql = neon(url)
await sql.query(
  `TRUNCATE TABLE
     leaderboard_scores,
     word_results,
     model_results,
     test_runs,
     accounts,
     users
   RESTART IDENTITY CASCADE`,
)
await sql.query(`ALTER SEQUENCE guest_number_seq RESTART WITH 0`)
console.log('Cleared runs, accounts, and leaderboard scores.')
