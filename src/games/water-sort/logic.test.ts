import { describe, expect, it } from 'vitest'
import { CAPACITY, isSolved, pour, type Board } from './logic'

describe('water sort state machine', () => {
  it('moves the entire contiguous top color block', () => {
    const board: Board = [[0, 1, 1], [1], []]
    const result = pour(board, 0, 1)
    expect(result.moved).toBe(2)
    expect(result.board).toEqual([[0], [1, 1, 1], []])
    expect(board).toEqual([[0, 1, 1], [1], []])
  })

  it('rejects a pour onto a different color or full tube', () => {
    const mixed: Board = [[0], [1], []]
    expect(pour(mixed, 0, 1).moved).toBe(0)
    const full: Board = [[0], Array(CAPACITY).fill(0), []]
    expect(pour(full, 0, 1).moved).toBe(0)
  })

  it('recognizes only empty or full monochrome tubes as solved', () => {
    expect(isSolved([Array(CAPACITY).fill(0), [], Array(CAPACITY).fill(1)])).toBe(true)
    expect(isSolved([[0], [], Array(CAPACITY).fill(1)])).toBe(false)
  })
})
