import { describe, expect, it } from 'vitest'
import { WORD_ROW_CHUNK, chunkedPackRows, packRows } from './sqlBatch'

describe('packRows', () => {
  it('numbers placeholders across the whole INSERT', () => {
    const packed = packRows(
      ['id', 'word'],
      [
        ['a', 'hello'],
        ['b', 'world'],
      ],
    )
    expect(packed.columns).toBe('id, word')
    expect(packed.values).toBe('($1,$2), ($3,$4)')
    expect(packed.params).toEqual(['a', 'hello', 'b', 'world'])
  })
})

describe('chunkedPackRows', () => {
  it('turns a 220-word model into a handful of INSERTs instead of 220', () => {
    const rows = Array.from({ length: 220 }, (_, index) => [
      `id-${index}`,
      'model',
      index,
      'expected',
      'heard',
      true,
      10,
      20,
    ])
    const packed = chunkedPackRows(
      [
        'id',
        'model_result_id',
        'word_index',
        'expected',
        'heard',
        'correct',
        'interim_latency_ms',
        'final_latency_ms',
      ],
      rows,
    )
    expect(packed).toHaveLength(Math.ceil(220 / WORD_ROW_CHUNK))
    expect(packed[0]?.params).toHaveLength(WORD_ROW_CHUNK * 8)
    expect(packed[packed.length - 1]?.params).toHaveLength(20 * 8)
  })

  it('returns no queries for an empty word list', () => {
    expect(chunkedPackRows(['id'], [])).toEqual([])
  })
})
