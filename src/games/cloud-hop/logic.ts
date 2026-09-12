import type { GateSpec, HopLevel, WindSpec } from './levels'

export const WORLD = { width: 160, height: 100, ground: 92, birdX: 46, birdRadius: 2.6, minX: 34, maxX: 58 } as const
export const GATE_WIDTH = 9
export const GRAVITY = 56
export const FLAP_VY = -21
export const MAX_FALL = 46
export const CENTER_TOL = 2.6
export const COIN_RADIUS = 4.4
export const GATE_SCORE = 100
export const CENTER_BONUS = 50
export const COIN_BONUS = 150
export const SCORE_CAP = 10000
export const WIND_WARN_LEAD = 1.2
export const WIND_RELAX = 5

export type HopStatus = 'flying' | 'completed' | 'failed'

export interface Bird {
  x: number
  y: number
  vy: number
}

export interface GateLive {
  scored: boolean
  passed: boolean
  coinTaken: boolean
}

export interface WorldState {
  time: number
  scroll: number
  bird: Bird
  gates: GateLive[]
  passed: number
  score: number
  coins: number
  status: HopStatus
}

export function createWorld(gates: readonly GateSpec[]): WorldState {
  return {
    time: 0, scroll: 0, bird: { x: WORLD.birdX, y: 50, vy: 0 },
    gates: gates.map(() => ({ scored: false, passed: false, coinTaken: false })),
    passed: 0, score: 0, coins: 0, status: 'flying',
  }
}

export function gateCenter(gate: GateSpec, time: number, gap: number) {
  const wave = gate.amp * Math.sin((Math.PI * 2 * time) / gate.period + gate.phase)
  const half = gap / 2 + 1
  return Math.min(WORLD.ground - half, Math.max(half, gate.base + wave))
}

const gustClock = (wind: WindSpec, time: number) => (((time + wind.phase) % wind.period) + wind.period) % wind.period

export function windForce(wind: WindSpec, time: number) {
  const clock = gustClock(wind, time)
  if (clock >= wind.duration) return 0
  const ramp = Math.min(1, clock / 0.4, (wind.duration - clock) / 0.4)
  const cycle = Math.floor((time + wind.phase) / wind.period)
  const direction = (cycle % 2 === 0 ? 1 : -1) * wind.direction
  return direction * wind.force * ramp
}

export function windWarning(wind: WindSpec, time: number) {
  const clock = gustClock(wind, time)
  return clock >= wind.duration && wind.period - clock <= WIND_WARN_LEAD
}

export function step(state: WorldState, spec: HopLevel, gates: readonly GateSpec[], wind: WindSpec | undefined, dt: number, flap: boolean): WorldState {
  if (state.status !== 'flying' || !Number.isFinite(dt) || dt <= 0) return state
  const delta = Math.min(dt, 0.06)
  const time = state.time + delta
  const scroll = state.scroll + spec.speed * delta
  const bird = { ...state.bird }
  bird.vy = Math.min(MAX_FALL, bird.vy + GRAVITY * delta)
  bird.y += bird.vy * delta
  if (bird.y < WORLD.birdRadius) {
    bird.y = WORLD.birdRadius
    bird.vy = Math.max(bird.vy, 0)
  }
  if (flap) bird.vy = FLAP_VY
  const force = wind ? windForce(wind, time) : 0
  if (wind) {
    bird.x += force * delta
    if (force === 0) bird.x += (WORLD.birdX - bird.x) * Math.min(1, WIND_RELAX * delta)
    bird.x = Math.min(WORLD.maxX, Math.max(WORLD.minX, bird.x))
  }
  let status: HopStatus = 'flying'
  if (bird.y + WORLD.birdRadius >= WORLD.ground) {
    bird.y = WORLD.ground - WORLD.birdRadius
    status = 'failed'
  }
  const live = state.gates.map((gate) => ({ ...gate }))
  let { score, passed, coins } = state
  for (let index = 0; index < gates.length; index += 1) {
    const gate = gates[index]
    const left = gate.x - scroll
    const center = gateCenter(gate, time, spec.gap)
    if (left < bird.x + WORLD.birdRadius && left + GATE_WIDTH > bird.x - WORLD.birdRadius
      && (bird.y - WORLD.birdRadius < center - spec.gap / 2 || bird.y + WORLD.birdRadius > center + spec.gap / 2)) {
      status = 'failed'
      break
    }
    if (!live[index].scored && left + GATE_WIDTH / 2 <= bird.x) {
      live[index].scored = true
      const offset = Math.abs(bird.y - center)
      score += GATE_SCORE + (offset <= CENTER_TOL ? CENTER_BONUS : 0)
      if (gate.coin && !live[index].coinTaken && offset <= COIN_RADIUS) {
        live[index].coinTaken = true
        coins += 1
        score += COIN_BONUS
      }
    }
    if (!live[index].passed && left + GATE_WIDTH <= bird.x - WORLD.birdRadius) {
      live[index].passed = true
      passed += 1
    }
  }
  if (status === 'flying' && passed >= spec.quota) status = 'completed'
  return { time, scroll, bird, gates: live, passed, score: Math.min(SCORE_CAP, score), coins, status }
}
