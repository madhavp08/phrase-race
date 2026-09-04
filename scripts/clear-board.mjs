#!/usr/bin/env node
/**
 * Wipe public scores so the live board starts empty.
 * Usage (from the repo root): npm run clear-board
 *
 * Reads DATABASE_URL from the shell, then .env / .env.local.
 * Vercel env vars are not visible to this command.
 */
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { neon } from '@neondatabase/serverless'

const ENV_FILES = ['.env', '.env.local']
const URL_KEYS = [
  'DATABASE_URL',
  'POSTGRES_URL',
  'POSTGRES_PRISMA_URL',
  'NEON_DATABASE_URL',
]

function stripQuotes(value) {
  const trimmed = value.trim()
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

function isPlaceholder(url) {
  if (!url) return true
  return (
    url.includes('user:pass@host') ||
    url.includes('your_') ||
    url.includes('example.com')
  )
}

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return
  const text = readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '')
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const assign = line.replace(/^export\s+/, '')
    const eq = assign.indexOf('=')
    if (eq === -1) continue
    const key = assign.slice(0, eq).trim()
    if (!key) continue
    const value = stripQuotes(assign.slice(eq + 1))
    const existing = process.env[key]
    if (!existing || isPlaceholder(existing)) process.env[key] = value
  }
}

function describeUrl(url) {
  try {
    const parsed = new URL(url)
    const db = parsed.pathname.replace(/^\//, '') || '(no database name)'
    return `${parsed.hostname} / ${db}`
  } catch {
    return '(unparseable URL)'
  }
}

for (const file of ENV_FILES) {
  loadEnvFile(resolve(process.cwd(), file))
}

let url = null
let source = null
for (const key of URL_KEYS) {
  const value = process.env[key]?.trim()
  if (!value || isPlaceholder(value)) continue
  url = value
  source = key
  break
}

if (!url) {
  const cwd = process.cwd()
  console.error(`clear-board: no real Postgres URL in ${cwd}

This script does not read Vercel. Put the Neon pooled connection string in
${resolve(cwd, '.env')} as DATABASE_URL, then run it again from the repo root:

  git pull origin main
  npm run clear-board

Copy the URL from Vercel → Storage → Neon, or Settings → Environment Variables.
It should look like postgres://…@ep-….neon.tech/neondb?sslmode=require
`)
  process.exit(1)
}

console.log(`Using ${source} (${describeUrl(url)})`)

const sql = neon(url)

try {
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
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  if (/does not exist/i.test(message)) {
    console.log('No leaderboard tables yet — the public board is already empty.')
    process.exit(0)
  }
  console.error(`clear-board failed: ${message}`)
  process.exit(1)
}

try {
  await sql.query(`ALTER SEQUENCE guest_number_seq RESTART WITH 0`)
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  if (!/does not exist/i.test(message)) {
    console.error(`Cleared tables, but could not reset guest numbers: ${message}`)
    process.exit(1)
  }
}

console.log('Cleared runs, accounts, and leaderboard scores.')
