import type { AnchorSpec, ZipLevel } from './levels'

export const WORLD = { width: 170, height: 120, ground: 112, startX: 14 } as const
export const GRAVITY = 150
export const FIXED_SLICE = 1 / 240
export const RELEASE_ANGLE = Math.PI / 6
export const ATTACH_FACTOR = 0.96
export const THETA_MAX = 1.3
export const START_LIVES = 3
export const METERS_PER_UNIT = 2
export const METER_STEP = 10
export const GOLD_BONUS = 200
export const SCORE_CAP = 10000

export type ZipPhase = 'swing' | 'fly'
export type ZipStatus = 'run' | 'completed' | 'failed'
export type ZipAction = 'none' | 'toggle'

export interface ZipPoint {
  x: number
  y: number
}

export interface ZipState {
  time: number
  phase: ZipPhase
  anchor: number
  theta: number
  omega: number
  x: number
  y: number
  vx: number
  vy: number
  progress: number
  golds: number
  lives: number
  status: ZipStatus
}

export const attachRadius = (spec: ZipLevel) => spec.rope * ATTACH_FACTOR
export const quotaUnits = (spec: ZipLevel) => spec.meters / METERS_PER_UNIT
export const metersOf = (progress: number) => progress * METERS_PER_UNIT
export const scoreFor = (progress: number, golds: number) =>
  Math.min(SCORE_CAP, Math.max(0, Math.floor(metersOf(progress) / METER_STEP) * METER_STEP + golds * GOLD_BONUS))

export function pivotOf(anchor: AnchorSpec, time: number): ZipPoint {
  const wave = anchor.amp === 0 ? 0 : anchor.amp * Math.sin((Math.PI * 2 * time) / anchor.period + anchor.phase)
  return { x: anchor.x, y: anchor.baseY + wave }
}

export function releaseVelocity(theta: number, omega: number, rope: number): ZipPoint {
  return { x: rope * omega * Math.cos(theta), y: -rope * omega * Math.sin(theta) }
}

export function hang(spec: ZipLevel, anchor: AnchorSpec, time: number): ZipState {
  const theta = -spec.swingStart
  const pivot = pivotOf(anchor, time)
  return {
    time,
    phase: 'swing',
    anchor: anchor.index,
    theta,
    omega: 0,
    x: pivot.x + spec.rope * Math.sin(theta),
    y: pivot.y + spec.rope * Math.cos(theta),
    vx: 0,
    vy: 0,
    progress: 0,
    golds: 0,
    lives: START_LIVES,
    status: 'run',
  }
}

export function createRun(spec: ZipLevel, anchors: readonly AnchorSpec[]): ZipState {
  return hang(spec, anchors[0], 0)
}

export function toggle(state: ZipState, spec: ZipLevel, anchors: readonly AnchorSpec[]): ZipState {
  if (state.status !== 'run') return state
  if (state.phase === 'swing') {
    const velocity = releaseVelocity(state.theta, state.omega, spec.rope)
    return { ...state, phase: 'fly', vx: velocity.x, vy: velocity.y }
  }
  const target = anchors[state.anchor + 1]
  if (!target) return state
  const pivot = pivotOf(target, state.time)
  if (Math.hypot(state.x - pivot.x, state.y - pivot.y) > attachRadius(spec)) return state
  const next = hang(spec, target, state.time)
  return { ...next, progress: state.progress, golds: state.golds + (target.gold ? 1 : 0), lives: state.lives }
}

function withProgress(state: ZipState, spec: ZipLevel): ZipState {
  const progress = Math.max(state.progress, state.x)
  const status: ZipStatus = progress >= quotaUnits(spec) ? 'completed' : state.status
  return progress === state.progress && status === state.status ? state : { ...state, progress, status }
}

function crash(state: ZipState, spec: ZipLevel, anchors: readonly AnchorSpec[], time: number): ZipState {
  const lives = state.lives - 1
  if (lives <= 0) return { ...state, time, y: WORLD.ground, vy: 0, lives: 0, status: 'failed' }
  const next = hang(spec, anchors[state.anchor], time)
  return { ...next, progress: state.progress, golds: state.golds, lives }
}

function advance(state: ZipState, spec: ZipLevel, anchors: readonly AnchorSpec[], dt: number): ZipState {
  const time = state.time + dt
  if (state.phase === 'swing') {
    const pivot = pivotOf(anchors[state.anchor], time)
    const rawOmega = state.omega - ((GRAVITY / spec.rope) * Math.sin(state.theta) * dt)
    const rawTheta = state.theta + rawOmega * dt
    const bounded = rawTheta > THETA_MAX || rawTheta < -THETA_MAX
    const theta = bounded ? Math.min(THETA_MAX, Math.max(-THETA_MAX, rawTheta)) : rawTheta
    const omega = bounded ? 0 : rawOmega
    return withProgress(
      { ...state, time, theta, omega, x: pivot.x + spec.rope * Math.sin(theta), y: pivot.y + spec.rope * Math.cos(theta) },
      spec,
    )
  }
  const vy = state.vy + GRAVITY * dt
  const x = state.x + state.vx * dt
  const y = state.y + vy * dt
  if (y > WORLD.ground) return crash(state, spec, anchors, time)
  return withProgress({ ...state, time, vy, x, y }, spec)
}

export function step(state: ZipState, spec: ZipLevel, anchors: readonly AnchorSpec[], rawDt: number, action: ZipAction): ZipState {
  if (state.status !== 'run' || !Number.isFinite(rawDt) || rawDt <= 0) return state
  let next = action === 'toggle' ? toggle(state, spec, anchors) : state
  const slices = Math.max(1, Math.min(48, Math.ceil(rawDt / FIXED_SLICE)))
  const dt = rawDt / slices
  for (let index = 0; index < slices && next.status === 'run'; index += 1) next = advance(next, spec, anchors, dt)
  return next
}

export function autoAction(state: ZipState, spec: ZipLevel, anchors: readonly AnchorSpec[]): ZipAction {
  if (state.status !== 'run') return 'none'
  if (state.phase === 'swing') return state.theta >= RELEASE_ANGLE && state.omega > 0 ? 'toggle' : 'none'
  const target = anchors[state.anchor + 1]
  if (!target) return 'none'
  const pivot = pivotOf(target, state.time)
  return Math.hypot(state.x - pivot.x, state.y - pivot.y) <= attachRadius(spec) ? 'toggle' : 'none'
}

export function drive(
  state: ZipState,
  spec: ZipLevel,
  anchors: readonly AnchorSpec[],
  limitSeconds: number,
  until?: (current: ZipState) => boolean,
): ZipState {
  let current = state
  const total = Math.ceil(limitSeconds * 120)
  for (let index = 0; index < total; index += 1) {
    if (current.status !== 'run') return current
    current = step(current, spec, anchors, 1 / 120, autoAction(current, spec, anchors))
    if (until && until(current)) return current
  }
  return current
}
