import { describe, expect, it, vi } from 'vitest'
import { BOMB_PENALTY, COMBO_CAP, HOLES, MIN_STAY, SCORE_CAP, createMoleState, isUp, multiplierOf, step, whack, type MolePlan, type MoleSpawn } from './logic'
import { CHAPTERS, CHAPTER_STARTS, LEVEL_COUNT, getMoleLevel, validateLevel } from './levels'

const plan = (level: number) => getMoleLevel(level)
const synthetic = (queue: MoleSpawn[], quota = 1, combo = false, duration = 12): MolePlan => ({ duration, quota, combo, queue })
const rise = (id: number, t: number, hole: number, stay = 0.9, kind: MoleSpawn['kind'] = 'normal'): MoleSpawn => ({ id, t, hole, stay, kind })

const advanceTo = (input: ReturnType<typeof createMoleState>, target: number) => {
  let state = input
  for (let guard = 0; guard < 4000 && state.status === 'playing' && state.time < target; guard += 1) {
    const dt = Math.min(0.05, target - state.time)
    if (dt <= 0) break
    const next = step(state, dt)
    if (next.time <= state.time) break
    state = next
  }
  return state
}

const perfectRun = (level: number) => {
  const spec = plan(level)
  let state = createMoleState(spec)
  for (const spawn of spec.queue.filter((item) => item.kind !== 'bomb')) {
    state = advanceTo(state, spawn.t + 0.02)
    if (state.status !== 'playing') break
    state = whack(state, spawn.hole).state
  }
  return state
}

describe('mole beat schedules', () => {
  it('builds sixty deterministic collision-free schedules', () => {
    for (let level = 1; level <= LEVEL_COUNT; level += 1) {
      const spec = plan(level)
      expect(JSON.stringify(spec)).toBe(JSON.stringify(plan(level)))
      expect(validateLevel(spec)).toBeNull()
      expect(new Set(spec.queue.map((spawn) => spawn.id)).size).toBe(spec.queue.length)
      expect(spec.queue.every((spawn) => spawn.hole >= 0 && spawn.hole < HOLES && spawn.stay >= MIN_STAY)).toBe(true)
    }
  })

  it('regenerates byte-identical streams in a fresh module registry', async () => {
    vi.resetModules()
    const { getMoleLevel: freshLevel } = await import('./levels')
    for (const level of [1, 27, 60]) {
      expect(JSON.stringify(freshLevel(level))).toBe(JSON.stringify(plan(level)))
    }
  })

  it('introduces one mechanic per chapter and stacks all in the finale', () => {
    expect(new Set(plan(1).queue.map((spawn) => spawn.kind))).toEqual(new Set(['normal']))
    const queue12 = plan(12).queue
    const paired = queue12.filter((spawn, index) => index > 0 && spawn.t === queue12[index - 1].t)
    expect(paired.length).toBeGreaterThan(0)
    const hasKind = (level: number, kind: string) => plan(level).queue.some((spawn) => spawn.kind === kind)
    expect(!hasKind(12, 'bomb') && !hasKind(12, 'gold') && !hasKind(23, 'gold')).toBe(true)
    expect(Array.from({ length: 11 }, (_, index) => hasKind(23 + index, 'bomb')).some(Boolean)).toBe(true)
    expect(Array.from({ length: 11 }, (_, index) => hasKind(34 + index, 'gold')).some(Boolean)).toBe(true)
    const finaleKinds = new Set(Array.from({ length: 16 }, (_, index) => plan(45 + index).queue).flat().map((spawn) => spawn.kind))
    expect(finaleKinds).toEqual(new Set(['normal', 'bomb', 'gold']))
    for (let level = 1; level <= 44; level += 1) expect(plan(level).combo).toBe(false)
    for (let level = 45; level <= LEVEL_COUNT; level += 1) expect(plan(level).combo).toBe(true)
  })

  it('tightens cadence, quotas and stays across chapters', () => {
    const starts = CHAPTER_STARTS.map((start) => plan(start))
    expect(starts.map((spec) => spec.quota)).toEqual([15, 19, 21, 23, 25])
    for (let index = 1; index < starts.length; index += 1) {
      expect(starts[index].quota).toBeGreaterThan(starts[index - 1].quota)
    }
    const meanInterval = (spec: ReturnType<typeof plan>) => (spec.duration - 1.2) / Math.max(1, spec.queue.length)
    expect(meanInterval(plan(53))).toBeLessThan(meanInterval(plan(29)))
    expect(meanInterval(plan(29))).toBeLessThan(meanInterval(plan(5)))
    expect(plan(50).stay).toBeLessThan(plan(5).stay)
    expect(plan(2).doubleChance).toBe(0)
    expect(plan(12).doubleChance).toBeGreaterThan(0)
    expect(plan(23).bombChance).toBeGreaterThan(0)
    expect(plan(34).goldChance).toBeGreaterThan(0)
    expect(CHAPTERS).toBe(5)
  })
})

describe('mole beat rules', () => {
  it('resolves whacks strictly inside rise windows, once per mole', () => {
    let state = createMoleState(synthetic([rise(1, 1, 4), rise(2, 1, 2, 0.9, 'gold')], 2))
    expect(whack(state, 4).event).toBe('empty')
    state = advanceTo(state, 1.01)
    const first = whack(state, 4)
    expect(first.event).toBe('hit')
    expect(first.state.score).toBe(100)
    expect(first.state.hits).toBe(1)
    expect(whack(first.state, 4).event).toBe('empty')
    expect(whack(first.state, 0).event).toBe('empty')
    const gold = whack(first.state, 2)
    expect(gold.event).toBe('gold')
    expect(gold.state.score).toBe(400)
    let later = gold.state
    later = advanceTo(later, 2.1)
    expect(whack(later, 2).event).toBe('empty')
    expect(isUp(rise(9, 2, 1, 0.5), 2.49)).toBe(true)
    expect(isUp(rise(9, 2, 1, 0.5), 2.5)).toBe(false)
  })

  it('punishes bombs with score loss, combo reset and a half-second stun', () => {
    let state = createMoleState(synthetic([rise(1, 0.5, 1, 2, 'bomb'), rise(2, 0.5, 3), rise(3, 0.5, 5)], 5, true))
    state = advanceTo(state, 0.6)
    state = whack(state, 3).state
    expect(state.streak).toBe(1)
    expect(state.score).toBe(100)
    const bombed = whack(state, 1)
    expect(bombed.event).toBe('bomb')
    expect(bombed.state.score).toBe(Math.max(0, 100 - BOMB_PENALTY))
    expect(bombed.state.stun).toBeCloseTo(0.5)
    expect(bombed.state.streak).toBe(0)
    const stunned = whack(bombed.state, 5)
    expect(stunned.event).toBe('stun')
    expect(stunned.state).toBe(bombed.state)
    const after = advanceTo(bombed.state, bombed.state.time + 0.55)
    expect(whack(after, 5).event).toBe('hit')
  })

  it('pays combo multipliers that cap at double', () => {
    expect(multiplierOf(0, false)).toBe(1)
    expect(multiplierOf(9, true)).toBe(COMBO_CAP)
    const queue = Array.from({ length: 6 }, (_, index) => rise(index + 1, 0.5 + index, index % HOLES))
    let state = createMoleState(synthetic(queue, 6, true))
    const gains: number[] = []
    for (let index = 0; index < 6; index += 1) {
      state = advanceTo(state, 0.5 + index + 0.02)
      const result = whack(state, index % HOLES)
      state = result.state
      gains.push(result.gained)
    }
    expect(gains).toEqual([100, 125, 150, 175, 200, 200])
    expect(state.score).toBe(950)
  })

  it('expires the combo multiplier outside the ch5 window and keeps it inside', () => {
    const queue = [rise(1, 0.5, 0, 3), rise(2, 1.2, 3, 3), rise(3, 3.4, 5, 3)]
    let state = createMoleState({ ...synthetic(queue, 3, true, 12), comboWindow: 1.5 })
    state = advanceTo(state, 0.6)
    state = whack(state, 0).state
    expect(state.streak).toBe(1)
    const inside = advanceTo(state, 1.3)
    const kept = whack(inside, 3)
    expect(kept.gained).toBe(125)
    expect(kept.state.streak).toBe(2)
    const expired = whack(advanceTo(kept.state, 3.5), 5)
    expect(expired.gained).toBe(100)
    expect(expired.state.streak).toBe(1)
  })

  it('pairs gold with bomb more often once the finale storm begins', () => {
    const overlap = (spec: ReturnType<typeof plan>) => {
      const golds = spec.queue.filter((spawn) => spawn.kind === 'gold')
      const bombs = spec.queue.filter((spawn) => spawn.kind === 'bomb')
      return golds.filter((gold) => bombs.some((bomb) => bomb.hole !== gold.hole && bomb.t < gold.t + gold.stay && gold.t < bomb.t + bomb.stay)).length
    }
    const finale = Array.from({ length: 16 }, (_, index) => overlap(plan(45 + index))).reduce((sum, count) => sum + count, 0)
    const chapter4 = Array.from({ length: 11 }, (_, index) => overlap(plan(34 + index))).reduce((sum, count) => sum + count, 0)
    expect(finale).toBeGreaterThan(0)
    expect(finale).toBeGreaterThan(chapter4)
    for (let level = 45; level <= LEVEL_COUNT; level += 1) {
      expect(plan(level).comboWindow, `level ${level}`).toBeGreaterThan(0)
      expect(plan(level).comboWindow).toBeLessThanOrEqual(2.6)
    }
    for (const level of [1, 20, 33, 44]) expect(plan(level).comboWindow).toBe(0)
  })

  it('completes on quota under perfect play and fails on timeout', () => {
    for (const level of [1, 23, 45, 60]) {
      const state = perfectRun(level)
      expect(state.status).toBe('cleared')
      expect(state.hits).toBeGreaterThanOrEqual(plan(level).quota)
    }
    let timeout = createMoleState(synthetic([rise(1, 0.5, 0)], 3, false, 2))
    while (timeout.status === 'playing') timeout = step(timeout, 0.05)
    expect(timeout.status).toBe('over')
    expect(timeout.hits).toBe(0)
    expect(timeout.escaped).toEqual([1])
  })

  it('clamps boundary lookups, frames and terminal states', () => {
    expect(plan(0).level).toBe(1)
    expect(plan(999).level).toBe(LEVEL_COUNT)
    expect(plan(Number.NaN).level).toBe(1)
    expect(plan(12.9).level).toBe(12)
    const state = createMoleState(synthetic([rise(1, 0.5, 0)], 1))
    expect(step(state, Number.NaN)).toBe(state)
    expect(step(state, -1)).toBe(state)
    expect(step(state, 0)).toBe(state)
    const cleared = { ...whack({ ...state, time: 0.6 }, 0).state, score: SCORE_CAP }
    expect(cleared.status).toBe('cleared')
    expect(whack(cleared, 0).event).toBe('empty')
    expect(step(cleared, 0.016)).toBe(cleared)
  })
})
