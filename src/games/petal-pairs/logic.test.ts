import { describe, expect, it } from 'vitest'
import { createPairDeck, getPairLevel, rotateUnmatched } from './logic'

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

  it('gives every opening level an obvious layout or rule change', () => {
    const signatures = Array.from({ length: 5 }, (_, index) => {
      const spec = getPairLevel(index + 1)
      return `${spec.rows}x${spec.columns}:${spec.mode}`
    })
    expect(new Set(signatures).size).toBe(5)
    expect(getPairLevel(2).previewMode).toBe('pulse')
    expect(getPairLevel(3).maxMistakes).toBe(2)
    expect(getPairLevel(4).mode).toBe('sequence')
    expect(getPairLevel(5).mode).toBe('shifting')
  })

  it('develops and combines mechanics across eight chapters', () => {
    const levels = Array.from({ length: 40 }, (_, index) => getPairLevel(index + 1))
    for (let chapter = 1; chapter <= 8; chapter += 1) {
      expect(levels.slice((chapter - 1) * 5, chapter * 5).every((level) => level.chapter === chapter)).toBe(true)
    }
    expect(getPairLevel(30)).toMatchObject({ mode: 'ordered-shift', sequence: true, shifting: true })
    expect(getPairLevel(35)).toMatchObject({ mode: 'limited-shift', shifting: true })
    expect(getPairLevel(40)).toMatchObject({ mode: 'gauntlet', sequence: true, shifting: true })
    expect(getPairLevel(40).maxMistakes).toBeDefined()
  })

  it('moves only unmatched cards in shifting mode', () => {
    expect(rotateUnmatched(['A', 'A', 'B', 'B'], [0, 1])).toEqual(['A', 'A', 'B', 'B'])
    expect(rotateUnmatched(['A', 'B', 'A', 'B'], [0])).toEqual(['A', 'B', 'B', 'A'])
  })

  it('increases board size while reducing reveal assistance', () => {
    expect(getPairLevel(1)).toMatchObject({ rows: 2, columns: 2 })
    expect(getPairLevel(40)).toMatchObject({ rows: 4, columns: 5 })
    expect(getPairLevel(40).previewMs).toBeLessThan(getPairLevel(1).previewMs)
    expect(getPairLevel(40).mismatchMs).toBeLessThan(getPairLevel(1).mismatchMs)
  })
})
