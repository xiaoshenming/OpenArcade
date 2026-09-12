import { describe, expect, it } from 'vitest'
import { birthValueAt, createSpawner, EDGE_CELLS, hasAnyMove, maxValue, placeTile, slideGrid, type Cell, type Direction, type Grid, type Tile } from './logic'

let nextId = 1
const tile = (value: number, locked = false): Tile => ({ value, locked, fixed: false, id: (nextId += 1) })
const fixedTile = (value: number): Tile => ({ value, locked: false, fixed: true, id: (nextId += 1) })

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
    expect(spawned[13]).toMatchObject({ value: 2, locked: true, fixed: false, id: 99 })
  })

  it('treats fixed anchor tiles as immovable walls that split lanes', () => {
    const anchor = gridWith(0, [tile(2), fixedTile(2), tile(2), tile(2)])
    const left = slideGrid(anchor, 'left')
    expect(values(rowOf(left.grid, 0))).toEqual([2, 2, 4, null])
    expect(left.grid[1]?.fixed).toBe(true)
    expect(left.gained).toBe(4)
    const right = slideGrid(anchor, 'right')
    expect(values(rowOf(right.grid, 0))).toEqual([2, 2, null, 4])
    expect(right.grid[1]?.fixed).toBe(true)
    const crossing = slideGrid(gridWith(1, [null, fixedTile(4), null, tile(2)]), 'left')
    expect(values(rowOf(crossing.grid, 1))).toEqual([null, 4, 2, null])
    const sealed = slideGrid(gridWith(2, [tile(2), fixedTile(2), null, null]), 'left')
    expect(sealed.moved).toBe(false)
    const wall = gridWith(3, [fixedTile(2), fixedTile(2), tile(4), tile(4)])
    expect(values(rowOf(slideGrid(wall, 'left').grid, 3))).toEqual([2, 2, 8, null])
    expect(slideGrid(wall, 'left').gained).toBe(8)
  })

  it('finds no escape on a board fully walled by fixed tiles', () => {
    const walled: Grid = Array.from({ length: 16 }, (_, index) => (index === 5 ? fixedTile(2) : tile((index % 3) + 1)))
    expect(hasAnyMove(walled)).toBe(false)
    const open = [...walled]
    open[5] = tile(2)
    expect(hasAnyMove(open)).toBe(true)
    expect(maxValue(walled)).toBe(3)
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
        const spawned = spawner.spawn(grid, spawnCount, 100 + spawnCount)
        if (spawned) {
          grid = spawned.grid
          spawnCount += 1
        }
      }
      return { grid, spawnCount, score }
    }
    expect(play()).toEqual(play())
  })

  it('spawns only on empty cells and degrades safely on a full board', () => {
    const spawner = createSpawner(23, 0, 0)
    const dead: Grid = Array.from({ length: 16 }, (_, index) => ({ value: (index + Math.floor(index / 4)) % 2 ? 4 : 2, locked: false, fixed: false, id: index }))
    const board = [...dead]
    board[2] = null
    board[3] = null
    let running: Grid = board
    const picks = new Set<number>()
    for (let index = 0; index < 40; index += 1) {
      const outcome = spawner.spawn(running, index, 700 + index)
      if (outcome) {
        picks.add(outcome.cell)
        running = outcome.grid
      }
    }
    expect(picks.size).toBeLessThanOrEqual(2)
    expect([...picks].every((cell) => cell === 2 || cell === 3)).toBe(true)
    expect(hasAnyMove(board)).toBe(true)
    expect(spawner.spawn(dead, 0, 0)).toBeNull()
    expect(hasAnyMove(dead)).toBe(false)
    expect(maxValue(board)).toBe(4)
  })

  it('births locked spawns on the shared edge model and unlocked spawns anywhere', () => {
    const sealed = createSpawner(41, 4, 1)
    expect(sealed.locked(0)).toBe(true)
    const interiorOnly: Grid = Array.from({ length: 16 }, (_, index) => ([5, 6, 9, 10].includes(index) ? null : tile(2)))
    expect(sealed.spawn(interiorOnly, 0, 901)).toBeNull()
    const edgeFree = [...interiorOnly]
    edgeFree[0] = null
    const pinned = sealed.spawn(edgeFree, 1, 902)
    expect(EDGE_CELLS).toContain(pinned?.cell)
    expect(pinned?.grid[0]).toMatchObject({ locked: true, fixed: false })
    const loose = createSpawner(43, 0, 0)
    const anywhere = loose.spawn(edgeFree, 0, 903)
    expect([0, 5, 6, 9, 10]).toContain(anywhere?.cell)
    expect(anywhere?.grid[anywhere?.cell ?? 0]).toMatchObject({ locked: false })
  })
})
