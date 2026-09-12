import { describe, expect, it } from 'vitest'
import { countSolutions, isPuzzleSolved } from './logic'
import { createSudokuPuzzle, getSudokuLevel, LEVEL_COUNT } from './levels'

const SAMPLED = [1, 5, 9, 12, 13, 17, 21, 24, 25, 29, 33, 36, 37, 41, 45, 48, 49, 53, 57, 60]
const floorBySize = (size: number) => (size === 4 ? 6 : size === 6 ? 14 : 42)

describe('star sudoku level system', () => {
  it('generates all sixty levels deterministically on repeated runs', () => {
    for (let level = 1; level <= LEVEL_COUNT; level += 1) {
      const first = createSudokuPuzzle(level)
      const second = createSudokuPuzzle(level)
      expect(first.givens, `level ${level}`).toEqual(second.givens)
      expect(first.solution, `level ${level}`).toEqual(second.solution)
    }
  }, 180000)

  it('constructs uniquely solvable puzzles whose givens match the solution', () => {
    for (const level of SAMPLED) {
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
  }, 180000)

  it('escalates board size, hole pressure and rules across five chapters', () => {
    expect(getSudokuLevel(1).spec.size).toBe(4)
    expect(getSudokuLevel(12).spec.size).toBe(4)
    expect(getSudokuLevel(13).spec.size).toBe(6)
    expect(getSudokuLevel(24).spec.size).toBe(6)
    expect(getSudokuLevel(25).spec.size).toBe(9)
    expect(getSudokuLevel(60).spec.size).toBe(9)
    for (let level = 1; level <= LEVEL_COUNT; level += 1) {
      const rule = getSudokuLevel(level)
      expect(rule.chapter).toBe(Math.floor((level - 1) / 12) + 1)
      if (level > 1) expect(rule.holes).toBeGreaterThanOrEqual(getSudokuLevel(level - 1).holes)
      expect(rule.notes).toBe(rule.chapter >= 3)
      expect(rule.highlightAll).toBe(rule.chapter === 1)
      expect(rule.errorLimit ?? 0).toBe(rule.chapter >= 4 ? 3 : 0)
      expect(rule.strictTime).toBe(rule.chapter === 5)
    }
  })

  it('tightens the par curve for 9x9 chapters and combines mechanics in chapter five', () => {
    expect(getSudokuLevel(1).par).toBe(40)
    expect(getSudokuLevel(13).par).toBe(150)
    expect(getSudokuLevel(25).par).toBe(420)
    expect(getSudokuLevel(37).par).toBe(390)
    expect(getSudokuLevel(49).par).toBe(360)
    const finale = getSudokuLevel(60)
    expect(finale.errorLimit).toBe(3)
    expect(finale.strictTime).toBe(true)
    expect(finale.notes).toBe(true)
    expect(finale.holes).toBeGreaterThanOrEqual(getSudokuLevel(37).holes)
    expect(getSudokuLevel(60).holes).toBeGreaterThan(getSudokuLevel(25).holes)
  })

  it('keeps every sampled puzzle finishable through player entries', () => {
    for (const level of SAMPLED) {
      const { givens, solution } = createSudokuPuzzle(level)
      expect(isPuzzleSolved(givens, solution, solution), `level ${level}`).toBe(true)
      expect(isPuzzleSolved(givens, givens.map(() => 0), solution), `level ${level}`).toBe(false)
    }
  }, 180000)

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
