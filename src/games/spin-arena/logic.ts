export interface Fighter { x: number; y: number; vx: number; vy: number; r: number; m: number; spin: number; alive: boolean }
export interface Dot { x: number; y: number; taken: boolean }
export interface ArenaInput { ax: number; ay: number }
export type ArenaEvent = 'collect' | 'knockout' | 'clash' | 'win' | 'lose'
export type ArenaStatus = 'running' | 'completed' | 'failed'
export interface ArenaState {
  time: number
  baseRadius: number
  radius: number
  duration: number
  enemySpeed: number
  smart: boolean
  shrink: boolean
  player: Fighter
  enemies: Fighter[]
  dots: Dot[]
  energy: number
  knockouts: number
  score: number
  status: ArenaStatus
  events: ArenaEvent[]
}
export interface Hit { clash: boolean; bonusApplied: boolean }

export const DT = 1 / 60
export const ARENA_RADIUS = 100
export const PLAYER_R = 9
export const PLAYER_M = 1.2
export const ENEMY_R = 8.5
export const ENEMY_M = 1
export const ENEMY_SPIN = 60
export const ENEMY_STEER = 1.6
export const AI_LEAD = 0.6
export const ACCEL = 300
export const DRAG = 2.4
export const RESTITUTION = 1
export const SPIN_MAX = 100
export const SPIN_DECAY = 2.4
export const DOT_SPIN = 18
export const DOT_R = 7
export const KNOCK_GAIN = 0.55
export const KNOCK_RATE = 6
export const SHRINK_EVERY = 15
export const SHRINK_FACTOR = 0.9
export const SCORE_PER_SECOND = 20
export const KNOCKOUT_SCORE = 400
export const DOT_SCORE = 30
export const SCORE_CAP = 10000

export const clampSpin = (spin: number) => Math.min(SPIN_MAX, Math.max(0, spin))

export function arenaRadiusAt(baseRadius: number, shrink: boolean, time: number): number {
  if (!shrink) return baseRadius
  return baseRadius * Math.pow(SHRINK_FACTOR, Math.floor(Math.max(0, time) / SHRINK_EVERY))
}

export function arenaScore(time: number, knockouts: number, energy: number): number {
  return Math.min(SCORE_CAP, Math.floor(Math.max(0, time)) * SCORE_PER_SECOND + Math.max(0, knockouts) * KNOCKOUT_SCORE + Math.max(0, energy) * DOT_SCORE)
}

export function resolveCollision(a: Fighter, b: Fighter, bonus: number): Hit {
  const dx = b.x - a.x
  const dy = b.y - a.y
  let dist = Math.hypot(dx, dy)
  let nx = 1
  let ny = 0
  if (dist > 1e-9) {
    nx = dx / dist
    ny = dy / dist
  } else {
    dist = 0.01
  }
  const overlap = a.r + b.r - dist
  const invA = 1 / a.m
  const invB = 1 / b.m
  const invSum = invA + invB
  let clash = false
  let bonusApplied = false
  if (overlap > 0) {
    clash = true
    const shift = overlap / invSum
    a.x -= nx * shift * invA
    a.y -= ny * shift * invA
    b.x += nx * shift * invB
    b.y += ny * shift * invB
    const rvn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny
    if (rvn < 0) {
      const impulse = -(1 + RESTITUTION) * rvn / invSum
      a.vx -= impulse * nx * invA
      a.vy -= impulse * ny * invA
      b.vx += impulse * nx * invB
      b.vy += impulse * ny * invB
    }
    if (bonus > 0) {
      b.vx += nx * bonus
      b.vy += ny * bonus
      bonusApplied = true
    }
  }
  return { clash, bonusApplied }
}

export function stepArena(state: ArenaState, input: ArenaInput, dt = DT): ArenaState {
  if (state.status !== 'running') return state
  const safeDt = Math.max(0, dt)
  const radius = arenaRadiusAt(state.baseRadius, state.shrink, state.time)
  const player = { ...state.player }
  const enemies = state.enemies.map((enemy) => ({ ...enemy }))
  const dots = state.dots.map((dot) => ({ ...dot }))
  const events: ArenaEvent[] = []
  const magnitude = Math.hypot(input.ax, input.ay)
  if (magnitude > 1e-9) {
    const power = ACCEL * (0.55 + 0.45 * (player.spin / SPIN_MAX))
    player.vx += (input.ax / magnitude) * power * safeDt
    player.vy += (input.ay / magnitude) * power * safeDt
  }
  for (const enemy of enemies) {
    if (!enemy.alive) continue
    const lead = state.smart ? AI_LEAD : 0
    const tx = state.player.x + state.player.vx * lead
    const ty = state.player.y + state.player.vy * lead
    const dx = tx - enemy.x
    const dy = ty - enemy.y
    const gap = Math.hypot(dx, dy) || 1
    const blend = 1 - Math.exp(-ENEMY_STEER * safeDt)
    enemy.vx += ((dx / gap) * state.enemySpeed - enemy.vx) * blend
    enemy.vy += ((dy / gap) * state.enemySpeed - enemy.vy) * blend
  }
  const drag = Math.exp(-DRAG * safeDt)
  player.vx *= drag
  player.vy *= drag
  player.x += player.vx * safeDt
  player.y += player.vy * safeDt
  for (const enemy of enemies) {
    if (!enemy.alive) continue
    enemy.x += enemy.vx * safeDt
    enemy.y += enemy.vy * safeDt
  }
  for (const enemy of enemies) {
    if (!enemy.alive) continue
    const advantage = Math.max(0, player.spin - enemy.spin) * KNOCK_GAIN * KNOCK_RATE * safeDt
    const hit = resolveCollision(player, enemy, advantage)
    if (hit.clash) events.push('clash')
  }
  for (let i = 0; i < enemies.length; i += 1) {
    for (let j = i + 1; j < enemies.length; j += 1) {
      if (!enemies[i].alive || !enemies[j].alive) continue
      resolveCollision(enemies[i] as Fighter, enemies[j] as Fighter, 0)
    }
  }
  for (const dot of dots) {
    if (dot.taken) continue
    if (Math.hypot(dot.x - player.x, dot.y - player.y) < player.r + DOT_R) {
      dot.taken = true
      events.push('collect')
      player.spin = clampSpin(player.spin + DOT_SPIN)
    }
  }
  let knockouts = 0
  for (const enemy of enemies) {
    if (!enemy.alive) continue
    if (Math.hypot(enemy.x, enemy.y) > radius) {
      enemy.alive = false
      knockouts += 1
      events.push('knockout')
    }
  }
  const knockTotal = state.knockouts + knockouts
  let energy = state.energy
  for (const event of events) if (event === 'collect') energy += 1
  player.spin = clampSpin(player.spin - SPIN_DECAY * safeDt)
  let status: ArenaStatus = 'running'
  if (Math.hypot(player.x, player.y) > radius || player.spin <= 0) {
    status = 'failed'
    events.push('lose')
  } else if (enemies.every((enemy) => !enemy.alive) || state.time + safeDt >= state.duration) {
    status = 'completed'
    events.push('win')
  }
  const time = state.time + safeDt
  const score = arenaScore(time, knockTotal, energy)
  return {
    ...state, time, radius, player, enemies, dots, energy, knockouts: knockTotal, score, status, events,
  }
}

export function createFighter(x: number, y: number, r: number, m: number, spin: number): Fighter {
  return { x, y, vx: 0, vy: 0, r, m, spin, alive: true }
}
