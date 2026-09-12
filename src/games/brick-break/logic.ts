import { seedFor } from '../../platform/rng'

export const FIELD = { width: 480, height: 620 }
export const PADDLE_TOP = 578
export const PADDLE_HEIGHT = 12
export const PADDLE_BASE = 84
export const WIDE_BONUS = 36
export const BALL_RADIUS = 6
export const BRICK_WIDTH = 42
export const BRICK_HEIGHT = 20
export const BRICK_COLS = 10
export const BRICK_OFFSET_X = 12
export const BRICK_TOP = 48
export const START_LIVES = 3
export const SCORE_PER_BRICK = 50
export const SCORE_CAP = 10000
export const MAX_BALLS = 5, MAX_DROPS = 3
export const SERVE_DELAY = 1.1, RESPAWN_DELAY = 1
export const MAX_DEFLECT = Math.PI / 3
export const PADDLE_SPEED = 460, SLOW_FACTOR = 0.65, DROP_SPEED = 150
export const WIDE_SECONDS = 10, SLOW_SECONDS = 8, FIXED_SLICE = 1 / 240

export type BrickKind = 'normal' | 'hard' | 'metal'
export type PowerKind = 'wide' | 'slow' | 'multi'
export type GameStatus = 'playing' | 'cleared' | 'over'
export type StepEvent = 'brick' | 'crack' | 'clank' | 'paddle' | 'power' | 'serve' | 'life' | 'clear' | 'over'
export interface BrickCell { row: number; col: number; kind: BrickKind }
export interface Brick { id: number; row: number; col: number; baseX: number; x: number; y: number; w: number; h: number; kind: BrickKind; hp: number; drift: number }
export interface Ball { x: number; y: number; vx: number; vy: number; r: number; held: boolean }
export interface Paddle { x: number; width: number }
export interface Drop { id: number; x: number; y: number; kind: PowerKind }
export interface Drift { rows: number[]; amplitude: number; period: number; phase: number }
export interface LevelPlan {
  level: number
  chapter: number
  bricks: BrickCell[]
  ballSpeed: number
  dropChance: number
  driftRows: number[]
  driftAmplitude: number
  driftPeriod: number
  driftPhase: number
  par: number
}
export interface GameState {
  bricks: Brick[]
  balls: Ball[]
  paddle: Paddle
  drops: Drop[]
  effects: { wide: number; slow: number }
  score: number
  combo: number
  lives: number
  serveTimer: number
  ballSpeed: number
  dropChance: number
  drift: Drift
  time: number
  rngState: number
  dropId: number
  status: GameStatus
  events: StepEvent[]
}

export function nextRandom(state: number): [number, number] {
  const next = (state + 0x6d2b79f5) >>> 0
  let value = next
  value = Math.imul(value ^ (value >>> 15), value | 1)
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
  return [((value ^ (value >>> 14)) >>> 0) / 4294967296, next]
}

export function paddleSpan(state: GameState): number {
  return state.paddle.width + (state.effects.wide > 0 ? WIDE_BONUS : 0)
}

export function driftOffset(drift: Drift, time: number): number {
  if (!drift.rows.length) return 0
  return Math.round(drift.amplitude * Math.sin(((time / drift.period) + drift.phase) * Math.PI * 2))
}

export function createGameState(plan: LevelPlan): GameState {
  const bricks: Brick[] = plan.bricks.map((cell, index) => {
    const x = BRICK_OFFSET_X + cell.col * (BRICK_WIDTH + 4)
    return {
      id: index + 1,
      row: cell.row,
      col: cell.col,
      baseX: x,
      x,
      y: BRICK_TOP + cell.row * (BRICK_HEIGHT + 6),
      w: BRICK_WIDTH,
      h: BRICK_HEIGHT,
      kind: cell.kind,
      hp: cell.kind === 'hard' ? 2 : cell.kind === 'metal' ? Number.POSITIVE_INFINITY : 1,
      drift: plan.driftRows.includes(cell.row) ? 1 : 0,
    }
  })
  return {
    bricks,
    balls: [{ x: FIELD.width / 2, y: PADDLE_TOP - BALL_RADIUS - 2, vx: 0, vy: 0, r: BALL_RADIUS, held: true }],
    paddle: { x: FIELD.width / 2, width: PADDLE_BASE },
    drops: [],
    effects: { wide: 0, slow: 0 },
    score: 0, combo: 0, lives: START_LIVES, serveTimer: SERVE_DELAY, ballSpeed: plan.ballSpeed, dropChance: plan.dropChance,
    drift: { rows: [...plan.driftRows], amplitude: plan.driftAmplitude, period: plan.driftPeriod, phase: plan.driftPhase },
    time: 0, rngState: seedFor(plan.level, 9), dropId: 0, status: 'playing', events: [],
  }
}

export function withPaddle(state: GameState, x: number): GameState {
  const half = paddleSpan(state) / 2
  const safe = Number.isFinite(x) ? x : FIELD.width / 2
  const clamped = Math.min(FIELD.width - half, Math.max(half, safe))
  return state.paddle.x === clamped ? state : { ...state, paddle: { ...state.paddle, x: clamped } }
}

export function launch(state: GameState, angle = 0): GameState {
  if (state.status !== 'playing' || state.serveTimer <= 0) return state
  const balls = state.balls.map((ball) => (ball.held
    ? { ...ball, held: false, vx: Math.sin(angle) * state.ballSpeed, vy: -Math.cos(angle) * state.ballSpeed }
    : ball))
  return { ...state, balls, serveTimer: 0, events: [...state.events, 'serve'] }
}

export function clearBonus(par: number, elapsed: number): number {
  return 200 + Math.max(0, Math.round((par - elapsed) * 6))
}

function pickPower(roll: number): PowerKind {
  return roll < 0.4 ? 'wide' : roll < 0.75 ? 'slow' : 'multi'
}

function spawnBall(source: Ball, turn: number, speed: number): Ball {
  const angle = Math.atan2(source.vx, -source.vy) + turn
  return { x: source.x, y: source.y, vx: Math.sin(angle) * speed, vy: -Math.cos(angle) * speed, r: BALL_RADIUS, held: false }
}

function advance(state: GameState, sdt: number): GameState {
  const events: StepEvent[] = []
  let rngState = state.rngState
  const time = state.time + sdt
  const offset = state.drift.rows.length ? driftOffset(state.drift, time) : 0
  const draft: GameState = {
    ...state,
    time,
    events,
    effects: { wide: Math.max(0, state.effects.wide - sdt), slow: Math.max(0, state.effects.slow - sdt) },
    bricks: offset || state.bricks.some((brick) => brick.drift)
      ? state.bricks.map((brick) => (brick.drift ? { ...brick, x: brick.baseX + offset } : brick))
      : state.bricks,
    drops: state.drops.map((drop) => ({ ...drop, y: drop.y + DROP_SPEED * sdt })).filter((drop) => drop.y < FIELD.height + 24),
  }
  const paddle = draft.paddle
  const span = paddleSpan(draft)
  const kept: Drop[] = []
  for (const drop of draft.drops) {
    const caught = drop.y + 7 >= PADDLE_TOP && drop.y - 7 <= PADDLE_TOP + PADDLE_HEIGHT + 12 && Math.abs(drop.x - paddle.x) <= span / 2 + 10
    if (!caught) {
      kept.push(drop)
      continue
    }
    events.push('power')
    if (drop.kind === 'multi') {
      const source = draft.balls.find((ball) => !ball.held)
      if (source) {
        const speed = Math.hypot(source.vx, source.vy) || draft.ballSpeed
        for (const turn of [-0.45, 0.45]) {
          if (draft.balls.length >= MAX_BALLS) break
          draft.balls = [...draft.balls, spawnBall(source, turn, speed)]
        }
      }
    } else if (drop.kind === 'wide') draft.effects = { ...draft.effects, wide: WIDE_SECONDS }
    else draft.effects = { ...draft.effects, slow: SLOW_SECONDS }
  }
  draft.drops = kept
  if (draft.serveTimer > 0) {
    draft.serveTimer = Math.max(0, draft.serveTimer - sdt)
    draft.balls = draft.balls.map((ball) => (ball.held ? { ...ball, x: paddle.x, y: PADDLE_TOP - BALL_RADIUS - 2 } : ball))
    if (draft.serveTimer === 0) {
      const [roll, next] = nextRandom(rngState)
      rngState = next
      const angle = (roll - 0.5) * 0.7
      draft.balls = draft.balls.map((ball) => (ball.held
        ? { ...ball, held: false, vx: Math.sin(angle) * draft.ballSpeed, vy: -Math.cos(angle) * draft.ballSpeed }
        : ball))
      events.push('serve')
    }
  }
  const scale = draft.effects.slow > 0 ? SLOW_FACTOR : 1
  const survivors: Ball[] = []
  let score = draft.score
  let combo = draft.combo
  for (const ball of draft.balls) {
    if (ball.held) {
      survivors.push(ball)
      continue
    }
    let { x, y, vx, vy } = ball
    const r = ball.r
    x += vx * scale * sdt
    y += vy * scale * sdt
    if (x < r) vx = Math.abs(vx)
    else if (x > FIELD.width - r) vx = -Math.abs(vx)
    x = Math.min(FIELD.width - r, Math.max(r, x))
    if (y < r) vy = Math.abs(vy)
    y = Math.max(r, y)
    if (vy > 0 && y + r >= PADDLE_TOP && y - r <= PADDLE_TOP + PADDLE_HEIGHT && Math.abs(x - paddle.x) <= span / 2 + r) {
      const u = Math.max(-1, Math.min(1, (x - paddle.x) / (span / 2 || 1)))
      const speed = Math.hypot(vx, vy)
      vx = Math.sin(u * MAX_DEFLECT) * speed
      vy = -Math.cos(u * MAX_DEFLECT) * speed
      y = PADDLE_TOP - r
      events.push('paddle')
    }
    let hit: Brick | null = null
    let nearX = 0, nearY = 0
    for (const brick of draft.bricks) {
      if (brick.hp <= 0) continue
      const nx = Math.min(brick.x + brick.w, Math.max(brick.x, x)), ny = Math.min(brick.y + brick.h, Math.max(brick.y, y))
      const dx = x - nx, dy = y - ny
      if (dx * dx + dy * dy <= r * r) {
        hit = brick
        nearX = nx
        nearY = ny
        break
      }
    }
    if (hit) {
      const dx = x - nearX, dy = y - nearY
      if (dx === 0 && dy === 0) vy = -vy
      else if (Math.abs(dx) > Math.abs(dy)) {
        vx = dx < 0 ? -Math.abs(vx) : Math.abs(vx)
        x = nearX + (dx < 0 ? -r : r)
      } else {
        vy = dy < 0 ? -Math.abs(vy) : Math.abs(vy)
        y = nearY + (dy < 0 ? -r : r)
      }
      if (hit.kind === 'metal') events.push('clank')
      else {
        const hp = hit.hp - 1
        const struck = hit
        draft.bricks = draft.bricks.map((brick) => (brick.id === struck.id ? { ...brick, hp } : brick))
        if (hp > 0) events.push('crack')
        else {
          events.push('brick')
          combo += 1
          score += SCORE_PER_BRICK * combo
          if (draft.dropChance > 0 && draft.drops.length < MAX_DROPS) {
            const [rollA, nextA] = nextRandom(rngState)
            rngState = nextA
            if (rollA < draft.dropChance) {
              const [rollB, nextB] = nextRandom(rngState)
              rngState = nextB
              draft.dropId += 1
              draft.drops = [...draft.drops, { id: draft.dropId, x: hit.x + hit.w / 2, y: hit.y + hit.h / 2, kind: pickPower(rollB) }]
            }
          }
        }
      }
    }
    survivors.push({ ...ball, x, y, vx, vy })
  }
  let lives = draft.lives, status = draft.status, serveTimer = draft.serveTimer
  let balls = survivors.filter((ball) => ball.y - ball.r <= FIELD.height + 8)
  if (balls.length < survivors.length && balls.length === 0) {
    lives -= 1
    combo = 0
    if (lives <= 0) {
      status = 'over'
      events.push('over')
    } else {
      serveTimer = RESPAWN_DELAY
      balls = [{ x: paddle.x, y: PADDLE_TOP - BALL_RADIUS - 2, vx: 0, vy: 0, r: BALL_RADIUS, held: true }]
      events.push('life')
    }
  }
  if (status === 'playing' && draft.bricks.every((brick) => brick.hp <= 0 || brick.kind === 'metal')) {
    status = 'cleared'
    events.push('clear')
  }
  return { ...draft, balls, score, combo, lives, status, serveTimer, rngState }
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
