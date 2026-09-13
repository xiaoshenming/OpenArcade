export interface Point { x: number; y: number }
export type Dir = 'up' | 'down' | 'left' | 'right'
export type EchoEvent = 'pulse' | 'move' | 'bump' | 'relocate' | 'win'
export type EchoStatus = 'running' | 'completed'
export const DIRS: Record<Dir, Point> = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } }
export const WALL_BIT: Record<Dir, number> = { up: 1, right: 2, down: 4, left: 8 }
export const OPPOSITE: Record<Dir, Dir> = { up: 'down', down: 'up', left: 'right', right: 'left' }
export const SCORE_BASE = 1000
export const PULSE_COST = 80
export const STEP_COST = 5
export const SCORE_FLOOR = 100
export const SCORE_CAP = 5000
export const RELOCATE_EVERY = 30
export const GLIMMER_MS = 2000
export const RELOCATE_MIN_DIST = 6
export const cellKey = (x: number, y: number) => `${x}:${y}`

export function nextRandom(seed: number): [number, number] {
  const state = (seed + 0x6d2b79f5) >>> 0
  let value = state
  value = Math.imul(value ^ (value >>> 15), value | 1)
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
  return [((value ^ (value >>> 14)) >>> 0) / 4294967296, state]
}

export function carvePerfectMaze(cols: number, rows: number, random: () => number): number[] {
  const walls = new Array<number>(cols * rows).fill(15)
  const visited = new Array<boolean>(cols * rows).fill(false)
  const stack = [0]
  visited[0] = true
  while (stack.length) {
    const index = stack[stack.length - 1] as number
    const x = index % cols
    const y = Math.floor(index / cols)
    const options: { dir: Dir; next: number }[] = []
    for (const dir of Object.keys(DIRS) as Dir[]) {
      const nx = x + DIRS[dir].x
      const ny = y + DIRS[dir].y
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue
      const next = ny * cols + nx
      if (visited[next]) continue
      options.push({ dir, next })
    }
    if (!options.length) {
      stack.pop()
      continue
    }
    const chosen = options[Math.floor(random() * options.length) % options.length] as { dir: Dir; next: number }
    walls[index] &= ~WALL_BIT[chosen.dir]
    walls[chosen.next] &= ~WALL_BIT[OPPOSITE[chosen.dir]]
    visited[chosen.next] = true
    stack.push(chosen.next)
  }
  return walls
}

export function openLoops(walls: number[], cols: number, rows: number, count: number, random: () => number): void {
  let opened = 0
  let guard = 0
  while (opened < count && guard < count * 24 + 64) {
    guard += 1
    const index = Math.floor(random() * walls.length) % walls.length
    const x = index % cols
    const y = Math.floor(index / cols)
    const dir = (Object.keys(DIRS) as Dir[])[Math.floor(random() * 4) % 4] as Dir
    const nx = x + DIRS[dir].x
    const ny = y + DIRS[dir].y
    if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue
    const next = ny * cols + nx
    if (!(walls[index] & WALL_BIT[dir])) continue
    walls[index] &= ~WALL_BIT[dir]
    walls[next] &= ~WALL_BIT[OPPOSITE[dir]]
    opened += 1
  }
}

export function bfsDistances(cols: number, rows: number, walls: number[], from: Point): number[] {
  const dist = new Array<number>(cols * rows).fill(-1)
  const origin = from.y * cols + from.x
  dist[origin] = 0
  const queue = [origin]
  for (let head = 0; head < queue.length; head += 1) {
    const index = queue[head] as number
    const x = index % cols
    const y = Math.floor(index / cols)
    for (const dir of Object.keys(DIRS) as Dir[]) {
      if (walls[index] & WALL_BIT[dir]) continue
      const nx = x + DIRS[dir].x
      const ny = y + DIRS[dir].y
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue
      const next = ny * cols + nx
      if (dist[next] >= 0) continue
      dist[next] = (dist[index] as number) + 1
      queue.push(next)
    }
  }
  return dist
}

export const toPoint = (index: number, cols: number): Point => ({ x: index % cols, y: Math.floor(index / cols) })

export function farthestCell(dist: number[]): number {
  let best = 0
  for (let index = 1; index < dist.length; index += 1) if ((dist[index] as number) > (dist[best] as number)) best = index
  return best
}

export function canMove(cols: number, rows: number, walls: number[], from: Point, dir: Dir): boolean {
  const x = from.x + DIRS[dir].x
  const y = from.y + DIRS[dir].y
  if (walls[from.y * cols + from.x] & WALL_BIT[dir]) return false
  return x >= 0 && y >= 0 && x < cols && y < rows
}

export function scoreFor(pulsesUsed: number, steps: number, par: number): number {
  const raw = SCORE_BASE - Math.max(0, pulsesUsed) * PULSE_COST - Math.max(0, Math.ceil(steps) - par) * STEP_COST
  return Math.min(SCORE_CAP, Math.max(SCORE_FLOOR, raw))
}

export interface EchoRule {
  cols: number
  rows: number
  radius: number
  litMs: number
  pulses: number
  movingExit: boolean
  hintMs: number
}
export interface EchoState {
  cols: number
  rows: number
  walls: number[]
  player: Point
  exit: Point
  radius: number
  litMs: number
  pulsesLeft: number
  pulsesUsed: number
  pulsesMax: number
  steps: number
  par: number
  clock: number
  lit: Record<string, number>
  exitLitUntil: number
  hintUntil: number
  movingExit: boolean
  rng: number
  status: EchoStatus
  score: number
  events: EchoEvent[]
}

export function createEchoState(rule: EchoRule, walls: number[], seed: number): EchoState {
  const player: Point = { x: 0, y: 0 }
  const dist = bfsDistances(rule.cols, rule.rows, walls, player)
  const exitIndex = farthestCell(dist)
  const exit = toPoint(exitIndex, rule.cols)
  const par = dist[exitIndex] as number
  return {
    cols: rule.cols, rows: rule.rows, walls, player, exit, radius: rule.radius, litMs: rule.litMs,
    pulsesLeft: rule.pulses, pulsesUsed: 0, pulsesMax: rule.pulses, steps: 0, par, clock: 0, lit: {},
    exitLitUntil: 0, hintUntil: rule.hintMs, movingExit: rule.movingExit, rng: seed, status: 'running',
    score: scoreFor(0, 0, par), events: [],
  }
}

function revealAround(state: EchoState, center: Point, until: number): Record<string, number> {
  const lit = { ...state.lit }
  const reach = state.radius * state.radius + 1e-9
  for (let y = 0; y < state.rows; y += 1) {
    for (let x = 0; x < state.cols; x += 1) {
      const dx = x - center.x
      const dy = y - center.y
      if (dx * dx + dy * dy <= reach) lit[cellKey(x, y)] = until
    }
  }
  return lit
}

export function pulseEcho(state: EchoState): EchoState {
  if (state.status !== 'running' || state.pulsesLeft <= 0) return state
  const until = state.clock + state.litMs
  const pulsesUsed = state.pulsesUsed + 1
  return {
    ...state,
    pulsesLeft: state.pulsesLeft - 1,
    pulsesUsed,
    lit: revealAround(state, state.player, until),
    score: scoreFor(pulsesUsed, state.steps, state.par),
    events: ['pulse'],
  }
}

export function tickEcho(state: EchoState, dtMs: number): EchoState {
  if (state.status !== 'running') return state
  const clock = state.clock + Math.max(0, dtMs)
  let expired = false
  const lit: Record<string, number> = {}
  for (const [key, until] of Object.entries(state.lit)) {
    if (until > clock) lit[key] = until
    else expired = true
  }
  return { ...state, clock, lit: expired ? lit : state.lit }
}

function relocateExit(state: EchoState): EchoState {
  const dist = bfsDistances(state.cols, state.rows, state.walls, state.player)
  const exitIndex = state.exit.y * state.cols + state.exit.x
  const pool: number[] = []
  for (let index = 0; index < dist.length; index += 1) {
    if ((dist[index] as number) < RELOCATE_MIN_DIST || index === exitIndex) continue
    pool.push(index)
  }
  if (!pool.length) {
    for (let index = 0; index < dist.length; index += 1) {
      if ((dist[index] as number) <= 0 || index === exitIndex) continue
      pool.push(index)
    }
  }
  if (!pool.length) return state
  const [value, rng] = nextRandom(state.rng)
  return {
    ...state,
    rng,
    exit: toPoint(pool[Math.floor(value * pool.length) % pool.length] as number, state.cols),
    exitLitUntil: state.clock + GLIMMER_MS,
    events: [...state.events, 'relocate'],
  }
}

export function moveEcho(state: EchoState, dir: Dir): EchoState {
  if (state.status !== 'running') return state
  if (!canMove(state.cols, state.rows, state.walls, state.player, dir)) return { ...state, events: ['bump'] }
  const player = { x: state.player.x + DIRS[dir].x, y: state.player.y + DIRS[dir].y }
  const steps = state.steps + 1
  if (player.x === state.exit.x && player.y === state.exit.y) {
    return { ...state, player, steps, score: scoreFor(state.pulsesUsed, steps, state.par), status: 'completed', events: ['move', 'win'] }
  }
  const moved: EchoState = { ...state, player, steps, score: scoreFor(state.pulsesUsed, steps, state.par), events: ['move'] }
  return state.movingExit && steps % RELOCATE_EVERY === 0 ? relocateExit(moved) : moved
}

export function exitVisible(state: EchoState): boolean {
  if (state.status === 'completed') return true
  if (state.clock < state.exitLitUntil) return true
  return (state.lit[cellKey(state.exit.x, state.exit.y)] ?? 0) > state.clock
}

export function hintOf(state: EchoState): number | null {
  if (state.clock >= state.hintUntil) return null
  return (Math.atan2(state.exit.y - state.player.y, state.exit.x - state.player.x) * 180) / Math.PI + 90
}

export function litWallSegments(state: EchoState): { key: string; x: number; y: number; dir: Dir }[] {
  const seen = new Set<string>()
  const segments: { key: string; x: number; y: number; dir: Dir }[] = []
  for (const [cell, until] of Object.entries(state.lit)) {
    if (until <= state.clock) continue
    const [sx, sy] = cell.split(':').map(Number)
    const bits = state.walls[(sy as number) * state.cols + (sx as number)] as number
    for (const dir of Object.keys(WALL_BIT) as Dir[]) {
      if (!(bits & WALL_BIT[dir])) continue
      const nx = (sx as number) + DIRS[dir].x
      const ny = (sy as number) + DIRS[dir].y
      let cx = sx as number
      let cy = sy as number
      let cdir = dir
      if (dir === 'down' && ny < state.rows) { cx = nx; cy = ny; cdir = 'up' }
      if (dir === 'right' && nx < state.cols) { cx = nx; cy = ny; cdir = 'left' }
      const key = `${cx}:${cy}:${cdir}`
      if (seen.has(key)) continue
      seen.add(key)
      segments.push({ key, x: cx, y: cy, dir: cdir })
    }
  }
  return segments
}
