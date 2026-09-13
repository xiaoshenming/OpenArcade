import { mulberry32, shuffle } from '../../platform/rng'

export const SKY_SIDES = ['top', 'right', 'bottom', 'left'] as const

export type ClueSide = (typeof SKY_SIDES)[number]

export interface Clues {
  readonly top: number[]
  readonly right: number[]
  readonly bottom: number[]
  readonly left: number[]
}

type MutableClues = { top: number[]; right: number[]; bottom: number[]; left: number[] }

export interface SkyPuzzle {
  readonly size: number
  readonly solution: number[]
  readonly clues: Clues
  readonly removed: number
  readonly sideCleared: boolean
}

const permCache = new Map<number, number[][]>()

function permutations(size: number): number[][] {
  const cached = permCache.get(size)
  if (cached) return cached
  const perms: number[][] = []
  const walk = (current: number[], used: number) => {
    if (current.length === size) {
      perms.push([...current])
      return
    }
    for (let value = 1; value <= size; value += 1) {
      const mark = 1 << value
      if (used & mark) continue
      current.push(value)
      walk(current, used | mark)
      current.pop()
    }
  }
  walk([], 0)
  permCache.set(size, perms)
  return perms
}

export function visibleCount(line: readonly number[]): number {
  let max = 0
  let seen = 0
  for (const value of line) {
    if (value > max) {
      max = value
      seen += 1
    }
  }
  return seen
}

const rowAt = (grid: readonly number[], size: number, row: number) => Array.from({ length: size }, (_, col) => grid[row * size + col])
const colAt = (grid: readonly number[], size: number, col: number) => Array.from({ length: size }, (_, row) => grid[row * size + col])

export function cluesFor(grid: readonly number[], size: number): Clues {
  return {
    top: Array.from({ length: size }, (_, col) => visibleCount(colAt(grid, size, col))),
    right: Array.from({ length: size }, (_, row) => visibleCount([...rowAt(grid, size, row)].reverse())),
    bottom: Array.from({ length: size }, (_, col) => visibleCount([...colAt(grid, size, col)].reverse())),
    left: Array.from({ length: size }, (_, row) => visibleCount(rowAt(grid, size, row))),
  }
}

export function fillLatin(rng: () => number, size: number): number[] {
  const deck = shuffle(rng, permutations(size).map((perm) => [...perm]))
  const used = new Array<number>(size).fill(0)
  const grid = new Array<number>(size * size).fill(0)
  const walk = (row: number): boolean => {
    if (row === size) return true
    for (const candidate of deck) {
      let ok = true
      for (let col = 0; col < size; col += 1) {
        if (used[col] & (1 << candidate[col])) {
          ok = false
          break
        }
      }
      if (!ok) continue
      for (let col = 0; col < size; col += 1) {
        grid[row * size + col] = candidate[col]
        used[col] |= 1 << candidate[col]
      }
      if (walk(row + 1)) return true
      for (let col = 0; col < size; col += 1) used[col] &= ~(1 << candidate[col])
    }
    return false
  }
  walk(0)
  return grid
}

export function countSolutions(clues: Clues, size: number, limit = 2): number {
  const meta = permutations(size).map((perm) => ({ perm, vis: visibleCount(perm), rvis: visibleCount([...perm].reverse()) }))
  const rowCands = Array.from({ length: size }, (_, row) =>
    meta
      .filter((entry) => (!clues.left[row] || entry.vis === clues.left[row]) && (!clues.right[row] || entry.rvis === clues.right[row]))
      .map((entry) => entry.perm))
  const initial = Array.from({ length: size }, (_, col) =>
    meta
      .filter((entry) => (!clues.top[col] || entry.vis === clues.top[col]) && (!clues.bottom[col] || entry.rvis === clues.bottom[col]))
      .map((entry) => entry.perm))
  const counter = { count: 0 }
  const walk = (row: number, colViable: number[][][]) => {
    if (counter.count >= limit) return
    if (row === size) {
      counter.count += 1
      return
    }
    for (const candidate of rowCands[row]) {
      const next: number[][][] = []
      let ok = true
      for (let col = 0; col < size; col += 1) {
        const kept = colViable[col].filter((perm) => perm[row] === candidate[col])
        if (!kept.length) {
          ok = false
          break
        }
        next.push(kept)
      }
      if (!ok) continue
      walk(row + 1, next)
      if (counter.count >= limit) return
    }
  }
  walk(0, initial)
  return counter.count
}

function greedyDig(rng: () => number, clues: MutableClues, size: number, target: number, removed: number): number {
  const pool = shuffle(rng, SKY_SIDES.flatMap((side) => clues[side].map((_, at) => ({ side, at }))))
  for (const spot of pool) {
    if (removed >= target) break
    if (clues[spot.side][spot.at] === 0) continue
    const backup = clues[spot.side][spot.at]
    clues[spot.side][spot.at] = 0
    if (countSolutions(clues, size, 2) === 1) removed += 1
    else clues[spot.side][spot.at] = backup
  }
  return removed
}

function growSky(seed: number, size: number, target: number, clearSide: ClueSide | null): SkyPuzzle {
  const rng = mulberry32(seed)
  const solution = fillLatin(rng, size)
  const full = cluesFor(solution, size)
  if (countSolutions(full, size, 2) !== 1) return { size, solution, clues: full, removed: -1, sideCleared: false }
  const order = clearSide ? [clearSide, ...SKY_SIDES.filter((side) => side !== clearSide)] : []
  for (const side of order) {
    const clues: MutableClues = { top: [...full.top], right: [...full.right], bottom: [...full.bottom], left: [...full.left] }
    clues[side] = new Array<number>(size).fill(0)
    if (countSolutions(clues, size, 2) !== 1) continue
    const removed = greedyDig(rng, clues, size, target, size)
    if (removed >= target) return { size, solution, clues, removed, sideCleared: true }
  }
  const clues: MutableClues = { top: [...full.top], right: [...full.right], bottom: [...full.bottom], left: [...full.left] }
  const removed = greedyDig(rng, clues, size, target, 0)
  return { size, solution, clues, removed, sideCleared: false }
}

const puzzleCache = new Map<string, SkyPuzzle>()

export function buildSkyPuzzle(seed: number, size: number, target: number, clearSide: ClueSide | null): SkyPuzzle {
  const key = `${seed}|${size}|${target}|${clearSide ?? ''}`
  const cached = puzzleCache.get(key)
  if (cached) return cached
  const floor = Math.floor(target * 0.75)
  const rank = (puzzle: SkyPuzzle) => (puzzle.sideCleared ? 1000 : 0) + puzzle.removed
  const good = (puzzle: SkyPuzzle) =>
    countSolutions(puzzle.clues, size, 2) === 1 && puzzle.removed >= floor && (!clearSide || puzzle.sideCleared)
  let best = growSky(seed, size, target, clearSide)
  for (let attempt = 1; attempt < 640 && !good(best); attempt += 1) {
    const grown = growSky((seed + attempt * 0x9e3779b1) >>> 0, size, target, clearSide)
    if (rank(grown) > rank(best)) best = grown
  }
  puzzleCache.set(key, best)
  return best
}

export function conflictIndexes(values: readonly number[], size: number): number[] {
  const flagged = new Set<number>()
  const lines: Array<number[]> = []
  for (let row = 0; row < size; row += 1) lines.push(Array.from({ length: size }, (_, col) => row * size + col))
  for (let col = 0; col < size; col += 1) lines.push(Array.from({ length: size }, (_, row) => row * size + col))
  for (const line of lines) {
    for (let a = 0; a < size; a += 1) {
      for (let b = a + 1; b < size; b += 1) {
        if (values[line[a]] > 0 && values[line[a]] === values[line[b]]) {
          flagged.add(line[a])
          flagged.add(line[b])
        }
      }
    }
  }
  return [...flagged].sort((x, y) => x - y)
}

export function isSolved(values: readonly number[], size: number, clues: Clues): boolean {
  if (!values.every((value) => value > 0)) return false
  if (conflictIndexes(values, size).length) return false
  const live = cluesFor(values, size)
  for (const side of SKY_SIDES) {
    for (let at = 0; at < size; at += 1) {
      const clue = clues[side][at]
      if (clue && live[side][at] !== clue) return false
    }
  }
  return true
}

export function scoreFor(errors: number, elapsed: number, par: number, strict = false): number {
  return Math.max(100, 1000 - errors * 60 - Math.max(0, Math.floor((elapsed - par) / 10)) * (strict ? 30 : 15))
}

export function formatClock(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds))
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`
}
