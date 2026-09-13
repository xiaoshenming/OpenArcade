import { describe, expect, it } from 'vitest'
import { componentsOf, crossOf, failedScore, isBudgetSpent, minDetonations, SCORE_CAP, scoreFor, simulateChain } from './logic'
import { createFusePuzzle, FUSE_LEVEL_COUNT, getFuseLevel, type FusePuzzle } from './levels'

const grid = (size: number, cells: number[]) => Array.from({ length: size }, (_, cell) => cells.includes(cell))

const replay = (puzzle: FusePuzzle) => {
  let state = [...puzzle.bombs]
  const waves: number[][] = []
  for (const cell of puzzle.solution) {
    const result = simulateChain(state, puzzle.locked, puzzle.spec.cols, puzzle.spec.rows, cell)
    waves.push(...result.waves)
    state = state.map((bomb, index) => bomb && !result.cleared.includes(index))
  }
  return { rest: state, waves }
}

describe('fuse chain simulation', () => {
  it('detonates recursive cross chains while manual blasts spare locked bombs', () => {
    expect(crossOf(12, 5, 5)).toEqual([12, 7, 17, 11, 13])
    expect(crossOf(0, 5, 5)).toEqual([0, 5, 1])
    expect(crossOf(2, 5, 5)).toEqual([2, 7, 1, 3])
    expect(crossOf(4, 5, 5)).toEqual([4, 9, 3])
    expect(crossOf(24, 5, 5)).toEqual([24, 19, 23])
    const column = grid(25, [7, 12, 17])
    const locked = grid(25, [12])
    const chain = simulateChain(column, locked, 5, 5, 7)
    expect(chain.waves).toEqual([[7], [12], [17]])
    expect(chain.cleared).toEqual([7, 12, 17])
    expect(simulateChain(grid(25, [12]), grid(25, [12]), 5, 5, 11)).toEqual({ cleared: [], waves: [] })
    expect(simulateChain(grid(25, [10, 12]), grid(25, []), 5, 5, 11).waves).toEqual([[10, 12]])
    expect(simulateChain(grid(25, [12]), grid(25, []), 5, 5, 0)).toEqual({ cleared: [], waves: [] })
    expect(simulateChain(grid(25, [12]), grid(25, []), 5, 5, 999).cleared).toEqual([])
    expect(simulateChain(grid(25, [12]), grid(25, []), 5, 5, -1).waves).toEqual([])
    expect(simulateChain(grid(25, [12]), grid(25, []), 5, 5, 2.5).cleared).toEqual([])
    expect(simulateChain(grid(25, [12]), grid(25, []), 5, 5, 12).waves).toEqual([[12]])
  })

  it('keeps wave partition and cross propagation invariants on every cell of every level', () => {
    for (let level = 1; level <= FUSE_LEVEL_COUNT; level += 1) {
      const puzzle = createFusePuzzle(level)
      const { spec, bombs, locked } = puzzle
      for (let cell = 0; cell < bombs.length; cell += 1) {
        const { cleared, waves } = simulateChain(bombs, locked, spec.cols, spec.rows, cell)
        const union = waves.flat()
        expect(union).toEqual(cleared)
        expect(new Set(cleared).size).toBe(cleared.length)
        cleared.forEach((hit) => expect(bombs[hit]).toBe(true))
        if (waves.length > 0) {
          const cross = crossOf(cell, spec.cols, spec.rows)
          waves[0].forEach((hit) => {
            expect(cross).toContain(hit)
            expect(locked[hit]).toBe(false)
          })
          for (let wave = 1; wave < waves.length; wave += 1) {
            const before = new Set(waves[wave - 1])
            waves[wave].forEach((hit) => {
              expect(crossOf(hit, spec.cols, spec.rows).some((from) => before.has(from))).toBe(true)
            })
          }
        }
      }
    }
  })

  it('constructs a solvable puzzle whose witness replay clears every detonator', () => {
    for (let level = 1; level <= FUSE_LEVEL_COUNT; level += 1) {
      const puzzle = createFusePuzzle(level)
      const { spec, bombs, locked, par, solution } = puzzle
      const total = bombs.filter(Boolean).length
      expect(total).toBeGreaterThan(0)
      expect(par).toBe(solution.length)
      expect(par).toBeGreaterThanOrEqual(1)
      expect(par).toBeLessThanOrEqual(total)
      solution.forEach((cell) => {
        expect(cell).toBeGreaterThanOrEqual(0)
        expect(cell).toBeLessThan(spec.rows * spec.cols)
        expect(locked[cell]).toBe(false)
      })
      const { rest, waves } = replay(puzzle)
      expect(rest.every((bomb) => !bomb)).toBe(true)
      expect(waves.length).toBeGreaterThanOrEqual(par)
      expect(minDetonations(bombs, locked, spec.cols, spec.rows)).toEqual({ count: par, cells: solution })
    }
  })

  it('locks bombs away from manual blasts yet keeps an igniter in every component', () => {
    expect(getFuseLevel(30).locks).toBe(0)
    expect(getFuseLevel(34).locks).toBe(1)
    expect(getFuseLevel(60).locks).toBe(5)
    for (let level = 34; level <= FUSE_LEVEL_COUNT; level += 1) {
      const puzzle = createFusePuzzle(level)
      const { spec, bombs, locked, solution } = puzzle
      const lockCells = locked.map((lock, cell) => (lock ? cell : -1)).filter((cell) => cell >= 0)
      expect(lockCells).toHaveLength(spec.locks)
      lockCells.forEach((cell) => expect(bombs[cell]).toBe(true))
      const comp = componentsOf(bombs, spec.cols, spec.rows)
      const groups = comp.reduce((max, id) => Math.max(max, id + 1), 0)
      for (let id = 0; id < groups; id += 1) {
        const members = comp.map((owner, cell) => (owner === id ? cell : -1)).filter((cell) => cell >= 0)
        expect(members.some((cell) => !locked[cell])).toBe(true)
      }
      solution.forEach((cell) => expect(locked[cell]).toBe(false))
    }
    expect(minDetonations(grid(25, [12]), grid(25, [12]), 5, 5).count).toBe(Number.POSITIVE_INFINITY)
    expect(minDetonations(grid(25, [12]), grid(25, [12]), 5, 5).cells).toEqual([])
    expect(minDetonations(grid(25, []), grid(25, []), 5, 5)).toEqual({ count: 0, cells: [] })
    expect(minDetonations(grid(25, [7, 12, 17]), grid(25, []), 5, 5).count).toBe(1)
  })

  it('generates deterministic distinct boards and clamps out-of-range levels', () => {
    for (let level = 1; level <= FUSE_LEVEL_COUNT; level += 1) {
      expect(createFusePuzzle(level)).toEqual(createFusePuzzle(level))
    }
    const signatures = new Set(Array.from({ length: FUSE_LEVEL_COUNT }, (_, index) => {
      const puzzle = createFusePuzzle(index + 1)
      return `${puzzle.spec.rows}x${puzzle.spec.cols}:${puzzle.bombs.map((bomb) => (bomb ? 1 : 0)).join('')}:${puzzle.locked.map((lock) => (lock ? 1 : 0)).join('')}`
    }))
    expect(signatures.size).toBe(FUSE_LEVEL_COUNT)
    expect(getFuseLevel(0)).toEqual(getFuseLevel(1))
    expect(getFuseLevel(-3)).toEqual(getFuseLevel(1))
    expect(getFuseLevel(999)).toEqual(getFuseLevel(FUSE_LEVEL_COUNT))
    expect(getFuseLevel(12.9)).toEqual(getFuseLevel(12))
    expect(createFusePuzzle(0)).toEqual(createFusePuzzle(1))
    expect(createFusePuzzle(999)).toEqual(createFusePuzzle(FUSE_LEVEL_COUNT))
  })

  it('escalates bombs, locks, budgets and par across five chapters', () => {
    expect(getFuseLevel(1)).toMatchObject({ chapter: 1, rows: 6, cols: 6, bombs: 5, locks: 0, slack: 0 })
    expect(getFuseLevel(12)).toMatchObject({ chapter: 2, rows: 6, cols: 8, mode: 'field' })
    expect(getFuseLevel(23)).toMatchObject({ chapter: 3, rows: 8, cols: 8, slack: 2, mode: 'budget' })
    expect(getFuseLevel(34)).toMatchObject({ chapter: 4, rows: 8, cols: 9, locks: 1, mode: 'locked' })
    expect(getFuseLevel(45)).toMatchObject({ chapter: 5, rows: 8, cols: 10, slack: 2, locks: 2, mode: 'core' })
    expect(getFuseLevel(60)).toMatchObject({ chapter: 5, bombs: 22, locks: 5 })
    for (const [chapter, from, to] of [[1, 1, 11], [2, 12, 22], [3, 23, 33], [4, 34, 44], [5, 45, 60]] as const) {
      for (let level = from; level <= to; level += 1) expect(getFuseLevel(level).chapter).toBe(chapter)
    }
    const specs = Array.from({ length: FUSE_LEVEL_COUNT }, (_, index) => getFuseLevel(index + 1))
    const puzzles = Array.from({ length: FUSE_LEVEL_COUNT }, (_, index) => createFusePuzzle(index + 1))
    for (let index = 1; index < specs.length; index += 1) {
      expect(specs[index].bombs).toBeGreaterThanOrEqual(specs[index - 1].bombs)
      expect(puzzles[index].par).toBeGreaterThanOrEqual(specs[index].par[0])
      expect(puzzles[index].par).toBeLessThanOrEqual(specs[index].par[1])
    }
    for (const [from, to] of [[34, 44], [45, 60]] as const) {
      for (let level = from + 1; level <= to; level += 1) expect(specs[level - 1].locks).toBeGreaterThanOrEqual(specs[level - 2].locks)
    }
    for (let level = 1; level <= FUSE_LEVEL_COUNT; level += 1) {
      const puzzle = puzzles[level - 1]
      const bombs = puzzle.bombs.filter(Boolean).length
      expect(bombs).toBe(puzzle.spec.bombs)
      if (puzzle.spec.slack > 0) {
        expect(puzzle.budget).toBe(puzzle.par + puzzle.spec.slack)
        expect(puzzle.budget).toBeLessThanOrEqual(puzzle.par + 2)
        expect(puzzle.budget).toBeGreaterThanOrEqual(puzzle.par + 1)
      } else {
        expect(puzzle.budget).toBeUndefined()
      }
    }
    const means = [1, 2, 3, 4, 5].map((chapter) => {
      const range = puzzles.filter((puzzle) => puzzle.spec.chapter === chapter)
      return range.reduce((total, puzzle) => total + puzzle.par, 0) / range.length
    })
    for (let index = 1; index < means.length; index += 1) expect(means[index]).toBeGreaterThan(means[index - 1])
  })

  it('scores detonations, spare lives and budget boundaries', () => {
    expect(scoreFor(0, 3)).toBe(1300)
    expect(scoreFor(2, 3)).toBe(1240)
    expect(scoreFor(4, 2)).toBe(1080)
    expect(scoreFor(40, 3)).toBe(100)
    expect(scoreFor(0, 900)).toBe(SCORE_CAP)
    expect(failedScore(10)).toBe(700)
    expect(failedScore(15)).toBe(550)
    expect(failedScore(40)).toBe(0)
    expect(isBudgetSpent(4, 5)).toBe(false)
    expect(isBudgetSpent(5, 5)).toBe(true)
    expect(isBudgetSpent(9, undefined)).toBe(false)
    for (let level = 1; level <= FUSE_LEVEL_COUNT; level += 1) {
      const puzzle = createFusePuzzle(level)
      expect(scoreFor(puzzle.par, 3)).toBeGreaterThanOrEqual(100)
      expect(scoreFor(puzzle.par, 3)).toBeLessThanOrEqual(SCORE_CAP)
    }
  })
})
