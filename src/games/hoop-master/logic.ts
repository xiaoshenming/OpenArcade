import type { PegLevel, PegSpec, WindSpec } from './levels'

export const WORLD = { width: 190, height: 120 } as const
export const GRAVITY = 90
export const LAUNCH_ANGLE = (55 * Math.PI) / 180
export const THROWER = { x: 18, y: 95 } as const
export const TABLE_Y = 70
export const TABLE = { left: 54, right: 182 } as const
export const V_MIN = 85
export const V_MAX = 130
export const HOOP_GAP = 26
export const SCORE_NORMAL = 150
export const SCORE_GOLD = 400
export const STREAK_CAP = 4
export const SCORE_CAP = 10000
export const FIXED_SLICE = 1 / 240
export const MAX_SLICES = 48
export const WIND_MAX = 0.16

export type HoopPhase = 'aim' | 'flight'
export type HoopStatus = 'play' | 'completed' | 'failed'
export type StepEvent = 'lock' | 'ring' | 'gold' | 'miss' | 'clear' | 'bust'

export interface FlyingHoop {
  id: number
  x: number
  y: number
  vx: number
  vy: number
}

export interface Mark {
  x: number
  hit: boolean
  gold: boolean
}

export interface HoopState {
  time: number
  phase: HoopPhase
  power: number
  hoops: FlyingHoop[]
  nextId: number
  throwsLeft: number
  claimed: boolean[]
  score: number
  streak: number
  marks: Mark[]
  status: HoopStatus
  events: StepEvent[]
}

export const clamp01 = (value: number) => Math.min(1, Math.max(0, value))

export const speedFor = (power: number) => V_MIN + clamp01(power) * (V_MAX - V_MIN)

export function launchVelocity(speed: number): { vx: number; vy: number } {
  return { vx: speed * Math.cos(LAUNCH_ANGLE), vy: -speed * Math.sin(LAUNCH_ANGLE) }
}

export function powerAt(spec: PegLevel, time: number): number {
  return clamp01(0.5 + 0.5 * Math.sin((Math.PI * 2 * time) / spec.meterPeriod))
}

export function windBias(wind: WindSpec | undefined, time: number): number {
  if (!wind) return 0
  return wind.force * Math.sin((Math.PI * 2 * time) / wind.period + wind.phase)
}

export function effectivePower(power: number, wind: WindSpec | undefined, time: number): number {
  return clamp01(power + windBias(wind, time))
}

export function landTime(y: number, vy: number): number | null {
  const disc = vy * vy - 2 * GRAVITY * (y - TABLE_Y)
  if (disc < 0) return null
  return (-vy + Math.sqrt(disc)) / GRAVITY
}

export function landX(x: number, y: number, vx: number, vy: number): number {
  const t = landTime(y, vy)
  return t === null ? x : x + vx * t
}

export function speedForLanding(targetX: number): number {
  // 反解在纯速度域解析:本作风只改出手力度(effectivePower),不改空中弹道,故反解天然免风且精确。
  // 若未来把风力引入飞行模型,必须让本反解同步吃 wind,否则双圈第二圈落点会被静默带偏。
  let low = V_MIN
  let high = V_MAX
  for (let index = 0; index < 40; index += 1) {
    const mid = (low + high) / 2
    const velocity = launchVelocity(mid)
    if (landX(THROWER.x, THROWER.y, velocity.vx, velocity.vy) < targetX) low = mid
    else high = mid
  }
  return (low + high) / 2
}

export function powerForLanding(targetX: number): number {
  return clamp01((speedForLanding(targetX) - V_MIN) / (V_MAX - V_MIN))
}

export function pegX(peg: PegSpec, time: number): number {
  if (peg.amp === 0) return peg.baseX
  return peg.baseX + peg.amp * Math.sin((Math.PI * 2 * time) / peg.period + peg.phase)
}

export function pegValue(peg: PegSpec): number {
  return peg.kind === 'gold' ? SCORE_GOLD : SCORE_NORMAL
}

export function createState(spec: PegLevel, pegs: readonly PegSpec[]): HoopState {
  return {
    time: 0,
    phase: 'aim',
    power: powerAt(spec, 0),
    hoops: [],
    nextId: 1,
    throwsLeft: spec.throws,
    claimed: pegs.map(() => false),
    score: 0,
    streak: 0,
    marks: [],
    status: 'play',
    events: [],
  }
}

export function lockThrow(state: HoopState, spec: PegLevel, wind: WindSpec | undefined): HoopState {
  if (state.status !== 'play' || state.phase !== 'aim' || state.throwsLeft <= 0) return state
  const power = effectivePower(state.power, wind, state.time)
  const speed = speedFor(power)
  const first = launchVelocity(speed)
  const hoops: FlyingHoop[] = [{ id: state.nextId, x: THROWER.x, y: THROWER.y, vx: first.vx, vy: first.vy }]
  if (spec.double) {
    // 不变式:double(第3章)与 wind(第5章)在关卡表互斥。第二圈落点经 speedForLanding 在
    // 速度域反解后,折回力度域再与首圈同样过 effectivePower —— 当前 wind 为 undefined 时是
    // 恒等变换,行为不变;若未来章节让 double+wind 同现,整对圈会被同一场风一起吹移、
    // 间距保持,而不会出现「首圈吃风、第二圈精确」的割裂。
    const followPower = effectivePower(powerForLanding(landX(THROWER.x, THROWER.y, first.vx, first.vy) + HOOP_GAP), wind, state.time)
    const second = launchVelocity(speedFor(followPower))
    hoops.push({ id: state.nextId + 1, x: THROWER.x, y: THROWER.y, vx: second.vx, vy: second.vy })
  }
  return {
    ...state,
    phase: 'flight',
    hoops,
    nextId: state.nextId + hoops.length,
    throwsLeft: state.throwsLeft - 1,
    events: [...state.events, 'lock'],
  }
}

export function judgeLanding(
  claimed: readonly boolean[],
  pegs: readonly PegSpec[],
  threshold: number,
  land: number,
  at: number,
  streak: number,
  score: number,
  marks: readonly Mark[],
): { claimed: boolean[]; score: number; streak: number; event: StepEvent; marks: Mark[] } {
  let best = -1
  let bestDist = threshold
  for (let index = 0; index < pegs.length; index += 1) {
    if (claimed[index]) continue
    const dist = Math.abs(land - pegX(pegs[index], at))
    if (dist <= bestDist) {
      best = index
      bestDist = dist
    }
  }
  const nextMarks = [...marks, { x: land, hit: best >= 0, gold: best >= 0 && pegs[best].kind === 'gold' }].slice(-8)
  if (best < 0) return { claimed: [...claimed], score, streak: 0, event: 'miss', marks: nextMarks }
  const hitStreak = streak + 1
  const hitScore = Math.min(SCORE_CAP, score + pegValue(pegs[best]) * Math.min(hitStreak, STREAK_CAP))
  const nextClaimed = claimed.map((flag, index) => (index === best ? true : flag))
  return { claimed: nextClaimed, score: hitScore, streak: hitStreak, event: pegs[best].kind === 'gold' ? 'gold' : 'ring', marks: nextMarks }
}

function advance(state: HoopState, spec: PegLevel, pegs: readonly PegSpec[], dt: number, events: StepEvent[]): HoopState {
  const time = state.time + dt
  if (state.phase === 'aim') return { ...state, time, power: powerAt(spec, time) }
  const survivors: FlyingHoop[] = []
  let next: HoopState = { ...state, time }
  for (const hoop of state.hoops) {
    const vy = hoop.vy + GRAVITY * dt
    const x = hoop.x + hoop.vx * dt
    const y = hoop.y + hoop.vy * dt + (GRAVITY / 2) * dt * dt
    if (hoop.y < TABLE_Y && y >= TABLE_Y) {
      const drop = landTime(hoop.y, hoop.vy)
      const land = drop === null ? x : hoop.x + hoop.vx * drop
      const judged = judgeLanding(next.claimed, pegs, spec.threshold, land, time - dt + (drop ?? 0), next.streak, next.score, next.marks)
      events.push(judged.event)
      next = { ...next, claimed: judged.claimed, score: judged.score, streak: judged.streak, marks: judged.marks }
      continue
    }
    survivors.push({ ...hoop, x, y, vy })
  }
  next = { ...next, hoops: survivors }
  if (survivors.length > 0 || next.status !== 'play') return next
  if (next.score >= spec.quota) {
    events.push('clear')
    return { ...next, status: 'completed' }
  }
  if (next.throwsLeft <= 0 || next.claimed.every((flag) => flag)) {
    events.push('bust')
    return { ...next, status: 'failed' }
  }
  return { ...next, phase: 'aim', power: powerAt(spec, time) }
}

export function step(state: HoopState, spec: PegLevel, pegs: readonly PegSpec[], rawDt: number): HoopState {
  if (state.status !== 'play' || !Number.isFinite(rawDt) || rawDt <= 0) return state
  const events: StepEvent[] = []
  const slices = Math.max(1, Math.min(MAX_SLICES, Math.ceil(rawDt / FIXED_SLICE)))
  const dt = rawDt / slices
  let next = state
  for (let index = 0; index < slices && next.status === 'play'; index += 1) next = advance(next, spec, pegs, dt, events)
  return events.length > 0 ? { ...next, events } : next
}
