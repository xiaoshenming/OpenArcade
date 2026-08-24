import { describe, expect, it } from 'vitest'
import { CAPACITY, isSolved, pour, type Board } from './logic'

describe('water sort state machine', () => {
  it('moves the entire contiguous top color block', () => {
    const board: Board = [['gold', 'teal', 'teal'], ['teal'], []]
    const result = pour(board, 0, 1)
    expect(result.moved).toBe(2)
    expect(result.board).toEqual([['gold'], ['teal', 'teal', 'teal'], []])
    expect(board).toEqual([['gold', 'teal', 'teal'], ['teal'], []])
  })

  it('rejects a pour onto a different color or full tube', () => {
    const mixed: Board = [['gold'], ['teal'], []]
    expect(pour(mixed, 0, 1).moved).toBe(0)
    const full: Board = [['gold'], Array(CAPACITY).fill('gold'), []]
    expect(pour(full, 0, 1).moved).toBe(0)
  })

  it('recognizes only empty or full monochrome tubes as solved', () => {
    expect(isSolved([Array(CAPACITY).fill('coral'), [], Array(CAPACITY).fill('teal')])).toBe(true)
    expect(isSolved([['coral'], [], Array(CAPACITY).fill('teal')])).toBe(false)
  })
})
