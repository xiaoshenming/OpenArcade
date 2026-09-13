import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../../platform/rng'
import { bandPattern, buildRunContext, computeScore, countSolutions, digHoles, fillRunGrid, isPuzzleSolved, isRunSolutionValid, moveSelection, writeClues } from './logic'
import { createRunPuzzle, getRunLevel } from './levels'

const samplePuzzles = [1, 15, 28, 40, 55].map((level) => ({ level, puzzle: createRunPuzzle(level) }))

describe('kakuro run core', () => {
  it('builds layouts where every white cell belongs to a 2+ cell run of matching direction', () => {
    for (const { level, puzzle } of samplePuzzles) {
      const rule = getRunLevel(level)
      const { ctx } = puzzle
      expect(ctx.whiteCount, `level ${level}`).toBeGreaterThanOrEqual(8)
      expect(ctx.runs.length, `level ${level}`).toBeGreaterThanOrEqual(4)
      ctx.runs.forEach((run) => {
        expect(run.cells.length, `level ${level} run ${run.id}`).toBeGreaterThanOrEqual(2)
        expect(run.cells.length, `level ${level} run ${run.id}`).toBeLessThanOrEqual(rule.maxRun)
        run.cells.forEach((cell, at) => {
          expect(ctx.black[cell], `level ${level} run ${run.id} cell ${cell}`).toBe(false)
          expect(ctx.runsOfCell[cell], `level ${level} cell ${cell}`).toContain(run.id)
          expect(ctx.runsOfCell[cell].length, `level ${level} cell ${cell}`).toBeLessThanOrEqual(2)
          if (at > 0) {
            const previous = run.cells[at - 1]
            const step = run.dir === 'h' ? 1 : rule.cols
            expect(cell - previous, `level ${level} run ${run.id} contiguous`).toBe(step)
          }
        })
        if (run.dir === 'h') expect(run.cells.length, `level ${level} run ${run.id} row bound`).toBeLessThanOrEqual(rule.cols - (run.cells[0] % rule.cols))
      })
      const seen = new Set<number>()
      ctx.runs.forEach((run) => run.cells.forEach((cell) => seen.add(cell)))
      expect(seen.size, `level ${level}`).toBe(ctx.whiteCount)
    }
  })

  it('fills distinct-per-run grids for many seeded layouts', () => {
    for (const [rows, cols, maxRun] of [[5, 5, 3], [7, 7, 4], [8, 8, 5], [9, 9, 6]] as const) {
      let filled = 0
      for (let seed = 1; seed <= 10; seed += 1) {
        const random = mulberry32(seed * 6421 + rows * 17 + cols)
        const ctx = buildRunContext(rows, cols, bandPattern(rows, cols, maxRun), maxRun)
        if (!ctx) throw new Error('band layout rejected')
        const solution = fillRunGrid(random, ctx)
        if (solution.some((value, index) => !value && !ctx.black[index])) continue
        filled += 1
        expect(isRunSolutionValid(solution, ctx), `seed ${seed} ${rows}x${cols}`).toBe(true)
        expect(countSolutions(solution, ctx, 2), `seed ${seed} ${rows}x${cols}`).toBe(1)
      }
      expect(filled, `${rows}x${cols}`).toBeGreaterThan(0)
    }
  })

  it('enforces run sums, distinct digits and reports contradictions through the solver', () => {
    const random = mulberry32(2024)
    const ctx = buildRunContext(5, 5, bandPattern(5, 5, 3), 3)!
    const solution = fillRunGrid(random, ctx)
    expect(isRunSolutionValid(solution, ctx)).toBe(true)
    writeClues(ctx, solution)
    expect(countSolutions(solution, ctx, 2)).toBe(1)
    expect(countSolutions(new Array<number>(25).fill(0), ctx, 2)).toBe(2)
    const holed = [...solution]
    holed[ctx.whiteCells[0]] = 0
    expect(countSolutions(holed, ctx, 2)).toBeGreaterThanOrEqual(1)
    const duplicated = [...solution]
    const run = ctx.runs[0]
    duplicated[run.cells[1]] = duplicated[run.cells[0]]
    expect(countSolutions(duplicated, ctx, 2)).toBe(0)
    const trueClue = ctx.runs[1].clue
    ctx.runs[1].clue = trueClue + 9
    expect(countSolutions(solution, ctx, 2)).toBe(0)
    ctx.runs[1].clue = trueClue
    expect(countSolutions(solution, ctx, 2)).toBe(1)
  })

  it('keeps clueless runs satisfiable while clued runs stay sum-checked', () => {
    for (const [at, chapter] of [[2, 3], [3, 4]] as const) {
      const { level, puzzle } = samplePuzzles[at]
      const { ctx, solution } = puzzle
      const hidden = ctx.runs.filter((run) => run.clue === 0)
      expect(hidden.length, `chapter ${chapter} has dark segments`).toBeGreaterThan(0)
      ctx.runs.forEach((run) => {
        if (run.clue === 0) return
        const sum = run.cells.reduce((total, cell) => total + solution[cell], 0)
        expect(sum, `level ${level} run ${run.id}`).toBe(run.clue)
      })
      expect(countSolutions(solution, ctx, 2), `level ${level}`).toBe(1)
    }
  })

  it('digs givens while preserving a unique solution', () => {
    const { puzzle } = samplePuzzles[1]
    const { ctx, solution } = puzzle
    const random = mulberry32(777)
    for (const target of [3, 10, 40]) {
      const givens = digHoles(random, solution, ctx, target)
      const holes = givens.filter((value, index) => value === 0 && !ctx.black[index]).length
      expect(holes, `target ${target}`).toBeLessThanOrEqual(target)
      expect(countSolutions(givens, ctx, 2), `target ${target}`).toBe(1)
      givens.forEach((value, index) => expect(value === 0 || value === solution[index]).toBe(true))
    }
  })

  it('scores with penalties and moves selection only across white cells', () => {
    expect(computeScore(0, 0, 90)).toBe(1000)
    expect(computeScore(2, 0, 90)).toBe(880)
    expect(computeScore(0, 99, 90)).toBe(1000)
    expect(computeScore(0, 100, 90)).toBe(985)
    expect(computeScore(3, 900, 90)).toBe(100)
    expect(moveSelection(null, 'down', 5, 5, [6, 7, 8, 11, 13])).toBe(6)
    const cells = [6, 8, 11, 13, 16]
    expect(moveSelection(6, 'right', 5, 5, cells)).toBe(8)
    expect(moveSelection(8, 'left', 5, 5, cells)).toBe(6)
    expect(moveSelection(8, 'right', 5, 5, cells)).toBe(6)
    expect(moveSelection(6, 'down', 5, 5, cells)).toBe(11)
    expect(moveSelection(16, 'down', 5, 5, cells)).toBe(6)
    expect(moveSelection(6, 'up', 5, 5, cells)).toBe(16)
    expect(moveSelection(13, 'right', 5, 5, cells)).toBe(6)
    expect(isPuzzleSolved([1, 0, 2], [2, 3, 2], [1, 3, 2])).toBe(true)
    expect(isPuzzleSolved([1, 0, 2], [2, 4, 2], [1, 3, 2])).toBe(false)
  })
})
