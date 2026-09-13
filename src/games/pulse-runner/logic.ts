import type { Course, PulseLevel } from './levels'

export const SWITCH_S = 0.2
export const PRESS_S = 0.22
export const REACT_S = 0.04
export const MAX_LIVES = 3
export const DT = 1 / 120
export const STEP_M = 10
export const STEP_SCORE = 10
export const GATE_SCORE = 100
export const GOLD_SCORE = 200
export const SCORE_MAX = 10000
export const MAX_DT = 0.05

export type GateKind = 'solid' | 'phantom' | 'gold'
export type PulseEvent = 'match' | 'gold' | 'hit'
export type OverKind = 'completed' | 'failed' | null

export interface PulseState {
  x: number
  color: number
  cooldown: number
  lives: number
  gateScore: number
  golds: number
  hits: number
  cursor: number
  over: OverKind
}

export interface StepResult {
  readonly state: PulseState
  readonly events: readonly PulseEvent[]
  readonly hitGate: number
}

export function clampLevel(level: number, levelCount: number) {
  const safe = Number.isFinite(level) ? Math.floor(level) : 1
  return Math.min(levelCount, Math.max(1, safe))
}

export function speedAt(level: PulseLevel, meters: number) {
  return level.speed + level.gradient * Math.max(0, meters)
}

export function pressesNeeded(from: number, to: number, colorCount: number) {
  const n = Math.max(2, Math.floor(colorCount))
  return ((to - from) % n + n) % n
}

export function minGapMeters(level: PulseLevel, fromColor: number, toColor: number, meters: number) {
  const presses = pressesNeeded(fromColor, toColor, level.colorCount)
  return speedAt(level, meters) * Math.max(0.32, presses * PRESS_S + 0.14)
}

export function pairGapMeters(level: PulseLevel, fromColor: number, toColor: number, meters: number) {
  const presses = pressesNeeded(fromColor, toColor, level.colorCount)
  return speedAt(level, meters) * Math.max(0.2, presses * PRESS_S + 0.12)
}

export function createPulseState(): PulseState {
  return { x: 0, color: 0, cooldown: 0, lives: MAX_LIVES, gateScore: 0, golds: 0, hits: 0, cursor: 0, over: null }
}

export function distanceScore(meters: number) {
  return Math.floor(Math.max(0, meters) / STEP_M) * STEP_SCORE
}

export function totalScore(state: PulseState) {
  return Math.min(SCORE_MAX, distanceScore(state.x) + Math.max(0, state.gateScore))
}

export function trySwitch(prev: PulseState, level: PulseLevel): { state: PulseState, switched: boolean } {
  if (prev.over || prev.cooldown > 0) return { state: prev, switched: false }
  const color = (prev.color + 1) % level.colorCount
  return { state: { ...prev, color, cooldown: SWITCH_S }, switched: true }
}

export function advance(prev: PulseState, level: PulseLevel, course: Course, rawDt: number): StepResult {
  if (prev.over) return { state: prev, events: [], hitGate: -1 }
  const dt = Number.isFinite(rawDt) ? Math.min(MAX_DT, Math.max(0, rawDt)) : 0
  if (dt <= 0) return { state: prev, events: [], hitGate: -1 }
  const state: PulseState = { ...prev, x: prev.x + speedAt(level, prev.x) * dt, cooldown: Math.max(0, prev.cooldown - dt) }
  const events: PulseEvent[] = []
  let hitGate = -1
  while (state.cursor < course.gates.length && course.gates[state.cursor].x <= state.x) {
    const gate = course.gates[state.cursor]
    const index = state.cursor
    state.cursor += 1
    if (gate.kind === 'gold') {
      state.gateScore += GOLD_SCORE
      state.golds += 1
      events.push('gold')
    } else if (gate.kind === 'solid') {
      if (gate.color === state.color) {
        state.gateScore += GATE_SCORE
        events.push('match')
      } else {
        state.lives -= 1
        state.hits += 1
        hitGate = index
        events.push('hit')
        if (state.lives <= 0) break
      }
    }
  }
  if (state.lives <= 0) state.over = 'failed'
  else if (state.x >= level.quota) state.over = 'completed'
  return { state, events, hitGate }
}

export function wantsSwitch(state: PulseState, level: PulseLevel, course: Course) {
  if (state.over || state.cooldown > 0) return false
  for (let index = state.cursor; index < course.gates.length; index += 1) {
    const gate = course.gates[index]
    if (gate.kind !== 'solid') continue
    if (gate.color === state.color) return false
    const time = (gate.x - state.x) / speedAt(level, state.x)
    return time <= pressesNeeded(state.color, gate.color, level.colorCount) * PRESS_S + REACT_S
  }
  return false
}

export interface SimReport {
  readonly survived: boolean
  readonly deaths: number
  readonly golds: number
  readonly score: number
  readonly fatal: readonly number[]
}

export function simulateCourse(level: PulseLevel, course: Course): SimReport {
  let state = createPulseState()
  const fatal: number[] = []
  const frames = Math.ceil((level.quota / Math.max(4, level.speed)) / DT) + 300
  for (let frame = 0; frame < frames; frame += 1) {
    if (wantsSwitch(state, level, course)) state = trySwitch(state, level).state
    const result = advance(state, level, course, DT)
    state = result.state
    if (result.hitGate >= 0 && !fatal.includes(result.hitGate)) fatal.push(result.hitGate)
    if (state.over) break
  }
  return { survived: state.over === 'completed', deaths: MAX_LIVES - state.lives, golds: state.golds, score: totalScore(state), fatal }
}
