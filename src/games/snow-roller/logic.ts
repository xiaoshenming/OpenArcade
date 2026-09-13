import type { Course, Obstacle } from './levels'

export const DT = 1 / 120
export const TRACK_HALF = 4.5
export const BASE_RADIUS = 0.7
export const FLAKE_DIV = 5
export const RADIUS_GAIN = 0.62
export const MAX_RADIUS = 2.4
export const FLAKE_RADIUS = 0.55
// 碰撞扫描窗口:由 FLAKE_RADIUS 推导,且远大于单步最大位移(≤0.08s × 速度上限约 24 ≈ 2),
// 只用作 firstAt 二分起点与提前 break,不参与精确判定(精确几何判定在循环体内完成)。
export const FLAKE_WINDOW = FLAKE_RADIUS * 12
export const HIT_WINDOW = FLAKE_WINDOW + FLAKE_RADIUS
export const FLAKE_SCORE = 25
export const CRUSH_SCORE = 150
export const STEP_METERS = 10
export const STEP_SCORE = 10
export const SCORE_MAX = 10000
export const START_LIVES = 3
export const IFRAMES = 1.6
export const HIT_SHRINK = 0.78
export const AIR_TIME = 0.75
export const AIR_MIN = 0.12
export const STEER_ACCEL = 18
export const GRIP = 5.5
export const ICE_GRIP = 1.9
export const SPEED_CAP = 1.55
export const SNOWMAN_CRUSH = 2
export const ROCK_CRUSH_MARGIN = 0.45

export type StepEvent = 'flake' | 'crush' | 'ramp' | 'hit' | 'goal' | 'over'
export interface RollerInput { readonly steer: number }
export interface RollerState { z: number, x: number, vx: number, flakes: number, lives: number, iframes: number, air: number, time: number, crushes: number }
export interface StepResult {
  readonly state: RollerState
  readonly events: readonly StepEvent[]
  readonly collected: readonly number[]
  readonly crushed: readonly number[]
  readonly hitIndex: number
  readonly won: boolean
  readonly dead: boolean
}
export interface RunReport {
  readonly won: boolean
  readonly deaths: number
  readonly flakes: number
  readonly crushes: number
  readonly radius: number
  readonly fatal: readonly number[]
}

export function radiusFor(flakes: number): number {
  const safe = Number.isFinite(flakes) ? Math.max(0, flakes) : 0
  return Math.min(MAX_RADIUS, BASE_RADIUS + RADIUS_GAIN * Math.log1p(safe / FLAKE_DIV))
}

export function flakesFor(radius: number): number {
  const safe = Number.isFinite(radius) ? Math.min(MAX_RADIUS, Math.max(BASE_RADIUS, radius)) : BASE_RADIUS
  return FLAKE_DIV * (Math.exp((safe - BASE_RADIUS) / RADIUS_GAIN) - 1)
}

export function speedAt(baseSpeed: number, accel: number, time: number): number {
  const base = Number.isFinite(baseSpeed) ? Math.max(0, baseSpeed) : 0
  const gain = Number.isFinite(accel) ? Math.max(0, accel) : 0
  const t = Number.isFinite(time) ? Math.max(0, time) : 0
  return Math.min(base * SPEED_CAP, base + gain * t)
}

export function trackLimit(radius: number): number {
  return TRACK_HALF - Math.min(Math.max(0, radius), TRACK_HALF)
}

export function canCrush(radius: number, obstacle: Obstacle): boolean {
  return Number.isFinite(obstacle.crushAt) && radius + 1e-9 >= obstacle.crushAt
}

export function overlapsObstacle(z: number, x: number, radius: number, obstacle: Obstacle): boolean {
  const dz = obstacle.z - z
  const dx = obstacle.x - x
  const span = radius + obstacle.half
  return dz * dz + dx * dx <= span * span
}

export function courseScore(z: number, flakes: number, crushes: number): number {
  const meters = Math.floor(Math.max(0, Number.isFinite(z) ? z : 0) / STEP_METERS) * STEP_SCORE
  return Math.min(SCORE_MAX, meters + Math.max(0, flakes) * FLAKE_SCORE + Math.max(0, crushes) * CRUSH_SCORE)
}

export function createRollerState(): RollerState {
  return { z: 0, x: 0, vx: 0, flakes: 0, lives: START_LIVES, iframes: 0, air: 0, time: 0, crushes: 0 }
}

function firstAt(items: readonly { z: number }[], z: number): number {
  let lo = 0
  let hi = items.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (items[mid].z < z) lo = mid + 1
    else hi = mid
  }
  return lo
}

export function advance(prev: RollerState, input: RollerInput, course: Course, taken: ReadonlySet<number>, broken: ReadonlySet<number>, dt = DT): StepResult {
  const events: StepEvent[] = []
  const frozen = { ...prev }
  const wonNow = frozen.z >= course.quota || radiusFor(frozen.flakes) >= course.targetRadius
  if (!Number.isFinite(dt) || dt <= 0) return { state: frozen, events, collected: [], crushed: [], hitIndex: -1, won: wonNow, dead: frozen.lives <= 0 }
  const step = Math.min(0.08, dt)
  frozen.time += step
  const radius = radiusFor(frozen.flakes)
  const steer = Number.isFinite(input.steer) ? Math.max(-1, Math.min(1, input.steer)) : 0
  frozen.vx += steer * STEER_ACCEL * step
  frozen.vx *= Math.max(0, 1 - (course.ice ? ICE_GRIP : GRIP) * step)
  frozen.x += frozen.vx * step
  const limit = trackLimit(radius)
  if (frozen.x > limit) {
    frozen.x = limit
    frozen.vx = 0
  } else if (frozen.x < -limit) {
    frozen.x = -limit
    frozen.vx = 0
  }
  if (frozen.iframes > 0) frozen.iframes = Math.max(0, frozen.iframes - step)
  if (frozen.air > 0) frozen.air = Math.max(0, frozen.air - step)
  const prevZ = frozen.z
  frozen.z += speedAt(course.baseSpeed, course.accel, frozen.time) * step
  const airborne = frozen.air > AIR_MIN
  for (const ramp of course.ramps) {
    if (ramp.z > prevZ && ramp.z <= frozen.z && frozen.air <= AIR_MIN && Math.abs(frozen.x - ramp.x) <= ramp.half + radius * 0.5) {
      frozen.air = AIR_TIME
      events.push('ramp')
      break
    }
  }
  const collected: number[] = []
  for (let index = firstAt(course.flakes, frozen.z - FLAKE_WINDOW); index < course.flakes.length; index += 1) {
    const flake = course.flakes[index]
    if (flake.z > frozen.z + FLAKE_WINDOW) break
    if (taken.has(index) || flake.high !== airborne) continue
    if (Math.abs(flake.z - frozen.z) > FLAKE_RADIUS + radius * 0.4) continue
    if (Math.abs(flake.x - frozen.x) > FLAKE_RADIUS + radius * 0.6) continue
    collected.push(index)
    frozen.flakes += 1
    events.push('flake')
  }
  const crushed: number[] = []
  let hitIndex = -1
  if (!airborne) {
    for (let index = firstAt(course.obstacles, frozen.z - HIT_WINDOW); index < course.obstacles.length; index += 1) {
      const obstacle = course.obstacles[index]
      if (obstacle.z > frozen.z + HIT_WINDOW) break
      if (broken.has(index) || !overlapsObstacle(frozen.z, frozen.x, radius, obstacle)) continue
      if (canCrush(radius, obstacle)) {
        crushed.push(index)
        frozen.crushes += 1
        events.push('crush')
        continue
      }
      if (frozen.iframes > 0 || hitIndex >= 0) continue
      hitIndex = index
      frozen.lives -= 1
      frozen.iframes = IFRAMES
      frozen.flakes = Math.floor(frozen.flakes * HIT_SHRINK)
      events.push('hit')
    }
  }
  const won = frozen.z >= course.quota || radiusFor(frozen.flakes) >= course.targetRadius
  if (won) events.push('goal')
  const dead = frozen.lives <= 0
  if (dead) events.push('over')
  return { state: frozen, events, collected, crushed, hitIndex, won, dead }
}

export function autopilotSteer(state: RollerState, course: Course, taken: ReadonlySet<number>, broken: ReadonlySet<number>): number {
  const radius = radiusFor(state.flakes)
  const lookahead = speedAt(course.baseSpeed, course.accel, state.time) * 1.35 + 9
  const airborne = state.air > AIR_MIN
  const limit = trackLimit(radius)
  let best = state.x
  let bestScore = Number.NEGATIVE_INFINITY
  for (let cand = -limit; cand <= limit + 1e-6; cand += 0.5) {
    const cx = Math.min(limit, Math.max(-limit, cand))
    let score = -Math.abs(cx - state.x) * 0.55
    for (let index = firstAt(course.obstacles, state.z - 2); index < course.obstacles.length; index += 1) {
      const obstacle = course.obstacles[index]
      const dz = obstacle.z - state.z
      if (dz > lookahead) break
      if (broken.has(index) || dz < -1.5) continue
      if (Math.abs(cx - obstacle.x) < obstacle.half + radius + 0.22) {
        if (canCrush(radius, obstacle)) score += 7
        else if (!airborne) score -= 90 + 420 * (1 - Math.max(0, dz) / lookahead)
      }
    }
    for (let index = firstAt(course.flakes, state.z - 2); index < course.flakes.length; index += 1) {
      const flake = course.flakes[index]
      const dz = flake.z - state.z
      if (dz > lookahead) break
      if (taken.has(index) || flake.high !== airborne || dz < -1) continue
      if (Math.abs(cx - flake.x) < radius + FLAKE_RADIUS + 0.35) score += 2.4
    }
    if (score > bestScore) {
      bestScore = score
      best = cx
    }
  }
  const delta = best - state.x
  if (Math.abs(delta) < 0.16) return 0
  return delta > 0 ? 1 : -1
}

export function simulateCourse(course: Course): RunReport {
  let state = createRollerState()
  const taken = new Set<number>()
  const broken = new Set<number>()
  const fatal: number[] = []
  const speedFloor = Math.max(6, course.baseSpeed * 0.92)
  const maxFrames = Math.ceil((course.quota / speedFloor + 45) / DT)
  let steer = 0
  for (let frame = 0; frame < maxFrames; frame += 1) {
    if (frame % 12 === 0) steer = autopilotSteer(state, course, taken, broken)
    const result = advance(state, { steer }, course, taken, broken, DT)
    state = result.state
    for (const index of result.collected) taken.add(index)
    for (const index of result.crushed) broken.add(index)
    if (result.hitIndex >= 0 && !fatal.includes(result.hitIndex)) fatal.push(result.hitIndex)
    if (result.won) return { won: true, deaths: START_LIVES - state.lives, flakes: state.flakes, crushes: state.crushes, radius: radiusFor(state.flakes), fatal }
    if (result.dead) return { won: false, deaths: START_LIVES, flakes: state.flakes, crushes: state.crushes, radius: radiusFor(state.flakes), fatal }
  }
  return { won: false, deaths: START_LIVES - state.lives, flakes: state.flakes, crushes: state.crushes, radius: radiusFor(state.flakes), fatal }
}
