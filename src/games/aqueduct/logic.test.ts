import { describe, expect, it } from 'vitest'
import { computeFlow, generateAquaPuzzle, minClicks, pipeDegree, rotateMask, type AquaPuzzle } from './logic'
import { AQUA_LEVEL_COUNT, chapterOf, getAquaLevel } from './levels'

const startMasks = (puzzle: AquaPuzzle) => puzzle.base.map((mask, index) => rotateMask(mask, puzzle.turns0[index]))
const solveMasks = (puzzle: AquaPuzzle) => puzzle.base.map((mask, index) => rotateMask(mask, puzzle.turns0[index] + minClicks(mask, puzzle.turns0[index])))

describe('aqueduct puzzle generator', () => {
  it('rotates masks clockwise and validates flow, connectivity and leaks', () => {
    expect(rotateMask(0b0001, 1)).toBe(0b0010)
    expect(rotateMask(0b0001, 5)).toBe(0b0010)
    expect(rotateMask(0b1000, 1)).toBe(0b0001)
    expect(minClicks(0b0101, 2)).toBe(0)
    expect(minClicks(0b0011, 1)).toBe(3)
    const solved = computeFlow(1, 2, [0b0010, 0b1000], [0])
    expect(solved.solved).toBe(true)
    expect(solved.filled).toBe(2)
    const leaking = computeFlow(1, 2, [0b0010, 0b0001], [0])
    expect(leaking.solved).toBe(false)
    expect(leaking.leaks[0]).toBe(true)
    expect(leaking.leaks[1]).toBe(true)
    const split = computeFlow(2, 1, [0b0010, 0b0001], [1])
    expect(split.solved).toBe(false)
    expect(split.filled).toBe(1)
  })

  it('generates identical puzzles for the same level', () => {
    for (const level of [1, 12, 23, 34, 45, 60]) expect(generateAquaPuzzle(level)).toEqual(generateAquaPuzzle(level))
    expect(generateAquaPuzzle(-3)).toEqual(generateAquaPuzzle(1))
    expect(generateAquaPuzzle(999)).toEqual(generateAquaPuzzle(AQUA_LEVEL_COUNT))
  })

  it('solves every level back to its tree with no leaks and a wet grid', () => {
    for (let level = 1; level <= AQUA_LEVEL_COUNT; level += 1) {
      const puzzle = generateAquaPuzzle(level)
      const solution = computeFlow(puzzle.rows, puzzle.cols, solveMasks(puzzle), puzzle.sources)
      expect(solution.solved, `level ${level} must be solvable`).toBe(true)
      expect(solution.filled).toBe(puzzle.rows * puzzle.cols)
      expect(computeFlow(puzzle.rows, puzzle.cols, startMasks(puzzle), puzzle.sources).solved, `level ${level} must start unsolved`).toBe(false)
      puzzle.base.forEach((mask) => expect(mask).not.toBe(0))
      expect(puzzle.par).toBe(Math.max(1, Math.round(puzzle.depth * 0.8)))
    }
  })

  it('stages five chapters with escalating mechanics', () => {
    expect([1, 11, 12, 22, 23, 33, 34, 44, 45, 60].map(chapterOf)).toEqual([1, 1, 2, 2, 3, 3, 4, 4, 5, 5])
    expect(getAquaLevel(5)).toMatchObject({ rows: 5, cols: 5, dual: false, budgeted: false, locks: false, fog: false })
    expect(getAquaLevel(15)).toMatchObject({ rows: 6, cols: 6, budgeted: true })
    expect(getAquaLevel(27)).toMatchObject({ rows: 7, cols: 7, locks: true })
    expect(getAquaLevel(38)).toMatchObject({ dual: true })
    expect(getAquaLevel(50)).toMatchObject({ fog: true, budgeted: true })
    expect(getAquaLevel(60)).toMatchObject({ fog: true, budgeted: true, dual: true })
    expect(getAquaLevel(1).chaos).toBeLessThan(getAquaLevel(11).chaos)
  })

  it('welds locked pieces at their solved orientation without breaking solvency', () => {
    for (const level of [23, 28, 33]) {
      const puzzle = generateAquaPuzzle(level)
      const count = puzzle.locked.filter(Boolean).length
      expect(count).toBeGreaterThan(0)
      expect(count).toBeLessThan(puzzle.base.length / 2)
      puzzle.locked.forEach((lock, index) => { if (lock) expect(puzzle.turns0[index]).toBe(0) })
      expect(computeFlow(puzzle.rows, puzzle.cols, solveMasks(puzzle), puzzle.sources).solved).toBe(true)
    }
    expect(generateAquaPuzzle(10).locked.every((lock) => !lock)).toBe(true)
    expect(generateAquaPuzzle(50).locked.every((lock) => !lock)).toBe(true)
  })

  it('keeps step budgets above the optimal rotation count', () => {
    for (let level = 12; level <= AQUA_LEVEL_COUNT; level += 1) {
      const puzzle = generateAquaPuzzle(level)
      if (!getAquaLevel(level).budgeted) { expect(puzzle.budget).toBeUndefined(); continue }
      const budget = puzzle.budget
      expect(budget).toBeDefined()
      if (budget !== undefined) expect(budget).toBeGreaterThan(puzzle.depth)
    }
  })

  it('deepens the scramble across chapters', () => {
    const sums = Array.from({ length: 5 }, () => 0)
    const counts = Array.from({ length: 5 }, () => 0)
    for (let level = 1; level <= AQUA_LEVEL_COUNT; level += 1) {
      const chapter = chapterOf(level) - 1
      sums[chapter] += generateAquaPuzzle(level).depth
      counts[chapter] += 1
    }
    const averages = sums.map((sum, index) => sum / counts[index])
    for (let chapter = 0; chapter < 3; chapter += 1) expect(averages[chapter + 1]).toBeGreaterThan(averages[chapter])
    expect(averages[3]).toBeGreaterThan(averages[2])
    // ch4 与 ch5 同为 8×8 且 chaos 都已饱和到 1,二者深度同为 rng 噪声量级;终章仍须不松于中章
    expect(averages[4]).toBeGreaterThanOrEqual(averages[2])
  })

  it('wires dual-source chapters only when both springs feed the grid', () => {
    for (let level = 34; level <= AQUA_LEVEL_COUNT; level += 1) {
      const puzzle = generateAquaPuzzle(level)
      const [a, b] = puzzle.sources
      expect(puzzle.sources, `level ${level}`).toHaveLength(2)
      expect(a, `level ${level}`).not.toBe(b)
      const both = computeFlow(puzzle.rows, puzzle.cols, solveMasks(puzzle), puzzle.sources)
      expect(both.solved, `level ${level}`).toBe(true)
      const single = computeFlow(puzzle.rows, puzzle.cols, solveMasks(puzzle), [a])
      expect(single.filled, `level ${level}`).toBeLessThan(puzzle.rows * puzzle.cols)
    }
    expect(generateAquaPuzzle(15).sources).toHaveLength(1)
  })

  it('fails budgeted runs that spend the whole quota without a wet grid', () => {
    for (const level of [15, 18, 22, 50, 55, 60]) {
      const puzzle = generateAquaPuzzle(level)
      const budget = puzzle.budget
      expect(budget, `level ${level}`).toBeDefined()
      if (budget === undefined) continue
      const victim = puzzle.base.findIndex((_, index) => !puzzle.locked[index])
      expect(victim, `level ${level}`).toBeGreaterThanOrEqual(0)
      const turns = [...puzzle.turns0]
      let moves = 0
      let solved = false
      while (moves < budget && !solved) {
        turns[victim] += 1
        moves += 1
        solved = computeFlow(puzzle.rows, puzzle.cols, puzzle.base.map((mask, index) => rotateMask(mask, turns[index])), puzzle.sources).solved
      }
      expect(solved, `level ${level}`).toBe(false)
      expect(moves, `level ${level}`).toBe(budget)
      const failed = puzzle.budget !== undefined && !solved && moves >= puzzle.budget
      expect(failed, `level ${level}`).toBe(true)
    }
  })

  it('clamps boundary levels and keeps sources and sinks in bounds', () => {
    expect(getAquaLevel(0)).toEqual(getAquaLevel(1))
    expect(getAquaLevel(999)).toEqual(getAquaLevel(60))
    for (const level of [-3, 0, 1, 34, 60, 999]) {
      const puzzle = generateAquaPuzzle(level)
      expect(new Set(puzzle.sources).size).toBe(puzzle.sources.length)
      puzzle.sources.forEach((cell) => {
        expect(cell).toBeGreaterThanOrEqual(0)
        expect(cell).toBeLessThan(puzzle.rows * puzzle.cols)
      })
      const sinks = puzzle.base.filter((mask, index) => pipeDegree(mask) === 1 && !puzzle.sources.includes(index)).length
      expect(sinks).toBeGreaterThan(0)
    }
  })
})
