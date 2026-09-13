import { describe, expect, it } from 'vitest'
import { countSolutions, isPuzzleSolved, isRunSolutionValid } from './logic'
import { createRunPuzzle, getRunLevel, RUN_LEVEL_COUNT } from './levels'

const ALL = Array.from({ length: RUN_LEVEL_COUNT }, (_, index) => index + 1)

describe('kakuro run level system', () => {
  it('generates all sixty levels deterministically on repeated runs', () => {
    for (const level of ALL) {
      const first = createRunPuzzle(level)
      const second = createRunPuzzle(level)
      expect(first.givens, `level ${level}`).toEqual(second.givens)
      expect(first.solution, `level ${level}`).toEqual(second.solution)
      expect(first.ctx.black, `level ${level}`).toEqual(second.ctx.black)
      expect(first.ctx.runs, `level ${level}`).toEqual(second.ctx.runs)
    }
  }, 480000)

  it('constructs uniquely solvable puzzles with valid solutions for all sixty levels', () => {
    for (const level of ALL) {
      const { ctx, givens, solution } = createRunPuzzle(level)
      expect(isRunSolutionValid(solution, ctx), `level ${level} solution`).toBe(true)
      givens.forEach((value, index) => {
        if (value > 0) expect(value, `level ${level} cell ${index}`).toBe(solution[index])
      })
      expect(countSolutions(givens, ctx, 2), `level ${level}`).toBe(1)
      const holes = givens.filter((value, index) => value === 0 && !ctx.black[index]).length
      expect(holes, `level ${level}`).toBeGreaterThanOrEqual(1)
      expect(holes, `level ${level}`).toBeLessThanOrEqual(ctx.whiteCount)
      const clued = ctx.runs.filter((run) => run.clue > 0)
      expect(clued.length, `level ${level}`).toBeGreaterThanOrEqual(1)
    }
  }, 480000)

  it('scales boards and mechanics across the five chapters', () => {
    const probe = [1, 11, 12, 22, 23, 33, 34, 44, 45, 60].map((level) => getRunLevel(level))
    expect(probe.map((rule) => `${rule.rows}x${rule.cols}`)).toEqual(['5x5', '5x5', '7x7', '7x7', '8x8', '8x8', '9x8', '9x8', '9x9', '9x9'])
    expect(probe.map((rule) => rule.chapter)).toEqual([1, 1, 2, 2, 3, 3, 4, 4, 5, 5])
    expect(probe.map((rule) => rule.maxRun)).toEqual([3, 3, 4, 4, 5, 5, 6, 6, 6, 6])
    expect(probe.map((rule) => rule.par)).toEqual([90, 90, 200, 200, 380, 380, 470, 470, 540, 540])
    expect(probe.map((rule) => rule.errorLimit ?? 0)).toEqual([0, 0, 0, 0, 3, 3, 3, 3, 3, 3])
    expect(probe.map((rule) => rule.clueless)).toEqual([0, 0, 0, 0, 0.05, 0.05, 0.25, 0.25, 0.35, 0.35])
    expect(probe.map((rule) => rule.minClueless)).toEqual([0, 0, 0, 0, 1, 1, 0, 0, 0, 0])
    const counts = [1, 2, 3, 4, 5].map((chapter) => ALL.filter((level) => getRunLevel(level).chapter === chapter).length)
    expect(counts).toEqual([11, 11, 11, 11, 16])
  })

  it('introduces clueless dark runs from chapter three onward', () => {
    for (const level of [23, 28, 33]) {
      const { ctx } = createRunPuzzle(level)
      const dark = ctx.runs.filter((run) => run.clue === 0)
      expect(dark.length, `level ${level} dark runs`).toBeGreaterThanOrEqual(1)
    }
    for (const level of [1, 12, 22]) {
      const { ctx } = createRunPuzzle(level)
      expect(ctx.runs.every((run) => run.clue > 0), `level ${level} stays fully clued`).toBe(true)
    }
  })

  it('never relaxes difficulty: area, par, segment length, budget and dark segments all climb', () => {
    for (const level of ALL) {
      const rule = getRunLevel(level)
      const area = rule.rows * rule.cols
      if (level > 1) {
        const previous = getRunLevel(level - 1)
        expect(rule.keepFraction, `level ${level}`).toBeLessThanOrEqual(previous.keepFraction)
        expect(area, `level ${level}`).toBeGreaterThanOrEqual(previous.rows * previous.cols)
        expect(rule.par, `level ${level}`).toBeGreaterThanOrEqual(previous.par)
        expect(rule.maxRun, `level ${level}`).toBeGreaterThanOrEqual(previous.maxRun)
        expect(rule.errorLimit ?? 0, `level ${level}`).toBeGreaterThanOrEqual(previous.errorLimit ?? 0)
        expect(rule.clueless, `level ${level}`).toBeGreaterThanOrEqual(previous.clueless)
        expect(rule.chapter, `level ${level}`).toBeGreaterThanOrEqual(previous.chapter)
      }
    }
    expect(getRunLevel(45).clueless).toBeGreaterThan(getRunLevel(33).clueless)
    expect(getRunLevel(60).keepFraction).toBeLessThan(getRunLevel(1).keepFraction)
  })

  it('keeps every puzzle finishable through player entries', () => {
    for (const level of ALL) {
      const { givens, solution } = createRunPuzzle(level)
      expect(isPuzzleSolved(givens, solution, solution), `level ${level}`).toBe(true)
      expect(isPuzzleSolved(givens, givens.map(() => 0), solution), `level ${level}`).toBe(false)
    }
  }, 480000)

  it('clamps hostile level inputs to the valid range', () => {
    expect(getRunLevel(0).level).toBe(1)
    expect(getRunLevel(-9).level).toBe(1)
    expect(getRunLevel(Number.NaN).level).toBe(1)
    expect(getRunLevel(999).level).toBe(60)
    expect(getRunLevel(7.9).level).toBe(7)
    expect(getRunLevel(0)).toEqual(getRunLevel(1))
    expect(getRunLevel(999)).toEqual(getRunLevel(60))
    expect(createRunPuzzle(0)).toEqual(createRunPuzzle(1))
    expect(() => createRunPuzzle(Number.NaN)).not.toThrow()
  })
})
