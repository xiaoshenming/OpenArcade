export const COLS = 15
export const ROWS = 11
export const START: Point = { x: 7, y: 5 }
export const START_LIVES = 3
export const SCORE_CAP = 10000
export const PELLET_SCORE = 10
export const GUARD_SCORE = 300
export const POWER_MULT = 3
export const FROZEN_STEPS = 24
export type Dir = 'up' | 'down' | 'left' | 'right'
export type GuardMode = 'patrol' | 'chase' | 'return' | 'frozen'
export type HarvestStatus = 'running' | 'completed' | 'failed'
export type StepEvent = 'move' | 'pellet' | 'star' | 'guard-down' | 'caught' | 'regen' | 'done' | 'lost'
export interface Point { x: number; y: number }
export interface GuardSeed { route: Point[]; homeIndex: number; field: number[] }
export interface GuardState { route: Point[]; homeIndex: number; field: number[]; index: number; fwd: boolean; pos: Point; mode: GuardMode; phase: number; frozen: number }
export interface GameRule {
  quota: number
  stepMs: number
  powerSteps: number
  powerBonus: number
  regenEvery: number
  wrap: boolean
  patrolEvery: number
  chaseEvery: number
}
export interface GameState {
  walls: Point[]
  pellets: Point[]
  stars: Point[]
  player: Point
  dir: Dir
  queue: Dir[]
  guards: GuardState[]
  lives: number
  eaten: number
  score: number
  power: number
  regenStack: Point[]
  regenPhase: number
  steps: number
  status: HarvestStatus
  rule: GameRule
  events: StepEvent[]
}
export const DIRS: Record<Dir, Point> = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } }
const NEIGHBOR_ORDER: Dir[] = ['left', 'right', 'up', 'down']
export const sameCell = (a: Point, b: Point) => a.x === b.x && a.y === b.y
export const cellKey = (cell: Point) => `${cell.x}:${cell.y}`
export const inBounds = (cell: Point) => cell.x >= 0 && cell.y >= 0 && cell.x < COLS && cell.y < ROWS

export function resetGuard(seed: GuardSeed): GuardState {
  const home = seed.route[seed.homeIndex]
  return {
    route: seed.route, homeIndex: seed.homeIndex, field: seed.field, index: seed.homeIndex,
    fwd: seed.homeIndex === 0, pos: { ...home }, mode: 'patrol', phase: 0, frozen: 0,
  }
}

export function createState(walls: Point[], pellets: Point[], stars: Point[], seeds: GuardSeed[], rule: GameRule): GameState {
  return {
    walls: walls.map((wall) => ({ ...wall })),
    pellets: pellets.map((cell) => ({ ...cell })),
    stars: stars.map((cell) => ({ ...cell })),
    player: { ...START }, dir: 'right', queue: [],
    guards: seeds.map(resetGuard),
    lives: START_LIVES, eaten: 0, score: 0, power: 0,
    regenStack: [], regenPhase: 0, steps: 0, status: 'running', rule, events: [],
  }
}

export function queueDir(state: GameState, dir: Dir): GameState {
  if (state.status !== 'running') return state
  const last = state.queue.length ? state.queue[state.queue.length - 1] : state.dir
  if (dir === last || state.queue.length >= 2) return state
  return { ...state, queue: [...state.queue, dir] }
}

export function step(state: GameState, dir?: Dir): GameState {
  return advance(dir ? queueDir(state, dir) : state)
}

export function facingOf(guard: GuardState): Dir {
  const from = guard.route[guard.index]
  const to = guard.route[guard.index + (guard.fwd ? 1 : -1)] || from
  if (to.y > from.y) return 'down'
  if (to.y < from.y) return 'up'
  return to.x > from.x ? 'right' : 'left'
}

export function lineClear(walls: Point[], a: Point, b: Point): boolean {
  if (a.y !== b.y && a.x !== b.x) return false
  if (a.y === b.y) {
    const [from, to] = a.x < b.x ? [a, b] : [b, a]
    for (let x = from.x + 1; x < to.x; x += 1) if (walls.some((wall) => wall.x === x && wall.y === a.y)) return false
    return true
  }
  const [from, to] = a.y < b.y ? [a, b] : [b, a]
  for (let y = from.y + 1; y < to.y; y += 1) if (walls.some((wall) => wall.x === a.x && wall.y === y)) return false
  return true
}

export function seesPlayer(walls: Point[], guard: Point, facing: Dir, player: Point): boolean {
  if (guard.y === player.y && (facing === 'left' || facing === 'right')) {
    return Math.sign(player.x - guard.x) === (facing === 'right' ? 1 : -1) && lineClear(walls, guard, player)
  }
  if (guard.x === player.x && (facing === 'up' || facing === 'down')) {
    return Math.sign(player.y - guard.y) === (facing === 'down' ? 1 : -1) && lineClear(walls, guard, player)
  }
  return false
}

export function alignStep(walls: Point[], from: Point, target: Point): Point | null {
  if (from.y === target.y && from.x !== target.x) {
    const x = from.x + Math.sign(target.x - from.x)
    return walls.some((wall) => wall.x === x && wall.y === from.y) ? null : { x, y: from.y }
  }
  if (from.x === target.x && from.y !== target.y) {
    const y = from.y + Math.sign(target.y - from.y)
    return walls.some((wall) => wall.x === from.x && wall.y === y) ? null : { x: from.x, y }
  }
  return null
}

export function descend(field: number[], from: Point): Point {
  let best = { ...from }
  let value = field[from.y * COLS + from.x]
  for (const dir of NEIGHBOR_ORDER) {
    const next = { x: from.x + DIRS[dir].x, y: from.y + DIRS[dir].y }
    if (!inBounds(next)) continue
    const candidate = field[next.y * COLS + next.x]
    if (candidate >= 0 && candidate < value) {
      value = candidate
      best = next
    }
  }
  return best
}

function advance(state: GameState): GameState {
  if (state.status !== 'running') return state
  const queue = [...state.queue]
  const dir = queue.length ? (queue.shift() as Dir) : state.dir
  const events: StepEvent[] = ['move']
  const delta = DIRS[dir]
  let px = state.player.x + delta.x
  const py = state.player.y + delta.y
  if (state.rule.wrap && (px < 0 || px >= COLS)) px = (px + COLS) % COLS
  const blocked = px < 0 || py < 0 || px >= COLS || py >= ROWS || state.walls.some((wall) => wall.x === px && wall.y === py)
  const player = blocked ? { ...state.player } : { x: px, y: py }
  const pellets = [...state.pellets]
  const stars = [...state.stars]
  const regenStack = [...state.regenStack]
  let score = state.score
  let eaten = state.eaten
  let power = Math.max(0, state.power - 1)
  const pelletAt = pellets.findIndex((cell) => sameCell(cell, player))
  if (pelletAt >= 0) {
    pellets.splice(pelletAt, 1)
    regenStack.push({ ...player })
    eaten += 1
    score += PELLET_SCORE * (power > 0 ? POWER_MULT : 1)
    events.push('pellet')
  }
  const starAt = stars.findIndex((cell) => sameCell(cell, player))
  if (starAt >= 0) {
    stars.splice(starAt, 1)
    power = state.rule.powerSteps
    events.push('star')
  }
  if (eaten >= state.rule.quota) {
    return { ...state, player, dir, queue, pellets, stars, score, eaten, power, steps: state.steps + 1, status: 'completed', events: [...events, 'done'] }
  }
  let caught = false
  const guards = state.guards.map((guard) => ({ ...guard }))
  const strike = (guard: GuardState) => {
    if (power > 0) {
      score += GUARD_SCORE
      // 能量星连锁:反杀期每吞噬一名守卫,护星时长延长 powerBonus 步(第 5 章 3 秒)。
      power += Math.max(0, state.rule.powerBonus)
      guard.mode = 'frozen'
      guard.frozen = FROZEN_STEPS
      events.push('guard-down')
    } else caught = true
  }
  for (const guard of guards) {
    if (guard.frozen === 0 && sameCell(guard.pos, player)) strike(guard)
  }
  for (const guard of guards) {
    if (guard.frozen > 0) {
      guard.frozen -= 1
      const home = guard.route[guard.homeIndex]
      if (guard.frozen === 0) {
        if (sameCell(home, player)) guard.frozen = 1
        else Object.assign(guard, { mode: 'patrol' as GuardMode, index: guard.homeIndex, fwd: guard.homeIndex === 0, pos: { ...home }, phase: 0 })
      }
      continue
    }
    guard.phase += 1
    if (guard.mode === 'patrol' && seesPlayer(state.walls, guard.pos, facingOf(guard), player)) guard.mode = 'chase'
    const cadence = guard.mode === 'chase' ? state.rule.chaseEvery : state.rule.patrolEvery
    if (guard.phase < cadence) continue
    guard.phase = 0
    if (guard.mode === 'patrol') {
      let fwd = guard.fwd
      let index = guard.index + (fwd ? 1 : -1)
      if (index < 0 || index >= guard.route.length) {
        fwd = !fwd
        index = guard.index + (fwd ? 1 : -1)
      }
      guard.fwd = fwd
      guard.index = index
      guard.pos = { ...guard.route[index] }
    } else if (guard.mode === 'chase') {
      const next = alignStep(state.walls, guard.pos, player)
      if (next) guard.pos = next
      else guard.mode = 'return'
    } else if (guard.mode === 'return') {
      const home = guard.route[guard.homeIndex]
      if (sameCell(guard.pos, home)) {
        guard.mode = 'patrol'
        guard.index = guard.homeIndex
        guard.fwd = guard.homeIndex === 0
      } else guard.pos = descend(guard.field, guard.pos)
    }
    if (sameCell(guard.pos, player)) strike(guard)
  }
  let regenPhase = state.regenPhase
  if (state.rule.regenEvery > 0) {
    regenPhase += 1
    if (regenPhase >= state.rule.regenEvery) {
      regenPhase = 0
      const cell = regenStack.shift()
      const guarded = cell ? guards.some((guard) => guard.frozen === 0 && sameCell(guard.pos, cell)) : false
      if (cell && !sameCell(cell, player) && !guarded && !pellets.some((item) => sameCell(item, cell))) {
        pellets.push(cell)
        events.push('regen')
      }
    }
  }
  let lives = state.lives
  let status: HarvestStatus = 'running'
  let nextPlayer = player
  let nextGuards = guards
  if (caught) {
    lives -= 1
    events.push('caught')
    if (lives <= 0) {
      status = 'failed'
      events.push('lost')
    } else {
      nextPlayer = { ...START }
      queue.length = 0
      power = 0
      nextGuards = guards.map((guard) => ({
        ...guard, index: guard.homeIndex, fwd: guard.homeIndex === 0,
        pos: { ...guard.route[guard.homeIndex] }, mode: 'patrol' as GuardMode, phase: 0, frozen: 0,
      }))
    }
  }
  return {
    ...state, player: nextPlayer, dir, queue, pellets, stars, guards: nextGuards, lives, eaten, score,
    power, regenStack, regenPhase, steps: state.steps + 1, status, events,
  }
}
