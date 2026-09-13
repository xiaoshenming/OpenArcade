export const FIELD = { width: 300, height: 520 }
export const LANE_X = [50, 150, 250] as const
export const PPM = 4
export const PLAYER_CY = 452
export const PLAYER_HALF = 2.2
export const CAR_HALF = 2.2
export const TRUCK_HALF = 4.5
export const CAR_WIDTH = 60
export const TRUCK_WIDTH = 70
export const SPAWN_AHEAD = 128
export const SWITCH_COOLDOWN = 0.22
export const INVULN_SECONDS = 1.5
export const START_LIVES = 3
export const COIN_HALF = 1.6
export const COIN_SCORE = 50
export const DIST_STEP = 10
export const DIST_SCORE = 10
export const THROTTLE_MULT = 1.5
export const SCORE_CAP = 10000
export const CULL_BEHIND = 26
export const FIXED_SLICE = 1 / 240
export const MAX_FRAME = 0.05

export type CarKind = 'car' | 'truck'
export type GameStatus = 'playing' | 'cleared' | 'over'
export type StepEvent = 'switch' | 'hit' | 'coin' | 'clear' | 'over'
export interface TrafficCar { id: number; at: number; lane: number; speed: number; kind: CarKind; enter: number }
export interface RoadCoin { id: number; at: number; lane: number; enter: number; trail: number }
export interface RoadPlan { quota: number; base: number; boost: number; queue: TrafficCar[]; coins: RoadCoin[] }
export interface ActiveCar { id: number; lane: number; y: number; speed: number; kind: CarKind; half: number }
export interface ActiveCoin { id: number; lane: number; y: number }
export interface InputState { left: boolean; right: boolean; throttle: boolean }
export interface GameState {
  time: number
  distance: number
  scoreDist: number
  quota: number
  base: number
  boost: number
  lane: number
  cooldown: number
  lives: number
  invuln: number
  cars: ActiveCar[]
  coins: ActiveCoin[]
  queue: TrafficCar[]
  coinQueue: RoadCoin[]
  cursor: number
  coinCursor: number
  coinsGot: number
  score: number
  status: GameStatus
  events: StepEvent[]
}

export const halfOf = (kind: CarKind) => (kind === 'truck' ? TRUCK_HALF : CAR_HALF)
export const arrivalOf = (at: number, enter: number) => at + enter

export function speedScore(state: Pick<GameState, 'scoreDist' | 'coinsGot'>): number {
  return Math.min(SCORE_CAP, Math.floor((state.scoreDist + 1e-4) / DIST_STEP) * DIST_SCORE + state.coinsGot * COIN_SCORE)
}

// Blocked stretch of player-distance while a car passes: y(D) = enter - (D - at) * (v - vCar) / v.
export function meetSpan(at: number, enter: number, speed: number, playerSpeed: number, half: number) {
  const k = playerSpeed / Math.max(1, playerSpeed - speed)
  const reach = half + PLAYER_HALF
  return { from: at + (enter - reach) * k, to: at + (enter + reach) * k }
}

export function createGameState(plan: RoadPlan): GameState {
  return {
    time: 0, distance: 0, scoreDist: 0, quota: plan.quota, base: plan.base, boost: plan.boost,
    lane: 1, cooldown: 0, lives: START_LIVES, invuln: 0, cars: [], coins: [],
    queue: plan.queue, coinQueue: plan.coins, cursor: 0, coinCursor: 0, coinsGot: 0,
    score: 0, status: 'playing', events: [],
  }
}

function advance(state: GameState, input: InputState, dt: number): GameState {
  const events: StepEvent[] = []
  const boosting = state.boost > 0 && !!input.throttle
  const speed = state.base + (boosting ? state.boost : 0)
  const time = state.time + dt
  const distance = state.distance + speed * dt
  const scoreDist = state.scoreDist + speed * dt * (boosting ? THROTTLE_MULT : 1)
  let lane = state.lane
  let cooldown = Math.max(0, state.cooldown - dt)
  if (!!input.left !== !!input.right) {
    if (cooldown <= 0) {
      const next = Math.min(2, Math.max(0, lane + (input.left ? -1 : 1)))
      if (next !== lane) {
        lane = next
        cooldown = SWITCH_COOLDOWN
        events.push('switch')
      }
    }
  } else {
    cooldown = 0
  }
  let invuln = Math.max(0, state.invuln - dt)
  const spawnedCars: ActiveCar[] = []
  let cursor = state.cursor
  while (cursor < state.queue.length && state.queue[cursor].at <= distance) {
    const spawn = state.queue[cursor]
    cursor += 1
    spawnedCars.push({ id: spawn.id, lane: spawn.lane, y: spawn.enter, speed: spawn.speed, kind: spawn.kind, half: halfOf(spawn.kind) })
  }
  let lives = state.lives
  const cars: ActiveCar[] = []
  for (const car of [...state.cars, ...spawnedCars]) {
    const y = car.y - (speed - car.speed) * dt
    if (y < -CULL_BEHIND) continue
    if (invuln <= 0 && car.lane === lane && Math.abs(y) < car.half + PLAYER_HALF) {
      events.push('hit')
      lives -= 1
      invuln = INVULN_SECONDS
      continue
    }
    cars.push({ ...car, y })
  }
  const spawnedCoins: ActiveCoin[] = []
  let coinCursor = state.coinCursor
  while (coinCursor < state.coinQueue.length && state.coinQueue[coinCursor].at <= distance) {
    const spawn = state.coinQueue[coinCursor]
    coinCursor += 1
    spawnedCoins.push({ id: spawn.id, lane: spawn.lane, y: spawn.enter })
  }
  let coinsGot = state.coinsGot
  const coins: ActiveCoin[] = []
  for (const coin of [...state.coins, ...spawnedCoins]) {
    const y = coin.y - speed * dt
    if (y < -CULL_BEHIND) continue
    if (coin.lane === lane && Math.abs(y) < COIN_HALF + PLAYER_HALF) {
      coinsGot += 1
      events.push('coin')
      continue
    }
    coins.push({ ...coin, y })
  }
  const score = speedScore({ scoreDist, coinsGot })
  let status = state.status
  if (distance >= state.quota) {
    status = 'cleared'
    events.push('clear')
  } else if (lives <= 0) {
    status = 'over'
    events.push('over')
  }
  return {
    ...state, time, distance, scoreDist, lane, cooldown, lives, invuln, cars, coins,
    cursor, coinCursor, coinsGot, score, status, events,
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
