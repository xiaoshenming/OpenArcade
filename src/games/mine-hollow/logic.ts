import { mulberry32, seedFor, shuffle } from '../../platform/rng'
import type { MineLevelSpec } from './levels'

export type MinePhase = 'idle' | 'playing' | 'won' | 'lost'

export interface MineCell {
  mine: boolean
  count: number
  revealed: boolean
  flagged: boolean
}

export interface MineBoard {
  rows: number
  columns: number
  mineCount: number
  safeRadius: number
  cells: MineCell[]
  phase: MinePhase
  flags: number
  firstIndex: number | null
  opened: number[]
}

export function neighborIndices(index: number, rows: number, columns: number): number[] {
  const row = Math.floor(index / columns)
  const column = index % columns
  const result: number[] = []
  for (let dr = -1; dr <= 1; dr += 1) {
    for (let dc = -1; dc <= 1; dc += 1) {
      if (dr === 0 && dc === 0) continue
      const r = row + dr
      const c = column + dc
      if (r >= 0 && r < rows && c >= 0 && c < columns) result.push(r * columns + c)
    }
  }
  return result
}

export function safeZone(index: number, rows: number, columns: number, radius: number): Set<number> {
  const row = Math.floor(index / columns)
  const column = index % columns
  const zone = new Set<number>()
  for (let dr = -radius; dr <= radius; dr += 1) {
    for (let dc = -radius; dc <= radius; dc += 1) {
      const r = row + dr
      const c = column + dc
      if (r >= 0 && r < rows && c >= 0 && c < columns) zone.add(r * columns + c)
    }
  }
  return zone
}

function candidates(total: number, zone: Set<number>): number[] {
  const pool: number[] = []
  for (let index = 0; index < total; index += 1) if (!zone.has(index)) pool.push(index)
  return pool
}

export function layoutMines(rows: number, columns: number, mines: number, firstIndex: number, radius: number, seed: number): boolean[] {
  const total = rows * columns
  const field = new Array<boolean>(total).fill(false)
  const wanted = Math.min(mines, total - 1)
  let pool = candidates(total, safeZone(firstIndex, rows, columns, radius))
  if (pool.length < wanted) pool = candidates(total, safeZone(firstIndex, rows, columns, 0))
  if (pool.length < wanted) pool = candidates(total, new Set([firstIndex]))
  shuffle(mulberry32(seed), pool)
  for (let index = 0; index < wanted; index += 1) field[pool[index]] = true
  return field
}

function countAround(field: readonly boolean[], index: number, rows: number, columns: number): number {
  return neighborIndices(index, rows, columns).reduce((sum, n) => sum + (field[n] ? 1 : 0), 0)
}

const blankCell: MineCell = { mine: false, count: 0, revealed: false, flagged: false }

export function createBoard(spec: MineLevelSpec): MineBoard {
  return {
    rows: spec.rows,
    columns: spec.columns,
    mineCount: spec.mines,
    safeRadius: spec.safeRadius,
    cells: Array.from({ length: spec.rows * spec.columns }, () => ({ ...blankCell })),
    phase: 'idle',
    flags: 0,
    firstIndex: null,
    opened: [],
  }
}

export function boardSeed(level: number, firstIndex: number): number {
  return seedFor(level, firstIndex + 1)
}

export function primeBoard(board: MineBoard, firstIndex: number, seed: number): MineBoard {
  if (board.phase !== 'idle') return board
  const field = layoutMines(board.rows, board.columns, board.mineCount, firstIndex, board.safeRadius, seed)
  const cells = board.cells.map((cell, index) => ({ ...cell, mine: field[index], count: countAround(field, index, board.rows, board.columns) }))
  return { ...board, cells, phase: 'playing', firstIndex, opened: [firstIndex] }
}

export function revealAt(board: MineBoard, index: number): MineBoard {
  if (board.phase !== 'playing') return board
  const cell = board.cells[index]
  if (!cell || cell.revealed || cell.flagged) return board
  if (cell.mine) {
    return { ...board, phase: 'lost', opened: [index], cells: board.cells.map((c) => (c.mine ? { ...c, revealed: true } : c)) }
  }
  const cells = board.cells.map((c) => ({ ...c }))
  const opened: number[] = []
  const stack = [index]
  while (stack.length) {
    const current = stack.pop() as number
    const target = cells[current]
    if (target.revealed || target.flagged || target.mine) continue
    target.revealed = true
    opened.push(current)
    if (target.count === 0) {
      for (const next of neighborIndices(current, board.rows, board.columns)) if (!cells[next].revealed) stack.push(next)
    }
  }
  const revealedSafe = cells.reduce((sum, c) => sum + (c.revealed && !c.mine ? 1 : 0), 0)
  const safeTotal = board.rows * board.columns - board.mineCount
  return { ...board, cells, opened, phase: revealedSafe >= safeTotal ? 'won' : 'playing' }
}

export function toggleFlag(board: MineBoard, index: number): MineBoard {
  if (board.phase === 'won' || board.phase === 'lost') return board
  const cell = board.cells[index]
  if (!cell || cell.revealed) return board
  const cells = board.cells.slice()
  cells[index] = { ...cell, flagged: !cell.flagged }
  return { ...board, cells, flags: board.flags + (cell.flagged ? -1 : 1) }
}

export function scoreFor(elapsedSeconds: number, spec: Pick<MineLevelSpec, 'par' | 'flagBonus'>, usedFlags: boolean): number {
  const over = Math.max(0, Math.ceil(Math.max(0, elapsedSeconds)) - spec.par)
  const penalty = Math.floor(over / 10) * 10
  const bonus = spec.flagBonus > 0 && !usedFlags ? spec.flagBonus : 0
  return Math.max(100, Math.min(5000, 1000 - penalty + bonus))
}
