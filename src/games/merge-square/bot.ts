import { createSpawner, DIRECTIONS, emptyCells, GRID_SIZE, maxValue, slideGrid, type Grid, type ReadonlyGrid, type Spawner } from './logic'

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
    if (cell.fixed) return
    snake += (cell.value / 2048) * 2 ** ranks[index]
    const right = index % GRID_SIZE !== GRID_SIZE - 1 ? grid[index + 1] : null
    const below = index < GRID_SIZE * (GRID_SIZE - 1) ? grid[index + GRID_SIZE] : null
    if (right && right.value === cell.value && !right.locked && !right.fixed && !cell.locked) pairs += 1
    if (below && below.value === cell.value && !below.locked && !below.fixed && !cell.locked) pairs += 1
  })
  const panic = Math.max(0, (6 - empty) / 6)
  return snake * 4096 + pairs * 1500 + empty * (400 + panic * 6000) + gained * 96
}

function botSearch(grid: ReadonlyGrid, spawner: Spawner, ranks: readonly number[], depth: number, spawnIndex: number, id: number, gained: number): number {
  let best = -Infinity
  for (const direction of DIRECTIONS) {
    const result = slideGrid(grid, direction)
    if (!result.moved) continue
    const projected = spawner.spawn(result.grid, spawnIndex, id + 1)?.grid ?? result.grid
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
      const projected = spawner.spawn(result.grid, spawnIndex, id + 1)?.grid ?? result.grid
      const inner = botSearch(projected, spawner, ranks, depth - 1, spawnIndex + 1, id + 1, result.gained)
      if (inner === bestScore) {
        bestGrid = result.grid
        break
      }
    }
    if (!bestGrid) return -1
    grid = bestGrid
    const spawned = spawner.spawn(grid, spawnIndex, id + 1)
    if (spawned) {
      grid = spawned.grid
      id += 1
      spawnIndex += 1
    }
    if (maxValue(grid) >= scenario.target) return moves
  }
  return -1
}
