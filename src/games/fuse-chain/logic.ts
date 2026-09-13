export type BombGrid = boolean[]

export interface ChainResult {
  cleared: number[]
  waves: number[][]
}

export interface SolveResult {
  count: number
  cells: number[]
}

export function crossOf(index: number, cols: number, rows: number): number[] {
  const row = Math.floor(index / cols)
  const col = index % cols
  return [
    [row, col], [row - 1, col], [row + 1, col], [row, col - 1], [row, col + 1],
  ].filter(([r, c]) => r >= 0 && r < rows && c >= 0 && c < cols).map(([r, c]) => r * cols + c)
}

export function simulateChain(bombs: BombGrid, locked: BombGrid, cols: number, rows: number, click: number): ChainResult {
  const total = cols * rows
  if (!Number.isInteger(click) || click < 0 || click >= total || locked[click]) return { cleared: [], waves: [] }
  const exploded = new Set<number>()
  const waves: number[][] = []
  const manual = crossOf(click, cols, rows).filter((cell) => bombs[cell] && !locked[cell])
  manual.forEach((cell) => exploded.add(cell))
  if (manual.length) waves.push(manual)
  for (let wave = 0; wave < waves.length; wave += 1) {
    const next: number[] = []
    for (const bomb of waves[wave]) {
      for (const cell of crossOf(bomb, cols, rows)) {
        if (bombs[cell] && !exploded.has(cell)) {
          exploded.add(cell)
          next.push(cell)
        }
      }
    }
    if (next.length) waves.push(next)
  }
  return { cleared: [...exploded], waves }
}

export function componentsOf(bombs: BombGrid, cols: number, rows: number): number[] {
  const comp = Array.from({ length: cols * rows }, () => -1)
  let count = 0
  for (let start = 0; start < comp.length; start += 1) {
    if (!bombs[start] || comp[start] >= 0) continue
    const queue = [start]
    comp[start] = count
    for (let head = 0; head < queue.length; head += 1) {
      for (const next of crossOf(queue[head], cols, rows)) {
        if (bombs[next] && comp[next] < 0) {
          comp[next] = count
          queue.push(next)
        }
      }
    }
    count += 1
  }
  return comp
}

export function minDetonations(bombs: BombGrid, locked: BombGrid, cols: number, rows: number): SolveResult {
  const comp = componentsOf(bombs, cols, rows)
  const groups = comp.reduce((max, id) => Math.max(max, id + 1), 0)
  if (groups === 0) return { count: 0, cells: [] }
  const full = (1 << groups) - 1
  const maskOf = new Map<number, number>()
  const byGroup = Array.from({ length: groups }, () => [] as number[])
  for (let cell = 0; cell < comp.length; cell += 1) {
    if (locked[cell]) continue
    let mask = 0
    for (const target of crossOf(cell, cols, rows)) {
      if (bombs[target] && !locked[target]) mask |= 1 << comp[target]
    }
    if (!mask) continue
    maskOf.set(cell, mask)
    byGroup.forEach((cells, id) => {
      if (mask & (1 << id)) cells.push(cell)
    })
  }
  let union = 0
  maskOf.forEach((mask) => { union |= mask })
  if (union !== full) return { count: Number.POSITIVE_INFINITY, cells: [] }
  const path: number[] = []
  let bestCount = Number.POSITIVE_INFINITY
  let bestCells: number[] = []
  const walk = (covered: number) => {
    if (covered === full) {
      if (path.length < bestCount) {
        bestCount = path.length
        bestCells = [...path]
      }
      return
    }
    if (path.length + 1 >= bestCount) return
    let target = -1
    let options: number[] = []
    for (let id = 0; id < groups; id += 1) {
      if (covered & (1 << id)) continue
      if (target < 0 || byGroup[id].length < options.length) {
        target = id
        options = byGroup[id]
      }
    }
    for (const cell of options) {
      path.push(cell)
      walk(covered | (maskOf.get(cell) ?? 0))
      path.pop()
    }
  }
  walk(0)
  return { count: bestCount, cells: bestCells }
}

export const LIVES_PER_LEVEL = 3
export const SCORE_BASE = 1000
export const COST_PER_DETONATION = 30
export const BONUS_PER_LIFE = 100
export const SCORE_FLOOR = 100
export const SCORE_CAP = 5000

export function scoreFor(detonations: number, lives: number) {
  const raw = SCORE_BASE - Math.max(0, detonations) * COST_PER_DETONATION + Math.max(0, lives) * BONUS_PER_LIFE
  return Math.min(SCORE_CAP, Math.max(SCORE_FLOOR, raw))
}

export function failedScore(detonations: number) {
  return Math.max(0, SCORE_BASE - Math.max(0, detonations) * COST_PER_DETONATION)
}

export function isBudgetSpent(attempt: number, budget: number | undefined) {
  return budget !== undefined && attempt >= budget
}
