/** Drop identical consecutive finals (reconnect / duplicate frames). */
export class FinalDeduper {
  private lastNormalized = ''

  accept(text: string): boolean {
    const normalized = text.replace(/\s+/g, ' ').trim().toLowerCase()
    if (!normalized) return false
    if (normalized === this.lastNormalized) return false
    this.lastNormalized = normalized
    return true
  }

  reset() {
    this.lastNormalized = ''
  }
}
