export const MAX_PER_TYPE = 4
export const TYPE_GLYPHS = ['🧸', '📚', '🪴', '🎲'] as const
export const SIZE_DOTS = ['·', '··', '···', '····'] as const

export type TidyMode = 'classic' | 'grouped' | 'frozen' | 'alternating' | 'gauntlet'

export interface TidyLevel {
  readonly shelf: readonly number[]
  readonly target: readonly number[]
  readonly counts: readonly number[]
  readonly par: number
  readonly budget: number
  readonly frozen: readonly number[]
  readonly alternates: readonly [number, number] | null
}

export const typeOf = (item: number) => Math.floor(item / MAX_PER_TYPE)
export const sizeOf = (item: number) => item % MAX_PER_TYPE

export function buildTarget(counts: readonly number[], alternates: readonly [number, number] | null): number[] {
  const target: number[] = []
  counts.forEach((count, type) => {
    if (alternates && (type === alternates[0] || type === alternates[1])) return
    for (let size = 0; size < count; size += 1) target.push(type * MAX_PER_TYPE + size)
  })
  if (alternates) {
    const [x, y] = alternates
    let ix = 0
    let iy = 0
    while (ix < counts[x] || iy < counts[y]) {
      const useX = ix < counts[x] && (ix <= iy || iy >= counts[y])
      target.push((useX ? x : y) * MAX_PER_TYPE + (useX ? ix : iy))
      if (useX) ix += 1
      else iy += 1
    }
  }
  return target
}

export function inversionCount(shelf: readonly number[], target: readonly number[]): number {
  const rank = new Map<number, number>()
  target.forEach((item, index) => rank.set(item, index))
  let inversions = 0
  for (let left = 0; left < shelf.length; left += 1) {
    for (let right = left + 1; right < shelf.length; right += 1) {
      if ((rank.get(shelf[left]) ?? 0) > (rank.get(shelf[right]) ?? 0)) inversions += 1
    }
  }
  return inversions
}

const ascendingSizes = (shelf: readonly number[], positions: readonly number[]) => {
  for (let index = 1; index < positions.length; index += 1) {
    if (sizeOf(shelf[positions[index]]) <= sizeOf(shelf[positions[index - 1]])) return false
  }
  return true
}

const contiguous = (positions: readonly number[]) => positions.length === 0 || positions[positions.length - 1] - positions[0] + 1 === positions.length

export function isShelfTidy(shelf: readonly number[], counts: readonly number[], alternates: readonly [number, number] | null): boolean {
  const positions = counts.map(() => [] as number[])
  shelf.forEach((item, index) => positions[typeOf(item)].push(index))
  if (alternates) {
    const [x, y] = alternates
    const pair = [...positions[x], ...positions[y]].sort((a, b) => a - b)
    if (pair.length !== counts[x] + counts[y]) return false
    if (!contiguous(pair)) return false
    for (let index = 1; index < pair.length; index += 1) {
      if (typeOf(shelf[pair[index]]) === typeOf(shelf[pair[index - 1]])) return false
    }
    if (!ascendingSizes(shelf, positions[x]) || !ascendingSizes(shelf, positions[y])) return false
    return counts.every((_, type) => type === x || type === y || (ascendingSizes(shelf, positions[type]) && contiguous(positions[type])))
  }
  return counts.every((_, type) => ascendingSizes(shelf, positions[type]) && contiguous(positions[type]))
}

export function swapAdjacent(shelf: readonly number[], frozen: readonly number[], left: number): number[] | null {
  if (!Number.isInteger(left) || left < 0 || left + 1 >= shelf.length) return null
  if (frozen.includes(left) || frozen.includes(left + 1)) return null
  const next = [...shelf]
  ;[next[left], next[left + 1]] = [next[left + 1], next[left]]
  return next
}
