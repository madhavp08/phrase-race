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
  for (const statement of SCHEMA_SQL) {
    await client.query(statement, [])
  }
  schemaReady = true
}

export function resetDbCache() {
  sql = null
  schemaReady = false
}
