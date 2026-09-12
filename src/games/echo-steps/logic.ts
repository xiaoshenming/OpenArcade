import { mulberry32 } from '../../platform/rng'
import type { EchoLevel } from './levels'

export const STAR_COUNT = 6
export const STEP_SCORE = 50
export const PERFECT_BONUS = 300
export const MAX_LIVES = 3

export type EchoPhase = 'playback' | 'input' | 'complete' | 'failed'

export interface EchoState {
  readonly phase: EchoPhase
  readonly round: number
  readonly position: number
  readonly lives: number
  readonly mistakes: number
  readonly steps: number
  readonly score: number
}

export interface DistractorFlash {
  readonly star: number
  readonly step: number
}

export interface EchoJudgement {
  readonly state: EchoState
  readonly correct: boolean
  readonly completed: boolean
  readonly failed: boolean
}

export const initialEchoState: EchoState = { phase: 'playback', round: 0, position: 0, lives: MAX_LIVES, mistakes: 0, steps: 0, score: 0 }

export function createSequence(level: EchoLevel): number[] {
  const random = mulberry32(level.seed)
  const sequence: number[] = []
  while (sequence.length < level.length) {
    const star = Math.floor(random() * STAR_COUNT) % STAR_COUNT
    if (sequence[sequence.length - 1] === star) continue
    sequence.push(star)
  }
  return sequence
}

export function effectiveSequence(sequence: readonly number[], reverse: boolean): number[] {
  return reverse ? [...sequence].reverse() : [...sequence]
}

export function isSilentRound(level: EchoLevel, round: number): boolean {
  return level.silentRetries && round > 0
}

export function createDistractorPlan(level: EchoLevel, round: number, sequence: readonly number[]): DistractorFlash[] {
  if (level.distractors <= 0) return []
  const effective = effectiveSequence(sequence, level.reverse)
  const random = mulberry32(level.seed ^ (0x9e3779b1 + round))
  const plan: DistractorFlash[] = []
  const used = new Set<string>()
  let guard = 0
  while (plan.length < level.distractors && guard < 120) {
    guard += 1
    const step = Math.floor(random() * effective.length) % effective.length
    const star = Math.floor(random() * STAR_COUNT) % STAR_COUNT
    const key = `${step}:${star}`
    if (used.has(key) || effective[step] === star) continue
    used.add(key)
    plan.push({ star, step })
  }
  return plan
}

export function distractorAt(plan: readonly DistractorFlash[], step: number): number {
  const flash = plan.find((item) => item.step === step)
  return flash ? flash.star : -1
}

export function expectedStar(level: EchoLevel, state: EchoState, sequence: readonly number[]): number {
  return effectiveSequence(sequence, level.reverse)[state.position]
}

export function judgeInput(level: EchoLevel, state: EchoState, sequence: readonly number[], star: number): EchoJudgement {
  if (state.phase !== 'input') return { state, correct: false, completed: false, failed: false }
  const effective = effectiveSequence(sequence, level.reverse)
  if (star < 0 || star >= STAR_COUNT || star !== effective[state.position]) {
    const lives = state.lives - 1
    const mistakes = state.mistakes + 1
    if (lives <= 0) {
      return { state: { ...state, phase: 'failed', lives: 0, mistakes }, correct: false, completed: false, failed: true }
    }
    return {
      state: { ...state, phase: 'playback', round: state.round + 1, position: 0, lives, mistakes },
      correct: false, completed: false, failed: false,
    }
  }
  const position = state.position + 1
  const steps = state.steps + 1
  const score = state.score + STEP_SCORE * level.chapter
  const completed = position >= effective.length
  const finalScore = completed && state.mistakes === 0 ? score + PERFECT_BONUS : score
  return {
    state: { ...state, phase: completed ? 'complete' : 'input', position, steps, score: finalScore },
    correct: true, completed, failed: false,
  }
}
