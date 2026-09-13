import { mulberry32, seedFor, shuffle } from '../../platform/rng'
import { CLOUD_LEVEL_COUNT, getCloudLevel } from './levels'

export const DIR_DR = [-1, 0, 1, 0] as const
export const DIR_DC = [0, 1, 0, -1] as const
export const REVEAL_MS = 5000
export const MAX_MISTAKES = 3
export const MISTAKE_PENALTY = 150

export function dirBetween(from: number, to: number, cols: number) {
  const dr = Math.floor(to / cols) - Math.floor(from / cols)
  const dc = (to % cols) - (from % cols)
  if (dr === -1 && dc === 0) return 0
  if (dr === 0 && dc === 1) return 1
  if (dr === 1 && dc === 0) return 2
  if (dr === 0 && dc === -1) return 3
  return -1
}

export function areNeighbors(a: number, b: number, cols: number) {
  return dirBetween(a, b, cols) >= 0
}

export interface CloudPuzzle {
  readonly rows: number
  readonly cols: number
  readonly start: number
  readonly anchors: readonly number[]
  readonly storms: readonly boolean[]
  readonly budget: number
  readonly solution: readonly number[]
  readonly par: number
  readonly fog: boolean
  readonly depth: number
}

export type PathIssue = 'ok' | 'start' | 'bounds' | 'jump' | 'self' | 'storm' | 'anchor' | 'budget'

export function validatePath(puzzle: CloudPuzzle, path: readonly number[]): PathIssue {
  if (path.length === 0 || path[0] !== puzzle.start) return 'start'
  const seen = new Set<number>()
  for (let index = 0; index < path.length; index += 1) {
    const cell = path[index]
    if (cell < 0 || cell >= puzzle.rows * puzzle.cols) return 'bounds'
    if (index > 0 && dirBetween(path[index - 1], cell, puzzle.cols) < 0) return 'jump'
    if (seen.has(cell)) return 'self'
    seen.add(cell)
    if (puzzle.storms[cell]) return 'storm'
  }
  if (!puzzle.anchors.every((anchor) => seen.has(anchor))) return 'anchor'
  if (path.length - 1 > puzzle.budget) return 'budget'
  return 'ok'
}

function serpentine(rows: number, cols: number): number[] {
  const path: number[] = []
  for (let row = 0; row < rows; row += 1) {
    for (let step = 0; step < cols; step += 1) {
      const col = row % 2 === 0 ? step : cols - 1 - step
      path.push(row * cols + col)
    }
  }
  return path
}

function anchorsFromWalk(random: () => number, walk: readonly number[], count: number): number[] {
  for (const gap of [3, 2, 1]) {
    const candidates = shuffle(random, walk.map((_, index) => index).filter((index) => index >= 2))
    const picks: number[] = []
    for (const index of candidates) {
      if (picks.length === count) break
      if (picks.every((pick) => Math.abs(pick - index) >= gap)) picks.push(index)
    }
    if (picks.length >= count) return picks.sort((a, b) => a - b).map((index) => walk[index])
  }
  return []
}

export function generateCloudPuzzle(level: number): CloudPuzzle {
  const safe = Math.min(CLOUD_LEVEL_COUNT, Math.max(1, Math.floor(level)))
  const spec = getCloudLevel(safe)
  const rows = spec.rows
  const cols = spec.cols
  const total = rows * cols
  const rng = mulberry32(seedFor(safe, 41))
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const start = Math.floor(rng() * total)
    const others = shuffle(rng, Array.from({ length: total }, (_, cell) => cell).filter((cell) => cell !== start))
    const storms = Array.from({ length: total }, () => false)
    others.slice(0, spec.storms).forEach((cell) => { storms[cell] = true })
    const walk = [start]
    const visited = new Set<number>([start])
    while (walk.length < spec.walk + 1) {
      const tail = walk[walk.length - 1]
      const row = Math.floor(tail / cols)
      const col = tail % cols
      const steps: number[] = []
      for (let dir = 0; dir < 4; dir += 1) {
        const nr = row + DIR_DR[dir]
        const nc = col + DIR_DC[dir]
        if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue
        const next = nr * cols + nc
        if (visited.has(next) || storms[next]) continue
        steps.push(next)
      }
      if (steps.length === 0) break
      const next = steps[Math.floor(rng() * steps.length)]
      walk.push(next)
      visited.add(next)
    }
    if (walk.length < spec.walk + 1) continue
    const anchorCells = anchorsFromWalk(rng, walk, spec.anchors)
    if (anchorCells.length < spec.anchors) continue
    return {
      rows, cols, start, anchors: anchorCells, storms,
      budget: spec.walk + spec.slack, solution: walk, par: spec.walk, fog: spec.fog,
      depth: walk.length + spec.anchors * 6 + spec.storms * 5 + (spec.fog ? 6 : 0),
    }
  }
  const walk = serpentine(rows, cols).slice(0, spec.walk + 1)
  return {
    rows, cols, start: walk[0], anchors: anchorsFromWalk(mulberry32(7), walk, spec.anchors),
    storms: Array.from({ length: total }, () => false),
    budget: spec.walk + spec.slack, solution: walk, par: spec.walk, fog: spec.fog,
    depth: walk.length + spec.anchors * 6,
  }
}

export function scoreFor(steps: number, par: number, mistakes: number) {
  return Math.max(100, 1000 - Math.max(0, steps - par) * 10 - mistakes * MISTAKE_PENALTY)
}
