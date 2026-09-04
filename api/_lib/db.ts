import { neon, type NeonQueryFunction } from '@neondatabase/serverless'
import { SCHEMA_SQL } from './schema'

let sql: NeonQueryFunction<false, false> | null = null
let schemaReady = false

export function getDatabaseUrl(): string | null {
  const url =
    process.env.DATABASE_URL?.trim() ||
    process.env.POSTGRES_URL?.trim() ||
    process.env.NEON_DATABASE_URL?.trim() ||
    null
  return url || null
}

export function getSql(): NeonQueryFunction<false, false> {
  if (sql) return sql
  const url = getDatabaseUrl()
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. Provision Neon (Vercel Marketplace) and add the connection string.',
    )
  }
  sql = neon(url)
  return sql
}

export async function ensureSchema(): Promise<void> {
  if (schemaReady) return
  const client = getSql()
  try {
    await client.query(`SELECT 1 FROM leaderboard_scores LIMIT 0`, [])
    schemaReady = true
    return
  } catch {
    // Tables are not there yet — apply the idempotent DDL one statement at a
    // time. A single Neon HTTP transaction of mixed CREATE/ALTER/INDEX can
    // crash the Vercel isolate (FUNCTION_INVOCATION_FAILED / generic 500).
  }

  for (const statement of SCHEMA_SQL) {
    try {
      await client.query(statement, [])
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (/already exists/i.test(message)) continue
      throw error
    }
  }
  schemaReady = true
}

export function resetDbCache() {
  sql = null
  schemaReady = false
}
