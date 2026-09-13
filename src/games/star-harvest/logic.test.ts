import { describe, expect, it, vi } from 'vitest'
import { COLS, START, createState, lineClear, queueDir, sameCell, seesPlayer, step, type Dir, type GameRule, type GuardMode, type Point } from './logic'
import { CHAPTER_STARTS, LEVEL_COUNT, buildField, createHarvestState, getHarvestLevel, validateSpec } from './levels'

const route: Point[] = [{ x: 2, y: 5 }, { x: 3, y: 5 }, { x: 4, y: 5 }, { x: 5, y: 5 }]
const farRoute: Point[] = [{ x: 1, y: 1 }, { x: 1, y: 2 }, { x: 1, y: 3 }]
const seeds = [{ route, homeIndex: 0, field: buildField([], { x: 2, y: 5 }) }]
const quietSeeds = [{ route: farRoute, homeIndex: 2, field: buildField([], { x: 1, y: 3 }) }]
const rule: GameRule = { quota: 99, stepMs: 140, powerSteps: 60, powerBonus: 0, regenEvery: 0, wrap: false, patrolEvery: 3, chaseEvery: 2 }

describe('star harvest levels', () => {
  it('builds sixty deterministic connected mazes with valid pickups and disjoint routes', () => {
    for (let level = 1; level <= LEVEL_COUNT; level += 1) {
      const first = createHarvestState(level)
      const second = createHarvestState(level)
      expect(first).toEqual(second)
      const spec = getHarvestLevel(level)
      expect(validateSpec(spec)).toBeNull()
      expect(spec.guards).toHaveLength([1, 2, 3, 4, 4][spec.chapter - 1])
      expect(first.guards.every((guard) => guard.mode === 'patrol')).toBe(true)
      expect(first.walls.some((wall) => sameCell(wall, START))).toBe(false)
      expect(getHarvestLevel(level)).toBe(spec)
    }
    expect(createHarvestState(1).rule.quota).toBe(40)
    expect(getHarvestLevel(60).walls.length).toBeGreaterThan(0)
  })

  it('regenerates byte-identical levels in a fresh module registry', async () => {
    const marks = [1, 17, 30, 44, 60]
    const snapshot = marks.map((level) => JSON.stringify(getHarvestLevel(level)))
    vi.resetModules()
    const { getHarvestLevel: fresh } = await import('./levels')
    marks.forEach((level, index) => {
      expect(JSON.stringify(fresh(level))).toBe(snapshot[index])
    })
  })

  it('keeps wrap lanes open and never traps the player against the border', () => {
    for (let level = 1; level <= LEVEL_COUNT; level += 1) {
      const spec = getHarvestLevel(level)
      expect(spec.walls.some((wall) => wall.x === 0 || wall.x === COLS - 1)).toBe(false)
      const open = spec.walls.length + spec.pellets.length + spec.stars.length + 1
      expect(open).toBeLessThanOrEqual(COLS * 11)
    }
  })
})

describe('guard state machine', () => {
  it('detects line of sight only when facing the player with a clear lane', () => {
    expect(seesPlayer([], { x: 2, y: 5 }, 'right', { x: 9, y: 5 })).toBe(true)
    expect(seesPlayer([], { x: 2, y: 5 }, 'left', { x: 9, y: 5 })).toBe(false)
    expect(seesPlayer([{ x: 5, y: 5 }], { x: 2, y: 5 }, 'right', { x: 9, y: 5 })).toBe(false)
    expect(seesPlayer([], { x: 2, y: 5 }, 'right', { x: 9, y: 4 })).toBe(false)
    expect(lineClear([{ x: 2, y: 3 }], { x: 2, y: 1 }, { x: 2, y: 5 })).toBe(false)
    expect(lineClear([], { x: 2, y: 1 }, { x: 2, y: 5 })).toBe(true)
  })

  it('lunges on sight, chases faster than patrol and returns home when blinded', () => {
    let state = createState([], [], [], seeds, rule)
    expect(state.guards[0].pos).toEqual({ x: 2, y: 5 })
    expect(state.guards[0].fwd).toBe(true)
    state = { ...state, player: { x: 14, y: 5 } }
    state = step(state)
    expect(state.guards[0].mode).toBe('chase')
    state = step(state)
    expect(state.guards[0].pos).toEqual({ x: 3, y: 5 })
    state = { ...state, player: { x: 8, y: 1 } }
    state = step(state)
    state = step(state)
    expect(state.guards[0].mode).toBe('return')
    for (let index = 0; index < 30 && state.guards[0].mode !== 'patrol'; index += 1) state = step(state)
    expect(state.guards[0].mode).toBe('patrol')
    expect(state.guards[0].pos).toEqual({ x: 2, y: 5 })
    expect(step({ ...state, player: { x: 14, y: 5 } }).guards[0].mode).toBe('chase')
  })

  it('costs a life on contact and resets the arena, failing at zero lives', () => {
    let state = { ...createState([], [], [], seeds, rule), player: { x: 14, y: 5 }, queue: ['right' as Dir] }
    for (let index = 0; index < 40 && state.lives === 3; index += 1) state = step(state)
    expect(state.lives).toBe(2)
    expect(state.events).toContain('caught')
    expect(state.player).toEqual(START)
    expect(state.guards[0].pos).toEqual({ x: 2, y: 5 })
    expect(state.guards[0].mode).toBe('patrol')
    expect(state.queue).toEqual([])
    let doomed = { ...createState([], [], [], seeds, { ...rule, quota: 99 }), lives: 1, player: { x: 14, y: 5 } }
    for (let index = 0; index < 60 && doomed.status === 'running'; index += 1) doomed = step(doomed)
    expect(doomed.status).toBe('failed')
    expect(doomed.events).toContain('lost')
    expect(doomed.lives).toBe(0)
  })
})

describe('harvest rules', () => {
  it('pays ten per star dust, thirty under power and completes at quota', () => {
    const pellets = [{ x: 8, y: 5 }, { x: 9, y: 5 }, { x: 10, y: 5 }]
    let state = createState([], pellets, [], quietSeeds, { ...rule, quota: 3 })
    state = step(state)
    expect(state.events).toContain('pellet')
    expect(state.score).toBe(10)
    expect(state.eaten).toBe(1)
    const powered = step({ ...createState([], pellets, [], quietSeeds, { ...rule, quota: 3 }), power: 40 })
    expect(powered.score).toBe(30)
    let finisher = createState([], pellets, [], quietSeeds, { ...rule, quota: 3 })
    for (let index = 0; index < 4 && finisher.status === 'running'; index += 1) finisher = step(finisher)
    expect(finisher.status).toBe('completed')
    expect(finisher.events).toContain('done')
    expect(finisher.score).toBe(30)
    const star = step(createState([], [], [{ x: 8, y: 5 }], quietSeeds, rule))
    expect(star.events).toContain('star')
    expect(star.power).toBe(rule.powerSteps)
  })

  it('lets a powered player devour guards for 300 and respawn them at home', () => {
    let state = { ...createState([], [], [], seeds, { ...rule, quota: 99 }), power: 60 }
    state = { ...state, guards: state.guards.map((guard) => ({ ...guard, pos: { x: 9, y: 5 }, phase: 0 })) }
    state = step(state)
    state = step(state)
    expect(state.events).toContain('guard-down')
    expect(state.score).toBe(300)
    expect(state.guards[0].mode).toBe('frozen')
    expect(state.guards[0].frozen).toBeGreaterThan(0)
    for (let index = 0; index < 40 && state.guards[0].mode === 'frozen'; index += 1) state = step(state)
    expect(state.guards[0].mode).toBe('patrol')
    expect(state.guards[0].pos).toEqual({ x: 2, y: 5 })
  })

  it('chains energy stars: each devoured guard extends the power window by the bonus', () => {
    expect(getHarvestLevel(CHAPTER_STARTS[4]).powerBonus).toBe(Math.round(3000 / getHarvestLevel(CHAPTER_STARTS[4]).stepMs))
    expect(getHarvestLevel(CHAPTER_STARTS[4]).powerBonus * getHarvestLevel(CHAPTER_STARTS[4]).stepMs).toBeGreaterThan(2900)
    expect(getHarvestLevel(1).powerBonus).toBe(0)
    let state = { ...createState([], [], [], seeds, { ...rule, quota: 99, powerBonus: 30 }), power: 20 }
    state = { ...state, guards: state.guards.map((guard) => ({ ...guard, pos: { x: 9, y: 5 }, phase: 0 })) }
    state = step(state)
    state = step(state)
    expect(state.events).toContain('guard-down')
    expect(state.power).toBe(20 - 2 + 30)
    expect(state.score).toBe(300)
    let twin = { ...createState([], [], [], [...seeds, { route: farRoute, homeIndex: 0, field: buildField([], { x: 1, y: 1 }) }], { ...rule, quota: 99, powerBonus: 30 }), power: 10 }
    twin = { ...twin, player: { x: 0, y: 2 }, guards: twin.guards.map((guard, index) => (index === 0
      ? { ...guard, pos: { x: 1, y: 2 } }
      : { ...guard, mode: 'chase' as GuardMode, pos: { x: 1, y: 1 }, phase: 1 })) }
    twin = step(twin)
    expect(twin.events.filter((event) => event === 'guard-down')).toHaveLength(2)
    expect(twin.power).toBe(10 - 1 + 60)
  })

  it('regrows eaten star dust on a fixed cadence in regeneration chapters', () => {
    let state = createState([], [{ x: 8, y: 5 }, { x: 9, y: 5 }], [], quietSeeds, { ...rule, regenEvery: 4, quota: 9 })
    expect(state.rule.regenEvery).toBe(4)
    state = step(state)
    state = step(state)
    expect(state.pellets).toHaveLength(0)
    expect(state.regenStack).toEqual([{ x: 8, y: 5 }, { x: 9, y: 5 }])
    for (let index = 0; index < 8 && !state.events.includes('regen'); index += 1) state = step(state)
    expect(state.events).toContain('regen')
    expect(state.pellets.some((cell) => sameCell(cell, { x: 8, y: 5 }))).toBe(true)
  })
})

describe('difficulty and boundaries', () => {
  it('tightens quota, guards and pace across the five chapters', () => {
    const marks = CHAPTER_STARTS.map((start) => getHarvestLevel(start))
    expect(marks.map((spec) => spec.quota)).toEqual([40, 60, 60, 60, 80])
    expect(marks.map((spec) => spec.guards.length)).toEqual([1, 2, 3, 4, 4])
    expect(marks.map((spec) => spec.patrolEvery)).toEqual([3, 3, 2, 2, 2])
    expect(marks.map((spec) => spec.chaseEvery)).toEqual([2, 2, 2, 2, 1])
    expect(marks.map((spec) => spec.wrap)).toEqual([false, false, true, true, true])
    expect(marks.map((spec) => spec.regenEvery > 0)).toEqual([false, false, false, true, true])
    for (let level = 2; level <= LEVEL_COUNT; level += 1) {
      expect(getHarvestLevel(level).stepMs).toBeLessThan(getHarvestLevel(level - 1).stepMs)
    }
    const average = (from: number, to: number) => {
      let total = 0
      for (let level = from; level <= to; level += 1) total += getHarvestLevel(level).walls.length
      return total / (to - from + 1)
    }
    expect(average(45, 60)).toBeGreaterThan(average(1, 11))
    expect(getHarvestLevel(1).powerSteps).toBeGreaterThanOrEqual(66)
    expect(getHarvestLevel(60).powerSteps).toBeLessThanOrEqual(110)
  })

  it('blocks walls, honours tunnels only when enabled and buffers turns', () => {
    const walled = createState([{ x: 8, y: 5 }], [], [], quietSeeds, rule)
    const pushed = step(walled)
    expect(pushed.player).toEqual(START)
    expect(pushed.walls.some((wall) => sameCell(wall, pushed.player))).toBe(false)
    const free = createState([], [], [], quietSeeds, { ...rule, wrap: true })
    expect(step({ ...free, player: { x: COLS - 1, y: 5 } }).player).toEqual({ x: 0, y: 5 })
    expect(step({ ...free, player: { x: 0, y: 5 }, dir: 'left' }).player).toEqual({ x: COLS - 1, y: 5 })
    expect(step({ ...walled, player: { x: COLS - 1, y: 5 } }).player).toEqual({ x: COLS - 1, y: 5 })
    const queued = queueDir(queueDir(createState([], [], [], quietSeeds, rule), 'up'), 'left')
    expect(queued.queue).toEqual(['up', 'left'])
    expect(queueDir(queued, 'left').queue).toEqual(['up', 'left'])
    expect(step(queued).player).toEqual({ x: 7, y: 4 })
    expect(step(step(queued)).dir).toBe('left')
  })

  it('freezes terminal states, replays identically and clamps wild levels', () => {
    const pellets = [{ x: 8, y: 5 }, { x: 9, y: 5 }, { x: 10, y: 5 }]
    const done = createState([], pellets, [], quietSeeds, { ...rule, quota: 3 })
    let finished = done
    for (let index = 0; index < 4 && finished.status === 'running'; index += 1) finished = step(finished)
    expect(step(finished)).toBe(finished)
    expect(step(finished, 'up')).toBe(finished)
    const replay = () => {
      let state = createHarvestState(30)
      const dirs: Dir[] = ['up', 'left', 'down', 'right']
      for (let index = 0; index < 200; index += 1) {
        if (state.status !== 'running') break
        state = step(state, dirs[index % 4])
      }
      return JSON.stringify(state)
    }
    expect(replay()).toBe(replay())
    expect(createHarvestState(0).rule.quota).toBe(40)
    expect(createHarvestState(999).rule.quota).toBe(80)
    expect(createHarvestState(Number.NaN).rule.quota).toBe(40)
  })
})
