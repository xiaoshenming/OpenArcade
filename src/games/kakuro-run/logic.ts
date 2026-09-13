import { shuffle } from '../../platform/rng'

export const FULL9 = (1 << 9) - 1

export interface RunSpec {
  readonly id: number; readonly dir: 'h' | 'v'; readonly cells: number[]
  clue: number
}

export interface RunContext {
  readonly rows: number; readonly cols: number; readonly total: number
  readonly black: readonly boolean[]; readonly whiteCells: readonly number[]; readonly whiteCount: number
  readonly runs: RunSpec[]; readonly runsOfCell: readonly number[][]
}

export interface RunPuzzle {
  readonly ctx: RunContext; readonly solution: number[]; readonly givens: number[]
}

export function popcount(mask: number): number {
  let count = 0
  let rest = mask
  while (rest) { rest &= rest - 1; count += 1 }
  return count
}

const SIZE_SUM_SUBSETS: number[][][] = Array.from({ length: 10 }, () => Array.from({ length: 46 }, () => [] as number[]))
for (let mask = 0; mask <= FULL9; mask += 1) {
  let size = 0
  let sum = 0
  for (let digit = 1; digit <= 9; digit += 1) if (mask & (1 << (digit - 1))) { size += 1; sum += digit }
  SIZE_SUM_SUBSETS[size][sum].push(mask)
}

function collectRuns(white: readonly boolean[], rows: number, cols: number) {
  const runs: { dir: 'h' | 'v'; cells: number[] }[] = []
  const inRun = new Array<boolean>(rows * cols).fill(false)
  const scan = (dir: 'h' | 'v') => {
    const outer = dir === 'h' ? rows : cols
    const inner = dir === 'h' ? cols : rows
    for (let a = 0; a < outer; a += 1) {
      let start = -1
      for (let b = 0; b <= inner; b += 1) {
        const on = b < inner && white[dir === 'h' ? a * cols + b : b * cols + a]
        if (on && start < 0) start = b
        if (!on && start >= 0) {
          const cells: number[] = []
          for (let c = start; c < b; c += 1) cells.push(dir === 'h' ? a * cols + c : c * cols + a)
          if (cells.length >= 2) { runs.push({ dir, cells }); cells.forEach((cell) => { inRun[cell] = true }) }
          start = -1
        }
      }
    }
  }
  scan('h')
  scan('v')
  return { runs, inRun }
}

export function buildRunContext(rows: number, cols: number, black: readonly boolean[], maxRun: number): RunContext | null {
  const white = black.map((flag) => !flag)
  const whiteCells = white.map((flag, index) => (flag ? index : -1)).filter((index) => index >= 0)
  const { runs, inRun } = collectRuns(white, rows, cols)
  if (whiteCells.length * 2 < rows * cols || runs.length < 4) return null
  if (runs.some((run) => run.cells.length > maxRun) || !inRun.every((flag, index) => flag || !white[index])) return null
  const specs: RunSpec[] = runs.map((run, id) => ({ id, dir: run.dir, cells: run.cells, clue: 0 }))
  const runsOfCell = Array.from({ length: rows * cols }, () => [] as number[])
  specs.forEach((run) => run.cells.forEach((cell) => runsOfCell[cell].push(run.id)))
  return { rows, cols, total: rows * cols, black, whiteCells, whiteCount: whiteCells.length, runs: specs, runsOfCell }
}

export function randomPattern(random: () => number, total: number, density: number): boolean[] {
  return Array.from({ length: total }, () => random() < density)
}

function cuts(length: number, maxRun: number): number[] {
  const positions: number[] = []
  let at = 0
  while (length - at > maxRun) {
    const band = Math.min(maxRun, length - at - 3)
    if (band < 2) return [...positions, Math.floor(length / 2)]
    at += band
    positions.push(at)
    at += 1
  }
  return positions
}

export function bandPattern(rows: number, cols: number, maxRun: number): boolean[] {
  const black = new Array<boolean>(rows * cols).fill(false)
  cuts(rows, maxRun).forEach((at) => { for (let col = 0; col < cols; col += 1) black[at * cols + col] = true })
  cuts(cols, maxRun).forEach((at) => { for (let row = 0; row < rows; row += 1) black[row * cols + at] = true })
  return black
}

function runCandidateMask(index: number, values: readonly number[], ctx: RunContext): number {
  let mask = FULL9
  for (const runId of ctx.runsOfCell[index]) {
    for (const peer of ctx.runs[runId].cells) {
      const value = values[peer]
      if (peer !== index && value) mask &= ~(1 << (value - 1))
    }
  }
  return mask
}

function fillWalk(values: number[], ctx: RunContext, random: () => number, budget: { nodes: number }): boolean {
  if (budget.nodes <= 0) return false
  budget.nodes -= 1
  let best = -1
  let bestMask = 0
  let bestCount = 10
  for (const index of ctx.whiteCells) {
    if (values[index]) continue
    const mask = runCandidateMask(index, values, ctx)
    const count = popcount(mask)
    if (!count) return false
    if (count < bestCount) { best = index; bestMask = mask; bestCount = count; if (count === 1) break }
  }
  if (best < 0) return true
  const options: number[] = []
  for (let digit = 1; digit <= 9; digit += 1) if (bestMask & (1 << (digit - 1))) options.push(digit)
  shuffle(random, options)
  for (const digit of options) {
    values[best] = digit
    if (fillWalk(values, ctx, random, budget)) return true
    values[best] = 0
    if (budget.nodes <= 0) return false
  }
  return false
}

export function fillRunGrid(random: () => number, ctx: RunContext): number[] {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const values = new Array<number>(ctx.total).fill(0)
    if (fillWalk(values, ctx, random, { nodes: 40000 })) return values
  }
  return new Array<number>(ctx.total).fill(0)
}

export function pickClueless(random: () => number, runCount: number, fraction: number): number[] {
  if (fraction <= 0) return []
  return shuffle(random, Array.from({ length: runCount }, (_, id) => id)).slice(0, Math.min(runCount, Math.round(runCount * fraction)))
}

export function writeClues(ctx: RunContext, solution: readonly number[], cluelessIds: readonly number[] = []): void {
  const hidden = new Set(cluelessIds)
  ctx.runs.forEach((run) => { run.clue = hidden.has(run.id) ? 0 : run.cells.reduce((sum, cell) => sum + solution[cell], 0) })
}

function propagate(masks: number[], ctx: RunContext): boolean {
  let changed = true
  while (changed) {
    changed = false
    for (const run of ctx.runs) {
      const cells = run.cells
      let used = 0
      let usedSum = 0
      let unfixed = 0
      for (const cell of cells) {
        const mask = masks[cell]
        if (!mask) return true
        if (!(mask & (mask - 1))) {
          if (used & mask) return true
          used |= mask
          usedSum += 32 - Math.clz32(mask)
        } else unfixed += 1
      }
      if (!unfixed) {
        if (run.clue > 0 && usedSum !== run.clue) return true
        continue
      }
      const free = FULL9 & ~used
      if (popcount(free) < unfixed) return true
      let cellUnion = 0
      for (const cell of cells) if (masks[cell] & (masks[cell] - 1)) cellUnion |= masks[cell]
      const need = run.clue - usedSum
      const pool = run.clue > 0 ? (need >= 0 && need <= 45 ? SIZE_SUM_SUBSETS[unfixed][need] : []) : SIZE_SUM_SUBSETS[unfixed].flat()
      let allowed = 0
      let mandatory = FULL9
      let found = 0
      for (const subset of pool) {
        if ((subset & used) || (subset & ~cellUnion)) continue
        allowed |= subset
        mandatory &= subset
        found += 1
      }
      if (!found) return true
      for (const cell of cells) {
        const mask = masks[cell]
        if (!mask || !(mask & (mask - 1))) continue
        const next = mask & allowed
        if (!next) return true
        if (next !== mask) { masks[cell] = next; changed = true }
      }
      let must = mandatory
      while (must) {
        const digit = must & -must
        must &= ~digit
        const holders = cells.filter((cell) => masks[cell] & digit)
        if (!holders.length) return true
        if (holders.length === 1 && masks[holders[0]] !== digit) { masks[holders[0]] = digit; changed = true }
      }
    }
  }
  return false
}

export function countSolutions(givens: readonly number[], ctx: RunContext, limit = 2): number {
  const masks = new Array<number>(ctx.total).fill(0)
  for (const cell of ctx.whiteCells) masks[cell] = givens[cell] ? 1 << (givens[cell] - 1) : FULL9
  if (propagate(masks, ctx)) return 0
  const counter = { count: 0 }
  const walk = (): boolean => {
    let best = -1
    let bestCount = 10
    for (const index of ctx.whiteCells) {
      const count = popcount(masks[index])
      if (!count) return false
      if (count > 1 && count < bestCount) { best = index; bestCount = count; if (count === 2) break }
    }
    if (best < 0) {
      counter.count += 1
      return counter.count >= limit
    }
    const snapshot = masks.slice()
    let pool = masks[best]
    while (pool) {
      const digit = pool & -pool
      pool &= ~digit
      masks[best] = digit
      if (!propagate(masks, ctx) && walk()) return true
      if (counter.count >= limit) return true
      snapshot.forEach((mask, index) => { masks[index] = mask })
    }
    return false
  }
  walk()
  return counter.count
}

export function digHoles(random: () => number, solution: readonly number[], ctx: RunContext, targetHoles: number): number[] {
  const puzzle = [...solution]
  const order = shuffle(random, ctx.whiteCells.slice())
  let holes = 0
  for (let round = 0; round < 6 && holes < targetHoles; round += 1) {
    let gained = 0
    for (const index of order) {
      if (holes >= targetHoles || !puzzle[index]) continue
      const backup = puzzle[index]
      puzzle[index] = 0
      if (countSolutions(puzzle, ctx, 2) !== 1) puzzle[index] = backup
      else { holes += 1; gained += 1 }
    }
    if (!gained) break
  }
  return puzzle
}

export function isRunSolutionValid(values: readonly number[], ctx: RunContext): boolean {
  const runsOk = ctx.runs.every((run) => {
    const seen = new Set<number>(run.cells.map((cell) => values[cell]))
    const digits = [...seen]
    const sum = digits.reduce((total, value) => total + value, 0)
    return seen.size === run.cells.length && digits.every((value) => value >= 1 && value <= 9) && (run.clue === 0 || sum === run.clue)
  })
  return runsOk && ctx.black.every((flag, index) => !flag || values[index] === 0)
}

export function isPuzzleSolved(givens: readonly number[], entries: readonly number[], solution: readonly number[]): boolean {
  return givens.every((given, index) => given > 0 || entries[index] === solution[index])
}

export function computeScore(mistakes: number, elapsed: number, par: number): number {
  const overtime = Math.floor(Math.max(0, elapsed - par) / 10)
  return Math.max(100, 1000 - mistakes * 60 - overtime * 15)
}

export type MoveDirection = 'up' | 'down' | 'left' | 'right'

export function moveSelection(current: number | null, direction: MoveDirection, rows: number, cols: number, cells: readonly number[]): number {
  if (current === null) return cells[0] ?? 0
  const row = Math.floor(current / cols)
  const col = current % cols
  const seek = (target: number) => cells.find((cell) => cell === target)
  const vertical = direction === 'up' || direction === 'down'
  const fixed = vertical ? col : row
  const moving = vertical ? row : col
  const limit = vertical ? rows : cols
  const at = (probe: number) => (vertical ? probe * cols + fixed : fixed * cols + probe)
  const step = direction === 'up' || direction === 'left' ? -1 : 1
  for (let probe = moving + step; probe >= 0 && probe < limit; probe += step) {
    const hit = seek(at(probe))
    if (hit !== undefined) return hit
  }
  return step > 0 ? cells[0] : cells[cells.length - 1]
}
