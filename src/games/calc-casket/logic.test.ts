import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../../platform/rng'
import { cageFeasible, computeScore, countCasketSolutions, fillLatin, isCasketSolved, isLatinValid, neighborsOf, partitionGrid, violationMask, type Cage } from './logic'
import { createCasketPuzzle } from './levels'

describe('calc casket core', () => {
  it('fills valid latin squares for every board size', () => {
    for (const size of [4, 5, 6]) {
      for (let seed = 1; seed <= 6; seed += 1) {
        const grid = fillLatin(mulberry32(seed * 7919 + size), size)
        expect(grid).toHaveLength(size * size)
        expect(grid.every((value) => value >= 1 && value <= size)).toBe(true)
        expect(isLatinValid(grid, size)).toBe(true)
      }
    }
  })

  it('grows connected cages that tile the whole board', () => {
    const tiling = (size: number, allowed: readonly number[], seeds: number) => {
      let ok = 0
      for (let seed = 1; seed <= seeds; seed += 1) {
        const layout = partitionGrid(mulberry32(seed * 104729 + size), size, [...allowed])
        if (!layout) continue
        ok += 1
        const seen = new Set<number>()
        for (const cage of layout) {
          expect(cage.length).toBeGreaterThanOrEqual(2)
          expect(cage.length).toBeLessThanOrEqual(Math.max(...allowed))
          for (let step = 1; step < cage.length; step += 1) {
            expect(cage.slice(0, step).some((cell) => neighborsOf(cage[step], size).includes(cell))).toBe(true)
          }
          cage.forEach((cell) => seen.add(cell))
        }
        expect(seen.size).toBe(size * size)
      }
      return ok
    }
    expect(tiling(4, [2], 12)).toBeGreaterThanOrEqual(3)
    expect(tiling(5, [2, 3], 12)).toBeGreaterThanOrEqual(4)
    expect(tiling(6, [2, 3, 4], 12)).toBeGreaterThanOrEqual(6)
  })

  it('counts cage-constrained boards as ambiguous, contradictory or solvable', () => {
    const ambiguous: Cage[] = [
      { cells: [0, 1], target: 3, op: '+' },
      { cells: [2, 3], target: 3, op: '+' },
    ]
    expect(countCasketSolutions(2, ambiguous, 4)).toBe(2)
    const contradictory: Cage[] = [
      { cells: [0, 3], target: 1, op: '−' },
      { cells: [1, 2], target: 3, op: '+' },
    ]
    expect(countCasketSolutions(2, contradictory, 4)).toBe(0)
    expect(countCasketSolutions(2, ambiguous, 1)).toBe(1)
  })

  it('prunes two-cell minus and divide cages from partial fills', () => {
    expect(cageFeasible([3], 1, 6, { cells: [], target: 2, op: '÷' })).toBe(true)
    expect(cageFeasible([6], 1, 6, { cells: [], target: 2, op: '÷' })).toBe(true)
    expect(cageFeasible([4], 1, 6, { cells: [], target: 3, op: '÷' })).toBe(false)
    expect(cageFeasible([2, 4], 0, 6, { cells: [], target: 2, op: '÷' })).toBe(true)
    expect(cageFeasible([2, 5], 0, 6, { cells: [], target: 2, op: '÷' })).toBe(false)
    expect(cageFeasible([6], 1, 6, { cells: [], target: 5, op: '−' })).toBe(true)
    expect(cageFeasible([3], 1, 6, { cells: [], target: 4, op: '−' })).toBe(false)
    expect(cageFeasible([2, 5], 0, 6, { cells: [], target: 3, op: '−' })).toBe(true)
    expect(cageFeasible([2, 5], 0, 6, { cells: [], target: 2, op: '−' })).toBe(false)
    expect(cageFeasible([1, 2, 3], 0, 6, { cells: [], target: 2, op: '−' })).toBe(false)
    expect(cageFeasible([3, 4], 1, 6, { cells: [], target: 12, op: '+' })).toBe(true)
    expect(cageFeasible([3, 4], 1, 6, { cells: [], target: 6, op: '+' })).toBe(false)
    expect(cageFeasible([2, 3], 1, 6, { cells: [], target: 36, op: '×' })).toBe(true)
    expect(cageFeasible([2, 3], 1, 6, { cells: [], target: 10, op: '×' })).toBe(false)
  })

  it('flags latin duplicates and impossible cages, solving only valid boards', () => {
    const dup = new Array<number>(16).fill(0)
    dup[0] = 2
    dup[1] = 2
    expect(violationMask(dup, 4, [])).toEqual([true, true, ...new Array<boolean>(14).fill(false)])
    const over = new Array<number>(16).fill(0)
    over[4] = 4
    over[5] = 5
    const cage: Cage = { cells: [4, 5], target: 7, op: '+' }
    expect(violationMask(over, 4, [cage])).toEqual([...new Array<boolean>(4).fill(false), true, true, ...new Array<boolean>(10).fill(false)])
    for (const level of [1, 15, 30, 45, 60]) {
      const { rule, cages, solution } = createCasketPuzzle(level)
      expect(isCasketSolved([...solution], rule.size, cages)).toBe(true)
      const broken = [...solution]
      broken[0] = broken[0] % rule.size + 1
      expect(isCasketSolved(broken, rule.size, cages)).toBe(false)
      expect(violationMask(broken, rule.size, cages).some(Boolean)).toBe(true)
      expect(isCasketSolved(new Array<number>(rule.size * rule.size).fill(0), rule.size, cages)).toBe(false)
    }
  })

  it('scores mistakes and overtime inside the policy band', () => {
    expect(computeScore(0, 0, 100)).toBe(1000)
    expect(computeScore(2, 0, 100)).toBe(880)
    expect(computeScore(0, 109, 100)).toBe(1000)
    expect(computeScore(0, 110, 100)).toBe(985)
    expect(computeScore(3, 600, 560)).toBe(760)
    expect(computeScore(20, 9000, 100)).toBe(100)
    expect(computeScore(0, 0, 100)).toBeLessThanOrEqual(5000)
  })
})
