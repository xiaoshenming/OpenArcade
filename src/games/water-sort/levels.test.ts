import { describe, expect, it } from 'vitest'
import { CAPACITY, isSolved, pour } from './logic'
import { createWaterBoard, WATER_LEVELS } from './levels'

describe('water level catalog', () => {
  it('ships sixty unique, structurally valid puzzles', () => {
    expect(WATER_LEVELS).toHaveLength(60)
    const keys = new Set<string>()
    for (const level of WATER_LEVELS) {
      const counts = new Map<number, number>()
      expect(level.tubes.filter((tube) => tube.length === 0)).toHaveLength(2)
      expect(isSolved(level.tubes.map((tube) => [...tube]))).toBe(false)
      for (const tube of level.tubes) {
        expect(tube.length).toBeLessThanOrEqual(CAPACITY)
        for (const color of tube) counts.set(color, (counts.get(color) ?? 0) + 1)
      }
      expect([...counts.values()].every((count) => count === CAPACITY)).toBe(true)
      keys.add(JSON.stringify(level.tubes))
    }
    expect(keys.size).toBe(WATER_LEVELS.length)
  })

  it('replays every stored solution through production pour rules', () => {
    for (const [index, level] of WATER_LEVELS.entries()) {
      let board = createWaterBoard(index + 1)
      expect(level.solution).toHaveLength(level.par * 2)
      for (let offset = 0; offset < level.solution.length; offset += 2) {
        const result = pour(board, Number(level.solution[offset]), Number(level.solution[offset + 1]))
        expect(result.moved, `level ${index + 1}, move ${offset / 2 + 1}`).toBeGreaterThan(0)
        board = result.board
      }
      expect(isSolved(board), `level ${index + 1}`).toBe(true)
    }
  })

  it('returns fresh mutable boards for each session', () => {
    const first = createWaterBoard(1)
    first[0].pop()
    expect(createWaterBoard(1)).not.toEqual(first)
  })
})
