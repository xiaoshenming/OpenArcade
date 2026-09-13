import { seedFor } from '../../platform/rng'

export const FIELD = { width: 480, height: 620 }
export const PADDLE_TOP = 566
export const PADDLE_HEIGHT = 12
export const PADDLE_BASE = 110
export const PADDLE_SPEED = 600
export const BALL_RADIUS = 9
export const GOLD_RADIUS = 6
export const GOLD_FACTOR = 1.22
export const BASE_GRAVITY = 620
export const ZONE_FACTOR = 1.6
export const START_LIVES = 3
export const SCORE_PER_BOUNCE = 50
export const ROTATE_BONUS = 30
export const GOLD_QUOTA = 5
export const SCORE_CAP = 10000
export const MAX_DEFLECT = Math.PI / 3
export const FIXED_SLICE = 1 / 240
export const FIRST_DELAY = 0.8
export const RESPAWN_DELAY = 1
export const RESET_Y = 76
export const RESET_VY = 90
export const RESET_SPREAD = 44
export type BallKind = 'normal' | 'gold'
export type GameStatus = 'playing' | 'cleared' | 'over'
export type StepEvent = 'bounce' | 'gold' | 'wall' | 'drop' | 'join' | 'serve' | 'clear' | 'over'
export interface Ball { id: number; kind: BallKind; x: number; y: number; vx: number; vy: number; r: number; speed: number }
export interface Paddle { x: number }
export interface Zone { y: number; height: number }
export interface LevelPlan {
  quota: number
  maxBalls: number
  goldCount: number
  startBalls: number
  ballSpeed: number
  gravity: number
  joinAfter: number
  zones: Zone[]
}
export interface GameState {
  balls: Ball[]
  paddle: Paddle
  score: number
  bounces: number
  lives: number
  joinTimer: number
  spawnTimer: number
  lastBallId: number
  time: number
  rngState: number
  nextId: number
  quota: number
  maxBalls: number
  goldCount: number
  ballSpeed: number
  gravity: number
  joinAfter: number
  zones: Zone[]
  status: GameStatus
  events: StepEvent[]
}
export const capacityOf = (state: Pick<GameState, 'maxBalls' | 'goldCount'>) => state.maxBalls + state.goldCount

export function nextRandom(state: number): [number, number] {
  const next = (state + 0x6d2b79f5) >>> 0
  let value = next
  value = Math.imul(value ^ (value >>> 15), value | 1)
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
  return [((value ^ (value >>> 14)) >>> 0) / 4294967296, next]
}

export function inZone(zones: Zone[], y: number): boolean {
  return zones.some((zone) => y >= zone.y && y <= zone.y + zone.height)
}

function draftBall(state: GameState, id: number): [Ball, number] {
  const [rollX, first] = nextRandom(state.rngState)
  const [rollV, second] = nextRandom(first)
  const kind: BallKind = state.balls.filter((ball) => ball.kind === 'normal').length < state.maxBalls ? 'normal' : 'gold'
  const speed = state.ballSpeed * (kind === 'gold' ? GOLD_FACTOR : 1)
  return [{
    id, kind, x: 80 + rollX * (FIELD.width - 160), y: 70,
    vx: (rollV - 0.5) * speed * 0.6, vy: speed * 0.45,
    r: kind === 'gold' ? GOLD_RADIUS : BALL_RADIUS, speed,
  }, second]
}

function spawn(state: GameState, events: StepEvent[], event: StepEvent): void {
  state.nextId += 1
  const [ball, next] = draftBall(state, state.nextId)
  state.balls = [...state.balls, ball]
  state.rngState = next
  events.push(event)
}

export function createGameState(plan: LevelPlan, level: number): GameState {
  const base: GameState = {
    balls: [], paddle: { x: FIELD.width / 2 }, score: 0, bounces: 0, lives: START_LIVES,
    joinTimer: plan.joinAfter > 0 ? plan.joinAfter : FIRST_DELAY, spawnTimer: 0, lastBallId: 0,
    time: 0, rngState: seedFor(level, 5), nextId: 0, quota: plan.quota, maxBalls: plan.maxBalls,
    goldCount: plan.goldCount, ballSpeed: plan.ballSpeed, gravity: plan.gravity, joinAfter: plan.joinAfter,
    zones: plan.zones.map((zone) => ({ ...zone })), status: 'playing', events: [],
  }
  for (let index = 0; index < plan.startBalls; index += 1) {
    base.nextId += 1
    const [ball, next] = draftBall(base, base.nextId)
    base.balls.push(ball)
    base.rngState = next
  }
  return base
}

export function withPaddle(state: GameState, x: number): GameState {
  const half = PADDLE_BASE / 2
  const safe = Number.isFinite(x) ? x : FIELD.width / 2
  const clamped = Math.min(FIELD.width - half, Math.max(half, safe))
  return state.paddle.x === clamped ? state : { ...state, paddle: { x: clamped } }
}

function advance(state: GameState, sdt: number): GameState {
  const events: StepEvent[] = []
  const draft: GameState = { ...state, time: state.time + sdt, events }
  if (draft.spawnTimer > 0) {
    draft.spawnTimer = Math.max(0, draft.spawnTimer - sdt)
    if (draft.spawnTimer === 0 && draft.balls.length < capacityOf(draft)) spawn(draft, events, 'serve')
  } else if (draft.balls.length < capacityOf(draft)) {
    draft.joinTimer = Math.max(0, draft.joinTimer - sdt)
    if (draft.joinTimer === 0) {
      spawn(draft, events, 'join')
      draft.joinTimer = draft.joinAfter > 0 ? draft.joinAfter : FIRST_DELAY
    }
  }
  const survivors: Ball[] = []
  let score = draft.score
  let bounces = draft.bounces
  let lastBallId = draft.lastBallId
  let dropped = 0
  for (const ball of draft.balls) {
    let { x, y, vx, vy } = ball
    const gravity = draft.gravity * (inZone(draft.zones, y) ? ZONE_FACTOR : 1)
    vy += gravity * sdt
    x += vx * sdt
    y += vy * sdt
    if (x < ball.r) {
      vx = Math.abs(vx)
      x = ball.r
      events.push('wall')
    } else if (x > FIELD.width - ball.r) {
      vx = -Math.abs(vx)
      x = FIELD.width - ball.r
      events.push('wall')
    }
    if (y < ball.r) {
      vy = Math.abs(vy)
      y = ball.r
      events.push('wall')
    }
    if (vy > 0 && y + ball.r >= PADDLE_TOP && y - ball.r <= PADDLE_TOP + PADDLE_HEIGHT + 6 && Math.abs(x - draft.paddle.x) <= PADDLE_BASE / 2 + ball.r) {
      const u = Math.max(-1, Math.min(1, (x - draft.paddle.x) / (PADDLE_BASE / 2)))
      vx = Math.sin(u * MAX_DEFLECT) * ball.speed
      vy = -Math.cos(u * MAX_DEFLECT) * ball.speed
      y = PADDLE_TOP - ball.r
      score += SCORE_PER_BOUNCE + (lastBallId !== 0 && lastBallId !== ball.id ? ROTATE_BONUS : 0)
      lastBallId = ball.id
      bounces += ball.kind === 'gold' ? GOLD_QUOTA : 1
      events.push(ball.kind === 'gold' ? 'gold' : 'bounce')
    }
    if (y - ball.r > FIELD.height) {
      dropped += 1
      events.push('drop')
      if (dropped > 1) {
        // 一次掉落只扣 1 命：同帧其余坠球重置到托板上方缓降，玩家仍需接住。
        const side = dropped % 2 === 0 ? -1 : 1
        const rx = Math.min(FIELD.width - ball.r, Math.max(ball.r, draft.paddle.x + side * RESET_SPREAD))
        survivors.push({ ...ball, x: rx, y: RESET_Y, vx: 0, vy: RESET_VY })
      }
      continue
    }
    survivors.push({ ...ball, x, y, vx, vy })
  }
  let status = draft.status
  if (status === 'playing' && bounces >= draft.quota) {
    status = 'cleared'
    events.push('clear')
  }
  let lives = draft.lives
  if (dropped > 0 && status === 'playing') {
    lives -= 1
    if (lives <= 0) {
      lives = 0
      status = 'over'
      events.push('over')
    } else if (survivors.length === 0) draft.spawnTimer = RESPAWN_DELAY
  }
  return { ...draft, balls: survivors, score, bounces, lastBallId, lives, status }
}

export function step(state: GameState, rawDt: number): GameState {
  if (state.status !== 'playing') return state
  const dt = Number.isFinite(rawDt) ? Math.min(0.05, Math.max(0, rawDt)) : 0
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
