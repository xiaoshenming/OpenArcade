import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../../platform/rng'
import { buildSkyPuzzle, cluesFor, conflictIndexes, countSolutions, fillLatin, formatClock, isSolved, scoreFor, SKY_SIDES, visibleCount, type Clues } from './logic'

const CRAFT = [2, 1, 3, 4, 4, 3, 1, 2, 3, 4, 2, 1, 1, 2, 4, 3]
const CRAFT_CLUES: Clues = { top: [2, 3, 2, 1], right: [1, 3, 3, 2], bottom: [3, 2, 1, 2], left: [3, 1, 2, 3] }
const EMPTY_CLUES = (size: number): Clues => ({ top: Array(size).fill(0), right: Array(size).fill(0), bottom: Array(size).fill(0), left: Array(size).fill(0) })

const expectLatin = (grid: readonly number[], size: number) => {
  const rows = Array.from({ length: size }, (_, row) => grid.slice(row * size, row * size + size))
  const cols = Array.from({ length: size }, (_, col) => Array.from({ length: size }, (_, row) => grid[row * size + col]))
  for (const lines of [rows, cols]) {
    for (const line of lines) {
      expect(line.every((value) => value >= 1 && value <= size)).toBe(true)
      expect(new Set(line).size).toBe(size)
    }
  }
}

describe('sky latin foundations', () => {
  it('fills complete Latin squares for every city size', () => {
    for (const size of [4, 5, 6]) {
      for (let seed = 1; seed <= 6; seed += 1) {
        const grid = fillLatin(mulberry32(seed * 104729 + size), size)
        expect(grid).toHaveLength(size * size)
        expectLatin(grid, size)
        expect(cluesFor(grid, size)).toEqual(cluesFor(grid, size))
      }
    }
  })

  it('counts visible skyscrapers and derives four edges of clues', () => {
    expect(visibleCount([2, 1, 4, 3])).toBe(2)
    expect(visibleCount([4, 3, 2, 1])).toBe(1)
    expect(visibleCount([1, 2, 3, 4])).toBe(4)
    expect(visibleCount([])).toBe(0)
    expect(cluesFor(CRAFT, 4)).toEqual(CRAFT_CLUES)
  })

  it('counts solutions and prunes impossible or open clue sets', () => {
    expect(countSolutions(CRAFT_CLUES, 4, 2)).toBe(1)
    expect(countSolutions(EMPTY_CLUES(4), 4, 2)).toBe(2)
    const contradiction: Clues = { ...EMPTY_CLUES(4), left: [1, 0, 0, 0], right: [1, 0, 0, 0] }
    expect(countSolutions(contradiction, 4, 2)).toBe(0)
    const relaxed: Clues = { ...CRAFT_CLUES, left: [0, 1, 2, 3] }
    expect(countSolutions(relaxed, 4, 2)).toBeGreaterThanOrEqual(1)
  })

  it('builds deterministic dug puzzles that keep exactly one solution', () => {
    for (const [seed, size, target, clear] of [[7, 4, 3, null], [99, 5, 6, null], [1234, 6, 8, 'left'], [55, 6, 9, 'top']] as const) {
      const first = buildSkyPuzzle(seed, size, target, clear)
      const second = buildSkyPuzzle(seed, size, target, clear)
      expect(second).toEqual(first)
      expect(countSolutions(first.clues, size, 2)).toBe(1)
      expect(first.removed).toBeGreaterThanOrEqual(Math.floor(target * 0.75))
      expect(first.removed).toBeLessThanOrEqual(Math.max(target, clear ? size : 0))
      if (clear) {
        expect(first.sideCleared).toBe(true)
        expect(SKY_SIDES.some((side) => first.clues[side].every((clue) => clue === 0))).toBe(true)
      }
      const live = cluesFor(first.solution, size)
      for (const side of ['top', 'right', 'bottom', 'left'] as const) {
        for (let at = 0; at < size; at += 1) {
          if (first.clues[side][at] > 0) expect(first.clues[side][at]).toBe(live[side][at])
        }
      }
      expectLatin(first.solution, size)
    }
  })
})

describe('sky scoring and conflicts', () => {
  it('scores 1000 minus errors and overtime with strict doubling', () => {
    expect(scoreFor(0, 0, 90)).toBe(1000)
    expect(scoreFor(2, 0, 90)).toBe(880)
    expect(scoreFor(0, 99, 90)).toBe(1000)
    expect(scoreFor(0, 100, 90)).toBe(985)
    expect(scoreFor(0, 160, 90, true)).toBe(790)
    expect(scoreFor(3, 500, 400)).toBe(670)
    expect(scoreFor(20, 9000, 90, true)).toBe(100)
  })

  it('never rewards more errors or slower finishes in either mode', () => {
    for (const strict of [false, true]) {
      for (let elapsed = 0; elapsed <= 300; elapsed += 25) {
        for (let errors = 0; errors <= 8; errors += 1) {
          expect(scoreFor(errors + 1, elapsed, 90, strict)).toBeLessThanOrEqual(scoreFor(errors, elapsed, 90, strict))
          expect(scoreFor(errors, elapsed + 1, 90, strict)).toBeLessThanOrEqual(scoreFor(errors, elapsed, 90, strict))
        }
      }
    }
    expect(formatClock(640)).toBe('10:40')
    expect(formatClock(-5)).toBe('0:00')
  })

  it('flags row and column duplicates and validates solved skylines', () => {
    const size = 4
    const blank = new Array<number>(size * size).fill(0)
    expect(conflictIndexes(blank, size)).toEqual([])
    const rowDup = [...blank]
    rowDup[0] = 3
    rowDup[2] = 3
    expect(conflictIndexes(rowDup, size)).toEqual([0, 2])
    const colDup = [...blank]
    colDup[1] = 2
    colDup[9] = 2
    expect(conflictIndexes(colDup, size)).toEqual([1, 9])
    expect(isSolved(CRAFT, 4, CRAFT_CLUES)).toBe(true)
    const broken = [...CRAFT]
    broken[0] = 3
    expect(isSolved(broken, 4, CRAFT_CLUES)).toBe(false)
    expect(isSolved(blank, 4, CRAFT_CLUES)).toBe(false)
    const wrongClues: Clues = { ...CRAFT_CLUES, top: [3, 2, 2, 1] }
    expect(isSolved(CRAFT, 4, wrongClues)).toBe(false)
  })
})
