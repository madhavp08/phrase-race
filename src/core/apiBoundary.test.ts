import { describe, expect, it } from 'vitest'

const apiModules = import.meta.glob('../../api/**/*.ts', {
  query: '?raw',
  eager: true,
  import: 'default',
}) as Record<string, string>

describe('Vercel API boundary', () => {
  it('keeps serverless files from importing the Vite src tree', () => {
    const files = Object.entries(apiModules)
    expect(files.length).toBeGreaterThan(5)
    for (const [path, text] of files) {
      expect(text, path).not.toMatch(/from ['"][^'"]*\/src\//)
    }
  })

  it('uses .js extensions on relative imports so Node ESM can load helpers', () => {
    const files = Object.entries(apiModules)
    for (const [path, text] of files) {
      for (const match of text.matchAll(/from ['"](\.[^'"]+)['"]/g)) {
        expect(match[1], path).toMatch(/\.js$/)
      }
      for (const match of text.matchAll(/import\(['"](\.[^'"]+)['"]\)/g)) {
        expect(match[1], path).toMatch(/\.js$/)
      }
    }
  })
})
