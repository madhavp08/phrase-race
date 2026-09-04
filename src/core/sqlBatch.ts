/** Stay well under Postgres’ 65535-parameter cap and Neon HTTP body limits. */
export const WORD_ROW_CHUNK = 100

export function packRows(
  columns: string[],
  rows: unknown[][],
): { columns: string; values: string; params: unknown[] } {
  const params: unknown[] = []
  const values = rows.map((row) => {
    const slots = row.map((value) => {
      params.push(value)
      return `$${params.length}`
    })
    return `(${slots.join(',')})`
  })
  return {
    columns: columns.join(', '),
    values: values.join(', '),
    params,
  }
}

export function chunkedPackRows(
  columns: string[],
  rows: unknown[][],
  chunkSize = WORD_ROW_CHUNK,
): ReturnType<typeof packRows>[] {
  if (rows.length === 0 || chunkSize < 1) return []
  const packed: ReturnType<typeof packRows>[] = []
  for (let i = 0; i < rows.length; i += chunkSize) {
    packed.push(packRows(columns, rows.slice(i, i + chunkSize)))
  }
  return packed
}
