import { mulberry32, shuffle } from '../../platform/rng'

export const VINE_COLORS = ['#4ade80', '#2fd6b8', '#ffc94d', '#7aa2ff', '#f18f4c', '#ff6b8f', '#c084fc', '#9db2d8'] as const

export interface VinePair { a: number; b: number; color: number }
export interface VinePuzzle { pairs: VinePair[]; paths: number[][] }
export interface VineVerdict { connected: boolean[]; filled: number; solved: boolean }
export interface VineStep { paths: number[][]; placed: boolean; paired: boolean }

export function areAdjacent(a: number, b: number, cols: number) {
  if (a === b || a < 0 || b < 0) return false
  return Math.abs(Math.floor(a / cols) - Math.floor(b / cols)) + Math.abs((a % cols) - (b % cols)) === 1
}

export function vineNeighbors(cell: number, rows: number, cols: number) {
  const row = Math.floor(cell / cols)
  const col = cell % cols
  const out: number[] = []
  if (row > 0) out.push(cell - cols)
  if (col > 0) out.push(cell - 1)
  if (col < cols - 1) out.push(cell + 1)
  if (row < rows - 1) out.push(cell + cols)
  return out
}

function serpentine(rows: number, cols: number) {
  const trail: number[] = []
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) trail.push(row * cols + (row % 2 ? cols - 1 - col : col))
  }
  return trail
}

function growSpine(rows: number, cols: number, rng: () => number): number[] | null {
  const total = rows * cols
  const visited = new Array<boolean>(total).fill(false)
  const trail = [Math.floor(rng() * total)]
  visited[trail[0]] = true
  const freedom = (cell: number) => vineNeighbors(cell, rows, cols).reduce((sum, next) => sum + (visited[next] ? 0 : 1), 0)
  while (trail.length < total) {
    const options = vineNeighbors(trail[trail.length - 1], rows, cols).filter((next) => !visited[next])
    if (!options.length) return null
    let next: number
    if (rng() < 0.14) {
      next = options[Math.floor(rng() * options.length)]
    } else {
      const ranks = options.map((option) => freedom(option))
      const best = Math.min(...ranks)
      const pool = options.filter((_, index) => ranks[index] === best)
      next = pool[Math.floor(rng() * pool.length)]
    }
    visited[next] = true
    trail.push(next)
  }
  return trail
}

function sampleCuts(total: number, parts: number, rng: () => number) {
  if (parts < 2) return []
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const cuts: number[] = []
    while (cuts.length < parts - 1) {
      const cut = 3 + Math.floor(rng() * (total - 5))
      if (!cuts.includes(cut)) cuts.push(cut)
    }
    cuts.sort((a, b) => a - b)
    const edges = [0, ...cuts, total]
    if (edges.every((edge, index) => index === 0 || edge - edges[index - 1] >= 3)) return cuts
  }
  const base = Math.floor(total / parts)
  return Array.from({ length: parts - 1 }, (_, index) => (index + 1) * base)
}

export function buildVinePuzzle(rows: number, cols: number, pairCount: number, seed: number): VinePuzzle {
  const rng = mulberry32(seed)
  const total = rows * cols
  let spine: number[] | null = null
  for (let attempt = 0; attempt < 48 && !spine; attempt += 1) spine = growSpine(rows, cols, rng)
  const trail = spine ?? serpentine(rows, cols)
  const edges = [0, ...sampleCuts(total, pairCount, rng), total]
  const palette = shuffle(rng, VINE_COLORS.map((_, index) => index))
  const pairs: VinePair[] = []
  const paths: number[][] = []
  for (let index = 0; index < pairCount; index += 1) {
    const segment = trail.slice(edges[index], edges[index + 1])
    paths.push(segment)
    pairs.push({ a: segment[0], b: segment[segment.length - 1], color: palette[index % palette.length] })
  }
  return { pairs, paths }
}

export function judgeVine(rows: number, cols: number, pairs: readonly VinePair[], paths: readonly number[][]): VineVerdict {
  const total = rows * cols
  const wellFormed = pairs.map((pair, index) => {
    const path = paths[index] ?? []
    if (pair.a === pair.b || path.length < 2 || new Set(path).size !== path.length) return false
    const forward = path[0] === pair.a && path[path.length - 1] === pair.b
    const backward = path[0] === pair.b && path[path.length - 1] === pair.a
    return (forward || backward) && path.every((cell, step) => cell >= 0 && cell < total && (step === 0 || areAdjacent(path[step - 1], cell, cols)))
  })
  const owner = new Int16Array(total).fill(-1)
  const clash = new Set<number>()
  for (let index = 0; index < pairs.length; index += 1) {
    if (!wellFormed[index]) continue
    for (const cell of paths[index]) {
      if (owner[cell] >= 0) {
        clash.add(owner[cell])
        clash.add(index)
      } else owner[cell] = index
    }
  }
  const connected = wellFormed.map((ok, index) => ok && !clash.has(index))
  const filled = owner.reduce((sum, value) => sum + (value >= 0 ? 1 : 0), 0)
  return { connected, filled, solved: connected.length > 0 && connected.every(Boolean) && filled === total }
}

export function ownerOf(paths: readonly number[][], cell: number) {
  return paths.findIndex((path) => path.includes(cell))
}

export function trimPath(path: readonly number[], cell: number) {
  const at = path.indexOf(cell)
  return at < 0 ? [...path] : path.slice(0, at + 1)
}

export function tryExtend(cols: number, pairs: readonly VinePair[], paths: readonly number[][], pair: number, cell: number): VineStep {
  const idle: VineStep = { paths: paths.map((path) => [...path]), placed: false, paired: false }
  const path = paths[pair] ?? []
  const target = pairs[pair]
  const last = path[path.length - 1]
  if (!path.length || path.includes(cell) || !areAdjacent(last, cell, cols)) return idle
  if (path.length > 1 && (last === target.a || last === target.b)) return idle
  const partner = cell === target.a || cell === target.b
  if (pairs.some((item, index) => index !== pair && (item.a === cell || item.b === cell))) return idle
  if (!partner && ownerOf(paths, cell) >= 0) return idle
  return { paths: paths.map((item, index) => (index === pair ? [...path, cell] : [...item])), placed: true, paired: partner }
}
