import { mulberry32, seedFor } from '../../platform/rng'

export type Direction = 'up' | 'down' | 'left' | 'right'
export const DIRECTIONS: readonly Direction[] = ['up', 'down', 'left', 'right']
export const GRID_SIZE = 4

export interface Tile {
  value: number
  locked: boolean
  fixed: boolean
  id: number
}
export type Cell = Tile | null
export type Grid = Cell[]
export type ReadonlyGrid = readonly Cell[]

export interface SlideResult {
  grid: Grid
  moved: boolean
  gained: number
  mergedIds: number[]
  removedIds: number[]
}

function buildLines(axis: 'row' | 'column', reversed: boolean) {
  return Array.from({ length: GRID_SIZE }, (_, outer) => {
    const line: number[] = []
    for (let inner = 0; inner < GRID_SIZE; inner += 1) {
      const row = axis === 'row' ? outer : inner
      const column = axis === 'row' ? inner : outer
      line.push(row * GRID_SIZE + column)
    }
    return reversed ? line.reverse() : line
  })
}

const LINES: Record<Direction, number[][]> = {
  left: buildLines('row', false),
  right: buildLines('row', true),
  up: buildLines('column', false),
  down: buildLines('column', true),
}

// 定调块(fixed)是墙体:自身不可滑动、不参与合并,并把所在行/列切分成独立滑段,
// 两侧方块各自向墙压实,无法穿墙或跨墙合并。
export function slideGrid(grid: ReadonlyGrid, direction: Direction): SlideResult {
  const next: Grid = grid.map((cell) => (cell ? { ...cell } : null))
  const mergedIds: number[] = []
  const removedIds: number[] = []
  let gained = 0
  let moved = false
  for (const line of LINES[direction]) {
    let write = 0
    let segment: Tile[] = []
    const settle = (endExclusive: number) => {
      const kept: Tile[] = []
      const merged = new Set<number>()
      for (const tile of segment) {
        const last = kept[kept.length - 1]
        if (last && !merged.has(last.id) && !last.locked && !tile.locked && last.value === tile.value) {
          last.value += tile.value
          merged.add(last.id)
          gained += last.value
          mergedIds.push(last.id)
          removedIds.push(tile.id)
          moved = true
        } else {
          kept.push(tile)
        }
      }
      for (let slot = write; slot < endExclusive; slot += 1) {
        next[line[slot]] = kept[slot - write] ?? null
      }
      write = endExclusive
      segment = []
    }
    line.forEach((index, position) => {
      const cell = next[index]
      if (cell?.fixed) {
        settle(position)
        write = position + 1
        return
      }
      if (cell) segment.push(cell)
      next[index] = null
    })
    settle(GRID_SIZE)
  }
  const displaced = grid.some((cell, index) => cell?.id !== next[index]?.id)
  return { grid: next, moved: moved || displaced, gained, mergedIds, removedIds }
}

export function hasAnyMove(grid: ReadonlyGrid): boolean {
  return DIRECTIONS.some((direction) => slideGrid(grid, direction).moved)
}

export function emptyCells(grid: ReadonlyGrid): number[] {
  const cells: number[] = []
  grid.forEach((cell, index) => { if (!cell) cells.push(index) })
  return cells
}

export function maxValue(grid: ReadonlyGrid): number {
  return grid.reduce((best, cell) => Math.max(best, cell?.value ?? 0), 0)
}

export function placeTile(grid: ReadonlyGrid, cell: number, value: number, id: number, locked = false, fixed = false): Grid {
  const next = [...grid]
  next[cell] = { value, locked, fixed, id }
  return next
}

export function createBirthValues(levelNumber: number) {
  const random = mulberry32(seedFor(levelNumber, 3))
  const values: (2 | 4)[] = []
  return (index: number) => {
    while (values.length <= index) values.push(random() < 0.9 ? 2 : 4)
    return values[index]
  }
}

export function birthValueAt(levelNumber: number, index: number): 2 | 4 {
  return createBirthValues(levelNumber)(index)
}

export function createLockSequence(levelNumber: number, quota: number, chance: number) {
  const random = mulberry32(seedFor(levelNumber, 13))
  let left = quota
  const hits: boolean[] = []
  return (index: number) => {
    while (hits.length <= index) {
      const hit = left > 0 && random() < chance
      if (hit) left -= 1
      hits.push(hit)
    }
    return hits[index]
  }
}

export interface SpawnOutcome {
  grid: Grid
  cell: number
}

export interface Spawner {
  value: (index: number) => 2 | 4
  locked: (index: number) => boolean
  spawn: (grid: ReadonlyGrid, index: number, id: number) => SpawnOutcome | null
}

export const EDGE_CELLS = [0, 1, 2, 3, 4, 7, 8, 11, 12, 13, 14, 15]

// 实机与 bot 共用同一出生规则:锁块只在边缘空格出生,普通块落在任意空格,
// 消费同一随机流,保证关卡校验与实战完全一致。
export function createSpawner(levelNumber: number, lockQuota: number, lockChance: number): Spawner {
  const value = createBirthValues(levelNumber)
  const locked = createLockSequence(levelNumber, lockQuota, lockChance)
  const random = mulberry32(seedFor(levelNumber, 7))
  const draws: number[] = []
  const drawAt = (index: number) => {
    while (draws.length <= index) draws.push(Math.floor(random() * GRID_SIZE * GRID_SIZE))
    return draws[index]
  }
  return {
    value,
    locked,
    spawn: (grid, index, id) => {
      const isLocked = locked(index)
      const pool = isLocked ? EDGE_CELLS.filter((candidate) => !grid[candidate]) : emptyCells(grid)
      if (!pool.length) return null
      const cell = pool[drawAt(index) % pool.length]
      return { grid: placeTile(grid, cell, value(index), id, isLocked), cell }
    },
  }
}
