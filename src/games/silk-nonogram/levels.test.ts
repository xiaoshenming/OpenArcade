import { describe, expect, it } from 'vitest'
import { computeClues, isLineSolvable, weaveLockedRows } from './logic'
import { chapterOf, createSilkPuzzle, getSilkLevel, lockedRowsFor, SILK_LEVEL_COUNT, type SilkLevelSpec } from './levels'

const allSpecs = (): SilkLevelSpec[] => Array.from({ length: SILK_LEVEL_COUNT }, (_, index) => getSilkLevel(index + 1))

describe('silk chapter ladder', () => {
  it('splits sixty levels into five chapters with growing boards', () => {
    const specs = allSpecs()
    expect(specs.filter((spec) => spec.chapter === 1)).toHaveLength(11)
    expect(specs.filter((spec) => spec.chapter === 2)).toHaveLength(11)
    expect(specs.filter((spec) => spec.chapter === 3)).toHaveLength(11)
    expect(specs.filter((spec) => spec.chapter === 4)).toHaveLength(11)
    expect(specs.filter((spec) => spec.chapter === 5)).toHaveLength(16)
    expect([1, 11, 12, 22, 23, 33, 34, 44, 45, 60].map((level) => chapterOf(level))).toEqual([1, 1, 2, 2, 3, 3, 4, 4, 5, 5])
    expect([0, 1, 12, 23, 34, 45, 60].map((level) => getSilkLevel(level).size)).toEqual([5, 5, 6, 8, 10, 12, 12])
  })

  it('introduces one new mechanic per chapter and combines them at the finale', () => {
    const specs = allSpecs()
    expect(specs.filter((spec) => spec.chapter === 2).every((spec) => spec.hints === 3 && spec.mode === 'shuttle')).toBe(true)
    expect(specs.filter((spec) => spec.chapter === 3).every((spec) => spec.maxMistakes === 3 && spec.lockedRows === 0)).toBe(true)
    expect(specs.filter((spec) => spec.chapter === 4).every((spec) => spec.maxMistakes === 3 && spec.mode === 'tempo' && spec.lockedRows >= 1 && spec.lockedRows <= 2)).toBe(true)
    expect(specs.filter((spec) => spec.chapter === 5).every((spec) => spec.maxMistakes === 3 && spec.lockedRows === 2 && spec.timeLimit === 720)).toBe(true)
    expect(specs.filter((spec) => spec.chapter < 5).every((spec) => spec.timeLimit === undefined)).toBe(true)
    expect(specs.filter((spec) => spec.chapter < 3).every((spec) => spec.maxMistakes === undefined)).toBe(true)
    expect(specs.filter((spec) => spec.chapter <= 3).every((spec) => spec.lockedRows === 0)).toBe(true)
    expect([1, 12, 23, 34, 45].map((level) => getSilkLevel(level).hints)).toEqual([0, 3, 1, 0, 0])
    expect(specs.filter((spec) => spec.chapter >= 2).every((spec) => spec.hints <= 3)).toBe(true)
  })

  it('never relaxes the difficulty curve between chapters', () => {
    const specs = allSpecs()
    for (let level = 1; level < specs.length; level += 1) {
      expect(specs[level].size).toBeGreaterThanOrEqual(specs[level - 1].size)
      expect(specs[level].density).toBeGreaterThanOrEqual(specs[level - 1].density)
    }
    for (let level = 12; level < specs.length; level += 1) {
      expect(specs[level].hints).toBeLessThanOrEqual(specs[level - 1].hints)
    }
    for (let level = 23; level < specs.length; level += 1) {
      expect(specs[level].maxMistakes ?? 0, `level ${level + 1}`).toBeLessThanOrEqual(specs[level - 1].maxMistakes ?? 0)
    }
    for (let level = 34; level < specs.length; level += 1) {
      expect(specs[level].lockedRows, `level ${level + 1}`).toBeGreaterThanOrEqual(specs[level - 1].lockedRows)
    }
    expect(specs.map((spec) => spec.par)).toEqual([...Array(11).fill(60), ...Array(11).fill(100), ...Array(11).fill(180), ...Array(11).fill(300), ...Array(16).fill(480)])
  })
})

describe('silk locked rows', () => {
  it('picks deterministic known-correct rows from chapters four and five', () => {
    expect(lockedRowsFor(33)).toEqual([])
    expect(lockedRowsFor(34)).toHaveLength(1)
    expect(lockedRowsFor(40)).toHaveLength(2)
    expect(lockedRowsFor(60)).toHaveLength(2)
    for (const level of [34, 39, 40, 44, 45, 60]) {
      const first = lockedRowsFor(level)
      const second = lockedRowsFor(level)
      expect(first).toEqual(second)
      const puzzle = createSilkPuzzle(level)
      expect(first.every((row) => row >= 0 && row < puzzle.size), `level ${level}`).toBe(true)
      expect(new Set(first).size, `level ${level}`).toBe(first.length)
      for (const row of first) {
        expect(puzzle.pattern.slice(row * puzzle.size, row * puzzle.size + puzzle.size).some((cell) => cell === 1), `level ${level} row ${row}`).toBe(true)
      }
    }
  })

  it('prefills locked rows with the exact solution states', () => {
    for (const level of [34, 41, 52, 60]) {
      const puzzle = createSilkPuzzle(level)
      const locked = lockedRowsFor(level)
      const marks = weaveLockedRows(puzzle.pattern, puzzle.size, locked)
      expect(marks.every((mark, index) => mark === 0 || locked.includes(Math.floor(index / puzzle.size))), `level ${level}`).toBe(true)
      for (const row of locked) {
        const slice = marks.slice(row * puzzle.size, row * puzzle.size + puzzle.size)
        expect(puzzle.pattern.slice(row * puzzle.size, row * puzzle.size + puzzle.size).every((cell, index) => (cell === 1) === (slice[index] === 1)), `level ${level} row ${row}`).toBe(true)
        expect(slice.every((mark) => mark !== 0), `level ${level} row ${row}`).toBe(true)
      }
      expect(locked.length ? puzzle.rowClues.filter((_, row) => locked.includes(row)).length : 0).toBe(locked.length)
    }
  })
})

describe('silk puzzle catalog', () => {
  it('weaves sixty unique line-solvable puzzles inside the density band', { timeout: 120_000 }, () => {
    const seen = new Set<string>()
    for (let level = 1; level <= SILK_LEVEL_COUNT; level += 1) {
      const spec = getSilkLevel(level)
      const puzzle = createSilkPuzzle(level)
      expect(puzzle.size, `level ${level}`).toBe(spec.size)
      expect(puzzle.lineSolvable, `level ${level}`).toBe(true)
      expect(puzzle.pattern.every((cell) => cell === 0 || cell === 1), `level ${level}`).toBe(true)
      expect(puzzle.density, `level ${level}`).toBeGreaterThanOrEqual(0.43)
      expect(puzzle.density, `level ${level}`).toBeLessThanOrEqual(0.62)
      const { rowClues, colClues } = computeClues(puzzle.pattern, puzzle.size)
      expect(rowClues, `level ${level}`).toEqual(puzzle.rowClues)
      expect(colClues, `level ${level}`).toEqual(puzzle.colClues)
      expect(isLineSolvable(rowClues, colClues), `level ${level}`).toBe(true)
      seen.add(puzzle.pattern.join(''))
    }
    expect(seen.size).toBe(SILK_LEVEL_COUNT)
  })

  it('replays the same puzzle for the same level every time', { timeout: 120_000 }, () => {
    for (const level of [1, 12, 23, 34, 45, 60]) {
      expect(createSilkPuzzle(level)).toEqual(createSilkPuzzle(level))
    }
  })

  it('clamps hostile level inputs into a playable range', () => {
    expect(getSilkLevel(0)).toMatchObject({ level: 1, chapter: 1, size: 5, hints: 0 })
    expect(getSilkLevel(-9)).toMatchObject({ level: 1 })
    expect(getSilkLevel(12.9)).toMatchObject({ level: 12, chapter: 2 })
    expect(getSilkLevel(999)).toMatchObject({ level: 60, chapter: 5, title: '终局·万丝归一', maxMistakes: 3, lockedRows: 2, timeLimit: 720 })
    for (const level of [0, -3, 999, 45.5]) {
      const puzzle = createSilkPuzzle(level)
      expect(puzzle.lineSolvable).toBe(true)
      expect(puzzle.pattern).toHaveLength(getSilkLevel(level).size ** 2)
    }
  })
})
