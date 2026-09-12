import { describe, expect, it } from 'vitest'
import { areAdjacent, buildVinePuzzle, judgeVine, ownerOf, trimPath, tryExtend, VINE_COLORS } from './logic'

describe('vine-link partition generator', () => {
  it('cuts every grid into connected, covering, disjoint color paths', () => {
    for (const [rows, cols, pairCount] of [[5, 5, 3], [6, 6, 4], [7, 7, 6], [8, 8, 8]] as const) {
      const puzzle = buildVinePuzzle(rows, cols, pairCount, 20260912)
      const laid = puzzle.paths.flat()
      expect(laid).toHaveLength(rows * cols)
      expect(new Set(laid).size).toBe(rows * cols)
      puzzle.paths.forEach((path, index) => {
        expect(path.length).toBeGreaterThanOrEqual(3)
        expect(puzzle.pairs[index]).toMatchObject({ a: path[0], b: path[path.length - 1] })
        expect(puzzle.pairs[index].color).toBeLessThan(VINE_COLORS.length)
        for (let step = 1; step < path.length; step += 1) expect(areAdjacent(path[step - 1], path[step], cols)).toBe(true)
      })
      expect(judgeVine(rows, cols, puzzle.pairs, puzzle.paths).solved).toBe(true)
    }
  })

  it('is deterministic per seed while varying across seeds', () => {
    expect(buildVinePuzzle(6, 6, 4, 99)).toEqual(buildVinePuzzle(6, 6, 4, 99))
    const shapes = new Set(Array.from({ length: 14 }, (_, seed) => JSON.stringify(buildVinePuzzle(6, 6, 4, seed * 7919 + 1).pairs.map((pair) => [pair.a, pair.b]))))
    expect(shapes.size).toBeGreaterThan(8)
  })
})

describe('vine-link judge', () => {
  const pairs = [{ a: 0, b: 2, color: 0 }, { a: 3, b: 8, color: 1 }]

  it('accepts the solved board in either orientation and rejects broken paths', () => {
    const solution = [[0, 1, 2], [3, 6, 7, 4, 5, 8]]
    expect(judgeVine(3, 3, pairs, solution)).toMatchObject({ solved: true, filled: 9 })
    expect(judgeVine(3, 3, pairs, [[2, 1, 0], [8, 5, 4, 7, 6, 3]]).solved).toBe(true)
    expect(judgeVine(3, 3, pairs, [[0, 1], [3, 4, 5, 8]]).solved).toBe(false)
    expect(judgeVine(3, 3, pairs, [[0, 1, 5, 2], [3, 4, 5, 8]]).connected).toEqual([false, true])
    expect(judgeVine(3, 3, pairs, [[0, 1, 2, 4], [3, 4, 5, 8]]).connected).toEqual([false, true])
  })

  it('flags overlapping paths on both sides', () => {
    const crossing = [{ a: 0, b: 5, color: 0 }, { a: 2, b: 6, color: 1 }]
    const verdict = judgeVine(3, 3, crossing, [[0, 1, 2, 5], [2, 5, 4, 7, 6]])
    expect(verdict.connected).toEqual([false, false])
    expect(verdict.solved).toBe(false)
  })
})

describe('vine-link interaction helpers', () => {
  const pairs = [{ a: 0, b: 2, color: 0 }, { a: 3, b: 8, color: 1 }]

  it('extends only into adjacent free cells and blocks foreign endpoints', () => {
    const start = [[0], [3]]
    expect(tryExtend(3, pairs, start, 0, 4).placed).toBe(false)
    expect(tryExtend(3, pairs, start, 0, 3).placed).toBe(false)
    const once = tryExtend(3, pairs, start, 0, 1)
    expect(once.placed).toBe(true)
    expect(once.paths[0]).toEqual([0, 1])
    expect(once.paths[1]).toEqual([3])
    const twice = tryExtend(3, pairs, once.paths, 0, 2)
    expect(twice).toMatchObject({ placed: true, paired: true })
    expect(tryExtend(3, pairs, twice.paths, 0, 5).placed).toBe(false)
    expect(tryExtend(3, pairs, twice.paths, 1, 4).placed).toBe(true)
    expect(ownerOf(twice.paths, 2)).toBe(0)
    expect(trimPath([0, 1, 2], 1)).toEqual([0, 1])
    expect(trimPath([0, 1, 2], 9)).toEqual([0, 1, 2])
  })

  it('never mutates the caller path arrays', () => {
    const start = [[0], [3]]
    tryExtend(3, pairs, start, 0, 1)
    expect(start).toEqual([[0], [3]])
  })
})
