import { mulberry32, seedFor } from '../../platform/rng'

export type Direction = 'up' | 'down' | 'left' | 'right'
export const DIRECTIONS: readonly Direction[] = ['up', 'down', 'left', 'right']
export const GRID_SIZE = 4

export interface Tile {
  value: number
  locked: boolean
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

export function slideGrid(grid: ReadonlyGrid, direction: Direction): SlideResult {
  const next: Grid = grid.map((cell) => (cell ? { ...cell } : null))
  const mergedIds: number[] = []
  const removedIds: number[] = []
  let gained = 0
  let moved = false
  for (const line of LINES[direction]) {
    const tiles: Tile[] = []
    for (const index of line) {
      const cell = next[index]
      if (cell) tiles.push(cell)
      next[index] = null
    }
    const kept: Tile[] = []
    const merged = new Set<number>()
    for (const tile of tiles) {
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
    line.forEach((index, slot) => {
      next[index] = kept[slot] ?? null
    })
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

export function placeTile(grid: ReadonlyGrid, cell: number, value: number, id: number, locked = false): Grid {
  const next = [...grid]
  next[cell] = { value, locked, id }
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

export interface Spawner {
  value: (index: number) => 2 | 4
  locked: (index: number) => boolean
  cell: (grid: ReadonlyGrid, index: number) => number
  project: (grid: ReadonlyGrid, index: number, id: number) => Grid | null
}

const EDGE_CELLS = [0, 1, 2, 3, 4, 7, 8, 11, 12, 13, 14, 15]

export function createSpawner(levelNumber: number, lockQuota: number, lockChance: number): Spawner {
  const value = createBirthValues(levelNumber)
  const locked = createLockSequence(levelNumber, lockQuota, lockChance)
  const random = mulberry32(seedFor(levelNumber, 7))
  const draws: number[] = []
  const drawAt = (index: number) => {
    while (draws.length <= index) draws.push(Math.floor(random() * GRID_SIZE * GRID_SIZE))
    return draws[index]
  }
  const cell = (grid: ReadonlyGrid, index: number, edgesOnly = false) => {
    const pool = edgesOnly ? EDGE_CELLS.filter((candidate) => !grid[candidate]) : emptyCells(grid)
    if (!pool.length) return -1
    return pool[drawAt(index) % pool.length]
  }
  return {
    value,
    locked,
    cell: (grid, index) => cell(grid, index),
    project: (grid, index, id) => {
      const isLocked = locked(index)
      const target = cell(grid, index, isLocked)
      if (target < 0) return null
      return placeTile(grid, target, value(index), id, isLocked)
    },
  }
}

export interface BotScenario {
  levelNumber: number
  target: number
  startGrid: Grid
  lockQuota: number
  lockChance: number
  moveCap: number
}

function snakePath(corner: number, horizontal: boolean): number[] {
  const row0 = Math.floor(corner / GRID_SIZE)
  const col0 = corner % GRID_SIZE
  const rowStep = row0 >= GRID_SIZE / 2 ? -1 : 1
  const colStep = col0 >= GRID_SIZE / 2 ? -1 : 1
  const path: number[] = []
  for (let outer = 0; outer < GRID_SIZE; outer += 1) {
    const line = horizontal ? row0 + outer * rowStep : col0 + outer * colStep
    const forward = outer % 2 === 0
    for (let inner = 0; inner < GRID_SIZE; inner += 1) {
      const offset = forward ? inner : GRID_SIZE - 1 - inner
      const row = horizontal ? line : row0 + offset * rowStep
      const column = horizontal ? col0 + offset * colStep : line
      path.push(row * GRID_SIZE + column)
    }
  }
  return path
}

function pickRanks(startGrid: ReadonlyGrid): number[] {
  const cornerCells = [0, 3, 12, 15]
  let bestRanks = new Array(16).fill(0)
  let bestScore = -Infinity
  for (const corner of cornerCells) {
    for (const horizontal of [true, false]) {
      const path = snakePath(corner, horizontal)
      const ranks = new Array(16).fill(0)
      path.forEach((cell, index) => { ranks[cell] = 15 - index })
      let score = 0
      startGrid.forEach((tile, index) => { if (tile) score += tile.value * 2 ** ranks[index] })
      if (score > bestScore) {
        bestScore = score
        bestRanks = ranks
      }
    }
  }
  return bestRanks
}

function botEvaluate(grid: ReadonlyGrid, ranks: readonly number[], gained: number): number {
  let empty = 0
  let snake = 0
  let pairs = 0
  grid.forEach((cell, index) => {
    if (!cell) {
      empty += 1
      return
    }
    snake += (cell.value / 2048) * 2 ** ranks[index]
    const right = index % GRID_SIZE !== GRID_SIZE - 1 ? grid[index + 1] : null
    const below = index < 12 ? grid[index + 4] : null
    if (right && right.value === cell.value && !right.locked && !cell.locked) pairs += 1
    if (below && below.value === cell.value && !below.locked && !cell.locked) pairs += 1
  })
  const panic = Math.max(0, (6 - empty) / 6)
  return snake * 4096 + pairs * 1500 + empty * (400 + panic * 6000) + gained * 96
}

function botSearch(grid: ReadonlyGrid, spawner: Spawner, ranks: readonly number[], depth: number, spawnIndex: number, id: number, gained: number): number {
  let best = -Infinity
  for (const direction of DIRECTIONS) {
    const result = slideGrid(grid, direction)
    if (!result.moved) continue
    const projected = spawner.project(result.grid, spawnIndex, id + 1) ?? result.grid
    const total = gained + result.gained
    if (depth <= 1) {
      best = Math.max(best, botEvaluate(projected, ranks, total))
    } else {
      const inner = botSearch(projected, spawner, ranks, depth - 1, spawnIndex + 1, id + 1, total)
      if (inner > best) best = inner
    }
  }
  return best
}

export function solveWithBot(scenario: BotScenario): number {
  const spawner = createSpawner(scenario.levelNumber, scenario.lockQuota, scenario.lockChance)
  const ranks = pickRanks(scenario.startGrid)
  let grid = scenario.startGrid.map((cell) => (cell ? { ...cell } : null))
  let spawnIndex = 0
  let id = 4096
  for (let moves = 1; moves <= scenario.moveCap; moves += 1) {
    const depth = emptyCells(grid).length <= 9 ? 4 : 3
    const bestScore = botSearch(grid, spawner, ranks, depth, spawnIndex, id, 0)
    if (bestScore === -Infinity) return -1
    let bestGrid: Grid | null = null
    for (const direction of DIRECTIONS) {
      const result = slideGrid(grid, direction)
      if (!result.moved) continue
      const projected = spawner.project(result.grid, spawnIndex, id + 1) ?? result.grid
      const inner = botSearch(projected, spawner, ranks, depth - 1, spawnIndex + 1, id + 1, result.gained)
      if (inner === bestScore) {
        bestGrid = result.grid
        break
      }
    }
    if (!bestGrid) return -1
    grid = bestGrid
    const spawned = spawner.project(grid, spawnIndex, id + 1)
    if (spawned) {
      grid = spawned
      id += 1
      spawnIndex += 1
    }
    if (maxValue(grid) >= scenario.target) return moves
  }
  return -1
}
