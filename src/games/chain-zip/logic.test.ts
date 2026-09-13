import { describe, expect, it } from 'vitest'
import { CHAPTER_STARTS, LEVEL_COUNT, createAnchors, getZipLevel } from './levels'
import {
  ATTACH_FACTOR,
  GRAVITY,
  RELEASE_ANGLE,
  SCORE_CAP,
  START_LIVES,
  THETA_MAX,
  WORLD,
  autoAction,
  createRun,
  metersOf,
  pivotOf,
  quotaUnits,
  releaseVelocity,
  scoreFor,
  step,
  toggle,
  type ZipState,
} from './logic'

const allLevels = Array.from({ length: LEVEL_COUNT }, (_, index) => index + 1)
const energy = (state: ZipState, rope: number) => 0.5 * (rope * state.omega) ** 2 - GRAVITY * rope * Math.cos(state.theta)

describe('chain zip pendulum physics', () => {
  const spec = getZipLevel(1)
  const anchors = createAnchors(1)

  it('keeps swing energy inside a tight band over twenty seconds', () => {
    let state = createRun(spec, anchors)
    const base = energy(state, spec.rope)
    for (let index = 0; index < 2400; index += 1) {
      state = step(state, spec, anchors, 1 / 120, 'none')
      expect(Math.abs(energy(state, spec.rope) - base)).toBeLessThanOrEqual(Math.abs(base) * 0.02 + 1e-6)
      expect(state.status).toBe('run')
    }
    expect(state.phase).toBe('swing')
    expect(Math.abs(state.theta)).toBeLessThanOrEqual(spec.swingStart + 1e-9)
  })

  it('flings with exactly the tangential velocity on release', () => {
    const held: ZipState = { ...createRun(spec, anchors), theta: 0.35, omega: 1.4 }
    const freed = toggle(held, spec, anchors)
    const velocity = releaseVelocity(0.35, 1.4, spec.rope)
    expect(freed.phase).toBe('fly')
    expect(freed.vx).toBeCloseTo(velocity.x, 9)
    expect(freed.vy).toBeCloseTo(velocity.y, 9)
    expect(freed.vx).toBeGreaterThan(0)
    expect(freed.vy).toBeLessThan(0)
    expect(freed.x).toBe(held.x)
    expect(freed.y).toBe(held.y)
  })

  it('keeps the bob on the rope circle while swinging', () => {
    let state = createRun(spec, anchors)
    for (let index = 0; index < 300; index += 1) {
      state = step(state, spec, anchors, 1 / 120, 'none')
      const pivot = pivotOf(anchors[state.anchor], state.time)
      expect(Math.hypot(state.x - pivot.x, state.y - pivot.y)).toBeCloseTo(spec.rope, 6)
      expect(Math.abs(state.theta)).toBeLessThanOrEqual(THETA_MAX + 1e-9)
      expect(state.y).toBeLessThan(WORLD.ground)
    }
  })

  it('resets to a canonical hang on attach and refuses out-of-range grabs', () => {
    const target = anchors[1]
    const pivot = pivotOf(target, 2)
    const close: ZipState = { ...createRun(spec, anchors), phase: 'fly', time: 2, x: pivot.x + 2, y: pivot.y + 2, vx: 6, vy: 0 }
    const grabbed = toggle(close, spec, anchors)
    expect(grabbed.anchor).toBe(1)
    expect(grabbed.phase).toBe('swing')
    expect(grabbed.theta).toBeCloseTo(-spec.swingStart, 12)
    expect(grabbed.omega).toBe(0)
    expect(grabbed.lives).toBe(close.lives)
    const far: ZipState = { ...close, x: pivot.x + spec.rope * ATTACH_FACTOR + 3, y: pivot.y }
    expect(toggle(far, spec, anchors)).toBe(far)
    const released = toggle(grabbed, spec, anchors)
    expect(released.phase).toBe('fly')
  })

  it('costs a life on ground impact and fails when lives run out', () => {
    const fall = (lives: number, time: number): ZipState => ({
      ...createRun(spec, anchors), phase: 'fly', time, x: 40, y: WORLD.ground - 0.4, vx: 2, vy: 20, lives,
    })
    const crashed = step(fall(START_LIVES, 0), spec, anchors, 0.02, 'none')
    expect(crashed.lives).toBe(START_LIVES - 1)
    expect(crashed.phase).toBe('swing')
    expect(crashed.anchor).toBe(0)
    expect(crashed.status).toBe('run')
    let last = crashed
    for (let index = 0; index < 4; index += 1) {
      last = step(fall(1, last.time + 1), spec, anchors, 0.02, 'none')
    }
    expect(last.status).toBe('failed')
    expect(last.lives).toBe(0)
  })
})

describe('chain zip anchor stream determinism', () => {
  it('builds all sixty anchor streams without falling off the fallback escape (不抛异常)', () => {
    for (const level of allLevels) {
      expect(() => createAnchors(level), `level ${level} anchor generation threw`).not.toThrow()
    }
  }, 120000)

  it('replays identical seeded anchors for every level', () => {
    const layouts = new Set<string>()
    for (const level of allLevels) {
      const first = createAnchors(level)
      expect(first).toEqual(createAnchors(level))
      expect(getZipLevel(level)).toEqual(getZipLevel(level))
      layouts.add(JSON.stringify(first))
    }
    expect(layouts.size).toBe(LEVEL_COUNT)
  }, 120000)

  it('keeps anchors inside the corridor and strictly forward', () => {
    for (const level of allLevels) {
      const spec = getZipLevel(level)
      const anchors = createAnchors(level)
      expect(anchors.length).toBeGreaterThanOrEqual(5)
      anchors.forEach((anchor, index) => {
        expect(anchor.index).toBe(index)
        expect(anchor.baseY + anchor.amp + spec.rope).toBeLessThanOrEqual(WORLD.ground - 2 + 1e-9)
        expect(anchor.baseY - anchor.amp).toBeGreaterThanOrEqual(24 - 1e-9)
        if (index > 0) expect(anchor.x - anchors[index - 1].x).toBeGreaterThanOrEqual(4.5 - 1e-9)
      })
      expect(anchors[anchors.length - 1].x).toBeGreaterThanOrEqual(quotaUnits(spec))
    }
  }, 120000)
})

describe('chain zip autopilot reachability', () => {
  const run = (level: number) => {
    const spec = getZipLevel(level)
    const anchors = createAnchors(level)
    let state = createRun(spec, anchors)
    for (let guard = 0; guard < 15000 && state.status === 'run'; guard += 1) {
      state = step(state, spec, anchors, 1 / 120, autoAction(state, spec, anchors))
    }
    return state
  }

  it('clears all sixty levels without losing a life', () => {
    for (const level of allLevels) {
      const spec = getZipLevel(level)
      const result = run(level)
      expect(result.status, `level ${level} ended ${result.status} at ${Math.round(metersOf(result.progress))}m`).toBe('completed')
      expect(result.progress).toBeGreaterThanOrEqual(quotaUnits(spec) - 1e-9)
      expect(result.lives).toBe(START_LIVES)
      expect(scoreFor(result.progress, result.golds)).toBeGreaterThan(0)
    }
  }, 180000)

  it('releases only at the forward tilt threshold while swinging', () => {
    const spec = getZipLevel(9)
    const anchors = createAnchors(9)
    let state = createRun(spec, anchors)
    let releases = 0
    for (let guard = 0; guard < 4000 && state.status === 'run' && releases < 6; guard += 1) {
      const action = autoAction(state, spec, anchors)
      if (action === 'toggle' && state.phase === 'swing') {
        releases += 1
        expect(state.theta).toBeGreaterThanOrEqual(RELEASE_ANGLE - 1e-9)
        expect(state.omega).toBeGreaterThan(0)
      }
      state = step(state, spec, anchors, 1 / 120, action)
    }
    expect(releases).toBe(6)
    expect(state.status).toBe('run')
  }, 60000)
})

describe('chain zip difficulty curve', () => {
  const levels = allLevels.map(getZipLevel)

  it('raises quota, rope length and swing amplitude chapter over chapter', () => {
    for (let index = 1; index < levels.length; index += 1) {
      expect(levels[index].meters).toBeGreaterThanOrEqual(levels[index - 1].meters)
      expect(levels[index].swingStart).toBeGreaterThanOrEqual(levels[index - 1].swingStart - 1e-9)
    }
    CHAPTER_STARTS.forEach((start, index) => {
      expect(levels[start - 1].chapter).toBe(index + 1)
    })
    expect(levels[0].meters).toBe(600)
    expect(levels.at(-1)?.meters).toBe(1300)
    expect(levels[44].rope).toBeGreaterThan(levels[0].rope)
    expect(levels[44].rope).toBeGreaterThan(levels[33].rope)
    expect(levels[10].spacing).toBeGreaterThan(levels[0].spacing)
    expect(levels[59].spacing).toBeGreaterThan(levels[44].spacing)
  })

  it('introduces one mechanic per chapter and combines all in the fifth', () => {
    levels.forEach((spec) => {
      if (spec.chapter >= 3) {
        expect(spec.mover).toBe(true)
        expect(spec.amp).toBeGreaterThan(0)
      } else {
        expect(spec.mover).toBe(false)
        expect(spec.amp).toBe(0)
      }
      expect(spec.gold).toBe(spec.chapter === 5)
    })
    expect(levels[11]).toMatchObject({ mover: false, gold: false })
    expect(levels[22]).toMatchObject({ mover: true, gold: false })
    expect(levels[33]).toMatchObject({ mover: true, gold: false })
    expect(levels[43].rope).toBeCloseTo(26, 6)
    expect(levels[44]).toMatchObject({ mover: true, gold: true })
  })
})

describe('chain zip boundaries', () => {
  it('clamps level lookups to the valid range', () => {
    expect(getZipLevel(0)).toEqual(getZipLevel(1))
    expect(getZipLevel(999)).toEqual(getZipLevel(60))
    expect(getZipLevel(Number.NaN)).toEqual(getZipLevel(1))
    expect(getZipLevel(7.8).level).toBe(7)
  })

  it('ignores dead timing input and frozen states', () => {
    const spec = getZipLevel(2)
    const anchors = createAnchors(2)
    const world = createRun(spec, anchors)
    expect(step(world, spec, anchors, 0, 'toggle')).toBe(world)
    expect(step(world, spec, anchors, Number.NaN, 'toggle')).toBe(world)
    expect(step(world, spec, anchors, -1, 'none')).toBe(world)
    const done: ZipState = { ...world, status: 'completed' }
    expect(step(done, spec, anchors, 0.02, 'toggle')).toBe(done)
    expect(toggle(done, spec, anchors)).toBe(done)
  })

  it('derives meters and caps the score exactly', () => {
    expect(metersOf(0)).toBe(0)
    expect(metersOf(4.9)).toBe(9.8)
    expect(scoreFor(4.9, 0)).toBe(0)
    expect(scoreFor(5, 0)).toBe(10)
    expect(scoreFor(5, 1)).toBe(210)
    expect(scoreFor(10000, 9999)).toBe(SCORE_CAP)
    expect(scoreFor(-3, 0)).toBe(0)
  })
})
