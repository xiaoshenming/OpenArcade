export const FIELD = { width: 480, height: 640 }
export const BALLOON_RADIUS = 34
export const SPIKE_RADIUS = 26
export const CHAIN_GAP = 52
export const HIT_SCORE = 100
export const CHAIN_BONUS = 200
export const WRONG_PENALTY = 50
export const SCORE_CAP = 10000
export const MAX_STEP = 0.05

export const COLORS = ['red', 'gold', 'teal', 'violet'] as const
export type BalloonColor = (typeof COLORS)[number]
export type ThingKind = 'balloon' | 'spike'
export type GameStatus = 'playing' | 'cleared' | 'over'
export type PopEvent = 'pop' | 'wrong' | 'chain' | 'spike' | 'empty'

export interface Spawn { id: number; t: number; x: number; speed: number; kind: ThingKind; color: BalloonColor; chain: number }
export interface BalloonPlan { duration: number; quota: number; target: BalloonColor; lives: number; windAmp: number; windFreq: number; queue: Spawn[] }
export interface BalloonState {
  time: number
  duration: number
  quota: number
  target: BalloonColor
  windAmp: number
  windFreq: number
  queue: Spawn[]
  popped: number[]
  escaped: number[]
  lostChains: number[]
  doneChains: number[]
  score: number
  hits: number
  misses: number
  lives: number
  status: GameStatus
}

export function radiusOf(spawn: Spawn): number {
  return spawn.kind === 'spike' ? SPIKE_RADIUS : BALLOON_RADIUS
}

export function positionOf(spawn: Spawn, time: number, windAmp: number, windFreq: number): { x: number; y: number } {
  const age = Math.max(0, time - spawn.t)
  const drift = spawn.kind === 'balloon' && windAmp > 0 ? windAmp * Math.sin(windFreq * age) : 0
  return { x: spawn.x + drift, y: FIELD.height + radiusOf(spawn) - spawn.speed * age }
}

export function escapeAt(spawn: Spawn): number {
  return spawn.t + (FIELD.height + radiusOf(spawn) * 2) / spawn.speed
}

export function createBalloonState(plan: BalloonPlan): BalloonState {
  return {
    time: 0, duration: plan.duration, quota: plan.quota, target: plan.target, windAmp: plan.windAmp,
    windFreq: plan.windFreq, queue: plan.queue, popped: [], escaped: [], lostChains: [], doneChains: [],
    score: 0, hits: 0, misses: 0, lives: plan.lives, status: 'playing',
  }
}

export function popAt(state: BalloonState, x: number, y: number): { state: BalloonState; event: PopEvent; gained: number; id: number | null } {
  if (state.status !== 'playing') return { state, event: 'empty', gained: 0, id: null }
  let best: Spawn | null = null
  let bestDist = Infinity
  for (const spawn of state.queue) {
    if (state.popped.includes(spawn.id) || state.escaped.includes(spawn.id)) continue
    const pos = positionOf(spawn, state.time, state.windAmp, state.windFreq)
    if (pos.y <= -radiusOf(spawn)) continue
    const dist = Math.hypot(pos.x - x, pos.y - y)
    if (dist <= radiusOf(spawn) && dist < bestDist) {
      best = spawn
      bestDist = dist
    }
  }
  if (!best) return { state, event: 'empty', gained: 0, id: null }
  const popped = [...state.popped, best.id]
  if (best.kind === 'spike') {
    const lives = state.lives - 1
    return { state: { ...state, popped, lives, status: lives <= 0 ? 'over' : state.status }, event: 'spike', gained: 0, id: best.id }
  }
  if (best.color !== state.target) {
    const score = Math.max(0, state.score - WRONG_PENALTY)
    return { state: { ...state, popped, score }, event: 'wrong', gained: -WRONG_PENALTY, id: best.id }
  }
  const doneChains = [...state.doneChains]
  const poppedIds = [best.id]
  if (best.chain >= 0 && !state.lostChains.includes(best.chain) && !doneChains.includes(best.chain)) {
    for (const member of state.queue) {
      if (member.chain === best.chain && !poppedIds.includes(member.id)) poppedIds.push(member.id)
    }
  }
  const hits = state.hits + poppedIds.length
  let gained = HIT_SCORE * poppedIds.length
  let event: PopEvent = 'pop'
  if (poppedIds.length > 1) {
    gained += CHAIN_BONUS
    doneChains.push(best.chain)
    event = 'chain'
  }
  for (const id of poppedIds) if (!popped.includes(id)) popped.push(id)
  const score = Math.min(SCORE_CAP, state.score + gained)
  return {
    state: { ...state, popped, score, hits, doneChains, status: hits >= state.quota ? 'cleared' : state.status },
    event,
    gained,
    id: best.id,
  }
}

export function step(state: BalloonState, rawDt: number): BalloonState {
  if (state.status !== 'playing') return state
  const dt = Number.isFinite(rawDt) ? Math.min(MAX_STEP, Math.max(0, rawDt)) : 0
  if (dt <= 0) return state
  const time = state.time + dt
  const escaped = [...state.escaped]
  const lostChains = [...state.lostChains]
  let misses = state.misses
  let lives = state.lives
  for (const spawn of state.queue) {
    if (escaped.includes(spawn.id) || state.popped.includes(spawn.id) || escapeAt(spawn) > time) continue
    escaped.push(spawn.id)
    if (spawn.kind !== 'balloon' || spawn.color !== state.target) continue
    misses += 1
    lives = Math.max(0, lives - 1)
    if (spawn.chain >= 0 && !lostChains.includes(spawn.chain)) lostChains.push(spawn.chain)
  }
  const status: GameStatus = lives <= 0 || (time >= state.duration && state.hits < state.quota) ? 'over' : state.status
  return { ...state, time, escaped, misses, lives, lostChains, status }
}
