import { describe, expect, it } from 'vitest'
import { birthValueAt, createSpawner, hasAnyMove, maxValue, placeTile, slideGrid, type Cell, type Direction, type Grid, type Tile } from './logic'

let nextId = 1
const tile = (value: number, locked = false): Tile => ({ value, locked, id: (nextId += 1) })

function gridWith(row: number, values: (Tile | null)[]): Grid {
  const grid: Grid = Array(16).fill(null)
  values.forEach((cell, column) => { grid[row * 4 + column] = cell })
  return grid
}
const rowOf = (grid: Grid, row: number) => grid.slice(row * 4, row * 4 + 4)
const values = (cells: Cell[]) => cells.map((cell) => cell?.value ?? null)

describe('merge square rules', () => {
  it('merges equal neighbours once per slide and never chains', () => {
    const pair = slideGrid(gridWith(0, [tile(2), tile(2), null, null]), 'left')
    expect(values(rowOf(pair.grid, 0))).toEqual([4, null, null, null])
    expect(pair.gained).toBe(4)
    const quad = slideGrid(gridWith(1, [tile(2), tile(2), tile(2), tile(2)]), 'left')
    expect(values(rowOf(quad.grid, 1))).toEqual([4, 4, null, null])
    expect(quad.gained).toBe(8)
    const chained = slideGrid(gridWith(2, [tile(4), tile(2), tile(2), null]), 'left')
    expect(values(rowOf(chained.grid, 2))).toEqual([4, 4, null, null])
    expect(chained.gained).toBe(4)
    const mixed = slideGrid(gridWith(3, [tile(2), tile(2), tile(4), tile(4)]), 'right')
    expect(values(rowOf(mixed.grid, 3))).toEqual([null, null, 4, 8])
    expect(mixed.gained).toBe(12)
  })

  it('slides locked tiles but blocks every merge around them', () => {
    const edge = slideGrid(gridWith(0, [tile(2, true), tile(2), tile(2), null]), 'left')
    expect(values(rowOf(edge.grid, 0))).toEqual([2, 4, null, null])
    const pair = slideGrid(gridWith(1, [tile(2, true), tile(2, true), null, null]), 'left')
    expect(pair.moved).toBe(false)
    expect(values(rowOf(pair.grid, 1))).toEqual([2, 2, null, null])
    const barrier = slideGrid(gridWith(2, [tile(2), tile(2, true), tile(2), tile(2)]), 'left')
    expect(values(rowOf(barrier.grid, 2))).toEqual([2, 2, 4, null])
    expect(barrier.gained).toBe(4)
    const spawned = placeTile(gridWith(3, [tile(8), null, tile(8), null]), 13, 2, 99, true)
    expect(spawned[13]).toMatchObject({ value: 2, locked: true, id: 99 })
  })

  it('treats jammed directions as no-ops', () => {
    const grid = gridWith(0, [tile(2), tile(4), tile(8), tile(16)])
    const full = gridWith(3, [tile(32), tile(64), tile(128), tile(256)])
    const jammed = grid.map((cell, index) => cell ?? full[index])
    const left = slideGrid(jammed, 'left')
    const right = slideGrid(jammed, 'right')
    expect(left.moved).toBe(false)
    expect(left.gained).toBe(0)
    expect(left.grid).toEqual(jammed)
    expect(right.moved).toBe(false)
    expect(right.grid).toEqual(jammed)
    expect(slideGrid(Array(16).fill(null), 'up').moved).toBe(false)
    expect(hasAnyMove(jammed)).toBe(true)
  })

  it('keeps the seeded 9:1 birth stream deterministic', () => {
    const first = Array.from({ length: 400 }, (_, index) => birthValueAt(17, index))
    const second = Array.from({ length: 400 }, (_, index) => birthValueAt(17, index))
    expect(first).toEqual(second)
    expect(first.every((value) => value === 2 || value === 4)).toBe(true)
    const twos = first.filter((value) => value === 2).length
    expect(twos).toBeGreaterThanOrEqual(340)
    expect(twos).toBeLessThanOrEqual(380)
  })

  it('replays an identical run from a fixed input script', () => {
    const play = () => {
      const spawner = createSpawner(9, 2, 0.06)
      let grid: Grid = Array(16).fill(null)
      grid = placeTile(grid, 5, 4, 1)
      grid = placeTile(grid, 10, 2, 2, true)
      let spawnCount = 0
      let score = 0
      const script: Direction[] = ['left', 'up', 'left', 'down', 'right', 'up', 'left', 'left', 'down', 'right', 'up', 'left']
      for (const direction of script) {
        const result = slideGrid(grid, direction)
        if (!result.moved) continue
        grid = result.grid
        score += result.gained
        const cell = spawner.cell(grid, spawnCount)
        if (cell >= 0) {
          grid = placeTile(grid, cell, spawner.value(spawnCount), 100 + spawnCount, spawner.locked(spawnCount))
          spawnCount += 1
        }
      }
      return { grid, spawnCount, score }
    }
    expect(play()).toEqual(play())
  })

  it('spawns only on empty cells and degrades safely on a full board', () => {
    const spawner = createSpawner(23, 0, 0)
    const dead: Grid = Array.from({ length: 16 }, (_, index) => ({ value: (index + Math.floor(index / 4)) % 2 ? 4 : 2, locked: false, id: index }))
    const board = [...dead]
    board[2] = null
    board[3] = null
    const picks = new Set(Array.from({ length: 40 }, (_, index) => spawner.cell(board, index)))
    expect([...picks].every((cell) => cell === 2 || cell === 3)).toBe(true)
    expect(hasAnyMove(board)).toBe(true)
    expect(spawner.cell(dead, 0)).toBe(-1)
    expect(hasAnyMove(dead)).toBe(false)
    expect(maxValue(board)).toBe(4)
  })
})
