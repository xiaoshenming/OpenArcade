import { describe, expect, it } from 'vitest'
import { evaluatePaths, wallCount } from './logic'
import { createLacePuzzle, getLaceLevel, LEVEL_COUNT } from './levels'

const ALL = Array.from({ length: LEVEL_COUNT }, (_, index) => index + 1)

describe('maze lace level system', () => {
  it('generates all sixty puzzles deterministically on repeated runs', () => {
    for (const level of ALL) expect(createLacePuzzle(level), `level ${level}`).toEqual(createLacePuzzle(level))
  }, 480000)

  it('solves every level by replaying presets plus the remaining maze walls', () => {
    for (const level of ALL) {
      const puzzle = createLacePuzzle(level)
      const walls = new Uint8Array(puzzle.solution.length)
      puzzle.presets.forEach((id) => { walls[id] = 1 })
      for (let id = 0; id < puzzle.solution.length; id += 1) if (puzzle.solution[id]) walls[id] = 1
      expect(evaluatePaths(walls, puzzle.rule.rows, puzzle.rule.cols, puzzle.start, puzzle.goal, puzzle.targetLen), `level ${level}`).toEqual({
        status: 'solved',
        paths: 1,
        length: puzzle.targetLen,
      })
      expect(wallCount(walls)).toBe(puzzle.par)
      const budget = puzzle.rule.slack === undefined ? puzzle.par : puzzle.par + puzzle.rule.slack
      expect(puzzle.par, `level ${level}`).toBeLessThanOrEqual(budget)
      expect(puzzle.start).toBe(0)
      expect(puzzle.goal).toBe(puzzle.rule.rows * puzzle.rule.cols - 1)
    }
  }, 480000)

  it('escalates board size, min length and mechanics across five chapters', () => {
    expect([1, 11, 12, 22, 23, 33, 34, 44, 45, 60].map((level) => getLaceLevel(level).rows)).toEqual([5, 5, 6, 6, 7, 7, 8, 8, 8, 8])
    expect([1, 11, 12, 22, 23, 33, 34, 44, 45, 60].map((level) => getLaceLevel(level).chapter)).toEqual([1, 1, 2, 2, 3, 3, 4, 4, 5, 5])
    const counts = [1, 2, 3, 4, 5].map((chapter) => ALL.filter((level) => getLaceLevel(level).chapter === chapter).length)
    expect(counts).toEqual([11, 11, 11, 11, 16])
    const minLens = ALL.map((level) => getLaceLevel(level).minLen)
    for (let index = 1; index < minLens.length; index += 1) expect(minLens[index]).toBeGreaterThanOrEqual(minLens[index - 1])
    for (const level of ALL) {
      const rule = getLaceLevel(level)
      expect(rule.slack ?? 99, `level ${level}`).toBe(rule.chapter === 1 ? 99 : rule.chapter >= 4 ? 1 : 3)
      expect(rule.presetFraction, `level ${level}`).toBe(rule.chapter === 3 ? 0.4 : rule.chapter === 4 ? 0.3 : rule.chapter === 5 ? 0.5 : 0)
      expect(createLacePuzzle(level).targetLen, `level ${level}`).toBeGreaterThanOrEqual(rule.minLen)
    }
  }, 480000)

  it('grows reference wall counts with board size and keeps puzzles distinct', () => {
    const pars = ALL.map((level) => createLacePuzzle(level).par)
    expect(pars[0]).toBeGreaterThan(10)
    expect(pars[LEVEL_COUNT - 1]).toBeGreaterThan(pars[0])
    const signatures = new Set(ALL.map((level) => {
      const puzzle = createLacePuzzle(level)
      return `${puzzle.rule.rows}:${puzzle.targetLen}:${puzzle.solution.join('')}`
    }))
    expect(signatures.size).toBe(LEVEL_COUNT)
  }, 480000)

  it('clamps hostile level inputs into the valid range', () => {
    expect(getLaceLevel(0).level).toBe(1)
    expect(getLaceLevel(-5).level).toBe(1)
    expect(getLaceLevel(Number.NaN).level).toBe(1)
    expect(getLaceLevel(999).level).toBe(60)
    expect(getLaceLevel(7.9).level).toBe(7)
    expect(getLaceLevel(0)).toEqual(getLaceLevel(1))
    expect(getLaceLevel(999)).toEqual(getLaceLevel(60))
    expect(createLacePuzzle(0)).toEqual(createLacePuzzle(1))
    expect(createLacePuzzle(999)).toEqual(createLacePuzzle(60))
  })
})
