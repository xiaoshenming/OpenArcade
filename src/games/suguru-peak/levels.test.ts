import { describe, expect, it } from 'vitest'
import { countSolutions, isPuzzleSolved, isSolutionValid } from './logic'
import { createPeakPuzzle, getPeakLevel, LEVEL_COUNT } from './levels'

const ALL = Array.from({ length: LEVEL_COUNT }, (_, index) => index + 1)

describe('suguru peak level system', () => {
  it('generates all sixty levels deterministically on repeated runs', () => {
    for (const level of ALL) {
      const first = createPeakPuzzle(level)
      const second = createPeakPuzzle(level)
      expect(first.givens, `level ${level}`).toEqual(second.givens)
      expect(first.solution, `level ${level}`).toEqual(second.solution)
      expect(first.ctx.regionOf, `level ${level}`).toEqual(second.ctx.regionOf)
      expect(first.ctx.regionCells, `level ${level}`).toEqual(second.ctx.regionCells)
    }
  }, 480000)

  it('constructs uniquely solvable puzzles with valid solutions for all sixty levels', () => {
    for (const level of ALL) {
      const rule = getPeakLevel(level)
      const { ctx, givens, solution } = createPeakPuzzle(level)
      expect(isSolutionValid(solution, ctx), `level ${level} solution`).toBe(true)
      givens.forEach((value, index) => {
        if (value > 0) expect(value, `level ${level} cell ${index}`).toBe(solution[index])
      })
      expect(countSolutions(givens, ctx, 2), `level ${level}`).toBe(1)
      const holes = givens.filter((value) => value === 0).length
      expect(holes, `level ${level}`).toBeGreaterThanOrEqual(1)
      expect(holes, `level ${level}`).toBeLessThanOrEqual(rule.holeTarget)
      const prefilled = givens.filter((value) => value > 0).length
      expect(prefilled, `level ${level} reserved hints`).toBeGreaterThanOrEqual(rule.hintKeep)
    }
  }, 480000)

  it('scales boards and mechanics across the five chapters', () => {
    const probe = [1, 11, 12, 22, 23, 33, 34, 44, 45, 60].map((level) => getPeakLevel(level))
    expect(probe.map((rule) => `${rule.rows}x${rule.cols}`)).toEqual(['6x6', '6x6', '8x6', '8x6', '9x7', '9x7', '9x8', '9x8', '10x8', '10x8'])
    expect(probe.map((rule) => rule.chapter)).toEqual([1, 1, 2, 2, 3, 3, 4, 4, 5, 5])
    expect(probe.map((rule) => rule.maxRegion)).toEqual([5, 5, 7, 7, 7, 7, 7, 7, 7, 7])
    expect(probe.map((rule) => rule.par)).toEqual([100, 100, 220, 220, 400, 400, 500, 500, 580, 580])
    expect(probe.map((rule) => rule.errorLimit ?? 0)).toEqual([0, 0, 0, 0, 3, 3, 3, 3, 3, 3])
    expect(probe.map((rule) => rule.hintKeep)).toEqual([0, 0, 0, 0, 0, 0, 2, 2, 1, 1])
    const counts = [1, 2, 3, 4, 5].map((chapter) => ALL.filter((level) => getPeakLevel(level).chapter === chapter).length)
    expect(counts).toEqual([11, 11, 11, 11, 16])
  })

  it('keeps reserved hint givens from chapter four and tapers them at the summit', () => {
    const chapterFour = ALL.filter((level) => getPeakLevel(level).chapter === 4)
    expect(chapterFour.map((level) => getPeakLevel(level).hintKeep)).toEqual(chapterFour.map((_, at) => 2 + (at % 2)))
    expect(ALL.filter((level) => getPeakLevel(level).chapter === 5).every((level) => getPeakLevel(level).hintKeep === 1)).toBe(true)
    expect(ALL.filter((level) => getPeakLevel(level).chapter <= 3).every((level) => getPeakLevel(level).hintKeep === 0)).toBe(true)
    expect(getPeakLevel(34).detail).toContain('提示格')
    expect(getPeakLevel(45).detail).toContain('提示格')
  })

  it('never relaxes difficulty: area, hole target, par, region size and budget all climb', () => {
    for (const level of ALL) {
      const rule = getPeakLevel(level)
      const area = rule.rows * rule.cols
      expect(rule.holeTarget, `level ${level}`).toBeLessThanOrEqual(area - 6)
      if (level > 1) {
        const previous = getPeakLevel(level - 1)
        expect(rule.holeTarget, `level ${level}`).toBeGreaterThanOrEqual(previous.holeTarget)
        expect(area, `level ${level}`).toBeGreaterThanOrEqual(previous.rows * previous.cols)
        expect(rule.par, `level ${level}`).toBeGreaterThanOrEqual(previous.par)
        expect(rule.maxRegion, `level ${level}`).toBeGreaterThanOrEqual(previous.maxRegion)
        expect(rule.errorLimit ?? 0, `level ${level}`).toBeGreaterThanOrEqual(previous.errorLimit ?? 0)
        expect(rule.chapter, `level ${level}`).toBeGreaterThanOrEqual(previous.chapter)
      }
    }
    expect(getPeakLevel(60).holeTarget).toBeGreaterThan(getPeakLevel(23).holeTarget)
    expect(getPeakLevel(44).holeTarget).toBeGreaterThan(getPeakLevel(33).holeTarget)
  })

  it('keeps every puzzle finishable through player entries', () => {
    for (const level of ALL) {
      const { givens, solution } = createPeakPuzzle(level)
      expect(isPuzzleSolved(givens, solution, solution), `level ${level}`).toBe(true)
      expect(isPuzzleSolved(givens, givens.map(() => 0), solution), `level ${level}`).toBe(false)
    }
  }, 480000)

  it('clamps hostile level inputs to the valid range', () => {
    expect(getPeakLevel(0).level).toBe(1)
    expect(getPeakLevel(-9).level).toBe(1)
    expect(getPeakLevel(Number.NaN).level).toBe(1)
    expect(getPeakLevel(999).level).toBe(60)
    expect(getPeakLevel(7.9).level).toBe(7)
    expect(getPeakLevel(0)).toEqual(getPeakLevel(1))
    expect(getPeakLevel(999)).toEqual(getPeakLevel(60))
    expect(createPeakPuzzle(0)).toEqual(createPeakPuzzle(1))
    expect(() => createPeakPuzzle(Number.NaN)).not.toThrow()
  })
})
