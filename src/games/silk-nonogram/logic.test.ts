import { describe, expect, it } from 'vitest'
import { computeClues, generatePuzzle, isLineSolvable, lineClue, lineDone, propagate, puzzleComplete, scoreFor, solveLine } from './logic'

describe('silk line solver', () => {
  it('narrows lines to the intersection of viable placements', () => {
    expect(solveLine([5], [-1, -1, -1, -1, -1]).line).toEqual([1, 1, 1, 1, 1])
    expect(solveLine([], [-1, -1, -1, -1, -1]).line).toEqual([0, 0, 0, 0, 0])
    expect(solveLine([4], [-1, -1, -1, -1, -1]).line).toEqual([-1, 1, 1, 1, -1])
    expect(solveLine([2], [-1, -1, -1, -1, 0]).line).toEqual([-1, -1, -1, -1, 0])
    expect(solveLine([1, 1], [-1, -1, 1, -1, -1]).line).toEqual([-1, 0, 1, 0, -1])
  })

  it('flags contradictions instead of guessing', () => {
    expect(solveLine([3], [0, -1, -1]).contradictory).toBe(true)
    expect(solveLine([4], [-1, 0, -1, -1]).contradictory).toBe(true)
    expect(solveLine([5], [-1, 0, -1, -1, -1]).contradictory).toBe(true)
    expect(solveLine([2], [-1, -1, -1, -1, -1]).contradictory).toBe(false)
  })

  it('solves a full puzzle with row and column propagation only', () => {
    const pattern = [1, 1, 0, 0, 1, 1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 1, 1, 0, 0, 1]
    const { rowClues, colClues } = computeClues(pattern, 5)
    expect(isLineSolvable(rowClues, colClues)).toBe(true)
    const result = propagate(rowClues, colClues)
    expect(result.contradictory).toBe(false)
    expect(result.rows.flat()).toEqual(pattern)
  })

  it('rejects ambiguous and contradictory clue sets', () => {
    expect(isLineSolvable([[1], [1]], [[1], [1]])).toBe(false)
    expect(isLineSolvable([[2], [2]], [[1], [1]])).toBe(false)
    expect(propagate([[2], [2]], [[1], [1]]).contradictory).toBe(true)
  })

  it('reuses one clue encoding for rows and columns', () => {
    expect(lineClue([1, 1, 0, 1])).toEqual([2, 1])
    expect(lineClue([0, 0, 0, 0])).toEqual([])
    expect(computeClues([1, 0, 0, 1], 2)).toEqual({ rowClues: [[1], [1]], colClues: [[1], [1]] })
    expect(computeClues([1, 1, 0, 1], 2)).toEqual({ rowClues: [[2], [1]], colClues: [[1], [2]] })
  })
})

describe('silk scoring and completion helpers', () => {
  it('scores 1000 minus mistake and overtime penalties with a floor of 100', () => {
    expect(scoreFor(0, 0, 60)).toBe(1000)
    expect(scoreFor(1, 0, 60)).toBe(920)
    expect(scoreFor(0, 69, 60)).toBe(1000)
    expect(scoreFor(0, 70, 60)).toBe(988)
    expect(scoreFor(12, 0, 60)).toBe(100)
    expect(scoreFor(20, 900, 60)).toBe(100)
  })

  it('never rewards more mistakes or slower finishes', () => {
    for (let elapsed = 0; elapsed <= 300; elapsed += 30) {
      for (let mistakes = 0; mistakes <= 8; mistakes += 1) {
        expect(scoreFor(mistakes + 1, elapsed, 60)).toBeLessThanOrEqual(scoreFor(mistakes, elapsed, 60))
        expect(scoreFor(mistakes, elapsed + 1, 60)).toBeLessThanOrEqual(scoreFor(mistakes, elapsed, 60))
      }
    }
  })

  it('completes only when every filled pattern cell is woven', () => {
    expect(lineDone([1, 0, 1], [1, 2, 1])).toBe(true)
    expect(lineDone([1, 0, 1], [1, 1, 1])).toBe(false)
    expect(lineDone([1, 0, 1], [0, 0, 1])).toBe(false)
    expect(puzzleComplete([1, 0, 1], [1, 2, 1])).toBe(true)
    expect(puzzleComplete([1, 0, 1], [1, 0, 0])).toBe(false)
  })
})

describe('silk puzzle generator', () => {
  it('returns deterministic line-solvable puzzles for arbitrary requests', () => {
    for (const [seed, size, density] of [[1, 5, 0.5], [42, 8, 0.55], [7, 12, 0.6], [99, 6, 0.45]] as const) {
      const first = generatePuzzle(seed, size, density)
      const second = generatePuzzle(seed, size, density)
      expect(second).toEqual(first)
      expect(first.lineSolvable).toBe(true)
      expect(first.density).toBeGreaterThanOrEqual(density - 0.06)
      expect(first.density).toBeLessThanOrEqual(density + 0.06)
      expect(first.pattern).toHaveLength(size * size)
    }
  })

  it('stays total and solvable for clamped extreme requests', () => {
    for (const density of [0.1, 0.45, 0.99]) {
      const puzzle = generatePuzzle(3, 5, density)
      expect(puzzle.size).toBe(5)
      expect(puzzle.lineSolvable).toBe(true)
      expect(puzzle.density).toBeGreaterThan(0)
      expect(puzzle.density).toBeLessThanOrEqual(0.65)
      const { rowClues, colClues } = computeClues(puzzle.pattern, puzzle.size)
      expect(isLineSolvable(rowClues, colClues)).toBe(true)
    }
  })
})
