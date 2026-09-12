import type { StrokeLevel } from './levels'

export const MAX_LIVES = 3
export const SCORE_CAP = 5000

export type StrokePhase = 'route' | 'complete' | 'failed'
export type StrokeFault = 'idle' | 'not-adjacent' | 'repeat-edge' | 'oath' | 'one-way' | 'no-lives' | 'budget' | 'ok'

export interface StrokeState {
  readonly phase: StrokePhase
  readonly at: number
  readonly walked: readonly number[]
  readonly taps: number
  readonly lives: number
  readonly mistakes: number
  readonly score: number
}

export interface StrokeJudgement {
  readonly state: StrokeState
  readonly valid: boolean
  readonly completed: boolean
  readonly failed: boolean
  readonly reason: StrokeFault
}

export function initialStrokeState(level: StrokeLevel): StrokeState {
  return { phase: 'route', at: level.start, walked: [], taps: 0, lives: MAX_LIVES, mistakes: 0, score: 0 }
}

export function oddVertices(vertexCount: number, edges: readonly (readonly [number, number])[]): number[] {
  const degree = new Array<number>(vertexCount).fill(0)
  edges.forEach(([a, b]) => { degree[a] += 1; degree[b] += 1 })
  return degree.reduce<number[]>((list, value, index) => (value % 2 === 1 ? [...list, index] : list), [])
}

export interface AdjacentEdge {
  readonly to: number
  readonly edge: number
}

export function buildAdjacency(vertexCount: number, edges: readonly (readonly [number, number])[]): AdjacentEdge[][] {
  const adjacency: AdjacentEdge[][] = Array.from({ length: vertexCount }, () => [])
  edges.forEach(([a, b], index) => {
    adjacency[a].push({ to: b, edge: index })
    adjacency[b].push({ to: a, edge: index })
  })
  return adjacency
}

export function edgeBetween(edges: readonly (readonly [number, number])[], from: number, to: number): number {
  return edges.findIndex(([a, b]) => (a === from && b === to) || (a === to && b === from))
}

export function isConnected(vertexCount: number, edges: readonly (readonly [number, number])[]): boolean {
  if (vertexCount <= 1) return true
  if (!edges.length) return false
  const adjacency = buildAdjacency(vertexCount, edges)
  const seen = new Set<number>([edges[0][0]])
  const queue = [edges[0][0]]
  while (queue.length) {
    const vertex = queue.shift() as number
    for (const { to } of adjacency[vertex]) if (!seen.has(to)) { seen.add(to); queue.push(to) }
  }
  return seen.size === vertexCount
}

export function hasEulerRoute(vertexCount: number, edges: readonly (readonly [number, number])[], start: number): boolean {
  if (!isConnected(vertexCount, edges)) return false
  const odds = oddVertices(vertexCount, edges)
  return odds.length <= 2 && (odds.length === 0 || odds.includes(start))
}

export function hierholzerRoute(vertexCount: number, edges: readonly (readonly [number, number])[], start: number): number[] | null {
  if (!hasEulerRoute(vertexCount, edges, start)) return null
  const adjacency = buildAdjacency(vertexCount, edges)
  const used = new Array<boolean>(edges.length).fill(false)
  const route: number[] = []
  const stack: { vertex: number; via: number }[] = [{ vertex: start, via: -1 }]
  while (stack.length) {
    const top = stack[stack.length - 1]
    const candidate = adjacency[top.vertex].find(({ edge }) => !used[edge])
    if (candidate) {
      used[candidate.edge] = true
      stack.push({ vertex: candidate.to, via: candidate.edge })
    } else {
      stack.pop()
      if (top.via >= 0) route.push(top.via)
    }
  }
  route.reverse()
  return route.length === edges.length ? route : null
}

export function strokeScore(level: StrokeLevel, mistakes: number): number {
  return Math.min(SCORE_CAP, Math.max(100, 1200 + level.par * 20 + level.chapter * 150 - mistakes * 180))
}

// 契约边必须按给定顺序经过：progress 是已按序完成的契约边数量。
export function oathProgress(walked: readonly number[], oathEdges: readonly number[]): number {
  let progress = 0
  while (progress < oathEdges.length && walked.includes(oathEdges[progress])) progress += 1
  return progress
}

export function oathKept(walked: readonly number[], oathEdges: readonly number[]): boolean {
  return oathProgress(walked, oathEdges) === oathEdges.length
}

function overBudget(level: StrokeLevel, taps: number, walked: number): boolean {
  return taps + level.par - walked > level.budget
}

export function judgeMove(level: StrokeLevel, state: StrokeState, target: number): StrokeJudgement {
  if (state.phase !== 'route' || target === state.at || target < 0 || target >= level.size * level.size) {
    return { state, valid: false, completed: false, failed: false, reason: 'idle' }
  }
  const edge = edgeBetween(level.edges, state.at, target)
  const nextOath = level.oathEdges[oathProgress(state.walked, level.oathEdges)]
  const oathBroken = edge >= 0 && !state.walked.includes(edge) && level.oathEdges.includes(edge) && edge !== nextOath
  const way = edge >= 0 ? level.oneWay.find((item) => item.edge === edge) : undefined
  const oneWayBroken = way !== undefined && (way.from !== state.at || way.to !== target)
  if (edge < 0 || state.walked.includes(edge) || oathBroken || oneWayBroken) {
    const lives = state.lives - 1
    const mistakes = state.mistakes + 1
    const taps = state.taps + 1
    const reason: StrokeFault = oathBroken ? 'oath' : edge < 0 ? 'not-adjacent' : oneWayBroken ? 'one-way' : 'repeat-edge'
    if (lives <= 0) {
      return { state: { ...state, phase: 'failed', lives: 0, mistakes, taps }, valid: false, completed: false, failed: true, reason: 'no-lives' }
    }
    if (overBudget(level, taps, state.walked.length)) {
      return { state: { ...state, phase: 'failed', lives, mistakes, taps }, valid: false, completed: false, failed: true, reason: 'budget' }
    }
    return {
      state: { ...state, lives, mistakes, taps },
      valid: false, completed: false, failed: false, reason,
    }
  }
  const walked = [...state.walked, edge]
  const taps = state.taps + 1
  const score = strokeScore(level, state.mistakes)
  if (overBudget(level, taps, walked.length)) {
    return { state: { ...state, phase: 'failed', at: target, walked, taps, score }, valid: true, completed: false, failed: true, reason: 'budget' }
  }
  const completed = walked.length === level.edges.length && oathKept(walked, level.oathEdges)
  return {
    state: { ...state, phase: completed ? 'complete' : 'route', at: target, walked, taps, score },
    valid: true, completed, failed: false, reason: 'ok',
  }
}
