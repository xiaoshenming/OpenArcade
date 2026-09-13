import { describe, expect, it, vi } from 'vitest'
import {
  CAR_HALF, INVULN_SECONDS, PLAYER_HALF, SCORE_CAP, SPAWN_AHEAD, SWITCH_COOLDOWN, TRUCK_HALF, createGameState,
  halfOf, meetSpan, speedScore, step, type GameState, type InputState, type RoadPlan,
} from './logic'
import {
  CHAPTER_STARTS, LEVEL_COUNT, REGEN_LIMIT, blockedSpans, chapterOf, createTurboState, getTurboLevel,
  resolveTurboLevel, roadSaturation, validateLevel, type ChapterConfig, type TurboLevelSpec,
} from './levels'

const plan = (level: number) => getTurboLevel(level)
const idle: InputState = { left: false, right: false, throttle: false }
const run = (state: GameState, seconds: number, input: InputState = idle, fps = 60) => {
  for (let frame = 0; frame < seconds * fps && state.status === 'playing'; frame += 1) state = step(state, input, 1 / fps)
  return state
}
const emptyPlan = (over: Partial<RoadPlan> = {}): RoadPlan => ({ quota: 500, base: 40, boost: 0, queue: [], coins: [], ...over })
const carAt = (id: number, y: number, lane = 1, kind: 'car' | 'truck' = 'car') => ({ id, lane, y, speed: 40, kind, half: halfOf(kind) })
const withCars = (state: GameState, cars: GameState['cars']): GameState => ({ ...state, base: 40, cars })
const chapterCfg = (level: number): ChapterConfig => {
  const spec = plan(level)
  return { ...spec, traffic: spec.traffic, spread: 6, gapFrom: spec.gapFrom, gapTo: spec.gapTo, truck: spec.chapter >= 2 ? 0.24 : 0, coins: spec.chapter >= 3 ? 0.4 : 0 }
}
const drainTrails = (spec: TurboLevelSpec): TurboLevelSpec => ({ ...spec, coins: spec.coins.slice(-8), coinCount: 8 })

describe('turbo lane levels', () => {
  it('builds sixty deterministic, fair and valid traffic streams', () => {
    for (let level = 1; level <= LEVEL_COUNT; level += 1) {
      const spec = plan(level)
      expect(JSON.stringify(spec)).toBe(JSON.stringify(plan(level)))
      expect(validateLevel(spec)).toBeNull()
      expect(roadSaturation(spec, 0)).toBeLessThanOrEqual(2)
      expect(spec.carCount * 64).toBeGreaterThanOrEqual(spec.quota - 80)
      expect(new Set(spec.queue.map((car) => car.id)).size).toBe(spec.carCount)
      expect(spec.queue.every((car) => car.at >= 0 && car.enter > 0 && car.enter <= SPAWN_AHEAD)).toBe(true)
    }
  })

  it('regenerates byte-identical streams in a fresh module registry', async () => {
    vi.resetModules()
    const { getTurboLevel: freshLevel } = await import('./levels')
    for (const level of [1, 17, 33, 49, 60]) {
      expect(JSON.stringify(freshLevel(level))).toBe(JSON.stringify(plan(level)))
      expect(freshLevel(level).queue.map((car) => `${car.at}:${car.lane}:${car.speed}:${car.kind}`))
        .toEqual(plan(level).queue.map((car) => `${car.at}:${car.lane}:${car.speed}:${car.kind}`))
    }
  })

  it('introduces one mechanic per chapter and stacks everything in the finale', () => {
    expect(plan(1).queue.every((car) => car.kind === 'car')).toBe(true)
    expect(plan(12).queue.some((car) => car.kind === 'truck')).toBe(true)
    expect(plan(23).coins.length).toBeGreaterThanOrEqual(8)
    expect(plan(34).boost).toBeGreaterThan(0)
    expect(plan(23).boost).toBe(0)
    expect(plan(45).quota).toBe(1200)
    expect(plan(45).queue.some((car) => car.kind === 'truck')).toBe(true)
    expect(plan(45).coins.length).toBeGreaterThanOrEqual(8)
    for (let chapter = 1; chapter <= CHAPTER_STARTS.length; chapter += 1) expect(plan(CHAPTER_STARTS[chapter - 1]).chapter).toBe(chapter)
    expect(plan(LEVEL_COUNT).title).toContain('终点')
  })

  it('tightens difficulty across and inside chapters', () => {
    const quotas = CHAPTER_STARTS.map((start) => plan(start).quota)
    expect(quotas).toEqual([600, 800, 1000, 1000, 1200])
    const average = (chapter: number, read: (spec: TurboLevelSpec) => number) => {
      const start = CHAPTER_STARTS[chapter - 1]
      const size = (chapter < CHAPTER_STARTS.length ? CHAPTER_STARTS[chapter] : LEVEL_COUNT + 1) - start
      let total = 0
      for (let variant = 0; variant < size; variant += 1) total += read(plan(start + variant))
      return total / size
    }
    const density = (spec: TurboLevelSpec) => spec.carCount / spec.quota
    expect(average(5, density)).toBeGreaterThan(average(1, density))
    expect(average(5, (spec) => spec.base)).toBeGreaterThan(average(1, (spec) => spec.base))
    expect(average(5, (spec) => (spec.gapFrom + spec.gapTo) / 2)).toBeLessThan(average(1, (spec) => (spec.gapFrom + spec.gapTo) / 2))
    for (const level of [3, 27, 52]) {
      expect(plan(level + 6).base).toBeGreaterThan(plan(level).base)
      expect(plan(level).gapTo).toBeLessThan(plan(level).gapFrom)
    }
    expect(average(2, (spec) => spec.queue.filter((car) => car.kind === 'truck').length / spec.carCount)).toBeGreaterThan(0)
  })

  it('rejects unfair streams and regenerates with a capped retry budget', () => {
    const wall: Array<TurboLevelSpec['queue'][number]> = Array.from({ length: 9 }, (_, index) => ({
      id: index + 1, at: index * 2, lane: index % 3, speed: 20, kind: 'car' as const, enter: SPAWN_AHEAD,
    }))
    const packed: TurboLevelSpec = { ...plan(1), queue: wall, carCount: wall.length }
    expect(validateLevel(packed)).toBe('road saturates')
    expect(roadSaturation(packed, 0)).toBe(3)
    const thin: TurboLevelSpec = { ...plan(1), queue: plan(1).queue.slice(0, 7), carCount: 7 }
    expect(validateLevel(thin)).toBe('traffic too sparse')
    const drained = drainTrails(plan(23))
    const mark = drained.coins[drained.coins.length - 1]
    const reach = CAR_HALF + PLAYER_HALF
    const shift = (SPAWN_AHEAD - reach) * (plan(23).base / (plan(23).base - 24))
    const ambush: TurboLevelSpec = {
      ...drained,
      queue: [...drained.queue, { id: 999, at: mark.at + mark.enter - shift - 1, lane: mark.lane, speed: 24, kind: 'car' as const, enter: SPAWN_AHEAD }]
        .sort((a, b) => a.at + a.enter - (b.at + b.enter)),
      carCount: drained.carCount + 1,
    }
    expect(validateLevel(ambush)).toBe('coin overlaps traffic')
    expect(validateLevel({ ...plan(1), queue: [{ ...plan(1).queue[0], kind: 'truck' }], carCount: 99 })).toBe('truck before chapter 2')
    const hostileCfg: ChapterConfig = { ...chapterCfg(57), quota: 1200, gapFrom: 26, gapTo: 22, truck: 0.34, coins: 0.55 }
    const retry = resolveTurboLevel(57, hostileCfg)
    expect(retry.attempts).toBeLessThanOrEqual(REGEN_LIMIT)
    expect(validateLevel(retry.spec)).toBeNull()
    for (const level of [1, 30, 60]) {
      const spec = plan(level)
      expect(blockedSpans(spec, 0).length).toBe(spec.carCount)
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

describe('turbo lane driving', () => {
  it('switches lanes with edge clamping and hold-repeat cooldown', () => {
    let state = createGameState(emptyPlan())
    expect(state.lane).toBe(1)
    state = step(state, { left: true, right: false, throttle: false }, 0.016)
    expect(state.lane).toBe(0)
    expect(state.cooldown).toBeGreaterThan(0)
    expect(state.cooldown).toBeLessThan(SWITCH_COOLDOWN)
    const heldBack = step(state, { left: true, right: false, throttle: false }, 0.016)
    expect(heldBack.lane).toBe(0)
    const released = step(heldBack, idle, 0.016)
    expect(released.cooldown).toBe(0)
    let state2 = createGameState(emptyPlan())
    state2 = run(step(state2, { left: false, right: true, throttle: false }, 1), 1)
    expect(state2.lane).toBe(2)
    expect(step(state2, { left: false, right: true, throttle: false }, 1).lane).toBe(2)
    const both = step(createGameState(emptyPlan()), { left: true, right: true, throttle: false }, 0.5)
    expect(both.lane).toBe(1)
  })

  it('separates exact contact from near miss and grants invulnerability windows', () => {
    const touching = step(withCars(createGameState(emptyPlan()), [carAt(1, CAR_HALF + PLAYER_HALF)]), idle, 0.016)
    expect(touching.events).not.toContain('hit')
    expect(touching.lives).toBe(3)
    const hit = step(withCars(createGameState(emptyPlan()), [carAt(1, CAR_HALF + PLAYER_HALF - 0.2)]), idle, 0.016)
    expect(hit.events).toContain('hit')
    expect(hit.lives).toBe(2)
    expect(hit.invuln).toBeGreaterThan(0)
    expect(hit.cars).toHaveLength(0)
    const shielded = step({ ...hit, cars: [carAt(2, 0)], invuln: INVULN_SECONDS }, idle, 0.016)
    expect(shielded.lives).toBe(2)
    expect(shielded.cars).toHaveLength(1)
    let expired: GameState = { ...hit, cars: [carAt(2, 0)], invuln: 0.05, events: [] }
    for (let frame = 0; frame < 12 && !expired.events.includes('hit'); frame += 1) expired = step(expired, idle, 1 / 60)
    expect(expired.lives).toBe(1)
    expect(expired.events).toContain('hit')
    const side = step(withCars(createGameState(emptyPlan()), [carAt(1, 0, 0)]), { left: false, right: false, throttle: false }, 0.016)
    expect(side.lives).toBe(3)
    const truck = step(withCars(createGameState(emptyPlan()), [carAt(1, TRUCK_HALF + PLAYER_HALF - 0.3, 1, 'truck')]), idle, 0.016)
    expect(truck.lives).toBe(2)
  })

  it('fails on the third hit, clears at quota and freezes terminal states', () => {
    let doomed = withCars(createGameState(emptyPlan({ quota: 10000 })), [carAt(1, 0)])
    doomed = run(doomed, 0.4)
    doomed = { ...doomed, invuln: 0, cars: [carAt(2, 0)] }
    doomed = run(doomed, 0.4)
    doomed = { ...doomed, invuln: 0, cars: [carAt(3, 0)] }
    doomed = run(doomed, 0.4)
    expect(doomed.status).toBe('over')
    expect(doomed.lives).toBe(0)
    expect(doomed.events).toContain('over')
    expect(step(doomed, idle, 1)).toBe(doomed)
    let winner = createGameState(emptyPlan({ quota: 100 }))
    winner = run(winner, 3)
    expect(winner.status).toBe('cleared')
    expect(winner.distance).toBeGreaterThanOrEqual(100)
    expect(winner.events).toContain('clear')
    expect(step(winner, idle, 1)).toBe(winner)
    const base = createGameState(emptyPlan())
    expect(step(base, idle, Number.NaN)).toBe(base)
    expect(step(base, idle, -1)).toBe(base)
    expect(step(base, idle, 0)).toBe(base)
    expect(step(base, idle, 9).distance).toBe(step(base, idle, 0.05).distance)
  })

  it('pays distance score, coin bonus and throttle multiplier with a hard cap', () => {
    let cruise = createGameState(emptyPlan({ base: 40 }))
    cruise = run(cruise, 3)
    expect(cruise.distance).toBeCloseTo(120, 0)
    expect(cruise.score).toBe(120)
    const throttled = run(createGameState(emptyPlan({ base: 40, boost: 20 })), 3, { left: false, right: false, throttle: true })
    expect(throttled.distance).toBeCloseTo(180, 0)
    expect(throttled.score).toBe(270)
    const ignored = run(createGameState(emptyPlan({ base: 40, boost: 0 })), 3, { left: false, right: false, throttle: true })
    expect(ignored.score).toBe(120)
    const coinPlan = emptyPlan({ coins: [{ id: 500, at: 0, lane: 1, enter: 12, trail: 1 }] })
    let collected = createGameState(coinPlan)
    for (let frame = 0; frame < 60 && !collected.events.includes('coin'); frame += 1) collected = step(collected, idle, 1 / 60)
    expect(collected.coinsGot).toBe(1)
    expect(collected.events).toContain('coin')
    expect(collected.score).toBe(50)
    collected = run(collected, 0.5)
    expect(collected.score).toBe(70)
    const missed = run(createGameState({ ...coinPlan, coins: [{ id: 500, at: 0, lane: 2, enter: 12, trail: 1 }] }), 0.5)
    expect(missed.coinsGot).toBe(0)
    expect(missed.score).toBe(20)
    expect(speedScore({ scoreDist: 999999, coinsGot: 100 })).toBe(SCORE_CAP)
  })

  it('models passing windows with meetSpan used by the generator', () => {
    const span = meetSpan(0, SPAWN_AHEAD, 20, 40, CAR_HALF)
    expect(span.to - span.from).toBeGreaterThan((CAR_HALF + PLAYER_HALF) * 2)
    expect(span.from).toBeGreaterThan(0)
    const faster = meetSpan(0, SPAWN_AHEAD, 20, 80, CAR_HALF)
    expect(faster.to - faster.from).toBeLessThan(span.to - span.from)
  })

  it('replays a fixed input sequence identically across all sixty levels', () => {
    const replay = (level: number) => {
      let state = createTurboState(level)
      const trace: string[] = []
      for (let frame = 0; frame < 2400 && state.status === 'playing'; frame += 1) {
        const left = frame % 97 < 12
        const right = !left && frame % 89 < 14
        const throttle = plan(level).boost > 0 && frame % 61 < 40
        state = step(state, { left, right, throttle }, 1 / 60)
        trace.push(JSON.stringify([
          state.distance, state.lane, state.lives, state.score, state.coinsGot,
          state.cars.map((car) => [car.id, Math.round(car.y * 100) / 100]), state.coins.map((coin) => coin.id),
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
    }
  })
})
