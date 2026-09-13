import { shuffle } from '../../platform/rng'

export interface PeakContext {
  readonly rows: number; readonly cols: number; readonly total: number; readonly neighbors: number[][]
  readonly regionOf: number[]; readonly regionCells: number[][]; readonly regionSize: number[]; readonly fullMask: number[]; readonly maxDigit: number
}

export interface PeakPuzzle {
  readonly ctx: PeakContext; readonly solution: number[]; readonly givens: number[]
}

export function popcount(mask: number): number {
  let count = 0
  let rest = mask
  while (rest) { rest &= rest - 1; count += 1 }
  return count
}

function cellNeighbors(index: number, rows: number, cols: number, diagonal: boolean): number[] {
  const row = Math.floor(index / cols)
  const col = index % cols
  const list: number[] = []
  for (let dr = -1; dr <= 1; dr += 1) for (let dc = -1; dc <= 1; dc += 1) {
    if ((!dr && !dc) || (!diagonal && dr && dc)) continue
    if (row + dr < 0 || row + dr >= rows || col + dc < 0 || col + dc >= cols) continue
    list.push((row + dr) * cols + col + dc)
  }
  return list
}

export function neighborIndexes(index: number, rows: number, cols: number): number[] {
  return cellNeighbors(index, rows, cols, true)
}

function tryPartition(random: () => number, rows: number, cols: number, maxSize: number): number[] | null {
  const regionOf = new Array<number>(rows * cols).fill(-1)
  const sizes: number[] = []
  for (let start = 0; start < regionOf.length; start += 1) {
    if (regionOf[start] >= 0) continue
    const id = sizes.length
    sizes.push(1)
    regionOf[start] = id
    const target = 2 + Math.floor(Math.sqrt(random()) * (maxSize - 1))
    const frontier = cellNeighbors(start, rows, cols, false).filter((cell) => regionOf[cell] < 0)
    while (sizes[id] < target && frontier.length) {
      const cell = frontier.splice(Math.floor(random() * frontier.length) % frontier.length, 1)[0]
      if (regionOf[cell] >= 0) continue
      regionOf[cell] = id
      sizes[id] += 1
      for (const next of cellNeighbors(cell, rows, cols, false)) if (regionOf[next] < 0) frontier.push(next)
    }
    if (sizes[id] === 1) {
      let best = -1
      let bestSize = maxSize + 1
      for (const next of cellNeighbors(start, rows, cols, false)) {
        const other = regionOf[next]
        if (other >= 0 && other !== id && sizes[other] < bestSize) { best = other; bestSize = sizes[other] }
      }
      if (best < 0) return null
      regionOf[start] = best
      sizes[best] += 1
      sizes[id] = 0
    }
  }
  if (sizes.some((size) => size > 0 && (size < 2 || size > maxSize))) return null
  return regionOf
}

function stripPartition(rows: number, cols: number, maxSize: number): number[] {
  const regionOf = new Array<number>(rows * cols).fill(-1)
  let id = 0
  for (let col = 0; col < cols; col += 1) {
    let row = 0
    while (row < rows) {
      let take = Math.min(maxSize, rows - row)
      if (rows - row - take === 1 && take > 2) take -= 1
      for (let step = 0; step < take; step += 1) regionOf[(row + step) * cols + col] = id
      id += 1
      row += take
    }
  }
  return regionOf
}

function buildRegions(regionOf: readonly number[]) {
  const remap = new Map<number, number>()
  const regionCells: number[][] = []
  regionOf.forEach((id, index) => {
    if (!remap.has(id)) { remap.set(id, regionCells.length); regionCells.push([]) }
    regionCells[remap.get(id)!].push(index)
  })
  return { regionOf: regionOf.map((id) => remap.get(id) ?? -1), regionCells }
}

export function partitionGrid(random: () => number, rows: number, cols: number, maxSize: number) {
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const regionOf = tryPartition(random, rows, cols, maxSize)
    if (regionOf) return buildRegions(regionOf)
  }
  return buildRegions(stripPartition(rows, cols, maxSize))
}

export function buildContext(rows: number, cols: number, regionOf: readonly number[], regionCells: readonly number[][]): PeakContext {
  const regionSize = regionCells.map((cells) => cells.length)
  const total = rows * cols
  return {
    rows, cols, total,
    neighbors: Array.from({ length: total }, (_, index) => neighborIndexes(index, rows, cols)),
    regionOf: [...regionOf],
    regionCells: regionCells.map((cells) => [...cells]),
    regionSize,
    fullMask: regionSize.map((size) => (1 << size) - 1),
    maxDigit: Math.max(...regionSize),
  }
}

function candidateMask(index: number, values: readonly number[], ctx: PeakContext): number {
  const region = ctx.regionOf[index]
  let mask = ctx.fullMask[region]
  for (const peer of ctx.regionCells[region]) if (peer !== index && values[peer]) mask &= ~(1 << (values[peer] - 1))
  for (const peer of ctx.neighbors[index]) if (values[peer]) mask &= ~(1 << (values[peer] - 1))
  return mask
}

function fillWalk(values: number[], ctx: PeakContext, random: () => number, budget: { nodes: number }): boolean {
  if (budget.nodes <= 0) return false
  budget.nodes -= 1
  let best = -1
  let bestMask = 0
  let bestCount = 10
  for (let index = 0; index < ctx.total; index += 1) {
    if (values[index]) continue
    const mask = candidateMask(index, values, ctx)
    const count = popcount(mask)
    if (!count) return false
    if (count < bestCount) { best = index; bestMask = mask; bestCount = count; if (count === 1) break }
  }
  if (best < 0) return true
  const options: number[] = []
  for (let digit = 1; digit <= ctx.maxDigit; digit += 1) if (bestMask & (1 << (digit - 1))) options.push(digit)
  shuffle(random, options)
  for (const digit of options) {
    values[best] = digit
    if (fillWalk(values, ctx, random, budget)) return true
    values[best] = 0
    if (budget.nodes <= 0) return false
  }
  return false
}

export function fillSolution(random: () => number, ctx: PeakContext): number[] {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const values = new Array<number>(ctx.total).fill(0)
    if (fillWalk(values, ctx, random, { nodes: 30000 })) return values
  }
  return new Array<number>(ctx.total).fill(0)
}

function propagate(masks: number[], ctx: PeakContext): boolean {
  let changed = true
  while (changed) {
    changed = false
    for (let region = 0; region < ctx.regionCells.length; region += 1) {
      const cells = ctx.regionCells[region]
      let used = 0
      let unfixed = 0
      for (const cell of cells) {
        const mask = masks[cell]
        if (!mask) return true
        if (!(mask & (mask - 1))) { if (used & mask) return true; used |= mask } else unfixed += 1
      }
      const remaining = ctx.fullMask[region] & ~used
      if (unfixed > popcount(remaining)) return true
      for (const cell of cells) {
        const mask = masks[cell]
        if (!mask || !(mask & (mask - 1))) continue
        const next = mask & remaining
        if (!next) return true
        if (next !== mask) { masks[cell] = next; changed = true }
      }
      if (unfixed > 1) {
        let pool = remaining
        while (pool) {
          const digit = pool & -pool
          pool &= ~digit
          const holders = cells.filter((cell) => masks[cell] & digit)
          if (!holders.length) return true
          if (holders.length === 1 && masks[holders[0]] !== digit) { masks[holders[0]] = digit; changed = true }
        }
      }
    }
    for (let index = 0; index < ctx.total; index += 1) {
      const mask = masks[index]
      if (!mask || mask & (mask - 1)) continue
      for (const peer of ctx.neighbors[index]) {
        if (masks[peer] & mask) { masks[peer] &= ~mask; changed = true; if (!masks[peer]) return true }
      }
    }
  }
  return false
}

export function countSolutions(givens: readonly number[], ctx: PeakContext, limit = 2): number {
  const masks = ctx.regionOf.map((region) => ctx.fullMask[region])
  for (let index = 0; index < ctx.total; index += 1) {
    const given = givens[index]
    if (!given) continue
    const mark = 1 << (given - 1)
    if (!(masks[index] & mark)) return 0
    masks[index] = mark
  }
  if (propagate(masks, ctx)) return 0
  const counter = { count: 0 }
  const walk = (): boolean => {
    let best = -1
    let bestCount = 10
    for (let index = 0; index < ctx.total; index += 1) {
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

export function digHoles(random: () => number, solution: readonly number[], ctx: PeakContext, targetHoles: number, protectedCells: readonly number[] = []): number[] {
  const puzzle = [...solution]
  const guarded = new Set(protectedCells)
  const order = shuffle(random, puzzle.map((_, cell) => cell).filter((cell) => !guarded.has(cell)))
  let holes = 0
  for (let round = 0; round < 6 && holes < targetHoles; round += 1) {
    let gained = 0
    for (const index of order) {
      if (holes >= targetHoles || !puzzle[index] || guarded.has(index)) continue
      const backup = puzzle[index]
      puzzle[index] = 0
      if (countSolutions(puzzle, ctx, 2) !== 1) puzzle[index] = backup
      else { holes += 1; gained += 1 }
    }
    if (!gained) break
  }
  return puzzle
}

export function hasNeighborConflict(values: readonly number[], index: number, ctx: PeakContext): boolean {
  const value = values[index]
  return value > 0 && ctx.neighbors[index].some((peer) => values[peer] === value)
}

export function hasRegionConflict(values: readonly number[], index: number, ctx: PeakContext): boolean {
  const value = values[index]
  if (!value) return false
  return ctx.regionCells[ctx.regionOf[index]].some((peer) => peer !== index && values[peer] === value)
}

export function isSolutionValid(values: readonly number[], ctx: PeakContext): boolean {
  const regionsOk = ctx.regionCells.every((cells, region) => {
    const seen = new Set<number>(cells.map((cell) => values[cell]))
    return seen.size === cells.length && [...seen].every((value) => value >= 1 && value <= ctx.regionSize[region])
  })
  return regionsOk && values.every((_, index) => !hasNeighborConflict(values, index, ctx))
}

export function isPuzzleSolved(givens: readonly number[], entries: readonly number[], solution: readonly number[]): boolean {
  return givens.every((given, index) => given > 0 || (entries[index] === solution[index] && entries[index] > 0))
}

export function computeScore(mistakes: number, elapsed: number, par: number): number {
  const overtime = Math.floor(Math.max(0, elapsed - par) / 10)
  return Math.max(100, 1000 - mistakes * 60 - overtime * 15)
}

export type MoveDirection = 'up' | 'down' | 'left' | 'right'

export function moveSelection(current: number | null, direction: MoveDirection, rows: number, cols: number): number {
  if (current === null) return 0
  const row = Math.floor(current / cols)
  const col = current % cols
  if (direction === 'up') return ((row - 1 + rows) % rows) * cols + col
  if (direction === 'down') return ((row + 1) % rows) * cols + col
  if (direction === 'left') return row * cols + ((col - 1 + cols) % cols)
  return row * cols + ((col + 1) % cols)
}
