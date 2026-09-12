import { describe, expect, it } from 'vitest'
import { createDistractorPlan, createSequence, distractorAt, effectiveSequence, expectedStar, initialEchoState, isSilentRound, judgeInput, STAR_COUNT, type EchoState } from './logic'
import { ECHO_LEVEL_COUNT, getEchoLevel } from './levels'

const readyState: EchoState = { ...initialEchoState, phase: 'input' }
const walk = (levelNumber: number, sequence: readonly number[], taps?: readonly number[]) => {
  const level = getEchoLevel(levelNumber)
  const order = taps ?? effectiveSequence(sequence, level.reverse)
  let state = readyState
  const results = order.map((star) => {
    const result = judgeInput(level, state, sequence, star)
    state = result.state
    return result
  })
  return { level, results, state }
}

describe('echo steps sequence generator', () => {
  it('creates sixty deterministic sequences without consecutive repeats', () => {
    const seen = new Set<string>()
    for (let level = 1; level <= ECHO_LEVEL_COUNT; level += 1) {
      const spec = getEchoLevel(level)
      const first = createSequence(spec)
      expect(createSequence(spec)).toEqual(first)
      expect(first).toHaveLength(spec.length)
      expect(first.every((star) => star >= 0 && star < STAR_COUNT)).toBe(true)
      for (let index = 1; index < first.length; index += 1) expect(first[index]).not.toBe(first[index - 1])
      seen.add(first.join(''))
    }
    expect(seen.size).toBe(ECHO_LEVEL_COUNT)
  })

  it('maps reverse recall against the demo order', () => {
    const level = getEchoLevel(24)
    expect(level.reverse).toBe(true)
    const sequence = createSequence(level)
    const effective = effectiveSequence(sequence, true)
    expect(effective).toEqual([...sequence].reverse())
    expect(expectedStar(level, initialEchoState, sequence)).toBe(sequence[sequence.length - 1])
    const reversed = [...sequence].reverse()
    const run = walk(24, sequence)
    expect(run.results.every((result) => result.correct)).toBe(true)
    expect(run.state.phase).toBe('complete')
    expect(run.state.steps).toBe(reversed.length)
  })
})

describe('echo steps judgement state machine', () => {
  it('awards fifty per step scaled by chapter plus perfect bonus', () => {
    const perfect = walk(5, createSequence(getEchoLevel(5)))
    expect(perfect.state.phase).toBe('complete')
    expect(perfect.state.score).toBe(perfect.state.steps * 50 + 300)
    expect(perfect.state.mistakes).toBe(0)
    const late = walk(50, createSequence(getEchoLevel(50)))
    expect(late.state.score).toBe(late.state.steps * 250 + 300)
  })

  it('spends one life per mistake and replays, failing after three', () => {
    const level = getEchoLevel(3)
    const sequence = createSequence(level)
    const wrong = (sequence[0] + 1) % STAR_COUNT
    const first = judgeInput(level, readyState, sequence, wrong)
    expect(first).toMatchObject({ correct: false, failed: false })
    expect(first.state).toMatchObject({ phase: 'playback', round: 1, position: 0, lives: 2, mistakes: 1 })
    expect(isSilentRound(level, first.state.round)).toBe(false)
    let state = { ...first.state, phase: 'input' as const }
    state = judgeInput(level, state, sequence, wrong).state
    expect(state).toMatchObject({ lives: 1, round: 2, phase: 'playback' })
    const last = judgeInput(level, { ...state, phase: 'input' as const }, sequence, wrong)
    expect(last).toMatchObject({ failed: true, completed: false })
    expect(last.state.phase).toBe('failed')
  })

  it('ignores taps outside the input phase and rejects illegal stars', () => {
    const level = getEchoLevel(2)
    const sequence = createSequence(level)
    const during = judgeInput(level, initialEchoState, sequence, sequence[0])
    expect(during.state).toBe(initialEchoState)
    const input = { ...initialEchoState, phase: 'input' as const }
    for (const star of [-1, STAR_COUNT, 99]) {
      const result = judgeInput(level, input, sequence, star)
      expect(result.correct).toBe(false)
      expect(result.state.lives).toBe(2)
    }
  })

  it('keeps silent retries and distractors for the deep chapters only', () => {
    expect(getEchoLevel(1).silentRetries).toBe(false)
    expect(getEchoLevel(33).silentRetries).toBe(false)
    expect(getEchoLevel(34).silentRetries).toBe(true)
    expect(getEchoLevel(44).distractors).toBe(0)
    const level = getEchoLevel(52)
    expect(level.distractors).toBeGreaterThan(0)
    const sequence = createSequence(level)
    const plan = createDistractorPlan(level, 0, sequence)
    expect(createDistractorPlan(level, 0, sequence)).toEqual(plan)
    expect(plan).toHaveLength(level.distractors)
    const effective = effectiveSequence(sequence, level.reverse)
    expect(plan.every((flash) => effective[flash.step] !== flash.star)).toBe(true)
    expect(plan.every((flash) => distractorAt(plan, flash.step) === flash.star)).toBe(true)
    expect(isSilentRound(level, 1)).toBe(true)
    expect(isSilentRound(level, 0)).toBe(false)
  })
})

describe('echo steps difficulty curve', () => {
  it('grows sequences and speeds playback across five chapters', () => {
    const levels = Array.from({ length: ECHO_LEVEL_COUNT }, (_, index) => getEchoLevel(index + 1))
    expect(levels.slice(0, 11).every((level) => level.chapter === 1)).toBe(true)
    for (let index = 1; index < levels.length; index += 1) {
      expect(levels[index].length).toBeGreaterThanOrEqual(levels[index - 1].length)
      expect(levels[index].stepMs).toBeLessThanOrEqual(levels[index - 1].stepMs)
    }
    expect(getEchoLevel(1)).toMatchObject({ length: 3, chapter: 1, mode: 'calm' })
    expect(getEchoLevel(22)).toMatchObject({ length: 9, chapter: 2, mode: 'swift' })
    expect(getEchoLevel(33)).toMatchObject({ reverse: true, chapter: 3 })
    expect(getEchoLevel(44)).toMatchObject({ silentRetries: true, chapter: 4 })
    expect(getEchoLevel(60)).toMatchObject({ length: 16, distractors: 4, chapter: 5 })
    expect(getEchoLevel(45).stepMs).toBeLessThan(getEchoLevel(44).stepMs * 0.75)
  })

  it('opens the input window only after the silent replay finishes', () => {
    const level = getEchoLevel(50)
    expect(level.silentRetries).toBe(true)
    expect(isSilentRound(level, 0)).toBe(false)
    expect(isSilentRound(level, 1)).toBe(true)
    for (const early of [1, 22, 33]) expect(isSilentRound(getEchoLevel(early), 5)).toBe(false)
    const sequence = createSequence(level)
    const duringDemo = judgeInput(level, initialEchoState, sequence, sequence[0])
    expect(duringDemo.state).toBe(initialEchoState)
    const replayRound: EchoState = { ...initialEchoState, phase: 'playback', round: 1 }
    expect(judgeInput(level, replayRound, sequence, sequence[0]).state).toBe(replayRound)
    const effective = effectiveSequence(sequence, level.reverse)
    const open = judgeInput(level, { ...initialEchoState, phase: 'input', round: 1 }, sequence, effective[0])
    expect(open.correct).toBe(true)
    expect(open.state.position).toBe(1)
    const walked = walk(50, sequence)
    expect(walked.state.phase).toBe('complete')
  })

  it('mirrors forward and reverse recall move for move', () => {
    const spec = getEchoLevel(30)
    expect(spec.reverse).toBe(true)
    const sequence = createSequence(spec)
    const effective = effectiveSequence(sequence, true)
    const forwardLevel = { ...spec, reverse: false }
    const runWith = (level: typeof spec, taps: readonly number[]) => {
      let state = readyState
      for (const star of taps) state = judgeInput(level, state, sequence, star).state
      return state
    }
    const reversedRun = runWith(spec, effective)
    const forwardRun = runWith(forwardLevel, sequence)
    expect(reversedRun.phase).toBe('complete')
    expect(forwardRun.phase).toBe('complete')
    expect(reversedRun.steps).toBe(forwardRun.steps)
    expect(reversedRun.score).toBe(forwardRun.score)
    expect(runWith(spec, sequence).phase).not.toBe('complete')
    expect(runWith(forwardLevel, effective).phase).not.toBe('complete')
    expect(effectiveSequence(effectiveSequence(sequence, true), true)).toEqual(sequence)
  })

  it('caps the perfect run inside the score policy', () => {
    const level = getEchoLevel(60)
    const worst = level.length * 50 * level.chapter + 300
    expect(worst).toBeLessThanOrEqual(5000)
  })
})
