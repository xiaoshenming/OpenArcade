import { pick } from '../../platform/rng'

export const SCORE_BASE = 1000
export const SCORE_FLOOR = 100
export const SCORE_CAP = 5000
export const WALL_PENALTY = 10
export const LIVES = 3
const SEARCH_BUDGET = 200000

export const edgeCount = (rows: number, cols: number) => rows * (cols - 1) + (rows - 1) * cols

export const verticalEdge = (row: number, col: number, cols: number) => row * (cols - 1) + col

export const horizontalEdge = (row: number, col: number, rows: number, cols: number) => rows * (cols - 1) + row * cols + col

export function neighborsOf(cell: number, rows: number, cols: number): Array<[number, number]> {
  const row = Math.floor(cell / cols)
  const col = cell % cols
  const out: Array<[number, number]> = []
  if (col + 1 < cols) out.push([cell + 1, verticalEdge(row, col, cols)])
  if (col > 0) out.push([cell - 1, verticalEdge(row, col - 1, cols)])
  if (row + 1 < rows) out.push([cell + cols, horizontalEdge(row, col, rows, cols)])
  if (row > 0) out.push([cell - cols, horizontalEdge(row - 1, col, rows, cols)])
  return out
}

export function carveMaze(rng: () => number, rows: number, cols: number): Uint8Array {
  const walls = new Uint8Array(edgeCount(rows, cols)).fill(1)
  const visited = new Uint8Array(rows * cols)
  visited[0] = 1
  const stack = [0]
  while (stack.length) {
    const current = stack[stack.length - 1]
    const options = neighborsOf(current, rows, cols).filter(([next]) => !visited[next])
    if (!options.length) {
      stack.pop()
      continue
    }
    const [next, edge] = pick(rng, options)
    walls[edge] = 0
    visited[next] = 1
    stack.push(next)
  }
  return walls
}

export const wallCount = (walls: ArrayLike<number>) => {
  let total = 0
  for (let index = 0; index < walls.length; index += 1) total += walls[index] ? 1 : 0
  return total
}

export const wallIds = (walls: ArrayLike<number>) => {
  const ids: number[] = []
  for (let index = 0; index < walls.length; index += 1) if (walls[index]) ids.push(index)
  return ids
}

function adjacency(walls: ArrayLike<number>, rows: number, cols: number) {
  const list: number[][] = Array.from({ length: rows * cols }, () => [])
  for (let cell = 0; cell < rows * cols; cell += 1) {
    for (const [next, edge] of neighborsOf(cell, rows, cols)) if (!walls[edge]) list[cell].push(next)
  }
  return list
}

function bfs(adj: readonly number[][], from: number, skip?: Uint8Array) {
  const dist = new Int16Array(adj.length).fill(-1)
  dist[from] = 0
  const queue = [from]
  for (let head = 0; head < queue.length; head += 1) {
    for (const next of adj[queue[head]]) {
      if (dist[next] >= 0 || (skip && skip[next])) continue
      dist[next] = dist[queue[head]] + 1
      queue.push(next)
    }
  }
  return dist
}

export function openDistance(walls: ArrayLike<number>, rows: number, cols: number, from: number, to: number): number {
  return bfs(adjacency(walls, rows, cols), from)[to]
}

export type PathStatus = 'blocked' | 'multiple' | 'offlength' | 'solved'

export interface PathVerdict {
  readonly status: PathStatus
  readonly paths: number
  readonly length: number
}

export function evaluatePaths(walls: ArrayLike<number>, rows: number, cols: number, start: number, goal: number, targetLen: number): PathVerdict {
  const adj = adjacency(walls, rows, cols)
  const distGoal = bfs(adj, goal)
  const visited = new Uint8Array(rows * cols)
  visited[start] = 1
  let paths = 0
  let length = 0
  let expansions = 0
  const walk = (cell: number, depth: number): boolean => {
    if (++expansions > SEARCH_BUDGET) {
      paths = 2
      return true
    }
    const options = adj[cell].filter((next) => !visited[next] && distGoal[next] >= 0).sort((a, b) => distGoal[a] - distGoal[b])
    for (const next of options) {
      if (next === goal) {
        paths += 1
        if (paths === 1) length = depth + 1
        if (length !== targetLen || paths >= 2) return true
        continue
      }
      if (bfs(adj, next, visited)[goal] < 0) continue
      visited[next] = 1
      const stop = walk(next, depth + 1)
      visited[next] = 0
      if (stop) return true
    }
    return false
  }
  walk(start, 0)
  if (!paths) return { status: 'blocked', paths: 0, length: 0 }
  if (paths >= 2) return { status: 'multiple', paths: 2, length }
  return { status: length === targetLen ? 'solved' : 'offlength', paths: 1, length }
}

export function scoreFor(walls: number, par: number): number {
  return Math.min(SCORE_CAP, Math.max(SCORE_FLOOR, SCORE_BASE - Math.max(0, walls - par) * WALL_PENALTY))
}
