import { describe, expect, it } from 'vitest'
import { canLink, countSolutions, degreesFor, edgeKey, failedScore, isSolved, neighborsOf, SCORE_CAP, SCORE_FLOOR, scoreFor, type Constellation } from './logic'

const block2x2: Constellation = {
  cols: 5,
  rows: 5,
  stars: [6, 7, 11, 12],
  edges: [
    { a: 6, b: 7 },
    { a: 6, b: 11 },
    { a: 7, b: 12 },
    { a: 11, b: 12 },
  ],
}

describe('constellation link core', () => {
  it('keeps neighbors inside the grid and on orthogonal steps only', () => {
    expect(neighborsOf(0, 5, 5)).toEqual([5, 1])
    expect(neighborsOf(24, 5, 5)).toEqual([19, 23])
    expect(neighborsOf(12, 5, 5)).toEqual([7, 17, 11, 13])
    expect(neighborsOf(3, 5, 5)).toEqual([8, 2, 4])
    expect(neighborsOf(7, 5, 5)).toHaveLength(4)
    for (const cell of [0, 7, 24]) {
      for (const neighbor of neighborsOf(cell, 5, 5)) {
        const drift = Math.abs(Math.floor(neighbor / 5) - Math.floor(cell / 5)) + Math.abs((neighbor % 5) - (cell % 5))
        expect(drift).toBe(1)
      }
    }
  })

  it('matches a brute-force subset counter on every degree assignment of a 2x2 ring', () => {
    const brute = (clues: number[]) => {
      let total = 0
      for (let mask = 0; mask < 16; mask += 1) {
        const picked = [0, 1, 2, 3].filter((slot) => mask & (1 << slot))
        if (isSolved(clues, degreesFor(block2x2, picked))) total += 1
      }
      return total
    }
    for (const a of [0, 1, 2]) for (const b of [0, 1, 2]) for (const c of [0, 1, 2]) {
      expect(countSolutions(block2x2, [a, b, c, 0], 4)).toBe(brute([a, b, c, 0]))
    }
    expect(countSolutions(block2x2, [1, 1, 1, 1], 4)).toBe(2)
    expect(countSolutions(block2x2, [2, 2, 1, 1], 4)).toBe(1)
    expect(countSolutions(block2x2, [2, 1, 2, 1], 4)).toBe(1)
    expect(countSolutions(block2x2, [2, 2, 2, 2], 4)).toBe(1)
    expect(countSolutions(block2x2, [2, 2, 2, 1], 4)).toBe(0)
  })

  it('guards link attempts by adjacency, membership and remaining degree', () => {
    expect(canLink(block2x2, [1, 1, 1, 1], [0, 0, 0, 0], 6, 7)).toBe(true)
    expect(canLink(block2x2, [1, 1, 1, 1], [0, 0, 0, 0], 6, 12)).toBe(false)
    expect(canLink(block2x2, [1, 1, 1, 1], [1, 0, 0, 0], 6, 7)).toBe(false)
    expect(canLink(block2x2, [1, 1, 1, 1], [0, 0, 0, 0], 0, 1)).toBe(false)
    expect(canLink(block2x2, [1, 1, 1, 1], [0, 1, 0, 0], 6, 7)).toBe(false)
    expect(degreesFor(block2x2, [0, 3])).toEqual([1, 1, 1, 1])
    expect(degreesFor(block2x2, [])).toEqual([0, 0, 0, 0])
    expect(isSolved([1, 1, 1, 1], degreesFor(block2x2, [0, 3]))).toBe(true)
    expect(isSolved([1, 0, 1, 0], degreesFor(block2x2, [0, 3]))).toBe(false)
  })

  it('derives a stable directional edge key', () => {
    expect(edgeKey(6, 7)).toBe(edgeKey(7, 6))
    expect(edgeKey(6, 7)).toBe(6 * 256 + 7)
    expect(edgeKey(11, 12)).toBe(11 * 256 + 12)
    expect(edgeKey(11, 12)).not.toBe(edgeKey(6, 11))
    expect(edgeKey(0, 48)).toBe(48)
  })

  it('clamps scoring between the floor and cap with churn and mistake penalties', () => {
    expect(scoreFor(10, 0, 10)).toBe(1000)
    expect(scoreFor(12, 0, 10)).toBe(976)
    expect(scoreFor(10, 2, 10)).toBe(950)
    expect(scoreFor(40, 12, 10)).toBe(340)
    expect(scoreFor(60, 12, 10)).toBe(SCORE_FLOOR)
    expect(scoreFor(0, 0, 0)).toBe(1000)
    expect(scoreFor(10, 0, 2000)).toBe(1000)
    expect(scoreFor(2000, 0, 10)).toBe(SCORE_FLOOR)
    expect(failedScore(10, 0, 10)).toBe(750)
    expect(failedScore(10, 30, 10)).toBe(0)
    for (let placed = 0; placed <= 30; placed += 1) {
      for (let mistakes = 0; mistakes <= 6; mistakes += 1) {
        const value = scoreFor(placed, mistakes, 12)
        expect(value).toBeGreaterThanOrEqual(SCORE_FLOOR)
        expect(value).toBeLessThanOrEqual(SCORE_CAP)
      }
    }
  })
})
