export const FIELD = { width: 360, height: 560 }
export const PPM = 4
export const DIVER_PY = 96
export const DIVER_R = 11
export const DIVER_MIN = 26
export const DIVE_SPEED_X = 210
export const SPAWN_BELOW = 128
export const JELLY_RISE = 10
export const JELLY_MAX = 90
export const JELLY_R = 13
export const MINE_R_MIN = 12
export const MINE_R_MAX = 16
export const DRIFT_MAX = 26
export const WALL_MARGIN = 20
export const INVULN_SECONDS = 1.6
export const START_LIVES = 3
export const PEARL_R = 8
export const PEARL_SCORE = 100
export const PEARL_MAX_MULT = 4
export const COMBO_GAP = 24
export const DEPTH_STEP = 10
export const DEPTH_SCORE = 10
export const SCORE_CAP = 10000
export const CULL_ABOVE = 26
export const FIXED_SLICE = 1 / 240
export const MAX_FRAME = 0.05

export type HazardKind = 'mine' | 'jelly'
export type GameStatus = 'playing' | 'cleared' | 'over'
export type StepEvent = 'hit' | 'pearl' | 'current' | 'clear' | 'over'
export interface Hazard { id: number; at: number; x: number; enter: number; r: number; drift: number; kind: HazardKind }
export interface Pearl { id: number; at: number; x: number; enter: number; trail: number }
export interface CurrentZone { from: number; to: number; vx: number }
export interface DivePlan {
  quota: number
  base: number
  boost: number
  combo: boolean
  zones: CurrentZone[]
  hazards: Hazard[]
  pearls: Pearl[]
}
export interface ActiveHazard { id: number; x: number; y: number; r: number; vx: number; kind: HazardKind }
export interface ActivePearl { id: number; x: number; y: number }
export interface InputState { left: boolean; right: boolean; down: boolean }
export interface GameState {
  time: number
  depth: number
  quota: number
  base: number
  boost: number
  combo: boolean
  x: number
  lives: number
  invuln: number
  hazards: ActiveHazard[]
  pearls: ActivePearl[]
  queue: Hazard[]
  pearlQueue: Pearl[]
  zones: CurrentZone[]
  zoneIndex: number
  cursor: number
  pearlCursor: number
  pearlsGot: number
  chain: number
  lastPearlDepth: number
  pearlScore: number
  score: number
  status: GameStatus
  events: StepEvent[]
}

// 洋流只推潜水员：按深度查当前区段返回水平速度（px/s），区段外为 0。
export function currentAt(zones: CurrentZone[], depth: number): number {
  for (const zone of zones) {
    if (depth >= zone.from && depth < zone.to) return zone.vx
  }
  return 0
}

export const comboMultiplier = (chain: number) => Math.min(PEARL_MAX_MULT, 1 + Math.floor(chain / 3))

export function speedScore(state: Pick<GameState, 'depth' | 'pearlScore'>): number {
  return Math.min(SCORE_CAP, Math.floor((state.depth + 1e-4) / DEPTH_STEP) * DEPTH_SCORE + state.pearlScore)
}

// 静止水雷的到达深度与下潜速度无关；水母上浮，到达深度随速度剖面收缩。
export function jellyArrivalSpan(at: number, enter: number, base: number, boost: number) {
  const slow = at + (enter * base) / (base + JELLY_RISE)
  const quick = at + (enter * (base + boost)) / (base + boost + JELLY_RISE)
  return { from: Math.min(slow, quick), to: Math.max(slow, quick) }
}

export function createGameState(plan: DivePlan): GameState {
  return {
    time: 0, depth: 0, quota: plan.quota, base: plan.base, boost: plan.boost, combo: plan.combo,
    x: FIELD.width / 2, lives: START_LIVES, invuln: 0, hazards: [], pearls: [],
    queue: plan.hazards, pearlQueue: plan.pearls, zones: plan.zones, zoneIndex: -1,
    cursor: 0, pearlCursor: 0, pearlsGot: 0, chain: 0, lastPearlDepth: -Infinity,
    pearlScore: 0, score: 0, status: 'playing', events: [],
  }
}

function advance(state: GameState, input: InputState, dt: number): GameState {
  const events: StepEvent[] = []
  const speed = state.base + (input.down ? state.boost : 0)
  const time = state.time + dt
  const depth = state.depth + speed * dt
  const zoneIndex = state.zones.findIndex((zone) => depth >= zone.from && depth < zone.to)
  if (zoneIndex >= 0 && zoneIndex !== state.zoneIndex) events.push('current')
  const current = zoneIndex >= 0 ? state.zones[zoneIndex].vx : 0
  const steer = (input.right ? 1 : 0) - (input.left ? 1 : 0)
  const x = Math.min(FIELD.width - DIVER_MIN, Math.max(DIVER_MIN, state.x + (steer * DIVE_SPEED_X + current) * dt))
  let invuln = Math.max(0, state.invuln - dt)
  const spawned: ActiveHazard[] = []
  let cursor = state.cursor
  while (cursor < state.queue.length && state.queue[cursor].at <= depth) {
    const spawn = state.queue[cursor]
    cursor += 1
    spawned.push({ id: spawn.id, x: spawn.x, y: spawn.enter, r: spawn.r, vx: spawn.drift, kind: spawn.kind })
  }
  let lives = state.lives
  const hazards: ActiveHazard[] = []
  for (const hazard of [...state.hazards, ...spawned]) {
    const rise = hazard.kind === 'jelly' ? JELLY_RISE : 0
    const y = hazard.y - (speed + rise) * dt
    let vx = hazard.kind === 'jelly'
      ? Math.max(-JELLY_MAX, Math.min(JELLY_MAX, hazard.vx + Math.sign(x - hazard.x) * JELLY_MAX * 1.4 * dt))
      : hazard.vx
    let hx = hazard.x + vx * dt
    if (hx < WALL_MARGIN) {
      hx = WALL_MARGIN
      vx = Math.abs(vx)
    } else if (hx > FIELD.width - WALL_MARGIN) {
      hx = FIELD.width - WALL_MARGIN
      vx = -Math.abs(vx)
    }
    if (y < -CULL_ABOVE) continue
    if (invuln <= 0 && Math.hypot(hx - x, y * PPM) < DIVER_R + hazard.r) {
      events.push('hit')
      lives -= 1
      invuln = INVULN_SECONDS
      continue
    }
    hazards.push({ ...hazard, x: hx, y, vx })
  }
  const spawnedPearls: ActivePearl[] = []
  let pearlCursor = state.pearlCursor
  while (pearlCursor < state.pearlQueue.length && state.pearlQueue[pearlCursor].at <= depth) {
    const spawn = state.pearlQueue[pearlCursor]
    pearlCursor += 1
    spawnedPearls.push({ id: spawn.id, x: spawn.x, y: spawn.enter })
  }
  let pearlsGot = state.pearlsGot
  let chain = state.chain
  let lastPearlDepth = state.lastPearlDepth
  let pearlScore = state.pearlScore
  const pearls: ActivePearl[] = []
  for (const pearl of [...state.pearls, ...spawnedPearls]) {
    const y = pearl.y - speed * dt
    if (y < -CULL_ABOVE) continue
    if (Math.hypot(pearl.x - x, y * PPM) < DIVER_R + PEARL_R + 2) {
      pearlsGot += 1
      chain = depth - lastPearlDepth <= COMBO_GAP ? chain + 1 : 1
      lastPearlDepth = depth
      pearlScore = Math.min(SCORE_CAP, pearlScore + PEARL_SCORE * (state.combo ? comboMultiplier(chain) : 1))
      events.push('pearl')
      continue
    }
    pearls.push({ ...pearl, y })
  }
  const score = speedScore({ depth, pearlScore })
  let status = state.status
  if (depth >= state.quota) {
    status = 'cleared'
    events.push('clear')
  } else if (lives <= 0) {
    status = 'over'
    events.push('over')
  }
  return {
    ...state, time, depth, x, lives, invuln, hazards, pearls, cursor, pearlCursor,
    pearlsGot, chain, lastPearlDepth, pearlScore, score, status, events, zoneIndex,
  }
}

export function step(state: GameState, input: InputState, rawDt: number): GameState {
  if (state.status !== 'playing') return state
  const dt = Number.isFinite(rawDt) ? Math.min(MAX_FRAME, Math.max(0, rawDt)) : 0
  if (dt <= 0) return state
  const slices = Math.max(1, Math.ceil(dt / FIXED_SLICE))
  const slice = dt / slices
  let current = state
  const events: StepEvent[] = []
  for (let index = 0; index < slices; index += 1) {
    current = advance(current, input, slice)
    if (current.events.length) events.push(...current.events)
    if (current.status !== 'playing') break
  }
  return events.length ? { ...current, events } : current
}
