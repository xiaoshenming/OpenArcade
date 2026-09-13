import { mulberry32, shuffle } from '../../platform/rng'

export const UNKNOWN = -1

export interface GardenPuzzle {
  readonly size: number
  readonly solution: number[]
  readonly givens: number[]
  readonly holes: number
  readonly hint?: { kind: LineKind; at: number }
}

export type LineKind = 'row' | 'col'

export function nextValue(value: number): number {
  return value === UNKNOWN ? 0 : value === 0 ? 1 : UNKNOWN
}

export function lineValues(cells: readonly number[], size: number, kind: LineKind, at: number): number[] {
  if (kind === 'row') return cells.slice(at * size, at * size + size)
  return Array.from({ length: size }, (_, row) => cells[row * size + at])
}

const cellIndexes = (size: number, kind: LineKind, at: number) =>
  Array.from({ length: size }, (_, step) => (kind === 'row' ? at * size + step : step * size + at))

const sameLine = (a: readonly number[], b: readonly number[]) => a.every((value, at) => value === b[at])

function tripleAt(line: readonly number[]): number {
  for (let at = 0; at + 2 < line.length; at += 1) {
    if (line[at] !== UNKNOWN && line[at] === line[at + 1] && line[at + 1] === line[at + 2]) return at
  }
  return -1
}

function balanced(line: readonly number[], half: number): boolean {
  const ones = line.filter((value) => value === 1).length
  const zeros = line.filter((value) => value === 0).length
  return ones <= half && zeros <= half
}

interface LineVerdict {
  contradiction?: boolean
  owner?: 1 | 2
  step?: number
  value?: number
}

function compareLines(first: readonly number[], second: readonly number[]): LineVerdict | null {
  let pending = -1
  let owner: 1 | 2 = 1
  let shared = 0
  for (let step = 0; step < first.length; step += 1) {
    const x = first[step]
    const y = second[step]
    if (x === UNKNOWN && y === UNKNOWN) shared += 1
    else if (x === UNKNOWN || y === UNKNOWN) {
      if (pending >= 0) return null
      pending = step
      owner = x === UNKNOWN ? 1 : 2
    } else if (x !== y) return null
  }
  if (pending < 0) return shared === 0 ? { contradiction: true } : null
  if (shared > 0) return null
  const known = owner === 1 ? second[pending] : first[pending]
  return { owner, step: pending, value: known === 0 ? 1 : 0 }
}

function propagate(cells: number[], size: number): boolean {
  const half = size / 2
  let changed = true
  while (changed) {
    changed = false
    for (const kind of ['row', 'col'] as const) {
      for (let at = 0; at < size; at += 1) {
        const line = lineValues(cells, size, kind, at)
        if (!balanced(line, half)) return false
        const ones = line.filter((value) => value === 1).length
        const zeros = line.filter((value) => value === 0).length
        const fill = ones === half ? 0 : zeros === half ? 1 : UNKNOWN
        const indexes = cellIndexes(size, kind, at)
        if (fill !== UNKNOWN) {
          line.forEach((value, step) => {
            if (value === UNKNOWN) {
              cells[indexes[step]] = fill
              changed = true
            }
          })
        }
        for (let step = 0; step + 2 < size; step += 1) {
          const trio = [line[step], line[step + 1], line[step + 2]]
          const known = trio.filter((value) => value !== UNKNOWN)
          if (known.length < 2 || new Set(known).size !== 1) continue
          if (known.length === 3) return false
          const opposite = known[0] === 0 ? 1 : 0
          trio.forEach((value, offset) => {
            if (value === UNKNOWN) {
              cells[indexes[step + offset]] = opposite
              changed = true
            }
          })
        }
      }
    }
    for (const kind of ['row', 'col'] as const) {
      for (let a = 0; a < size; a += 1) {
        for (let b = a + 1; b < size; b += 1) {
          const verdict = compareLines(lineValues(cells, size, kind, a), lineValues(cells, size, kind, b))
          if (verdict === null) continue
          if (verdict.contradiction) return false
          const owner = cellIndexes(size, kind, verdict.owner === 1 ? a : b)
          cells[owner[verdict.step as number]] = verdict.value as number
          changed = true
        }
      }
    }
  }
  return true
}

export function countSolutions(givens: readonly number[], size: number, limit = 2): number {
  const counter = { count: 0 }
  const walk = (cells: readonly number[]) => {
    if (counter.count >= limit) return
    const work = [...cells]
    if (!propagate(work, size)) return
    const at = work.indexOf(UNKNOWN)
    if (at < 0) {
      counter.count += 1
      return
    }
    for (const value of [0, 1]) {
      work[at] = value
      walk(work)
      if (counter.count >= limit) return
    }
  }
  walk(givens)
  return counter.count
}

function placementOk(grid: readonly number[], size: number, at: number): boolean {
  const row = Math.floor(at / size)
  const col = at % size
  const half = size / 2
  const rowLine = lineValues(grid, size, 'row', row)
  const colLine = lineValues(grid, size, 'col', col)
  if (!balanced(rowLine, half) || !balanced(colLine, half)) return false
  if (tripleAt(rowLine) >= 0 || tripleAt(colLine) >= 0) return false
  if (col === size - 1) {
    for (let other = 0; other < row; other += 1) {
      if (sameLine(rowLine, lineValues(grid, size, 'row', other))) return false
    }
  }
  if (row === size - 1) {
    for (let other = 0; other < col; other += 1) {
      if (sameLine(colLine, lineValues(grid, size, 'col', other))) return false
    }
  }
  return true
}

export function generateFullGrid(rng: () => number, size: number): number[] {
  const grid = new Array<number>(size * size).fill(UNKNOWN)
  const walk = (at: number): boolean => {
    if (at === grid.length) return true
    const first = rng() < 0.5 ? 0 : 1
    for (const value of [first, 1 - first]) {
      grid[at] = value
      if (placementOk(grid, size, at) && walk(at + 1)) return true
    }
    grid[at] = UNKNOWN
    return false
  }
  walk(0)
  return grid
}

function digHoles(rng: () => number, solution: readonly number[], size: number, target: number): number[] {
  const givens = [...solution]
  let holes = 0
  let pool = shuffle(rng, givens.map((_, index) => index))
  while (holes < target && pool.length) {
    let progressed = false
    for (const index of pool) {
      if (holes >= target) break
      const backup = givens[index]
      givens[index] = UNKNOWN
      if (countSolutions(givens, size, 2) === 1) {
        holes += 1
        progressed = true
      } else {
        givens[index] = backup
      }
    }
    if (!progressed) break
    pool = shuffle(rng, givens.map((value, at) => (value === UNKNOWN ? -1 : at)).filter((at) => at >= 0))
  }
  return givens
}

function growGarden(seed: number, size: number, target: number): GardenPuzzle {
  const rng = mulberry32(seed)
  const solution = generateFullGrid(rng, size)
  const givens = digHoles(rng, solution, size, target)
  const holes = givens.reduce((sum, value) => sum + (value === UNKNOWN ? 1 : 0), 0)
  return { size, solution, givens, holes }
}

export function generateGarden(seedBase: number, size: number, target: number): GardenPuzzle {
  const floor = Math.max(4, Math.floor(target * 0.75))
  let best = growGarden(seedBase, size, target)
  for (let attempt = 1; attempt < 10 && best.holes < floor; attempt += 1) {
    const grown = growGarden((seedBase + attempt * 0x9e3779b1) >>> 0, size, target)
    if (grown.holes > best.holes) best = grown
  }
  return best
}

export function conflictCells(values: readonly number[], size: number): number[] {
  const flagged = new Set<number>()
  const half = size / 2
  for (const kind of ['row', 'col'] as const) {
    for (let at = 0; at < size; at += 1) {
      const line = lineValues(values, size, kind, at)
      const indexes = cellIndexes(size, kind, at)
      const ones = line.filter((value) => value === 1).length
      const zeros = line.filter((value) => value === 0).length
      if (ones > half) line.forEach((value, step) => { if (value === 1) flagged.add(indexes[step]) })
      if (zeros > half) line.forEach((value, step) => { if (value === 0) flagged.add(indexes[step]) })
      for (let step = 0; step + 2 < size; step += 1) {
        if (line[step] === UNKNOWN || line[step] !== line[step + 1] || line[step + 1] !== line[step + 2]) continue
        flagged.add(indexes[step])
        flagged.add(indexes[step + 1])
        flagged.add(indexes[step + 2])
      }
    }
  }
  for (const kind of ['row', 'col'] as const) {
    for (let a = 0; a < size; a += 1) {
      for (let b = a + 1; b < size; b += 1) {
        const first = lineValues(values, size, kind, a)
        const second = lineValues(values, size, kind, b)
        if (first.some((value) => value === UNKNOWN) || !sameLine(first, second)) continue
        cellIndexes(size, kind, a).forEach((index) => flagged.add(index))
        cellIndexes(size, kind, b).forEach((index) => flagged.add(index))
      }
    }
  }
  return [...flagged].sort((x, y) => x - y)
}

export function lineComplete(values: readonly number[], size: number, kind: LineKind, at: number): boolean {
  const line = lineValues(values, size, kind, at)
  if (line.some((value) => value === UNKNOWN)) return false
  if (!balanced(line, size / 2) || tripleAt(line) >= 0) return false
  for (let other = 0; other < size; other += 1) {
    if (other !== at && sameLine(line, lineValues(values, size, kind, other))) return false
  }
  return true
}

export function scoreFor(mistakes: number, elapsed: number, par: number): number {
  return Math.max(100, 1000 - mistakes * 60 - Math.max(0, Math.floor((elapsed - par) / 10)) * 15)
}

export function formatClock(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds))
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`
}
