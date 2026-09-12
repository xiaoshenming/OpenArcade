import { describe, expect, it } from 'vitest'
import { countSolutions, isPuzzleSolved } from './logic'
import { createSudokuPuzzle, getSudokuLevel, LEVEL_COUNT } from './levels'

const ALL = Array.from({ length: LEVEL_COUNT }, (_, index) => index + 1)
const floorBySize = (size: number) => (size === 4 ? 6 : size === 6 ? 14 : 42)

describe('star sudoku level system', () => {
  it('generates all sixty levels deterministically on repeated runs', () => {
    for (const level of ALL) {
      const first = createSudokuPuzzle(level)
      const second = createSudokuPuzzle(level)
      expect(first.givens, `level ${level}`).toEqual(second.givens)
      expect(first.solution, `level ${level}`).toEqual(second.solution)
    }
  }, 480000)

  it('constructs uniquely solvable puzzles for all sixty levels', () => {
    for (const level of ALL) {
      const rule = getSudokuLevel(level)
      const { givens, solution } = createSudokuPuzzle(level)
      givens.forEach((value, index) => {
        if (value > 0) expect(value, `level ${level} cell ${index}`).toBe(solution[index])
      })
      expect(countSolutions(givens, rule.spec, 2), `level ${level}`).toBe(1)
      const holes = givens.filter((value) => value === 0).length
      expect(holes, `level ${level}`).toBeGreaterThanOrEqual(floorBySize(rule.spec.size))
      expect(holes, `level ${level}`).toBeLessThanOrEqual(rule.holes)
    }
  }, 480000)

  it('compresses chapter one to eight 4x4 boards and escalates sizes after', () => {
    expect([1, 8, 9, 20, 21, 32, 33, 45, 60].map((level) => getSudokuLevel(level).spec.size)).toEqual([4, 4, 6, 6, 9, 9, 9, 9, 9])
    expect([1, 8, 9, 20, 21, 32, 33, 45, 60].map((level) => getSudokuLevel(level).chapter)).toEqual([1, 1, 2, 2, 3, 3, 4, 5, 5])
    const counts = [1, 2, 3, 4, 5].map((chapter) => ALL.filter((level) => getSudokuLevel(level).chapter === chapter).length)
    expect(counts).toEqual([8, 12, 12, 12, 16])
  })

  it('escalates freeze, notes, error limits and strict time chapter by chapter', () => {
    for (const level of ALL) {
      const rule = getSudokuLevel(level)
      expect(rule.freeze, `level ${level}`).toBe(rule.chapter >= 2)
      expect(rule.notes, `level ${level}`).toBe(rule.chapter >= 3)
      expect(rule.errorLimit ?? 0, `level ${level}`).toBe(rule.chapter >= 4 ? 3 : 0)
      expect(rule.strictTime, `level ${level}`).toBe(rule.chapter === 5)
      expect(rule.highlightAll, `level ${level}`).toBe(rule.chapter === 1)
      if (level > 1) {
        const previous = getSudokuLevel(level - 1)
        expect(rule.holes, `level ${level}`).toBeGreaterThanOrEqual(previous.holes)
        expect(rule.spec.size, `level ${level}`).toBeGreaterThanOrEqual(previous.spec.size)
        expect(rule.chapter, `level ${level}`).toBeGreaterThanOrEqual(previous.chapter)
      }
    }
  })

  it('tightens the par curve for 9x9 chapters and combines mechanics at the finale', () => {
    expect(getSudokuLevel(1).par).toBe(40)
    expect(getSudokuLevel(9).par).toBe(150)
    expect(getSudokuLevel(21).par).toBe(420)
    expect(getSudokuLevel(33).par).toBe(390)
    expect(getSudokuLevel(45).par).toBe(360)
    const finale = getSudokuLevel(60)
    expect(finale.errorLimit).toBe(3)
    expect(finale.strictTime).toBe(true)
    expect(finale.notes).toBe(true)
    expect(finale.freeze).toBe(true)
    expect(finale.holes).toBeGreaterThanOrEqual(getSudokuLevel(33).holes)
    expect(getSudokuLevel(60).holes).toBeGreaterThan(getSudokuLevel(21).holes)
  })

  it('keeps every puzzle finishable through player entries', () => {
    for (const level of ALL) {
      const { givens, solution } = createSudokuPuzzle(level)
      expect(isPuzzleSolved(givens, solution, solution), `level ${level}`).toBe(true)
      expect(isPuzzleSolved(givens, givens.map(() => 0), solution), `level ${level}`).toBe(false)
    }
  })

  it('clamps hostile level inputs to the valid range', () => {
    expect(getSudokuLevel(0).level).toBe(1)
    expect(getSudokuLevel(-9).level).toBe(1)
    expect(getSudokuLevel(Number.NaN).level).toBe(1)
    expect(getSudokuLevel(999).level).toBe(60)
    expect(getSudokuLevel(7.9).level).toBe(7)
    expect(getSudokuLevel(0)).toEqual(getSudokuLevel(1))
    expect(getSudokuLevel(999)).toEqual(getSudokuLevel(60))
    expect(createSudokuPuzzle(0)).toEqual(createSudokuPuzzle(1))
  })
})
