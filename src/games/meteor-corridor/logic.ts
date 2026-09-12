export const FIELD = { width: 480, height: 640 }
export const SPAWN_Y = -30
export const SPLIT_NEVER = FIELD.height * 4
export const SHIP_Y = 576
export const SHIP_RADIUS = 11
export const SHIP_MIN = SHIP_RADIUS + 8
export const SHIP_SPEED = 430
export const GRAZE_GAP = 26
export const START_SHIELD = 3
export const INVULN_SECONDS = 1.6
export const SCORE_PER_SECOND = 10
export const GRAZE_SCORE = 25
export const SCORE_CAP = 10000
export const HOMING_MAX = 130
export const CULL_MARGIN = 56
export const FIXED_SLICE = 1 / 240
export const MAX_FRAME = 0.05

export type MeteorKind = 'straight' | 'diagonal' | 'splitter' | 'shard' | 'homing'
export type GameStatus = 'playing' | 'cleared' | 'over'
export type StepEvent = 'hit' | 'graze' | 'split' | 'clear' | 'over'

export interface ShardSpec { dx: number; vx: number; r: number; speed: number }
export interface Spawn {
  id: number
  t: number
  x: number
  kind: MeteorKind
  r: number
  speed: number
  vx: number
  splitY: number
  shards: ShardSpec[]
  turn: number
}
export interface Meteor {
  id: number
  x: number
  y: number
  kind: MeteorKind
  r: number
  vx: number
  vy: number
  splitY: number
  shards: ShardSpec[]
  turn: number
  grazed: boolean
}
export interface CorridorPlan { duration: number; graze: boolean; queue: Spawn[] }
export interface GameState {
  time: number
  duration: number
  graze: boolean
  queue: Spawn[]
  cursor: number
  meteors: Meteor[]
  ship: number
  shield: number
  invuln: number
  score: number
  grazes: number
  hits: number
  status: GameStatus
  events: StepEvent[]
}

export function createGameState(plan: CorridorPlan): GameState {
  return {
    time: 0, duration: plan.duration, graze: plan.graze, queue: plan.queue, cursor: 0, meteors: [],
    ship: FIELD.width / 2, shield: START_SHIELD, invuln: 0, score: 0, grazes: 0, hits: 0, status: 'playing', events: [],
  }
}

export function withShip(state: GameState, x: number): GameState {
  const safe = Number.isFinite(x) ? Math.min(FIELD.width - SHIP_MIN, Math.max(SHIP_MIN, x)) : FIELD.width / 2
  return state.ship === safe ? state : { ...state, ship: safe }
}

export interface InputState { left: boolean; right: boolean; pointerX: number | null }

// Pointer steering wins while the touch is held; the component clears pointerX on
// pointerup/cancel so a stale touch point never pins the ship against keyboard input.
export function applyInput(state: GameState, input: InputState, dt: number): GameState {
  let next = state
  if (input.pointerX != null) next = withShip(next, input.pointerX)
  if (input.left !== input.right) next = withShip(next, next.ship + (input.left ? -1 : 1) * SHIP_SPEED * dt)
  return next
}

function advance(state: GameState, dt: number): GameState {
  const events: StepEvent[] = []
  const time = state.time + dt
  let cursor = state.cursor
  const spawned: Meteor[] = []
  while (cursor < state.queue.length && state.queue[cursor].t <= time) {
    const spawn = state.queue[cursor]
    cursor += 1
    spawned.push({ id: spawn.id, x: spawn.x, y: SPAWN_Y, kind: spawn.kind, r: spawn.r, vx: spawn.vx, vy: spawn.speed, splitY: spawn.splitY, shards: spawn.shards, turn: spawn.turn, grazed: false })
  }
  const ship = state.ship
  let shield = state.shield
  let invuln = Math.max(0, state.invuln - dt)
  let score = Math.min(SCORE_CAP, state.score + SCORE_PER_SECOND * dt)
  let grazes = state.grazes
  let hits = state.hits
  let status = state.status
  const alive: Meteor[] = []
  for (const meteor of [...state.meteors, ...spawned]) {
    const vx = meteor.kind === 'homing'
      ? Math.max(-HOMING_MAX, Math.min(HOMING_MAX, meteor.vx + Math.sign(ship - meteor.x) * meteor.turn * dt))
      : meteor.vx
    const x = meteor.x + vx * dt
    const y = meteor.y + meteor.vy * dt
    if (meteor.kind === 'splitter' && y >= meteor.splitY) {
      events.push('split')
      meteor.shards.forEach((shard, index) => {
        alive.push({ id: 100000 + meteor.id * 4 + index, x: x + (index === 0 ? -shard.dx : shard.dx), y, kind: 'shard', r: shard.r, vx: shard.vx, vy: shard.speed, splitY: SPLIT_NEVER, shards: [], turn: 0, grazed: false })
      })
      continue
    }
    if (x < -CULL_MARGIN || x > FIELD.width + CULL_MARGIN || y > FIELD.height + CULL_MARGIN) continue
    const distance = Math.hypot(x - ship, y - SHIP_Y)
    if (distance <= SHIP_RADIUS + meteor.r && invuln <= 0) {
      events.push('hit')
      shield -= 1
      hits += 1
      invuln = INVULN_SECONDS
      continue
    }
    if (state.graze && !meteor.grazed && distance > SHIP_RADIUS + meteor.r && distance <= SHIP_RADIUS + meteor.r + GRAZE_GAP) {
      events.push('graze')
      grazes += 1
      score = Math.min(SCORE_CAP, score + GRAZE_SCORE)
      alive.push({ ...meteor, x, y, vx, grazed: true })
      continue
    }
    alive.push({ ...meteor, x, y, vx })
  }
  if (shield <= 0) {
    status = 'over'
    events.push('over')
  } else if (time >= state.duration) {
    status = 'cleared'
    events.push('clear')
  }
  return { ...state, time, cursor, meteors: alive, shield, invuln, score, grazes, hits, status, events }
}

export function step(state: GameState, rawDt: number): GameState {
  if (state.status !== 'playing') return state
  const dt = Number.isFinite(rawDt) ? Math.min(MAX_FRAME, Math.max(0, rawDt)) : 0
  if (dt <= 0) return state
  const slices = Math.max(1, Math.ceil(dt / FIXED_SLICE))
  const slice = dt / slices
  let current = state
  const events: StepEvent[] = []
  for (let index = 0; index < slices; index += 1) {
    current = advance(current, slice)
    if (current.events.length) events.push(...current.events)
    if (current.status !== 'playing') break
  }
  return events.length ? { ...current, events } : current
}
