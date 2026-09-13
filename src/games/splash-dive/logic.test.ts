import { describe, expect, it, vi } from 'vitest'
import {
  COMBO_GAP, DIVER_MIN, DIVER_R, FIELD, JELLY_MAX, JELLY_R, JELLY_RISE, PEARL_R, PEARL_SCORE, SCORE_CAP, SPAWN_BELOW,
  comboMultiplier, createGameState, currentAt, speedScore, step, type ActiveHazard, type DivePlan, type GameState,
  type InputState, type Pearl,
} from './logic'
import {
  CHAPTER_STARTS, FAIR_WIDTH, JELLY_TAU_MAX, LEVEL_COUNT, MIN_HAZARD_GAP, MIN_PEARLS, REGEN_LIMIT, chapterOf,
  createDiveState,
  getDiveLevel, hazardBoxes, maxBlockedWidth, resolveDiveLevel, validateLevel, type ChapterConfig, type DiveLevelSpec,
} from './levels'

const plan = (level: number) => getDiveLevel(level)
const idle: InputState = { left: false, right: false, down: false }
const run = (state: GameState, seconds: number, input: InputState = idle, fps = 60) => {
  for (let frame = 0; frame < seconds * fps && state.status === 'playing'; frame += 1) state = step(state, input, 1 / fps)
  return state
}
const emptyPlan = (over: Partial<DivePlan> = {}): DivePlan => ({
  quota: 400, base: 20, boost: 12, combo: false, zones: [], hazards: [], pearls: [], ...over,
})
const hazardAt = (id: number, x: number, y: number, r = 14, kind: ActiveHazard['kind'] = 'mine'): ActiveHazard => ({ id, x, y, r, vx: 0, kind })
const withHazards = (state: GameState, hazards: ActiveHazard[]): GameState => ({ ...state, base: 20, boost: 12, hazards })
const drainTrails = (spec: DiveLevelSpec): DiveLevelSpec => ({ ...spec, pearls: spec.pearls.slice(-MIN_PEARLS), pearlCount: MIN_PEARLS })

describe('splash dive levels', () => {
  it('builds sixty deterministic, fair and valid dive streams', () => {
    for (let level = 1; level <= LEVEL_COUNT; level += 1) {
      const spec = plan(level)
      expect(JSON.stringify(spec)).toBe(JSON.stringify(plan(level)))
      expect(validateLevel(spec)).toBeNull()
      expect(maxBlockedWidth(spec)).toBeLessThanOrEqual(FAIR_WIDTH)
      expect(spec.hazardCount * MIN_HAZARD_GAP).toBeGreaterThanOrEqual(spec.quota - 90)
      expect(spec.pearlCount).toBeGreaterThanOrEqual(MIN_PEARLS)
      expect(new Set(spec.hazards.map((hazard) => hazard.id)).size).toBe(spec.hazardCount)
      expect(spec.hazards.every((hazard) => hazard.at >= 0 && hazard.enter > 0 && hazard.enter <= SPAWN_BELOW)).toBe(true)
    }
  })

  it('regenerates byte-identical streams in a fresh module registry', async () => {
    vi.resetModules()
    const { getDiveLevel: freshLevel } = await import('./levels')
    for (const level of [1, 17, 33, 49, 60]) {
      expect(JSON.stringify(freshLevel(level))).toBe(JSON.stringify(plan(level)))
      expect(freshLevel(level).hazards.map((hazard) => `${hazard.at}:${hazard.x}:${hazard.r}:${hazard.kind}`))
        .toEqual(plan(level).hazards.map((hazard) => `${hazard.at}:${hazard.x}:${hazard.r}:${hazard.kind}`))
    }
  })

  it('introduces one mechanic per chapter and stacks everything in the finale', () => {
    expect(plan(1).zones).toHaveLength(0)
    expect(plan(1).hazards.every((hazard) => hazard.kind === 'mine' && hazard.drift === 0)).toBe(true)
    expect(plan(12).hazards.some((hazard) => hazard.drift !== 0)).toBe(true)
    expect(plan(23).zones.length).toBeGreaterThanOrEqual(2)
    expect(plan(23).hazards.every((hazard) => hazard.kind === 'mine')).toBe(true)
    expect(plan(34).hazards.some((hazard) => hazard.kind === 'jelly')).toBe(true)
    expect(plan(45).quota).toBe(800)
    expect(plan(45).combo).toBe(true)
    for (let chapter = 1; chapter <= CHAPTER_STARTS.length; chapter += 1) expect(plan(CHAPTER_STARTS[chapter - 1]).chapter).toBe(chapter)
    expect(plan(LEVEL_COUNT).title).toContain('深渊')
  })

  it('tightens difficulty across and inside chapters', () => {
    const quotas = CHAPTER_STARTS.map((start) => plan(start).quota)
    expect(quotas).toEqual([300, 450, 600, 650, 800])
    const average = (chapter: number, read: (spec: DiveLevelSpec) => number) => {
      const start = CHAPTER_STARTS[chapter - 1]
      const size = (chapter < CHAPTER_STARTS.length ? CHAPTER_STARTS[chapter] : LEVEL_COUNT + 1) - start
      let total = 0
      for (let variant = 0; variant < size; variant += 1) total += read(plan(start + variant))
      return total / size
    }
    expect(average(5, (spec) => spec.hazardCount / spec.quota)).toBeGreaterThan(average(1, (spec) => spec.hazardCount / spec.quota))
    expect(average(5, (spec) => spec.hazards.reduce((sum, hazard) => sum + Math.abs(hazard.drift), 0)))
      .toBeGreaterThan(average(2, (spec) => spec.hazards.reduce((sum, hazard) => sum + Math.abs(hazard.drift), 0)))
    expect(average(5, (spec) => spec.zones.reduce((sum, zone) => sum + Math.abs(zone.vx), 0) / Math.max(1, spec.zones.length)))
      .toBeGreaterThan(average(3, (spec) => spec.zones.reduce((sum, zone) => sum + Math.abs(zone.vx), 0) / Math.max(1, spec.zones.length)))
    for (const level of [3, 27, 52]) {
      expect(plan(level + 6).base).toBeGreaterThan(plan(level).base)
      expect(plan(level).gapTo).toBeLessThan(plan(level).gapFrom)
    }
  })

  it('rejects unfair streams and regenerates with a capped retry budget', () => {
    const wall: DiveLevelSpec = {
      ...plan(12), quota: 200,
      hazards: [60, 110, 160].map((x, index) => ({ id: index + 1, at: 0, x, enter: 100 + index, r: 16, drift: (index - 1) * 26, kind: 'mine' as const })),
      hazardCount: 3,
      pearls: Array.from({ length: MIN_PEARLS }, (_, index) => ({ id: 400 + index, at: 0, x: 330, enter: 150 + index, trail: 1 })),
      pearlCount: MIN_PEARLS,
    }
    expect(validateLevel(wall)).toBe('channel saturates')
    expect(maxBlockedWidth(wall)).toBeGreaterThan(FAIR_WIDTH)
    const drained = drainTrails(plan(23))
    const mark = drained.pearls[0]
    const markDepth = mark.at + mark.enter
    const markAt = Math.max(0, markDepth - SPAWN_BELOW)
    const ambush: DiveLevelSpec = {
      ...drained,
      hazards: [...drained.hazards, { id: 999, at: markAt, x: mark.x, enter: markDepth - markAt, r: 16, drift: 0, kind: 'mine' as const }]
        .sort((a, b) => a.at + a.enter - (b.at + b.enter)),
      hazardCount: drained.hazardCount + 1,
    }
    expect(validateLevel(ambush)).toBe('pearl overlaps hazard')
    const hostileCfg: ChapterConfig = { ...plan(57), quota: 800, gapFrom: 24, gapTo: 20, drift: 26, jelly: 0.3, pearls: 0.6 }
    const retry = resolveDiveLevel(57, hostileCfg)
    expect(retry.attempts).toBeLessThanOrEqual(REGEN_LIMIT)
    expect(validateLevel(retry.spec)).toBeNull()
  })

  it('caps jelly tracking windows and keeps pearls outside their chase envelopes', () => {
    for (let level = 34; level <= LEVEL_COUNT; level += 1) {
      const spec = plan(level)
      const jellies = spec.hazards.filter((hazard) => hazard.kind === 'jelly')
      expect(jellies.length, `level ${level} lost its jellies`).toBeGreaterThan(0)
      for (const hazard of jellies) {
        const tau = hazard.enter / (spec.base + JELLY_RISE)
        expect(tau, `level ${level} jelly tracks longer than the fair window`).toBeLessThanOrEqual(JELLY_TAU_MAX + 1e-9)
        const envelope = 2 * (JELLY_MAX * tau + hazard.r + DIVER_R)
        expect(envelope, `level ${level} jelly envelope ${envelope.toFixed(1)} exceeds channel`).toBeLessThanOrEqual(FAIR_WIDTH)
      }
      const boxes = hazardBoxes(spec).filter((box) => box.kind === 'jelly')
      for (const pearl of spec.pearls) {
        const depth = pearl.at + pearl.enter
        const boxed = boxes.some((box) => box.from < depth + 6 && box.to > depth - 6 &&
          box.xMin < pearl.x + PEARL_R + 4 && box.xMax > pearl.x - PEARL_R - 4)
        expect(boxed, `level ${level} pearl at depth ${depth.toFixed(0)} sits inside a jelly envelope`).toBe(false)
      }
    }
  })

  it('clamps level lookups to the playable range', () => {
    expect(plan(0).level).toBe(1)
    expect(plan(999).level).toBe(LEVEL_COUNT)
    expect(plan(Number.NaN).level).toBe(1)
    expect(plan(12.9).level).toBe(12)
    expect(chapterOf(45)).toBe(5)
    expect(chapterOf(11)).toBe(1)
  })
})

describe('splash dive physics', () => {
  it('separates exact contact from near miss and grants invulnerability windows', () => {
    const contactRadius = DIVER_R + 14
    const touching = step(withHazards(createGameState(emptyPlan()), [hazardAt(1, FIELD.width / 2, contactRadius / 4 + 0.5)]), idle, 0.016)
    expect(touching.events).not.toContain('hit')
    expect(touching.lives).toBe(3)
    const hit = step(withHazards(createGameState(emptyPlan()), [hazardAt(1, FIELD.width / 2, contactRadius / 4 - 0.3)]), idle, 0.016)
    expect(hit.events).toContain('hit')
    expect(hit.lives).toBe(2)
    expect(hit.invuln).toBeGreaterThan(0)
    expect(hit.hazards).toHaveLength(0)
    const shielded = step({ ...hit, hazards: [hazardAt(2, FIELD.width / 2, 0)], invuln: 1.6, events: [] }, idle, 0.016)
    expect(shielded.lives).toBe(2)
    expect(shielded.hazards).toHaveLength(1)
    let expired: GameState = { ...hit, hazards: [hazardAt(2, FIELD.width / 2, 0)], invuln: 0.05, events: [] }
    for (let frame = 0; frame < 12 && !expired.events.includes('hit'); frame += 1) expired = step(expired, idle, 1 / 60)
    expect(expired.lives).toBe(1)
    expect(expired.events).toContain('hit')
    const jelly = step(withHazards(createGameState(emptyPlan()), [hazardAt(1, FIELD.width / 2, (DIVER_R + JELLY_R) / 4 - 0.2, JELLY_R, 'jelly')]), idle, 0.016)
    expect(jelly.lives).toBe(2)
  })

  it('fails on the third hit, clears at quota and freezes terminal states', () => {
    let doomed = withHazards(createGameState(emptyPlan({ quota: 10000 })), [hazardAt(1, FIELD.width / 2, 0)])
    doomed = run(doomed, 0.4)
    doomed = { ...doomed, invuln: 0, hazards: [hazardAt(2, FIELD.width / 2, 0)] }
    doomed = run(doomed, 0.4)
    doomed = { ...doomed, invuln: 0, hazards: [hazardAt(3, FIELD.width / 2, 0)] }
    doomed = run(doomed, 0.4)
    expect(doomed.status).toBe('over')
    expect(doomed.lives).toBe(0)
    expect(doomed.events).toContain('over')
    expect(step(doomed, idle, 1)).toBe(doomed)
    let winner = createGameState(emptyPlan({ quota: 80 }))
    winner = run(winner, 5)
    expect(winner.status).toBe('cleared')
    expect(winner.depth).toBeGreaterThanOrEqual(80)
    expect(winner.events).toContain('clear')
    expect(step(winner, idle, 1)).toBe(winner)
    const base = createGameState(emptyPlan())
    expect(step(base, idle, Number.NaN)).toBe(base)
    expect(step(base, idle, -1)).toBe(base)
    expect(step(base, idle, 0)).toBe(base)
    expect(step(base, idle, 9).depth).toBe(step(base, idle, 0.05).depth)
  })

  it('pays depth score, pearl bonus and combo multiplier with a hard cap', () => {
    let cruise = createGameState(emptyPlan({ base: 20, boost: 0 }))
    cruise = run(cruise, 3)
    expect(cruise.depth).toBeCloseTo(60, 0)
    expect(cruise.score).toBe(60)
    const pearls: Pearl[] = [30, 36, 42, 82].map((enter, index) => ({ id: 400 + index, at: 0, x: FIELD.width / 2, enter, trail: 1 }))
    let combo = createGameState(emptyPlan({ combo: true, pearls }))
    for (let frame = 0; frame < 300 && combo.pearlsGot < 4; frame += 1) combo = step(combo, idle, 1 / 60)
    expect(combo.pearlsGot).toBe(4)
    expect(combo.chain).toBe(1)
    expect(combo.pearlScore).toBe(PEARL_SCORE * (1 + 1 + 2 + 1))
    expect(comboMultiplier(3)).toBe(2)
    const flat = run(createGameState(emptyPlan({ pearls: pearls.slice(0, 1) })), 2.2)
    expect(flat.pearlsGot).toBe(1)
    expect(flat.pearlScore).toBe(PEARL_SCORE)
    expect(speedScore({ depth: 999999, pearlScore: 0 })).toBe(SCORE_CAP)
  })

  it('moves only the diver with currents and obeys the analytic displacement invariant', () => {
    const zones = [{ from: 0, to: 100, vx: 30 }]
    const carried = { hazard: { id: 1, at: 80, x: 100, enter: SPAWN_BELOW, r: 14, drift: 0, kind: 'mine' as const }, pearl: { id: 1, at: 80, x: 60, enter: SPAWN_BELOW, trail: 1 } }
    let drifted = createGameState(emptyPlan({ zones, hazards: [carried.hazard], pearls: [carried.pearl] }))
    drifted = run(drifted, 5)
    expect(drifted.depth).toBeCloseTo(100, 0)
    expect(drifted.x).toBeCloseTo(FIELD.width / 2 + 30 * 5, 0)
    expect(drifted.hazards[0].x).toBe(100)
    expect(drifted.pearls[0].x).toBe(60)
    expect(currentAt(zones, 100)).toBe(0)
    const boosted = run(createGameState(emptyPlan({ zones })), 100 / 32, { left: false, right: false, down: true })
    expect(boosted.x).toBeCloseTo(FIELD.width / 2 + 30 * (100 / 32), 0)
    const clamped = run(createGameState(emptyPlan({ zones: [{ from: 0, to: 100, vx: 90 }] })), 5)
    expect(clamped.x).toBe(FIELD.width - DIVER_MIN)
    const steered = run(createGameState(emptyPlan()), 0.5, { left: true, right: false, down: false })
    expect(steered.x).toBeCloseTo(FIELD.width / 2 - 105, 0)
  })

  it('replays a fixed input sequence identically across all sixty levels', () => {
    const replay = (level: number) => {
      let state = createDiveState(level)
      const trace: string[] = []
      for (let frame = 0; frame < 2600 && state.status === 'playing'; frame += 1) {
        const left = frame % 97 < 12
        const right = !left && frame % 89 < 14
        const down = frame % 61 < 38
        state = step(state, { left, right, down }, 1 / 60)
        trace.push(JSON.stringify([
          state.depth, Math.round(state.x * 100) / 100, state.lives, state.score, state.pearlsGot,
          state.hazards.map((hazard) => [hazard.id, Math.round(hazard.x), Math.round(hazard.y * 100) / 100]),
        ]))
      }
      return { status: state.status, score: state.score, trace }
    }
    for (let level = 1; level <= LEVEL_COUNT; level += 1) {
      const first = replay(level)
      const second = replay(level)
      expect(second).toEqual(first)
      expect(first.trace.length).toBeGreaterThan(0)
      expect(['cleared', 'over']).toContain(first.status)
      expect(first.score).toBeGreaterThanOrEqual(0)
      expect(COMBO_GAP).toBeGreaterThan(0)
      expect(PEARL_R).toBeGreaterThan(0)
    }
  })
})
