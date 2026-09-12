import { shuffle } from '../../platform/rng'

export type Grid = number[]

export interface SudokuSpec {
  readonly size: number
  readonly boxRows: number
  readonly boxCols: number
}

export function specFor(size: number): SudokuSpec {
  if (size === 4) return { size: 4, boxRows: 2, boxCols: 2 }
  if (size === 6) return { size: 6, boxRows: 2, boxCols: 3 }
  return { size: 9, boxRows: 3, boxCols: 3 }
}

export const bit = (digit: number) => 1 << (digit - 1)

export function boxOf(index: number, spec: SudokuSpec) {
  const row = Math.floor(index / spec.size)
  const col = index % spec.size
  return Math.floor(row / spec.boxRows) * (spec.size / spec.boxCols) + Math.floor(col / spec.boxCols)
}

export function peerIndexes(index: number, spec: SudokuSpec): number[] {
  const size = spec.size
  const row = Math.floor(index / size)
  const col = index % size
  const box = boxOf(index, spec)
  const peers = new Set<number>()
  for (let step = 0; step < size; step += 1) {
    peers.add(row * size + step)
    peers.add(step * size + col)
  }
  for (let cell = 0; cell < size * size; cell += 1) if (boxOf(cell, spec) === box) peers.add(cell)
  peers.delete(index)
  return [...peers]
}

function popcount(mask: number) {
  let count = 0
  while (mask) {
    mask &= mask - 1
    count += 1
  }
  return count
}

interface SearchState {
  rows: number[]
  cols: number[]
  boxes: number[]
}

function masksFor(grid: readonly number[], spec: SudokuSpec): SearchState {
  const size = spec.size
  const state: SearchState = { rows: new Array<number>(size).fill(0), cols: new Array<number>(size).fill(0), boxes: new Array<number>(size).fill(0) }
  grid.forEach((value, index) => {
    if (!value) return
    const mark = bit(value)
    state.rows[Math.floor(index / size)] |= mark
    state.cols[index % size] |= mark
    state.boxes[boxOf(index, spec)] |= mark
  })
  return state
}

function search(grid: Grid, spec: SudokuSpec, state: SearchState, limit: number, rng: (() => number) | null, counter: { count: number }) {
  if (counter.count >= limit) return
  const size = spec.size
  const full = (1 << size) - 1
  let best = -1
  let bestMask = 0
  let bestCount = size + 1
  for (let index = 0; index < grid.length; index += 1) {
    if (grid[index]) continue
    const mask = full & ~(state.rows[Math.floor(index / size)] | state.cols[index % size] | state.boxes[boxOf(index, spec)])
    const count = popcount(mask)
    if (count === 0) return
    if (count < bestCount) {
      best = index
      bestMask = mask
      bestCount = count
      if (count === 1) break
    }
  }
  if (best < 0) {
    counter.count += 1
    return
  }
  const row = Math.floor(best / size)
  const col = best % size
  const box = boxOf(best, spec)
  const digits: number[] = []
  for (let digit = 1; digit <= size; digit += 1) if (bestMask & bit(digit)) digits.push(digit)
  if (rng) shuffle(rng, digits)
  for (const digit of digits) {
    const mark = bit(digit)
    grid[best] = digit
    state.rows[row] |= mark
    state.cols[col] |= mark
    state.boxes[box] |= mark
    search(grid, spec, state, limit, rng, counter)
    if (counter.count >= limit) return
    grid[best] = 0
    state.rows[row] &= ~mark
    state.cols[col] &= ~mark
    state.boxes[box] &= ~mark
  }
}

export function countSolutions(grid: readonly number[], spec: SudokuSpec, limit = 2): number {
  const work = [...grid]
  const counter = { count: 0 }
  search(work, spec, masksFor(work, spec), limit, null, counter)
  return counter.count
}

export function fillGrid(rng: () => number, spec: SudokuSpec): Grid {
  const grid: Grid = new Array<number>(spec.size * spec.size).fill(0)
  search(grid, spec, masksFor(grid, spec), 1, rng, { count: 0 })
  return grid
}

export function digHoles(rng: () => number, solution: readonly number[], spec: SudokuSpec, target: number): Grid {
  const puzzle = [...solution]
  let holes = 0
  for (const index of shuffle(rng, puzzle.map((_, cell) => cell))) {
    if (holes >= target) break
    const backup = puzzle[index]
    puzzle[index] = 0
    if (countSolutions(puzzle, spec, 2) !== 1) puzzle[index] = backup
    else holes += 1
  }
  return puzzle
}

export function hasConflict(grid: readonly number[], index: number, spec: SudokuSpec): boolean {
  const value = grid[index]
  return value > 0 && peerIndexes(index, spec).some((peer) => grid[peer] === value)
}

export function isPuzzleSolved(givens: readonly number[], entries: readonly number[], solution: readonly number[]): boolean {
  return givens.every((given, index) => given > 0 || (entries[index] === solution[index] && entries[index] > 0))
}

export function toggleNote(notes: readonly number[], index: number, digit: number): number[] {
  const next = [...notes]
  next[index] ^= bit(digit)
  return next
}

export function clearPeerNotes(notes: readonly number[], index: number, digit: number, spec: SudokuSpec): number[] {
  const next = [...notes]
  next[index] = 0
  for (const peer of peerIndexes(index, spec)) next[peer] &= ~bit(digit)
  return next
}

export function computeScore(errors: number, elapsed: number, par: number, strict: boolean): number {
  const overtimeSteps = Math.floor(Math.max(0, elapsed - par) / 10)
  return Math.min(10000, Math.max(100, 1000 - errors * 60 - overtimeSteps * (strict ? 30 : 15)))
}

export const FROZEN_SECONDS = 3

export type MoveDirection = 'up' | 'down' | 'left' | 'right'

export function moveSelection(current: number | null, direction: MoveDirection, size: number): number {
  if (current === null) return 0
  const row = Math.floor(current / size)
  const col = current % size
  if (direction === 'up') return ((row - 1 + size) % size) * size + col
  if (direction === 'down') return ((row + 1) % size) * size + col
  if (direction === 'left') return row * size + (col - 1 + size) % size
  return row * size + (col + 1) % size
}

export function decrementFrozen(frozen: Readonly<Record<number, number>>): Record<number, number> {
  const next: Record<number, number> = {}
  for (const [index, seconds] of Object.entries(frozen)) {
    const left = seconds - 1
    if (left > 0) next[Number(index)] = left
  }
  return next
}
