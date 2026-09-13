import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../../platform/rng'
import { carveMaze, edgeCount, evaluatePaths, horizontalEdge, neighborsOf, openDistance, scoreFor, verticalEdge, wallCount, WALL_PENALTY } from './logic'
import { createLacePuzzle, LEVEL_COUNT } from './levels'

describe('maze lace core', () => {
  it('carves perfect mazes: connected trees with exactly cells-1 open edges', () => {
    for (const [rows, cols] of [[5, 5], [6, 6], [7, 7], [8, 8]] as const) {
      for (let seed = 1; seed <= 6; seed += 1) {
        const walls = carveMaze(mulberry32(seed * 7919 + rows), rows, cols)
        expect(walls).toHaveLength(edgeCount(rows, cols))
        expect(wallCount(walls)).toBe(edgeCount(rows, cols) - (rows * cols - 1))
        expect(openDistance(walls, rows, cols, 0, rows * cols - 1)).toBeGreaterThan(0)
      }
    }
  })

  it('maps edges and neighbors consistently in both directions', () => {
    expect(verticalEdge(0, 0, 5)).toBe(0)
    expect(verticalEdge(1, 0, 5)).toBe(4)
    expect(horizontalEdge(0, 0, 5, 5)).toBe(20)
    expect(horizontalEdge(1, 2, 5, 5)).toBe(20 + 7)
    const seen = new Map<number, number>()
    for (const [next, edge] of neighborsOf(0, 5, 5)) seen.set(next, edge)
    expect(seen.get(1)).toBe(verticalEdge(0, 0, 5))
    expect(seen.get(5)).toBe(horizontalEdge(0, 0, 5, 5))
    for (const [next, edge] of neighborsOf(12, 5, 5)) {
      expect(neighborsOf(next, 5, 5).some(([back, backEdge]) => back === 12 && backEdge === edge)).toBe(true)
    }
    expect(neighborsOf(12, 5, 5)).toHaveLength(4)
    expect(neighborsOf(0, 5, 5)).toHaveLength(2)
    expect(neighborsOf(24, 5, 5)).toHaveLength(2)
  })

  it('classifies blocked, multiple, offlength and solved boards', () => {
    const rows = 3
    const cols = 3
    const goal = 8
    const target = openDistance(new Uint8Array(edgeCount(rows, cols)), rows, cols, 0, goal)
    expect(evaluatePaths(new Uint8Array(edgeCount(rows, cols)), rows, cols, 0, goal, target).status).toBe('multiple')
    const sealed = new Uint8Array(edgeCount(rows, cols)).fill(1)
    sealed[horizontalEdge(0, 0, cols)] = 0
    sealed[verticalEdge(0, 0, cols)] = 0
    expect(evaluatePaths(sealed, rows, cols, 0, goal, target).status).toBe('blocked')
    const corridor = new Uint8Array(edgeCount(rows, cols)).fill(1)
    for (let col = 0; col < cols - 1; col += 1) corridor[verticalEdge(0, col, cols)] = 0
    for (let row = 0; row < rows - 1; row += 1) corridor[horizontalEdge(row, cols - 1, rows, cols)] = 0
    const snake = (cols - 1) + (rows - 1)
    expect(evaluatePaths(corridor, rows, cols, 0, goal, snake)).toEqual({ status: 'solved', paths: 1, length: snake })
    expect(evaluatePaths(corridor, rows, cols, 0, goal, snake + 1).status).toBe('offlength')
    expect(evaluatePaths(corridor, rows, cols, 0, goal, snake - 1).status).toBe('offlength')
  })

  it('validates every generated maze solution as a unique target-length path', () => {
    for (let level = 1; level <= LEVEL_COUNT; level += 1) {
      const puzzle = createLacePuzzle(level)
      expect(evaluatePaths(puzzle.solution, puzzle.rule.rows, puzzle.rule.cols, puzzle.start, puzzle.goal, puzzle.targetLen), `level ${level}`).toEqual({
        status: 'solved',
        paths: 1,
        length: puzzle.targetLen,
      })
      expect(puzzle.targetLen, `level ${level}`).toBeGreaterThanOrEqual(puzzle.rule.minLen)
      expect(puzzle.par, `level ${level}`).toBe(wallCount(puzzle.solution))
      expect(puzzle.presets.every((id) => puzzle.solution[id] === 1), `level ${level}`).toBe(true)
      expect(puzzle.presets, `level ${level}`).toHaveLength(Math.round(puzzle.par * puzzle.rule.presetFraction))
    }
  })

  it('scores extra walls with a ten point penalty above par', () => {
    expect(scoreFor(10, 10)).toBe(1000)
    expect(scoreFor(13, 10)).toBe(1000 - 3 * WALL_PENALTY)
    expect(scoreFor(4, 10)).toBe(1000)
    expect(scoreFor(200, 10)).toBe(100)
    expect(scoreFor(0, 0)).toBeLessThanOrEqual(5000)
    expect(scoreFor(4, 2)).toBe(1000 - 2 * WALL_PENALTY)
  })
})
