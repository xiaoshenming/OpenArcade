import type { Course, Hazard } from './levels'

export const G = 24
export const G_HOLD = 15
export const JUMP_V = 7.5
export const DJ_V = 6.9
export const HOLD_MAX = 0.5
export const RUNNER_H = 1.7
export const CROUCH_H = 0.9
export const RUNNER_W = 0.6
export const COIN_R = 0.45
export const IFRAMES = 1.4
export const MAX_LIVES = 3
export const DT = 1 / 120
export const SCORE_MAX = 10000
export const COIN_VALUE = 50
export const STEP_METERS = 10
export const STEP_SCORE = 10

export type HitKind = 'block' | 'bird' | 'pit'
export interface RunInput { readonly hold: boolean, readonly duck: boolean, readonly press: boolean }
export interface RunState { x: number, y: number, vy: number, air: number, holdT: number, holding: boolean, crouch: boolean, lives: number, iframes: number, coins: number }
export interface StepResult { readonly state: RunState, readonly hit: HitKind | null, readonly hitIndex: number, readonly collected: number[] }
export interface RunReport { readonly deaths: number, readonly survived: boolean, readonly coins: number, readonly fatal: number[] }

export function createRunState(): RunState {
  return { x: 0, y: 0, vy: 0, air: 0, holdT: 0, holding: false, crouch: false, lives: MAX_LIVES, iframes: 0, coins: 0 }
}

export function bodyTop(state: RunState) {
  return state.y + (state.crouch ? CROUCH_H : RUNNER_H)
}

export function arcPeak(holdMs: number, doubleJump: boolean) {
  const v = doubleJump ? DJ_V : JUMP_V
  const thrust = Math.min(Math.max(0, holdMs) / 1000, v / G_HOLD)
  return v * thrust - (G_HOLD * thrust * thrust) / 2 + Math.max(0, v - G_HOLD * thrust) ** 2 / (2 * G)
}

export function distanceScore(meters: number) {
  return Math.floor(Math.max(0, meters) / STEP_METERS) * STEP_SCORE
}

export function courseScore(meters: number, coins: number) {
  return Math.min(SCORE_MAX, distanceScore(meters) + Math.max(0, coins) * COIN_VALUE)
}

function gapIndexAt(course: Course, x: number) {
  return course.hazards.findIndex((hazard) => hazard.kind === 'gap' && x > hazard.x + 0.2 && x < hazard.x + hazard.width - 0.3)
}

function platformAt(course: Course, x: number, y: number) {
  return course.platforms.some((platform) => x > platform.x && x < platform.x + platform.width && Math.abs(y - platform.top) < 0.06)
}

export function advance(prev: RunState, input: RunInput, course: Course, time: number, taken: ReadonlySet<number>, dt = DT): StepResult {
  const s = { ...prev }
  const maxAir = course.doubleJump ? 2 : 1
  const center = s.x + RUNNER_W * 0.5
  const supported = (s.y <= 0.001 && gapIndexAt(course, center) < 0) || platformAt(course, center, s.y)
  s.crouch = input.duck && supported
  if (input.press && (supported || (s.air > 0 && s.air < maxAir && s.y > 0.05))) {
    s.vy = supported ? JUMP_V : DJ_V
    s.air = supported ? 1 : s.air + 1
    s.holding = input.hold
    s.holdT = 0
  } else if (input.hold && s.holding && s.vy > 0 && s.holdT < HOLD_MAX) {
    s.holdT += dt
  } else {
    s.holding = false
  }
  const gravity = s.holding && s.vy > 0 ? G_HOLD : input.duck && !supported ? G * 2 : G
  const prevY = s.y
  s.vy -= gravity * dt
  s.y += s.vy * dt
  s.x += course.speed * dt
  const nextCenter = s.x + RUNNER_W * 0.5
  let landed = false
  if (s.vy <= 0) {
    for (const platform of course.platforms) {
      if (nextCenter > platform.x && nextCenter < platform.x + platform.width && prevY >= platform.top - 0.03 && s.y <= platform.top) {
        s.y = platform.top
        s.vy = 0
        landed = true
        break
      }
    }
  }
  const gapNow = gapIndexAt(course, nextCenter)
  if (!landed && s.y <= 0 && s.vy <= 0 && gapNow < 0) { s.y = 0; s.vy = 0; landed = true }
  if (landed) { s.air = 0; s.holding = false; s.holdT = 0 } else if (s.air === 0 && (s.y > 0.05 || gapNow >= 0)) s.air = 1
  const box = { left: s.x + 0.06, right: s.x + RUNNER_W - 0.06, bottom: s.y + 0.04, top: bodyTop(s) - 0.04 }
  let hit: HitKind | null = null
  let hitIndex = -1
  if (s.iframes > 0) s.iframes = Math.max(0, s.iframes - dt)
  else {
    for (let index = 0; index < course.hazards.length; index += 1) {
      const hazard = course.hazards[index]
      if (hazard.kind === 'gap') continue
      const hx = hazard.kind === 'bird' ? hazard.x - hazard.speed * (time + dt) : hazard.x
      const low = hazard.kind === 'bird' ? hazard.low : 0
      const high = hazard.kind === 'bird' ? hazard.high : hazard.height
      if (box.right > hx + 0.1 && box.left < hx + hazard.width - 0.1 && box.top > low + 0.08 && box.bottom < high - 0.04) {
        hit = hazard.kind
        hitIndex = index
        break
      }
    }
  }
  if (hit) {
    s.lives -= 1
    s.iframes = IFRAMES
  } else if (s.y < -2.4 && gapNow >= 0) {
    hit = 'pit'
    hitIndex = gapNow
  }
  const collected: number[] = []
  for (let index = 0; index < course.coins.length; index += 1) {
    if (taken.has(index)) continue
    const coin = course.coins[index]
    if (Math.abs(coin.x - nextCenter) > COIN_R + RUNNER_W / 2) continue
    const nearX = Math.max(box.left, Math.min(coin.x, box.right))
    const nearY = Math.max(box.bottom, Math.min(coin.y, box.top))
    if ((coin.x - nearX) ** 2 + (coin.y - nearY) ** 2 <= COIN_R * COIN_R) { collected.push(index); s.coins += 1 }
  }
  return { state: s, hit, hitIndex, collected }
}

export function respawn(state: RunState, course: Course, gapIndex: number): RunState {
  const gap = course.hazards[gapIndex]
  return {
    ...state, x: gap && gap.kind === 'gap' ? gap.x + gap.width + 1.2 : state.x,
    y: 0, vy: 0, air: 0, holdT: 0, holding: false, crouch: false, iframes: IFRAMES,
  }
}

export function autopilotInput(state: RunState, course: Course, time: number): RunInput {
  const front = state.x + RUNNER_W
  if (state.y > 0.03) return { hold: state.holding, duck: false, press: false }
  for (const hazard of course.hazards) {
    if (hazard.kind !== 'bird') continue
    const hx = hazard.x - hazard.speed * time
    if (hx + hazard.width > state.x - 0.4 && hx < front + (course.speed + hazard.speed) * 0.5) return { hold: false, duck: true, press: false }
  }
  let target: Hazard | null = null
  let end = 0
  let tall = false
  for (const hazard of course.hazards) {
    if (hazard.kind === 'bird') continue
    if (hazard.x + hazard.width < state.x - 0.5) continue
    if (!target) {
      target = hazard
      end = hazard.x + hazard.width
      tall = hazard.kind === 'block' && hazard.height > 1.15
      if (hazard.kind === 'gap') break
    } else if (hazard.kind === 'block' && hazard.x - end < 4.5) {
      end = hazard.x + hazard.width
      tall = tall || hazard.height > 1.15
    } else break
  }
  if (!target) return { hold: false, duck: false, press: false }
  if (target.kind === 'gap') {
    const wide = target.width >= 2.6
    if (target.x - front <= course.speed * (wide ? 0.14 : 0.1)) return { hold: wide, duck: false, press: true }
    return { hold: false, duck: false, press: false }
  }
  if (target.x - front <= course.speed * (tall ? 0.4 : 0.3)) return { hold: tall || end - target.x > 3.2, duck: false, press: true }
  return { hold: false, duck: false, press: false }
}

export function simulateCourse(course: Course): RunReport {
  let state = createRunState()
  const taken = new Set<number>()
  const fatal: number[] = []
  let time = 0
  const finishX = course.quota + 4
  for (let frame = 0; frame < 26000 && state.x < finishX; frame += 1) {
    const result = advance(state, autopilotInput(state, course, time), course, time, taken, DT)
    time += DT
    state = result.state
    for (const index of result.collected) taken.add(index)
    if (result.hit) {
      if (!fatal.includes(result.hitIndex)) fatal.push(result.hitIndex)
      if (result.hit === 'pit') state = respawn(state, course, result.hitIndex)
      if (state.lives <= 0) return { deaths: MAX_LIVES, survived: false, coins: state.coins, fatal }
    }
  }
  return { deaths: MAX_LIVES - state.lives, survived: state.x >= finishX, coins: state.coins, fatal }
}
