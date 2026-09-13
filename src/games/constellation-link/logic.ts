export interface StarEdge {
  readonly a: number
  readonly b: number
}

export interface Constellation {
  readonly cols: number
  readonly rows: number
  readonly stars: number[]
  readonly edges: StarEdge[]
}

export const edgeKey = (a: number, b: number) => (a < b ? a * 256 + b : b * 256 + a)

export function neighborsOf(cell: number, cols: number, rows: number): number[] {
  const row = Math.floor(cell / cols)
  const col = cell % cols
  return [
    [row - 1, col], [row + 1, col], [row, col - 1], [row, col + 1],
  ].filter(([r, c]) => r >= 0 && r < rows && c >= 0 && c < cols).map(([r, c]) => r * cols + c)
}

export function adjacencyOf(constellation: Constellation): number[][] {
  const incidence = constellation.stars.map(() => [] as number[])
  constellation.edges.forEach((edge, index) => {
    const left = constellation.stars.indexOf(edge.a)
    const right = constellation.stars.indexOf(edge.b)
    if (left < 0 || right < 0) return
    incidence[left].push(index)
    incidence[right].push(index)
  })
  return incidence
}

export function clueIndexes(constellation: Constellation, solution: readonly number[]): number[] {
  const clues = constellation.stars.map(() => 0)
  for (const edge of solution) {
    clues[constellation.stars.indexOf(constellation.edges[edge].a)] += 1
    clues[constellation.stars.indexOf(constellation.edges[edge].b)] += 1
  }
  return clues
}

export function degreesFor(constellation: Constellation, placed: readonly number[]): number[] {
  const degrees = constellation.stars.map(() => 0)
  for (const edge of placed) {
    degrees[constellation.stars.indexOf(constellation.edges[edge].a)] += 1
    degrees[constellation.stars.indexOf(constellation.edges[edge].b)] += 1
  }
  return degrees
}

export function isSolved(clues: readonly number[], degrees: readonly number[]): boolean {
  return clues.every((clue, slot) => clue === degrees[slot])
}

export function canLink(constellation: Constellation, clues: readonly number[], degrees: readonly number[], from: number, to: number): boolean {
  const slotA = constellation.stars.indexOf(from)
  const slotB = constellation.stars.indexOf(to)
  if (slotA < 0 || slotB < 0) return false
  return neighborsOf(from, constellation.cols, constellation.rows).includes(to) && degrees[slotA] < clues[slotA] && degrees[slotB] < clues[slotB]
}

interface SearchFrame {
  readonly incidence: number[][]
  readonly pairs: readonly [number, number][]
  readonly clues: readonly number[]
  readonly values: number[]
  readonly degrees: number[]
  count: number
}

function propagate(frame: SearchFrame, seeds: readonly number[], forced: number[]): boolean {
  const queue = [...seeds]
  while (queue.length) {
    const slot = queue.pop() as number
    const need = frame.clues[slot] - frame.degrees[slot]
    const open = frame.incidence[slot].filter((edge) => frame.values[edge] === -1)
    if (need < 0 || need > open.length) return false
    if (need !== 0 && need !== open.length) continue
    for (const edge of open) {
      const [a, b] = frame.pairs[edge]
      frame.values[edge] = need === 0 ? 0 : 1
      forced.push(edge)
      if (need > 0) {
        frame.degrees[a] += 1
        frame.degrees[b] += 1
      }
      queue.push(a)
      queue.push(b)
    }
  }
  return true
}

function search(frame: SearchFrame, forced: number[], limit: number) {
  if (frame.count >= limit) return
  const total = frame.pairs.length
  let pick = -1
  for (let slot = 0; slot < frame.clues.length; slot += 1) {
    if (frame.clues[slot] === frame.degrees[slot]) continue
    const open = frame.incidence[slot].filter((edge) => frame.values[edge] === -1)
    if (open.length && (pick < 0 || open.length < frame.incidence[frame.pairs[pick][0]].length)) {
      pick = open[0]
      if (open.length === 1) break
    }
  }
  if (pick < 0) {
    for (let edge = 0; edge < total; edge += 1) if (frame.values[edge] === -1) return
    frame.count += 1
    return
  }
  for (const value of [1, 0]) {
    const mark = forced.length
    const snapshot = [...frame.degrees]
    const [a, b] = frame.pairs[pick]
    frame.values[pick] = value
    frame.degrees[a] += value
    frame.degrees[b] += value
    if (propagate(frame, [a, b], forced)) search(frame, forced, limit)
    frame.values[pick] = -1
    for (let slot = 0; slot < frame.degrees.length; slot += 1) frame.degrees[slot] = snapshot[slot]
    while (forced.length > mark) frame.values[forced.pop() as number] = -1
    if (frame.count >= limit) return
  }
}

export function countSolutions(constellation: Constellation, clues: readonly number[], limit = 2): number {
  const index = new Map(constellation.stars.map((cell, slot) => [cell, slot]))
  const pairs = constellation.edges.map((edge) => [index.get(edge.a) as number, index.get(edge.b) as number] as [number, number])
  const incidence = constellation.stars.map(() => [] as number[])
  pairs.forEach(([a, b], edge) => {
    incidence[a].push(edge)
    incidence[b].push(edge)
  })
  const frame: SearchFrame = { incidence, pairs, clues, values: pairs.map(() => -1), degrees: constellation.stars.map(() => 0), count: 0 }
  const forced: number[] = []
  if (!propagate(frame, constellation.stars.map((_, slot) => slot), forced)) return 0
  search(frame, forced, limit)
  return frame.count
}

export const SCORE_CAP = 5000
export const SCORE_FLOOR = 100
export const SCORE_BASE = 1000
export const PENALTY_PER_LINK = 12
export const PENALTY_PER_MISTAKE = 25
export const FAIL_PENALTY = 250

export function scoreFor(placed: number, mistakes: number, par: number): number {
  const churn = Math.max(0, placed - par) * PENALTY_PER_LINK
  return Math.min(SCORE_CAP, Math.max(SCORE_FLOOR, SCORE_BASE - churn - mistakes * PENALTY_PER_MISTAKE))
}

export function failedScore(placed: number, mistakes: number, par: number): number {
  return Math.max(0, scoreFor(placed, mistakes, par) - FAIL_PENALTY)
}
