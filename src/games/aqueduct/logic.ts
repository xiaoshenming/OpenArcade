import { mulberry32, seedFor, shuffle } from '../../platform/rng'
import { AQUA_LEVEL_COUNT, getAquaLevel, type AquaLevel } from './levels'

export const DIR_DELTAS: readonly (readonly [number, number])[] = [[-1, 0], [0, 1], [1, 0], [0, -1]]

export interface AquaPuzzle {
  readonly rows: number
  readonly cols: number
  readonly sources: readonly number[]
  readonly base: readonly number[]
  readonly turns0: readonly number[]
  readonly locked: readonly boolean[]
  readonly depth: number
  readonly par: number
  readonly budget: number | undefined
  readonly fog: boolean
}

export function rotateMask(mask: number, turns: number) {
  let value = mask & 15
  for (let count = ((turns % 4) + 4) % 4; count > 0; count -= 1) value = ((value << 1) | (value >>> 3)) & 15
  return value
}

export function minClicks(base: number, turns: number) {
  const start = rotateMask(base, turns)
  for (let clicks = 0; clicks < 4; clicks += 1) if (rotateMask(start, clicks) === base) return clicks
  return 0
}

export function pipeDegree(mask: number) {
  return [0, 1, 2, 3].reduce((sum, dir) => sum + ((mask >> dir) & 1), 0)
}

export interface FlowState {
  readonly wet: readonly boolean[]
  readonly leaks: readonly boolean[]
  readonly leakDirs: readonly number[]
  readonly solved: boolean
  readonly filled: number
}

export function computeFlow(rows: number, cols: number, masks: readonly number[], sources: readonly number[]): FlowState {
  const total = rows * cols
  const wet = Array.from({ length: total }, () => false)
  const leaks = Array.from({ length: total }, () => false)
  const leakDirs = Array.from({ length: total }, () => 0)
  for (let cell = 0; cell < total; cell += 1) {
    const row = Math.floor(cell / cols)
    const col = cell % cols
    for (let dir = 0; dir < 4; dir += 1) {
      if (((masks[cell] >> dir) & 1) === 0) continue
      const nr = row + DIR_DELTAS[dir][0]
      const nc = col + DIR_DELTAS[dir][1]
      const back = (dir + 2) % 4
      if (nr < 0 || nr >= rows || nc < 0 || nc >= cols || ((masks[nr * cols + nc] >> back) & 1) === 0) {
        leaks[cell] = true
        leakDirs[cell] |= 1 << dir
      }
    }
  }
  const queue: number[] = []
  for (const source of sources) if (source >= 0 && source < total && !wet[source]) { wet[source] = true; queue.push(source) }
  for (let head = 0; head < queue.length; head += 1) {
    const cell = queue[head]
    const row = Math.floor(cell / cols)
    const col = cell % cols
    for (let dir = 0; dir < 4; dir += 1) {
      if (((masks[cell] >> dir) & 1) === 0) continue
      const nr = row + DIR_DELTAS[dir][0]
      const nc = col + DIR_DELTAS[dir][1]
      if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue
      const next = nr * cols + nc
      if (!wet[next] && ((masks[next] >> ((dir + 2) % 4)) & 1) !== 0) { wet[next] = true; queue.push(next) }
    }
  }
  const filled = wet.reduce((sum, isWet) => sum + (isWet ? 1 : 0), 0)
  return { wet, leaks, leakDirs, solved: filled === total && leaks.every((leak) => !leak), filled }
}

interface TreeEdge { readonly cell: number; readonly neighbor: number; readonly dir: number }

function growForest(rng: () => number, rows: number, cols: number, roots: readonly number[]) {
  const total = rows * cols
  const owner = Array.from({ length: total }, () => -1)
  const frontiers = roots.map(() => [] as number[])
  const queued = roots.map(() => Array.from({ length: total }, () => false))
  const edges = roots.map(() => [] as TreeEdge[])
  const enqueue = (tag: number, cell: number) => {
    const row = Math.floor(cell / cols)
    const col = cell % cols
    for (let dir = 0; dir < 4; dir += 1) {
      const nr = row + DIR_DELTAS[dir][0]
      const nc = col + DIR_DELTAS[dir][1]
      if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue
      const next = nr * cols + nc
      if (owner[next] !== -1 || queued[tag][next]) continue
      queued[tag][next] = true
      frontiers[tag].push(next)
    }
  }
  let claimed = 0
  roots.forEach((root, tag) => { owner[root] = tag; claimed += 1; enqueue(tag, root) })
  let guard = total * 8 + 16
  while (claimed < total && guard > 0) {
    guard -= 1
    for (let tag = 0; tag < roots.length && claimed < total; tag += 1) {
      let cell = -1
      while (frontiers[tag].length > 0) {
        const pick = Math.floor(rng() * frontiers[tag].length)
        cell = frontiers[tag][pick]
        frontiers[tag][pick] = frontiers[tag][frontiers[tag].length - 1]
        frontiers[tag].pop()
        if (owner[cell] === -1) break
        cell = -1
      }
      if (cell === -1) continue
      const row = Math.floor(cell / cols)
      const col = cell % cols
      const options: number[] = []
      for (let dir = 0; dir < 4; dir += 1) {
        const nr = row + DIR_DELTAS[dir][0]
        const nc = col + DIR_DELTAS[dir][1]
        if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && owner[nr * cols + nc] === tag) options.push(dir)
      }
      if (options.length === 0) continue
      const dir = options[Math.floor(rng() * options.length)]
      const neighbor = (row + DIR_DELTAS[dir][0]) * cols + (col + DIR_DELTAS[dir][1])
      owner[cell] = tag
      claimed += 1
      edges[tag].push({ cell, neighbor, dir })
      enqueue(tag, cell)
    }
  }
  return edges
}

function masksFromEdges(groups: readonly TreeEdge[][], total: number) {
  const masks = Array.from({ length: total }, () => 0)
  for (const group of groups) {
    for (const edge of group) {
      masks[edge.cell] |= 1 << edge.dir
      masks[edge.neighbor] |= 1 << ((edge.dir + 2) % 4)
    }
  }
  return masks
}

function pickSources(rng: () => number, rows: number, cols: number, dual: boolean) {
  const total = rows * cols
  if (!dual) return [Math.floor(rng() * total)]
  let first = 0
  let second = 0
  let best = -1
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const a = Math.floor(rng() * total)
    const b = Math.floor(rng() * total)
    const distance = Math.abs(Math.floor(a / cols) - Math.floor(b / cols)) + Math.abs((a % cols) - (b % cols))
    if (a !== b && distance > best) { best = distance; first = a; second = b }
  }
  if (first === second) second = (first + Math.floor(total / 2)) % total
  return [first, second]
}

export function generateAquaPuzzle(level: number): AquaPuzzle {
  const safe = Math.min(AQUA_LEVEL_COUNT, Math.max(1, Math.floor(level)))
  const spec: AquaLevel = getAquaLevel(safe)
  const rows = spec.rows
  const cols = spec.cols
  const total = rows * cols
  const rng = mulberry32(seedFor(safe, 17))
  const sources = pickSources(rng, rows, cols, spec.dual)
  const base = masksFromEdges(growForest(rng, rows, cols, sources), total)
  const order = shuffle(rng, Array.from({ length: total }, (_, index) => index))
  const lockSet = new Set(spec.locks ? order.slice(0, Math.round(total * spec.lockRatio)) : [])
  const locked = Array.from({ length: total }, (_, index) => lockSet.has(index))
  let turns0: number[] = Array.from({ length: total }, () => 0)
  let startSolved = true
  let depth = 0
  let attempt = 0
  while ((startSolved || depth < 4) && attempt < 10) {
    attempt += 1
    turns0 = base.map(() => (rng() < spec.chaos ? Math.floor(rng() * 4) : 0))
    for (const cell of lockSet) turns0[cell] = 0
    const startMasks = base.map((mask, index) => rotateMask(mask, turns0[index]))
    startSolved = computeFlow(rows, cols, startMasks, sources).solved
    depth = base.reduce((sum, mask, index) => sum + (locked[index] ? 0 : minClicks(mask, turns0[index])), 0)
  }
  const par = Math.max(1, Math.round(depth * 0.8))
  const budget = spec.budgeted ? Math.max(par + Math.max(3, Math.round(par * spec.slackRate)), depth + 2) : undefined
  return { rows, cols, sources, base, turns0, locked, depth, par, budget, fog: spec.fog }
}
