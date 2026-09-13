import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../../platform/rng'
import { buildContext, computeScore, countSolutions, digHoles, fillSolution, hasNeighborConflict, hasRegionConflict, isPuzzleSolved, isSolutionValid, moveSelection, partitionGrid } from './logic'
import { createPeakPuzzle, getPeakLevel } from './levels'

const samplePuzzles = [1, 15, 28, 40, 55].map((level) => ({ level, puzzle: createPeakPuzzle(level) }))

describe('suguru peak core', () => {
  it('partitions every board into connected regions of 2..max cells', () => {
    for (const { level, puzzle } of samplePuzzles) {
      const rule = getPeakLevel(level)
      const { ctx } = puzzle
      const seen = new Set<number>()
      ctx.regionCells.forEach((cells, region) => {
        const inner = new Set(cells)
        expect(cells.length, `level ${level} region ${region}`).toBeGreaterThanOrEqual(2)
        expect(cells.length, `level ${level} region ${region}`).toBeLessThanOrEqual(rule.maxRegion)
        for (const cell of cells) {
          expect(ctx.regionOf[cell], `level ${level} cell ${cell}`).toBe(region)
          expect(seen.has(cell), `level ${level} cell ${cell}`).toBe(false)
          seen.add(cell)
        }
        const stack = [cells[0]]
        const reached = new Set<number>(stack)
        while (stack.length) {
          const cell = stack.pop()!
          for (const next of ctx.neighbors[cell]) {
            if (inner.has(next) && !reached.has(next)) {
              reached.add(next)
              stack.push(next)
            }
          }
        }
        expect(reached.size, `level ${level} region ${region}`).toBe(cells.length)
      })
      expect(seen.size, `level ${level}`).toBe(rule.rows * rule.cols)
    }
  })

  it('fills rule-valid grids where region digits differ and all eight neighbors differ', () => {
    for (const [rows, cols, maxRegion] of [[6, 6, 5], [8, 6, 7], [9, 8, 7], [10, 8, 7]] as const) {
      let filled = 0
      for (let seed = 1; seed <= 10; seed += 1) {
        const random = mulberry32(seed * 7919 + rows * 31 + cols)
        const { regionOf, regionCells } = partitionGrid(random, rows, cols, maxRegion)
        const ctx = buildContext(rows, cols, regionOf, regionCells)
        const solution = fillSolution(random, ctx)
        if (solution.some((value) => !value)) continue
        filled += 1
        expect(isSolutionValid(solution, ctx), `seed ${seed} ${rows}x${cols}`).toBe(true)
        expect(countSolutions(solution, ctx, 2), `seed ${seed} ${rows}x${cols}`).toBe(1)
      }
      expect(filled, `${rows}x${cols}`).toBeGreaterThan(0)
    }
  })

  it('counts solutions with a cap, rejects contradictory givens and keeps single holes unique', () => {
    const { puzzle } = samplePuzzles[0]
    const { ctx, solution } = puzzle
    expect(countSolutions(new Array<number>(ctx.total).fill(0), ctx, 2)).toBe(2)
    expect(countSolutions(new Array<number>(ctx.total).fill(0), ctx, 1)).toBe(1)
    const broken = [...solution]
    const region = ctx.regionCells[0]
    broken[region[0]] = solution[region[1]]
    expect(countSolutions(broken, ctx, 2)).toBe(0)
    for (let index = 0; index < 12; index += 1) {
      const holed = [...solution]
      holed[index] = 0
      expect(countSolutions(holed, ctx, 2), `hole ${index}`).toBe(1)
    }
  })

  it('flags region and neighbour conflicts but accepts distinct placements', () => {
    const { puzzle } = samplePuzzles[0]
    const { ctx, solution } = puzzle
    expect(hasNeighborConflict(solution, 0, ctx)).toBe(false)
    expect(hasRegionConflict(solution, 0, ctx)).toBe(false)
    const dirty = [...solution]
    dirty[ctx.neighbors[0][0]] = solution[0]
    expect(hasNeighborConflict(dirty, ctx.neighbors[0][0], ctx)).toBe(true)
    const region = ctx.regionCells[0]
    dirty[region[1]] = solution[region[0]]
    expect(hasRegionConflict(dirty, region[1], ctx)).toBe(true)
    expect(hasRegionConflict(new Array<number>(ctx.total).fill(0), region[0], ctx)).toBe(false)
  })

  it('scores with mistake and overtime penalties and moves selection with wrap-around', () => {
    expect(computeScore(0, 0, 100)).toBe(1000)
    expect(computeScore(2, 0, 100)).toBe(880)
    expect(computeScore(0, 109, 100)).toBe(1000)
    expect(computeScore(0, 110, 100)).toBe(985)
    expect(computeScore(1, 300, 100)).toBe(640)
    expect(computeScore(3, 600, 100)).toBe(100)
    expect(computeScore(30, 9000, 100)).toBe(100)
    expect(moveSelection(null, 'left', 6, 6)).toBe(0)
    expect(moveSelection(0, 'up', 6, 6)).toBe(30)
    expect(moveSelection(0, 'left', 6, 6)).toBe(5)
    expect(moveSelection(35, 'down', 6, 6)).toBe(5)
    expect(moveSelection(35, 'right', 6, 6)).toBe(30)
    expect(moveSelection(7, 'right', 3, 4)).toBe(4)
  })

  it('only reports solved boards when every entry matches the unique solution', () => {
    const { puzzle } = samplePuzzles[0]
    const { givens, solution } = puzzle
    expect(isPuzzleSolved(givens, solution, solution)).toBe(true)
    expect(isPuzzleSolved(givens, givens.map(() => 0), solution)).toBe(false)
    const hole = givens.findIndex((value) => value === 0)
    expect(hole).toBeGreaterThanOrEqual(0)
    const wrong = [...solution]
    wrong[hole] = wrong[hole] % 5 + 1
    expect(isPuzzleSolved(givens, wrong, solution)).toBe(false)
  })

  it('digs holes that always keep the puzzle uniquely solvable', () => {
    const { puzzle } = samplePuzzles[1]
    const { ctx, solution } = puzzle
    const random = mulberry32(4242)
    for (const target of [4, 20, 60]) {
      const givens = digHoles(random, solution, ctx, target)
      const holes = givens.filter((value) => value === 0).length
      expect(holes, `target ${target}`).toBeLessThanOrEqual(target)
      expect(countSolutions(givens, ctx, 2), `target ${target}`).toBe(1)
      givens.forEach((value, index) => expect(value === 0 || value === solution[index]).toBe(true))
    }
  })
})
