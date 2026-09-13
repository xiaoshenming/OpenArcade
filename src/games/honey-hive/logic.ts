export const NECTAR_MIN = 1
export const NECTAR_MAX = 6

export interface Axial {
  readonly q: number
  readonly r: number
}
export type RingKind = 'uniform' | 'single'
export type RingClue = { readonly kind: 'sum'; readonly value: number } | { readonly kind: 'delta'; readonly value: number }

export interface HiveLevel {
  readonly radius: number
  readonly rings: readonly (readonly Axial[])[]
  readonly cells: readonly Axial[]
  readonly ringIndex: Readonly<Record<string, number>>
  readonly solution: Readonly<Record<string, number>>
  readonly givens: Readonly<Record<string, number>>
  readonly clues: readonly RingClue[]
  readonly empties: number
  readonly singles: number
  readonly deltaRings: number
  readonly budget: number | null
  readonly par: number
}

export const DIRS: readonly Axial[] = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
]

export const cellKey = (cell: Axial) => `${cell.q},${cell.r}`
export const hexDist = (q: number, r: number) => (Math.abs(q) + Math.abs(r) + Math.abs(q + r)) / 2

export function hexRing(k: number): Axial[] {
  if (k <= 0) return [{ q: 0, r: 0 }]
  const cells: Axial[] = []
  let q = -k
  let r = k
  for (let side = 0; side < DIRS.length; side += 1) {
    for (let step = 0; step < k; step += 1) {
      cells.push({ q, r })
      q += DIRS[side].q
      r += DIRS[side].r
    }
  }
  return cells
}

export function hexDisk(radius: number): Axial[] {
  const cells: Axial[] = []
  for (let k = 0; k <= radius; k += 1) cells.push(...hexRing(k))
  return cells
}

export function countWays(target: number, empties: number): number {
  if (empties === 0) return target === 0 ? 1 : 0
  if (empties < 0 || target < NECTAR_MIN * empties || target > NECTAR_MAX * empties) return 0
  let ways = new Array(target + 1).fill(0)
  ways[0] = 1
  for (let cell = 0; cell < empties; cell += 1) {
    const next = new Array(target + 1).fill(0)
    for (let sum = 0; sum <= target; sum += 1) {
      if (!ways[sum]) continue
      for (let value = NECTAR_MIN; value <= NECTAR_MAX && sum + value <= target; value += 1) next[sum + value] += ways[sum]
    }
    ways = next
  }
  return ways[target]
}

export function ringSums(clues: readonly RingClue[]): number[] {
  const sums: number[] = []
  clues.forEach((clue, index) => sums.push(clue.kind === 'sum' || index === 0 ? clue.value : sums[index - 1] + clue.value))
  return sums
}

export function ringBroken(target: number, sum: number, filled: number, size: number): boolean {
  const empties = size - filled
  if (sum > target) return true
  if (empties === 0) return sum !== target
  return sum + NECTAR_MAX * empties < target || sum + NECTAR_MIN * empties > target
}

export function ringTotals(level: HiveLevel, values: Readonly<Record<string, number>>) {
  return level.rings.map((ring) =>
    ring.reduce(
      (acc, cell) => {
        const value = values[cellKey(cell)]
        return value ? { sum: acc.sum + value, filled: acc.filled + 1 } : acc
      },
      { sum: 0, filled: 0 },
    ),
  )
}

export function placeConflicts(level: HiveLevel, values: Readonly<Record<string, number>>, key: string, value: number): boolean {
  const index = level.ringIndex[key]
  if (index === undefined || level.givens[key]) return true
  const ring = level.rings[index]
  let sum = value
  let filled = 1
  for (const cell of ring) {
    const other = cellKey(cell)
    if (other === key) continue
    const known = values[other]
    if (known) {
      sum += known
      filled += 1
    }
  }
  return ringBroken(ringSums(level.clues)[index], sum, filled, ring.length)
}

export function isSolved(level: HiveLevel, values: Readonly<Record<string, number>>): boolean {
  if (!level.cells.every((cell) => values[cellKey(cell)])) return false
  const totals = ringTotals(level, values)
  return ringSums(level.clues).every((target, index) => totals[index].sum === target && totals[index].filled === level.rings[index].length)
}

export const scoreFor = (mistakes: number, seconds: number, par: number) => Math.max(100, 1000 - mistakes * 60 - Math.max(0, seconds - par))
