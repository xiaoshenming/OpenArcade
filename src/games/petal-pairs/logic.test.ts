import { describe, expect, it } from 'vitest'
import { createPairDeck, getPairLevel } from './logic'

describe('petal pairs level generator', () => {
  it('creates forty deterministic decks with exact pairs', () => {
    const layouts = new Set<string>()
    for (let level = 1; level <= 40; level += 1) {
      const first = createPairDeck(level)
      const second = createPairDeck(level)
      expect(first).toEqual(second)
      const counts = Object.values(Object.fromEntries(first.map((symbol) => [symbol, first.filter((item) => item === symbol).length])))
      expect(counts.every((count) => count === 2)).toBe(true)
      expect(first).toHaveLength(getPairLevel(level).rows * getPairLevel(level).columns)
      layouts.add(first.join(''))
    }
    expect(layouts.size).toBe(40)
  })

  it('increases board size while reducing reveal assistance', () => {
    expect(getPairLevel(1)).toMatchObject({ rows: 2, columns: 2 })
    expect(getPairLevel(40)).toMatchObject({ rows: 4, columns: 5 })
    expect(getPairLevel(40).previewMs).toBeLessThan(getPairLevel(1).previewMs)
    expect(getPairLevel(40).mismatchMs).toBeLessThan(getPairLevel(1).mismatchMs)
  })
})
