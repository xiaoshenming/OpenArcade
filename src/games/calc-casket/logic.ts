import { pick, shuffle } from '../../platform/rng'

export type CageOp = '+' | '−' | '×' | '÷'

export interface Cage {
  readonly cells: readonly number[]
  readonly target: number
  readonly op: CageOp
}

export const MISTAKE_PENALTY = 60
export const OVERTIME_SECONDS = 10
export const OVERTIME_PENALTY = 15
export const SCORE_FLOOR = 100
export const SCORE_CAP = 5000

export function bit(digit: number) {
  return 1 << (digit - 1)
}

export function neighborsOf(index: number, size: number): number[] {
  const row = Math.floor(index / size)
  const col = index % size
  const out: number[] = []
  if (row > 0) out.push(index - size)
  if (row + 1 < size) out.push(index + size)
  if (col > 0) out.push(index - 1)
  if (col + 1 < size) out.push(index + 1)
  return out
}

export function fillLatin(rng: () => number, size: number): number[] {
  const grid = new Array<number>(size * size).fill(0)
  const rows = new Array<number>(size).fill(0)
  const cols = new Array<number>(size).fill(0)
  const digits = Array.from({ length: size }, (_, step) => step + 1)
  const place = (index: number): boolean => {
    if (index >= grid.length) return true
    const row = Math.floor(index / size)
    const col = index % size
    const open = digits.filter((digit) => !(rows[row] & bit(digit)) && !(cols[col] & bit(digit)))
    for (const digit of shuffle(rng, open)) {
      grid[index] = digit
      rows[row] |= bit(digit)
      cols[col] |= bit(digit)
      if (place(index + 1)) return true
      grid[index] = 0
      rows[row] &= ~bit(digit)
      cols[col] &= ~bit(digit)
    }
    return false
  }
  place(0)
  return grid
}

export function partitionGrid(rng: () => number, size: number, allowed: readonly number[]): number[][] | null {
  const total = size * size
  const owner = new Int16Array(total).fill(-1)
  const cages: number[][] = []
  const maxSize = Math.max(...allowed)
  for (const seed of shuffle(rng, Array.from({ length: total }, (_, cell) => cell))) {
    if (owner[seed] >= 0) continue
    const cage = [seed]
    owner[seed] = cages.length
    while (cage.length < pick(rng, allowed)) {
      const frontier: number[] = []
      for (const cell of cage) for (const next of neighborsOf(cell, size)) if (owner[next] < 0) frontier.push(next)
      if (!frontier.length) break
      const grown = pick(rng, frontier)
      owner[grown] = cages.length
      cage.push(grown)
    }
    cages.push(cage)
  }
  for (let index = 0; index < cages.length; index += 1) {
    if (cages[index].length > 1) continue
    const hosts = neighborsOf(cages[index][0], size)
      .map((cell) => owner[cell])
      .filter((host) => host >= 0 && host !== index && cages[host].length < maxSize)
    if (!hosts.length) return null
    const host = pick(rng, hosts)
    cages[host].push(cages[index][0])
    owner[cages[index][0]] = host
    cages[index] = []
  }
  return cages.filter((cage) => cage.length > 0)
}

export function clueFor(rng: () => number, cells: readonly number[], values: readonly number[], ops: readonly CageOp[]): Cage {
  if (cells.length === 2) {
    const [a, b] = values
    const hi = Math.max(a, b)
    const lo = Math.min(a, b)
    const options: Cage[] = []
    if (ops.includes('+')) options.push({ cells, target: a + b, op: '+' })
    if (ops.includes('×')) options.push({ cells, target: a * b, op: '×' })
    if (ops.includes('−') && a !== b) options.push({ cells, target: hi - lo, op: '−' })
    if (ops.includes('÷') && hi % lo === 0) options.push({ cells, target: hi / lo, op: '÷' })
    return pick(rng, options)
  }
  const plus = !ops.includes('×') || rng() < 0.6
  if (plus) return { cells, target: values.reduce((sum, value) => sum + value, 0), op: '+' }
  return { cells, target: values.reduce((prod, value) => prod * value, 1), op: '×' }
}

export function cageFeasible(values: readonly number[], remaining: number, size: number, cage: Cage): boolean {
  if (cage.op === '+') {
    const sum = values.reduce((total, value) => total + value, 0)
    if (sum > cage.target) return false
    return remaining === 0 ? sum === cage.target : sum + remaining * size >= cage.target
  }
  if (cage.op === '×') {
    const prod = values.reduce((total, value) => total * value, 1)
    if (prod > cage.target || cage.target % prod !== 0) return false
    return remaining === 0 ? prod === cage.target : prod * size ** remaining >= cage.target
  }
  if (values.length > 2) return false
  if (values.length === 2) {
    const [a, b] = values
    if (cage.op === '−') return Math.abs(a - b) === cage.target
    return Math.max(a, b) === Math.min(a, b) * cage.target
  }
  if (!values.length) return true
  const value = values[0]
  if (cage.op === '−') return value - cage.target >= 1 || value + cage.target <= size
  return value * cage.target <= size || value % cage.target === 0
}

export function countCasketSolutions(size: number, cages: readonly Cage[], limit = 2): number {
  const total = size * size
  const owner = new Int16Array(total).fill(-1)
  cages.forEach((cage, index) => cage.cells.forEach((cell) => { owner[cell] = index }))
  const grid = new Array<number>(total).fill(0)
  const rows = new Array<number>(size).fill(0)
  const cols = new Array<number>(size).fill(0)
  const counter = { count: 0 }
  const maskFor = (index: number) => {
    const row = Math.floor(index / size)
    const col = index % size
    let mask = 0
    for (let digit = 1; digit <= size; digit += 1) {
      if (rows[row] & bit(digit) || cols[col] & bit(digit)) continue
      const cage = cages[owner[index]]
      const values = cage.cells.map((cell) => (cell === index ? digit : grid[cell])).filter((value) => value > 0)
      const remaining = cage.cells.length - values.length
      if (!cageFeasible(values, remaining, size, cage)) continue
      mask |= bit(digit)
    }
    return mask
  }
  const popcount = (mask: number) => {
    let count = 0
    while (mask) {
      mask &= mask - 1
      count += 1
    }
    return count
  }
  const search = () => {
    if (counter.count >= limit) return
    let best = -1
    let bestMask = 0
    let bestCount = size + 1
    for (let index = 0; index < total; index += 1) {
      if (grid[index]) continue
      const mask = maskFor(index)
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
    for (let digit = 1; digit <= size; digit += 1) {
      if (!(bestMask & bit(digit))) continue
      grid[best] = digit
      rows[row] |= bit(digit)
      cols[col] |= bit(digit)
      search()
      grid[best] = 0
      rows[row] &= ~bit(digit)
      cols[col] &= ~bit(digit)
      if (counter.count >= limit) return
    }
  }
  search()
  return counter.count
}

export function isLatinValid(values: readonly number[], size: number): boolean {
  const full = (1 << size) - 1
  for (let row = 0; row < size; row += 1) {
    let mask = 0
    for (let col = 0; col < size; col += 1) mask |= bit(values[row * size + col])
    if (mask !== full) return false
  }
  for (let col = 0; col < size; col += 1) {
    let mask = 0
    for (let row = 0; row < size; row += 1) mask |= bit(values[row * size + col])
    if (mask !== full) return false
  }
  return true
}

export function violationMask(entries: readonly number[], size: number, cages: readonly Cage[]): boolean[] {
  const mask = new Array<boolean>(entries.length).fill(false)
  for (let index = 0; index < entries.length; index += 1) {
    const value = entries[index]
    if (!value) continue
    const row = Math.floor(index / size)
    const col = index % size
    for (let step = 0; step < size; step += 1) {
      if (step !== col && entries[row * size + step] === value) mask[index] = true
      if (step !== row && entries[step * size + col] === value) mask[index] = true
    }
  }
  for (const cage of cages) {
    const values = cage.cells.map((cell) => entries[cell]).filter((value) => value > 0)
    if (!values.length) continue
    if (!cageFeasible(values, cage.cells.length - values.length, size, cage)) {
      for (const cell of cage.cells) if (entries[cell]) mask[cell] = true
    }
  }
  return mask
}

export function isCasketSolved(entries: readonly number[], size: number, cages: readonly Cage[]): boolean {
  return entries.every((value) => value > 0) && violationMask(entries, size, cages).every((bad) => !bad)
}

export function computeScore(errors: number, elapsed: number, par: number): number {
  const overtime = Math.floor(Math.max(0, elapsed - par) / OVERTIME_SECONDS) * OVERTIME_PENALTY
  return Math.min(SCORE_CAP, Math.max(SCORE_FLOOR, 1000 - errors * MISTAKE_PENALTY - overtime))
}
