import { describe, expect, it, vi } from 'vitest'
import {
  BALLOON_RADIUS, CHAIN_BONUS, CHAIN_GAP, FIELD, HIT_SCORE, SCORE_CAP, SPIKE_RADIUS,
  WRONG_PENALTY, createBalloonState, escapeAt, popAt, positionOf, step,
  type BalloonPlan, type Spawn,
} from './logic'
import { CHAPTERS, CHAPTER_STARTS, LEVEL_COUNT, getBalloonLevel, validateLevel } from './levels'

const plan = (level: number) => getBalloonLevel(level)
const spawn = (over: Partial<Spawn>): Spawn => ({ id: 1, t: 0.5, x: 240, speed: 120, kind: 'balloon', color: 'red', chain: -1, ...over })
const synthetic = (queue: Spawn[], over: Partial<BalloonPlan> = {}): BalloonPlan => ({ duration: 20, quota: 1, target: 'red', lives: 3, windAmp: 0, windFreq: 0, queue, ...over })
const settled = (state: ReturnType<typeof createBalloonState>, target: number) => {
  let current = state
  for (let guard = 0; guard < 4000 && current.status === 'playing' && current.time < target; guard += 1) {
    const next = step(current, Math.min(0.05, target - current.time))
    if (next.time <= current.time) break
    current = next
  }
  return current
}

const perfectRun = (level: number) => {
  const spec = plan(level)
  let state = createBalloonState(spec)
  for (const item of spec.queue) {
    if (item.kind !== 'balloon' || item.color !== spec.target || state.popped.includes(item.id)) continue
    state = settled(state, item.t + 0.05)
    if (state.status !== 'playing') break
    const pos = positionOf(item, state.time, spec.windAmp, spec.windFreq)
    state = popAt(state, pos.x, pos.y).state
  }
  return state
}

describe('balloon drift schedules', () => {
  it('builds sixty deterministic validated launch tables', () => {
    for (let level = 1; level <= LEVEL_COUNT; level += 1) {
      const spec = plan(level)
      expect(JSON.stringify(spec)).toBe(JSON.stringify(plan(level)))
      expect(validateLevel(spec)).toBeNull()
      expect(new Set(spec.queue.map((item) => item.id)).size).toBe(spec.queue.length)
      expect(spec.queue.every((item) => item.speed >= 40 && item.speed <= 240)).toBe(true)
    }
  })

  it('regenerates byte-identical queues in a fresh module registry', async () => {
    vi.resetModules()
    const { getBalloonLevel: freshLevel } = await import('./levels')
    for (const level of [1, 29, 60]) {
      expect(JSON.stringify(freshLevel(level))).toBe(JSON.stringify(plan(level)))
    }
  })

  it('gates each mechanic to its chapter and stacks all in the finale', () => {
    const kinds = (level: number) => new Set(plan(level).queue.map((item) => item.kind))
    const colors = (level: number) => new Set(plan(level).queue.filter((item) => item.kind === 'balloon').map((item) => item.color))
    expect(kinds(1)).toEqual(new Set(['balloon']))
    expect(colors(1)).toEqual(new Set(['red']))
    expect(plan(13).target).toBe('gold')
    expect(Array.from({ length: 11 }, (_, index) => kinds(34 + index).has('spike')).some(Boolean)).toBe(true)
    expect(plan(23).queue.every((item) => item.chain < 0)).toBe(true)
    expect(Array.from({ length: 11 }, (_, index) => plan(34 + index).windAmp).every((amp) => amp > 0)).toBe(true)
    expect(plan(23).windAmp).toBeGreaterThan(0)
    expect(plan(23).windAmp).toBeLessThan(plan(34).windAmp)
    expect(plan(12).windAmp).toBe(0)
    expect(Array.from({ length: 16 }, (_, index) => plan(45 + index).queue).flat().some((item) => item.chain >= 0)).toBe(true)
    expect(Array.from({ length: 16 }, (_, index) => plan(45 + index).queue).flat().some((item) => item.kind === 'spike')).toBe(true)
    for (let level = 1; level <= LEVEL_COUNT; level += 1) {
      expect(plan(level).queue.filter((item) => item.chain >= 0).every((item) => item.color === plan(level).target)).toBe(true)
    }
  })

  it('tightens cadence, quotas and speed across chapters', () => {
    const starts = CHAPTER_STARTS.map((start) => plan(start))
    expect(starts.map((spec) => spec.quota)).toEqual([12, 16, 18, 20, 22])
    expect(starts.map((spec) => spec.lives)).toEqual([4, 4, 3, 3, 2])
    for (let index = 1; index < starts.length; index += 1) {
      expect(starts[index].quota).toBeGreaterThan(starts[index - 1].quota)
      expect(starts[index].speedFrom).toBeGreaterThan(starts[index - 1].speedFrom)
    }
    const meanInterval = (spec: ReturnType<typeof plan>) => (spec.duration - 2) / Math.max(1, spec.queue.filter((item) => item.chain < 0).length + spec.queue.filter((item) => item.chain >= 0).length / 3)
    expect(meanInterval(plan(53))).toBeLessThan(meanInterval(plan(5)))
    expect(plan(2).spikeChance).toBe(0)
    expect(plan(23).spikeChance).toBeGreaterThan(0)
    expect(plan(34).chainChance).toBeGreaterThan(0)
    expect(plan(12).targetShare).toBeLessThan(1)
    expect(CHAPTERS).toBe(5)
  })
})

describe('balloon drift rules', () => {
  it('computes deterministic rise and drift kinematics', () => {
    const item = spawn({ t: 2, x: 200, speed: 120 })
    expect(positionOf(item, 1, 30, 1)).toEqual({ x: 200, y: FIELD.height + BALLOON_RADIUS })
    expect(positionOf(item, 2, 30, 1).y).toBe(FIELD.height + BALLOON_RADIUS)
    const risen = positionOf(item, 3, 30, 1)
    expect(risen.y).toBeCloseTo(FIELD.height + BALLOON_RADIUS - 120)
    expect(Math.abs(risen.x - 200)).toBeLessThanOrEqual(30)
    const period = (2 * Math.PI) / 1
    expect(positionOf(item, 2 + period, 30, 1).x).toBeCloseTo(200)
    expect(positionOf(item, 2 + period / 4, 30, 1).x).toBeCloseTo(200 + 30)
    expect(positionOf(item, 5, 0, 0).x).toBe(200)
    expect(escapeAt(item)).toBeCloseTo(2 + (FIELD.height + BALLOON_RADIUS * 2) / 120)
    const spike = spawn({ kind: 'spike', speed: 120 })
    expect(escapeAt(spike)).toBeCloseTo(0.5 + (FIELD.height + SPIKE_RADIUS * 2) / 120)
    expect(escapeAt(item)).toBeGreaterThan(escapeAt(spike))
  })

  it('pops by distance, pays the target and fines the wrong color', () => {
    let state = createBalloonState(synthetic([
      spawn({ id: 1, t: 0.5, x: 200, color: 'red' }),
      spawn({ id: 2, t: 0.5, x: 320, color: 'gold' }),
      spawn({ id: 3, t: 0.5, x: 380, color: 'gold' }),
    ], { quota: 3 }))
    state = settled(state, 1.5)
    const empty = popAt(state, 60, 80)
    expect(empty.event).toBe('empty')
    expect(empty.state).toBe(state)
    const wrong = popAt(state, positionOf(spawn({ id: 2, t: 0.5, x: 320, color: 'gold' }), 1.5, 0, 0).x, positionOf(spawn({ id: 2 }), 1.5, 0, 0).y)
    expect(wrong.event).toBe('wrong')
    expect(wrong.gained).toBe(-WRONG_PENALTY)
    expect(wrong.state.score).toBe(0)
    expect(wrong.state.lives).toBe(3)
    const hit = popAt(wrong.state, 200, positionOf(spawn({ t: 0.5, x: 200 }), 1.5, 0, 0).y)
    expect(hit.event).toBe('pop')
    expect(hit.gained).toBe(HIT_SCORE)
    expect(hit.state.hits).toBe(1)
    expect(popAt(hit.state, 200, positionOf(spawn({ t: 0.5, x: 200 }), 1.5, 0, 0).y).event).toBe('empty')
    const capped = { ...hit.state, score: SCORE_CAP - 10 }
    const again = popAt(capped, 380, positionOf(spawn({ t: 0.5, x: 380 }), 1.5, 0, 0).y)
    expect(again.event).toBe('wrong')
    expect(again.state.score).toBe(SCORE_CAP - 10 - WRONG_PENALTY)
  })

  it('resolves chains as one burst and voids them when a member escapes', () => {
    const trio = [-1, 0, 1].map((offset): Spawn => spawn({ id: offset + 2, t: 0.5, x: 240 + offset * CHAIN_GAP, color: 'red', chain: 7 }))
    let state = createBalloonState(synthetic(trio, { quota: 3 }))
    state = settled(state, 1.2)
    const center = positionOf(spawn({ t: 0.5, x: 240 }), 1.2, 0, 0)
    const burst = popAt(state, center.x, center.y)
    expect(burst.event).toBe('chain')
    expect(burst.gained).toBe(HIT_SCORE * 3 + CHAIN_BONUS)
    expect(burst.state.popped.length).toBe(3)
    expect(burst.state.hits).toBe(3)
    expect(burst.state.status).toBe('cleared')
    expect(burst.state.doneChains).toEqual([7])
    const stray = createBalloonState(synthetic([...trio, spawn({ id: 9, t: 0.5, x: 60, color: 'red' })], { quota: 2 }))
    const drained = settled(stray, 30)
    expect(drained.status).toBe('over')
    expect(drained.misses).toBe(4)
    expect(drained.lives).toBe(0)
    expect(drained.lostChains).toEqual([7])
  })

  it('charges a life for spikes and for escaped target balloons', () => {
    let state = createBalloonState(synthetic([
      spawn({ id: 1, t: 0.5, x: 200, kind: 'spike', color: 'red' }),
      spawn({ id: 2, t: 0.5, x: 360, color: 'red' }),
    ], { quota: 5 }))
    state = settled(state, 1.2)
    const spiked = popAt(state, 200, positionOf(spawn({ kind: 'spike' }), 1.2, 0, 0).y)
    expect(spiked.event).toBe('spike')
    expect(spiked.state.lives).toBe(2)
    expect(spiked.state.score).toBe(0)
    expect(spiked.state.hits).toBe(0)
    const after = settled(spiked.state, 7)
    expect(after.escaped).toEqual([2])
    expect(after.misses).toBe(1)
    expect(after.lives).toBe(1)
    const decoy = createBalloonState(synthetic([spawn({ id: 3, t: 0.5, x: 200, color: 'teal' })], { target: 'red', quota: 5 }))
    const safe = settled(decoy, 30)
    expect(safe.escaped).toEqual([3])
    expect(safe.misses).toBe(0)
    expect(safe.lives).toBe(3)
    expect(safe.status).toBe('over')
  })

  it('completes the quota under perfect play', () => {
    for (const level of [1, 23, 38, 60]) {
      const state = perfectRun(level)
      expect(state.status).toBe('cleared')
      expect(state.hits).toBeGreaterThanOrEqual(plan(level).quota)
      expect(state.misses).toBe(0)
      expect(state.lives).toBe(plan(level).lives)
    }
  })

  it('clamps boundary lookups, frames and terminal states', () => {
    expect(plan(0).level).toBe(1)
    expect(plan(999).level).toBe(LEVEL_COUNT)
    expect(plan(Number.NaN).level).toBe(1)
    expect(plan(23.9).level).toBe(23)
    const state = createBalloonState(synthetic([spawn({ t: 0.5, x: 200, color: 'red' })]))
    expect(step(state, Number.NaN)).toBe(state)
    expect(step(state, -1)).toBe(state)
    expect(step(state, 0)).toBe(state)
    const cleared = popAt({ ...state, time: 1 }, 200, positionOf(spawn({ t: 0.5, x: 200 }), 1, 0, 0).y)
    expect(cleared.state.status).toBe('cleared')
    expect(popAt(cleared.state, 200, 200).event).toBe('empty')
    expect(step(cleared.state, 0.016)).toBe(cleared.state)
  })
})
