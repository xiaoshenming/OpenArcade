import type { SiegeCourse, SiegeTarget, Wall } from './levels'

export const FIELD = { width: 120, height: 68 }
export const GRAVITY = 20
export const BASE_X = 6
export const MUZZLE = 1.6
export const AIM_MIN = 10
export const AIM_MAX = 80
export const V_MIN = 24
export const V_MAX = 62
export const CHARGE_S = 1.1
export const SHELL_R = 0.5
export const TARGET_R = 1.9
export const SHOT_DT = 1 / 120
export const STEP_MAX = 0.05
export const MAX_FLIGHT = 14
export const HIT_SCORE = 200
export const AMMO_SCORE = 50
export const SCORE_MAX = 10000
export const SOLVE_AIMS = [0.08, 0.18, 0.28, 0.38, 0.5, 0.62, 0.74, 0.86, 0.95]
export const SOLVE_POWERS = [0.25, 0.34, 0.43, 0.52, 0.61, 0.7, 0.79, 0.88, 0.97]

export type ShotOutcome = 'hit' | 'wall' | 'ground' | 'lost'
export type SiegeEvent = 'fire' | 'crack' | 'hit' | 'wall' | 'ground' | 'lost' | 'clear' | 'deplete'
export type OverKind = 'completed' | 'failed' | null

export interface Point { readonly x: number, readonly y: number }
export interface Shell { readonly angle: number, readonly power: number, readonly t0: number }
export interface ShotReport { readonly outcome: ShotOutcome, readonly hits: readonly number[], readonly flight: number }

export interface SiegeState {
  time: number
  aim: number
  charging: boolean
  charge: number
  ammo: number
  combo: number
  score: number
  destroyed: readonly boolean[]
  cracked: readonly boolean[]
  shot: { readonly shell: Shell, readonly report: ShotReport } | null
  over: OverKind
}

export function clamp01(value: number) {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0
}

export function aimRad(aim: number) {
  return ((AIM_MIN + clamp01(aim) * (AIM_MAX - AIM_MIN)) * Math.PI) / 180
}

export function aimDeg(aim: number) {
  return AIM_MIN + clamp01(aim) * (AIM_MAX - AIM_MIN)
}

export function shotPower(charge: number) {
  return 0.25 + clamp01(charge) * 0.75
}

export function muzzleSpeed(power: number) {
  return V_MIN + power * (V_MAX - V_MIN)
}

export function shellAt(t: number, angle: number, power: number, wind: number): Point {
  const speed = muzzleSpeed(power)
  const vx = Math.cos(angle) * speed
  const vy = Math.sin(angle) * speed
  return { x: BASE_X + vx * t + 0.5 * wind * t * t, y: MUZZLE + vy * t - 0.5 * GRAVITY * t * t }
}

export function rangeOf(angle: number, power: number, wind: number) {
  const speed = muzzleSpeed(power)
  const vx = Math.cos(angle) * speed
  const vy = Math.sin(angle) * speed
  const disc = vy * vy + 2 * GRAVITY * MUZZLE
  const flight = (vy + Math.sqrt(disc)) / GRAVITY
  return { flight, x: BASE_X + vx * flight + 0.5 * wind * flight * flight }
}

export function apexOf(angle: number, power: number) {
  const vy = Math.sin(angle) * muzzleSpeed(power)
  return MUZZLE + (vy * vy) / (2 * GRAVITY)
}

export function targetX(target: SiegeTarget, time: number) {
  if (target.amp <= 0 || target.period <= 0) return target.baseX
  return target.baseX + Math.sin((time / target.period) * Math.PI * 2 + target.phase) * target.amp
}

function insideWall(point: Point, wall: Wall) {
  return point.x + SHELL_R > wall.x && point.x - SHELL_R < wall.x + wall.width && point.y - SHELL_R < wall.height
}

export function traceShot(course: SiegeCourse, angle: number, power: number, t0 = 0, destroyed?: readonly boolean[]): ShotReport {
  const hits: number[] = []
  for (let t = SHOT_DT; t <= MAX_FLIGHT; t += SHOT_DT) {
    const point = shellAt(t, angle, power, course.wind)
    if (point.y <= 0) return { outcome: 'ground', hits, flight: t }
    if (point.x >= FIELD.width + 2) return { outcome: 'lost', hits, flight: t }
    for (const wall of course.walls) {
      if (insideWall(point, wall)) return { outcome: 'wall', hits, flight: t }
    }
    for (let index = 0; index < course.targets.length; index += 1) {
      if (hits.includes(index) || destroyed?.[index]) continue
      const target = course.targets[index]
      const dx = point.x - targetX(target, t + t0)
      const dy = point.y - target.y
      if (dx * dx + dy * dy <= (TARGET_R + SHELL_R) ** 2) hits.push(index)
    }
    if (hits.length) return { outcome: 'hit', hits, flight: t }
  }
  return { outcome: 'lost', hits, flight: MAX_FLIGHT }
}

export function hasSolution(course: SiegeCourse, index: number) {
  for (const aim of SOLVE_AIMS) {
    for (const power of SOLVE_POWERS) {
      const report = traceShot(course, aimRad(aim), power)
      if (report.outcome === 'hit' && report.hits[0] === index) return true
    }
  }
  return false
}

export function createSiegeState(course: SiegeCourse): SiegeState {
  return {
    time: 0, aim: 0.62, charging: false, charge: 0, ammo: course.ammo, combo: 0, score: 0,
    destroyed: course.targets.map(() => false),
    cracked: course.targets.map(() => false),
    shot: null, over: null,
  }
}

export function setAim(state: SiegeState, aim: number): SiegeState {
  const next = clamp01(aim)
  return state.aim === next ? state : { ...state, aim: next }
}

export function beginCharge(state: SiegeState): SiegeState {
  if (state.over || state.charging || state.shot || state.ammo <= 0) return state
  return { ...state, charging: true, charge: 0 }
}

export function holdCharge(state: SiegeState, dt: number): SiegeState {
  if (!state.charging || state.charge >= 1) return state
  return { ...state, charge: Math.min(1, state.charge + Math.max(0, dt) / CHARGE_S) }
}

export function release(state: SiegeState, course: SiegeCourse): { state: SiegeState, event: SiegeEvent | null } {
  if (!state.charging) return { state, event: null }
  const power = shotPower(state.charge)
  const shell: Shell = { angle: aimRad(state.aim), power, t0: state.time }
  // 已摧毁目标是残骸:不挡弹,弹丸直接穿过继续飞行
  const report = traceShot(course, shell.angle, power, state.time, state.destroyed)
  return { state: { ...state, charging: false, charge: 0, ammo: state.ammo - 1, shot: { shell, report } }, event: 'fire' }
}

export function applyShot(state: SiegeState, course: SiegeCourse): { state: SiegeState, events: readonly SiegeEvent[] } {
  const shot = state.shot
  if (!shot) return { state, events: [] }
  const events: SiegeEvent[] = []
  const { ammo } = state
  let { combo, score } = state
  const destroyed = [...state.destroyed]
  const cracked = [...state.cracked]
  if (shot.report.outcome === 'hit') {
    for (const index of shot.report.hits) {
      if (course.targets[index].helmet && !cracked[index]) {
        cracked[index] = true
        events.push('crack')
      } else if (!destroyed[index]) {
        destroyed[index] = true
        combo += 1
        score = Math.min(SCORE_MAX, score + HIT_SCORE * combo)
        events.push('hit')
      }
    }
  } else {
    combo = 0
    events.push(shot.report.outcome)
  }
  let over = state.over
  if (destroyed.every((done) => done)) {
    score = Math.min(SCORE_MAX, score + Math.max(0, ammo) * AMMO_SCORE)
    over = 'completed'
    events.push('clear')
  } else if (ammo <= 0) {
    over = 'failed'
    events.push('deplete')
  }
  return { state: { ...state, ammo, combo, score, destroyed, cracked, shot: null, over }, events }
}

export function stepSiege(prev: SiegeState, course: SiegeCourse, rawDt: number): { state: SiegeState, events: readonly SiegeEvent[] } {
  if (prev.over) return { state: prev, events: [] }
  const dt = Number.isFinite(rawDt) ? Math.min(STEP_MAX, Math.max(0, rawDt)) : 0
  if (dt <= 0) return { state: prev, events: [] }
  const state = holdCharge({ ...prev, time: prev.time + dt }, dt)
  if (state.shot && state.time - state.shot.shell.t0 >= state.shot.report.flight) {
    return applyShot(state, course)
  }
  if (!state.shot && !state.charging && state.ammo <= 0) {
    return { state: { ...state, over: 'failed' }, events: ['deplete'] }
  }
  return { state, events: [] }}
