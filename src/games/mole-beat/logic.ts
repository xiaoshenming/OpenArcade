export const HOLES = 9
export const HIT_SCORE = 100
export const GOLD_SCORE = 300
export const BOMB_PENALTY = 100
export const STUN_SECONDS = 0.5
export const COMBO_CAP = 2
export const COMBO_STEP = 0.25
export const SCORE_CAP = 10000
export const MIN_STAY = 0.38
export const MAX_STEP = 0.05

export type MoleKind = 'normal' | 'bomb' | 'gold'
export type GameStatus = 'playing' | 'cleared' | 'over'
export type WhackEvent = 'hit' | 'gold' | 'bomb' | 'empty' | 'stun'

export interface MoleSpawn { id: number; t: number; hole: number; stay: number; kind: MoleKind }
export interface MolePlan { duration: number; quota: number; combo: boolean; queue: MoleSpawn[]; comboWindow?: number }
export interface MoleState {
  time: number
  duration: number
  quota: number
  comboRule: boolean
  comboWindow: number
  queue: MoleSpawn[]
  whacked: number[]
  escaped: number[]
  score: number
  hits: number
  misses: number
  streak: number
  lastHit: number
  stun: number
  status: GameStatus
}

export function multiplierOf(streak: number, comboRule: boolean): number {
  return comboRule ? Math.min(COMBO_CAP, 1 + COMBO_STEP * Math.max(0, Math.floor(streak))) : 1
}

export function isUp(spawn: MoleSpawn, time: number): boolean {
  return spawn.t <= time && time < spawn.t + spawn.stay
}

export function createMoleState(plan: MolePlan): MoleState {
  return {
    time: 0, duration: plan.duration, quota: plan.quota, comboRule: plan.combo, comboWindow: plan.comboWindow ?? 0, queue: plan.queue,
    whacked: [], escaped: [], score: 0, hits: 0, misses: 0, streak: 0, lastHit: -999, stun: 0, status: 'playing',
  }
}

export function whack(state: MoleState, hole: number): { state: MoleState; event: WhackEvent; gained: number } {
  if (state.status !== 'playing') return { state, event: 'empty', gained: 0 }
  if (state.stun > 0) return { state, event: 'stun', gained: 0 }
  const target = state.queue.find((spawn) => spawn.hole === hole && isUp(spawn, state.time) && !state.whacked.includes(spawn.id))
  if (!target) return { state, event: 'empty', gained: 0 }
  const whacked = [...state.whacked, target.id]
  if (target.kind === 'bomb') {
    const score = Math.max(0, state.score - BOMB_PENALTY)
    return { state: { ...state, whacked, score, streak: 0, stun: STUN_SECONDS }, event: 'bomb', gained: -BOMB_PENALTY }
  }
  const gained = Math.round((target.kind === 'gold' ? GOLD_SCORE : HIT_SCORE) * multiplierOf(state.streak, state.comboRule))
  const hits = state.hits + 1
  return {
    state: { ...state, whacked, score: Math.min(SCORE_CAP, state.score + gained), hits, streak: state.streak + 1, lastHit: state.time, status: hits >= state.quota ? 'cleared' : state.status },
    event: target.kind === 'gold' ? 'gold' : 'hit',
    gained,
  }
}

export function step(state: MoleState, rawDt: number): MoleState {
  if (state.status !== 'playing') return state
  const dt = Number.isFinite(rawDt) ? Math.min(MAX_STEP, Math.max(0, rawDt)) : 0
  if (dt <= 0) return state
  const time = state.time + dt
  const escaped = [...state.escaped]
  let misses = state.misses
  let streak = state.streak
  for (const spawn of state.queue) {
    if (spawn.kind === 'bomb' || spawn.t + spawn.stay > time) continue
    if (state.whacked.includes(spawn.id) || escaped.includes(spawn.id)) continue
    escaped.push(spawn.id)
    misses += 1
    streak = 0
  }
  if (state.comboRule && state.comboWindow > 0 && streak > 0 && time - state.lastHit > state.comboWindow) streak = 0
  const status: GameStatus = time >= state.duration && state.hits < state.quota ? 'over' : state.status
  return { ...state, time, escaped, misses, streak, stun: Math.max(0, state.stun - dt), status }
}
