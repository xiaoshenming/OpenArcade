import { mulberry32, pick, seedFor, shuffle } from '../../platform/rng'
import { hierholzerRoute, isConnected, oddVertices } from './logic'

export type StrokeMode = 'firstpath' | 'wider' | 'budget' | 'oath' | 'gauntlet'

/** 单向边：edge 只能按 from→to 方向通过（构造解天然顺向） */
export interface OneWayEdge {
  readonly edge: number
  readonly from: number
  readonly to: number
}

export interface StrokeLevel {
  readonly level: number
  readonly chapter: number
  readonly mode: StrokeMode
  readonly size: number
  readonly edges: readonly (readonly [number, number])[]
  readonly start: number
  readonly par: number
  readonly budget: number
  /** 契约边序列：必须按此顺序经过（构造解按序含全部契约边） */
  readonly oathEdges: readonly number[]
  /** 单向边标注：第二章变体，逆箭头踏上一条即违约 */
  readonly oneWay: readonly OneWayEdge[]
  readonly title: string
  readonly detail: string
}

export const STROKE_LEVEL_COUNT = 60
const EDGE_KEY = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`)
const CHAPTER_COPY: readonly (readonly [string, string])[] = [
  ['初执笔', '三点九线的小点阵，从起点一笔走遍每条边'],
  ['展网格', '四四方方的点阵更密，单向边只许顺着箭头走'],
  ['步数预算', '点阵扩到五见方，落笔次数超出预算即失败'],
  ['契约锁边', '金契边按标号顺序经过，乱序踏上即违约'],
  ['终局·万线归一', '六见方点阵叠加按序契约与紧预算，一笔定乾坤'],
] as const

export function strokeChapter(level: number): number {
  const safe = Math.min(STROKE_LEVEL_COUNT, Math.max(1, Math.floor(level)))
  return safe <= 11 ? 1 : safe <= 22 ? 2 : safe <= 33 ? 3 : safe <= 44 ? 4 : 5
}

function targetEdges(safe: number, chapter: number): number {
  if (chapter === 1) return 8 + Math.min(2, Math.floor((safe - 1) / 4))
  if (chapter === 2) return 15 + Math.min(6, Math.floor((safe - 12) / 2))
  if (chapter === 3) return 24 + Math.min(8, Math.floor((safe - 23) / 1.4))
  if (chapter === 4) return 26 + Math.min(9, Math.floor((safe - 34) / 1.2))
  return 35 + Math.min(11, Math.floor((safe - 45) / 1.4))
}

function budgetSlack(chapter: number): number {
  return chapter === 1 ? 12 : chapter === 2 ? 8 : chapter === 3 ? 3 : chapter === 4 ? 2 : 1
}

function lockCount(safe: number, chapter: number): number {
  if (chapter === 4) return 2 + Math.min(2, Math.floor((safe - 34) / 4))
  if (chapter === 5) return 3 + Math.min(3, Math.floor((safe - 45) / 5))
  return 0
}

export function gridEdges(size: number): (readonly [number, number])[] {
  const edges: (readonly [number, number])[] = []
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      const id = row * size + col
      if (col + 1 < size) edges.push([id, id + 1] as const)
      if (row + 1 < size) edges.push([id, id + size] as const)
    }
  }
  return edges
}

function neighbors(size: number, vertex: number): number[] {
  const row = Math.floor(vertex / size)
  const col = vertex % size
  const list: number[] = []
  if (col > 0) list.push(vertex - 1)
  if (col + 1 < size) list.push(vertex + 1)
  if (row > 0) list.push(vertex - size)
  if (row + 1 < size) list.push(vertex + size)
  return list
}

function parityDelta(odds: readonly number[], a: number, b: number): number {
  return (odds.includes(a) ? -1 : 1) + (odds.includes(b) ? -1 : 1)
}

function shortestPath(size: number, from: number, to: number, present: Set<string>): number[] | null {
  const corners = new Set<number>([0, size - 1, size * (size - 1), size * size - 1])
  const prev = new Map<number, number>([[from, -1]])
  const queue = [from]
  while (queue.length) {
    const vertex = queue.shift() as number
    if (vertex === to) break
    for (const next of neighbors(size, vertex)) {
      if (prev.has(next) || !present.has(EDGE_KEY(vertex, next)) || (next !== to && corners.has(next))) continue
      prev.set(next, vertex)
      queue.push(next)
    }
  }
  if (!prev.has(to)) return null
  const path: number[] = []
  let cursor = to
  while (cursor !== from) { path.unshift(cursor); cursor = prev.get(cursor) as number }
  return [from, ...path]
}

function carveEulerGraph(size: number, random: () => number, target: number, vertexCount: number): (readonly [number, number])[] {
  const edges = [...gridEdges(size)]
  const present = new Set(edges.map(([a, b]) => EDGE_KEY(a, b)))
  const removeEdge = (a: number, b: number) => {
    const key = EDGE_KEY(a, b)
    present.delete(key)
    edges.splice(edges.findIndex(([x, y]) => EDGE_KEY(x, y) === key), 1)
  }
  const addEdge = (a: number, b: number) => {
    edges.push([Math.min(a, b), Math.max(a, b)] as const)
    present.add(EDGE_KEY(a, b))
  }
  const removableSafely = (a: number, b: number) => isConnected(vertexCount, edges.filter(([x, y]) => EDGE_KEY(x, y) !== EDGE_KEY(a, b)))
  const paired = shuffle(random, oddVertices(vertexCount, edges))
  for (let index = 0; index + 1 < paired.length; index += 2) {
    const path = shortestPath(size, paired[index], paired[index + 1], present)
    if (!path) continue
    const removed: (readonly [number, number])[] = []
    for (let step = 0; step + 1 < path.length; step += 1) {
      removeEdge(path[step], path[step + 1])
      removed.push([path[step], path[step + 1]] as const)
    }
    if (!isConnected(vertexCount, edges)) for (const [a, b] of removed.reverse()) addEdge(a, b)
  }
  let odds = oddVertices(vertexCount, edges)
  let guard = 0
  while (edges.length > target && guard < 200) {
    guard += 1
    const candidates = shuffle(random, edges).filter(([a, b]) => {
      const delta = parityDelta(odds, a, b)
      return delta <= 0 && (odds.length > 2 || odds.length + delta <= 2)
    })
    const chosen = candidates.find(([a, b]) => removableSafely(a, b))
    if (!chosen) break
    removeEdge(chosen[0], chosen[1])
    odds = oddVertices(vertexCount, edges)
  }
  for (const [a, b] of shuffle(random, gridEdges(size))) {
    if (edges.length >= target) break
    if (present.has(EDGE_KEY(a, b)) || odds.length + parityDelta(odds, a, b) > 2) continue
    addEdge(a, b)
    odds = oddVertices(vertexCount, edges)
  }
  guard = 0
  while (odds.length > 2 && guard < 400) {
    guard += 1
    const presentPair = shuffle(random, edges).find(([a, b]) => odds.includes(a) && odds.includes(b) && removableSafely(a, b))
    if (presentPair) {
      removeEdge(presentPair[0], presentPair[1])
      odds = oddVertices(vertexCount, edges)
      continue
    }
    const absentPair = shuffle(random, gridEdges(size)).find(([a, b]) => !present.has(EDGE_KEY(a, b)) && odds.includes(a) && odds.includes(b))
    if (absentPair) {
      addEdge(absentPair[0], absentPair[1])
      odds = oddVertices(vertexCount, edges)
      continue
    }
    const moverAdd = shuffle(random, gridEdges(size)).find(([a, b]) => !present.has(EDGE_KEY(a, b)) && parityDelta(odds, a, b) === 0)
    if (moverAdd) {
      addEdge(moverAdd[0], moverAdd[1])
      odds = oddVertices(vertexCount, edges)
      continue
    }
    const moverRemove = shuffle(random, edges).find(([a, b]) => parityDelta(odds, a, b) === 0 && removableSafely(a, b))
    if (!moverRemove) break
    removeEdge(moverRemove[0], moverRemove[1])
    odds = oddVertices(vertexCount, edges)
  }
  for (const [a, b] of shuffle(random, gridEdges(size))) {
    if (edges.length >= target) break
    if (present.has(EDGE_KEY(a, b)) || odds.length + parityDelta(odds, a, b) > 2) continue
    addEdge(a, b)
    odds = oddVertices(vertexCount, edges)
  }
  return edges
}

export function getStrokeLevel(level: number): StrokeLevel {
  const safe = Math.min(STROKE_LEVEL_COUNT, Math.max(1, Math.floor(level)))
  const chapter = strokeChapter(safe)
  const size = chapter === 1 ? 3 : chapter === 2 ? 4 : chapter === 5 ? 6 : 5
  const mode: StrokeMode = chapter === 1 ? 'firstpath' : chapter === 2 ? 'wider' : chapter === 3 ? 'budget' : chapter === 4 ? 'oath' : 'gauntlet'
  const random = mulberry32(seedFor(safe, 23))
  const vertexCount = size * size
  const edges = carveEulerGraph(size, random, targetEdges(safe, chapter), vertexCount)
  const odds = oddVertices(vertexCount, edges)
  const start = odds.length > 0 ? pick(random, odds) : Math.floor(random() * vertexCount) % vertexCount
  // 契约边取自一条真实欧拉路并保持其在路上的先后次序，构造解天然按序经过全部契约边。
  const route = hierholzerRoute(vertexCount, edges, start)
  const oathCount = lockCount(safe, chapter)
  const oathEdges = route && oathCount > 0
    ? shuffle(random, route.map((_, position) => position)).slice(0, oathCount).sort((a, b) => a - b).map((position) => route[position])
    : []
  // 单向边标注：从构造欧拉路取边并沿其被经过的方向立箭头，构造解天然全部顺向。
  const oneWayCount = chapter === 2 ? 3 + Math.min(2, Math.floor((safe - 12) / 4)) : 0
  let oneWay: OneWayEdge[] = []
  if (route && oneWayCount > 0) {
    let at = start
    const directions = route.map((edge) => {
      const [a, b] = edges[edge]
      const to = a === at ? b : a
      const directed = { edge, from: at, to }
      at = to
      return directed
    })
    oneWay = shuffle(random, directions.map((_, position) => position))
      .slice(0, Math.min(oneWayCount, directions.length))
      .sort((a, b) => a - b)
      .map((position) => directions[position])
  }
  const [title, detail] = CHAPTER_COPY[chapter - 1]
  return {
    level: safe, chapter, mode, size, edges, start,
    par: edges.length,
    budget: edges.length + budgetSlack(chapter),
    oathEdges,
    oneWay,
    title: safe === STROKE_LEVEL_COUNT ? '终局·一笔千线' : title,
    detail,
  }
}
