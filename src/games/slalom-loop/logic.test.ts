import { describe, expect, it } from 'vitest'
import { BLACK, countSolutions, edgeTotal, edgesOfCell, endsOfEdge, failedScore, loopEdges, loopOrder, neighborsOf, scoreFor, validateLoop, WHITE } from './logic'
import { createSlalomPuzzle, hasClosedLoop } from './levels'

const perimeter = [0, 1, 2, 3, 4, 5, 11, 17, 23, 29, 35, 34, 33, 32, 31, 30, 24, 18, 12, 6]

describe('slalom loop core', () => {
  it('derives cell neighborhoods and edge wiring on every board size', () => {
    expect(edgeTotal(6, 6)).toBe(60)
    expect(neighborsOf(0, 6, 6)).toEqual([6, 1])
    expect(neighborsOf(14, 6, 6)).toEqual([8, 20, 13, 15])
    for (const [cols, rows] of [[4, 4], [6, 6], [10, 10]] as Array<[number, number]>) {
      for (let edge = 0; edge < edgeTotal(cols, rows); edge += 1) {
        const [a, b] = endsOfEdge(edge, cols, rows)
        expect(a).toBeGreaterThanOrEqual(0)
        expect(b).toBeLessThan(cols * rows)
        expect(neighborsOf(a, cols, rows)).toContain(b)
      }
      expect(edgesOfCell(0, cols, rows)).toHaveLength(2)
      expect(edgesOfCell(cols + 1, cols, rows)).toHaveLength(4)
    }
  })

  it('judges closed loops for the mistake rule, ignoring open paths', () => {
    const edges = loopEdges(perimeter, 6, 6)
    expect(hasClosedLoop([], 6, 6)).toBe(false)
    expect(hasClosedLoop(edges.slice(0, 8), 6, 6)).toBe(false)
    expect(hasClosedLoop(edges, 6, 6)).toBe(true)
    expect(hasClosedLoop([...edges, 7], 6, 6)).toBe(true)
    expect(hasClosedLoop([0, 3, 12, 13], 4, 4)).toBe(true)
    expect(hasClosedLoop([0, 1, 4, 5], 4, 4)).toBe(false)
    expect(hasClosedLoop([0, 1, 2], 4, 4)).toBe(false)
  })

  it('applies masyu clue rules to the perimeter loop, black corners included', () => {
    expect(loopOrder(loopEdges(perimeter, 6, 6), 6, 6)).not.toBeNull()
    const clues = new Array<number>(36).fill(0)
    clues[0] = BLACK
    clues[1] = WHITE
    expect(validateLoop(perimeter, clues, 6, 6)).toBe(true)
    clues[2] = WHITE
    expect(validateLoop(perimeter, clues, 6, 6)).toBe(false)
    clues[2] = 0
    clues[1] = BLACK
    expect(validateLoop(perimeter, clues, 6, 6)).toBe(false)
    clues[1] = 0
    clues[0] = WHITE
    expect(validateLoop(perimeter, clues, 6, 6)).toBe(false)
    expect(validateLoop([0, 2], clues, 6, 6)).toBe(false)
    expect(validateLoop([...perimeter, 8], clues, 6, 6)).toBe(false)
  })

  it('counts solutions monotonically and rejects clue sets the intended loop cannot satisfy', () => {
    const empty = new Array<number>(16).fill(0)
    expect(countSolutions(4, 4, empty, 1)).toBe(1)
    expect(countSolutions(4, 4, empty, 2)).toBe(2)
    const puzzle = createSlalomPuzzle(2)
    expect(countSolutions(puzzle.spec.cols, puzzle.spec.rows, puzzle.clues, 2, 120000)).toBe(1)
    const size = puzzle.spec.cols * puzzle.spec.rows
    const offLoop = Array.from({ length: size }, (_, cell) => cell).find((cell) => !puzzle.solution.includes(cell))
    expect(offLoop).toBeDefined()
    const poisoned = [...puzzle.clues]
    poisoned[offLoop as number] = WHITE
    expect(countSolutions(puzzle.spec.cols, puzzle.spec.rows, poisoned, 2, 120000)).toBe(0)
  }, 60000)

  it('scores within the policy band and floors failed runs at zero', () => {
    expect(scoreFor(0, 0, 60)).toBe(1000)
    expect(scoreFor(0, 3, 60)).toBe(820)
    expect(scoreFor(70, 0, 60)).toBe(990)
    expect(scoreFor(6000, 0, 60)).toBe(100)
    expect(scoreFor(0, 99, 0)).toBe(100)
    expect(failedScore(0, 0, 60)).toBe(750)
    expect(failedScore(0, 13, 60)).toBe(0)
    expect(failedScore(6000, 12, 60)).toBe(0)
  })

  it('keeps generated chapter-one boards unique and every board rule-valid', () => {
    for (const level of [1, 5, 11]) {
      const puzzle = createSlalomPuzzle(level)
      expect(countSolutions(puzzle.spec.cols, puzzle.spec.rows, puzzle.clues, 2)).toBe(1)
      expect(validateLoop(puzzle.solution, puzzle.clues, puzzle.spec.cols, puzzle.spec.rows)).toBe(true)
    }
    for (const level of [23, 45, 60]) {
      const puzzle = createSlalomPuzzle(level)
      expect(validateLoop(puzzle.solution, puzzle.clues, puzzle.spec.cols, puzzle.spec.rows)).toBe(true)
    }
  }, 60000)
})
