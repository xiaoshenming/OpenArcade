import type { RhythmNote, SpeedWindow } from './levels'

export const PERFECT_MS = 60
export const GOOD_MS = 130
export const SCORE_PERFECT = 300
export const SCORE_GOOD = 150
export const COMBO_STEP = 10
export const COMBO_BONUS = 50
export const SCORE_MAX = 10000
export const MAX_HP = 100
export const MISS_DAMAGE = 12
export const GOOD_DAMAGE = 4
export const WARMUP_MISS_DAMAGE = 6

export type Judgement = 'perfect' | 'good' | 'miss'
// Biting a ghost lure is punished as a miss instead of being judged by timing.
export type HitKind = Judgement | 'decoy'

export function judge(noteTime: number, hitTime: number): Judgement {
  const delta = Math.abs(noteTime - hitTime)
  if (delta <= PERFECT_MS) return 'perfect'
  return delta <= GOOD_MS ? 'good' : 'miss'
}

export function resolveHit(note: RhythmNote, hitTime: number): HitKind {
  return note.decoy ? 'decoy' : judge(note.time, hitTime)
}

// Nearest pending note in the lane inside the good window. Real notes win over
// decoys when both share the window, so a lure is only punished when hit alone.
export function findTarget(notes: readonly RhythmNote[], statuses: readonly number[], songTime: number, lane: number): number {
  let real = -1
  let realDelta = GOOD_MS + 1
  let lure = -1
  let lureDelta = GOOD_MS + 1
  statuses.forEach((status, index) => {
    if (status !== 0) return
    const note = notes[index]
    if (!note || note.lane !== lane) return
    const delta = Math.abs(note.time - songTime)
    if (delta > GOOD_MS) return
    if (note.decoy) {
      if (delta < lureDelta) {
        lure = index
        lureDelta = delta
      }
    } else if (delta < realDelta) {
      real = index
      realDelta = delta
    }
  })
  return real >= 0 ? real : lure
}

export interface HitOutcome {
  readonly gain: number
  readonly bonus: number
  readonly combo: number
}

export function applyHit(kind: Judgement, combo: number): HitOutcome {
  if (kind === 'miss') return { gain: 0, bonus: 0, combo: 0 }
  const next = combo + 1
  const bonus = next % COMBO_STEP === 0 ? COMBO_BONUS : 0
  return { gain: kind === 'perfect' ? SCORE_PERFECT : SCORE_GOOD, bonus, combo: next }
}

export function damageFor(kind: 'good' | 'miss', inWarmup: boolean) {
  if (kind === 'good') return GOOD_DAMAGE
  return inWarmup ? WARMUP_MISS_DAMAGE : MISS_DAMAGE
}

export function clampHp(hp: number) {
  return Math.min(MAX_HP, Math.max(0, hp))
}

export function capScore(score: number) {
  return Math.min(SCORE_MAX, Math.max(0, Math.floor(score)))
}

export function overlapSpan(start: number, end: number, window: SpeedWindow) {
  return Math.max(0, Math.min(end, window.end) - Math.max(start, window.start))
}

export function visualDistance(from: number, to: number, windows: readonly SpeedWindow[], slowScale: number) {
  const forward = to >= from
  const [a, b] = forward ? [from, to] : [to, from]
  const slow = windows.reduce((sum, window) => sum + overlapSpan(a, b, window), 0)
  return (forward ? 1 : -1) * (b - a - (1 - slowScale) * slow)
}
