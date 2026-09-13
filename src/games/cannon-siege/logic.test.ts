import { describe, expect, it } from 'vitest'
import {
  AMMO_SCORE, apexOf, applyShot, beginCharge, createSiegeState, FIELD, GRAVITY, HIT_SCORE,
  holdCharge, hasSolution, aimRad, muzzleSpeed, rangeOf, release, setAim, shellAt, shotPower, SOLVE_AIMS, SOLVE_POWERS,
  stepSiege, targetX, traceShot, MUZZLE, V_MIN, V_MAX,
} from './logic'
import { chapterOf, generateSiegeLevel, getSiegeSpec, hpDemand, SIEGE_LEVEL_COUNT } from './levels'

const levels = Array.from({ length: SIEGE_LEVEL_COUNT }, (_, index) => index + 1)
const courses = new Map(levels.map((level) => [level, generateSiegeLevel(level)]))
const spec12 = getSiegeSpec(12)
const plainCourse = {
  level: spec12,
  targets: [{ baseX: 64, y: 10, amp: 0, period: 0, phase: 0, helmet: false }],
  walls: [],
  wind: 0,
  ammo: 4,
  seed: 1,
}

describe('cannon siege ballistic pure functions', () => {
  it('matches the closed-form projectile solution exactly', () => {
    const angle = aimRad(0.5)
    const power = 0.6
    const speed = muzzleSpeed(power)
    const vx = Math.cos(angle) * speed
    const vy = Math.sin(angle) * speed
    expect(shotPower(0)).toBeCloseTo(0.25, 12)
    expect(muzzleSpeed(0)).toBe(V_MIN)
    expect(muzzleSpeed(1)).toBe(V_MAX)
    for (const t of [0.4, 1.1, 2.3]) {
      const point = shellAt(t, angle, power, 0)
      expect(point.x).toBeCloseTo(6 + vx * t, 9)
      expect(point.y).toBeCloseTo(1.6 + vy * t - 0.5 * GRAVITY * t * t, 9)
    }
    const landed = rangeOf(angle, power, 0)
    expect(shellAt(landed.flight, angle, power, 0).y).toBeCloseTo(0, 6)
    const flightAnalytic = (vy + Math.sqrt(vy * vy + 2 * GRAVITY * MUZZLE)) / GRAVITY
    expect(landed.flight).toBeCloseTo(flightAnalytic, 9)
    expect(landed.x).toBeCloseTo(6 + vx * flightAnalytic, 9)
    const apexTime = vy / GRAVITY
    expect(apexOf(angle, power)).toBeCloseTo(1.6 + (vy * vy) / (2 * GRAVITY), 9)
    expect(shellAt(apexTime, angle, power, 0).y).toBeCloseTo(apexOf(angle, power), 9)
    expect(rangeOf(angle, power, 0).x).toBeLessThanOrEqual(FIELD.width + 90)
  })

  it('adds wind drift as a pure horizontal acceleration term', () => {
    const angle = aimRad(0.4)
    for (const wind of [-6, -2, 2, 6]) {
      for (const t of [0.8, 1.6, 2.4]) {
        const drifted = shellAt(t, angle, 0.5, wind)
        const calm = shellAt(t, angle, 0.5, 0)
        expect(drifted.y).toBe(calm.y)
        expect(drifted.x - calm.x).toBeCloseTo(0.5 * wind * t * t, 9)
      }
      expect(rangeOf(angle, 0.5, wind).x).toBeGreaterThan(rangeOf(angle, 0.5, wind - 0.5).x)
    }
    expect(rangeOf(angle, 0.5, 6).x - rangeOf(angle, 0.5, -6).x).toBeGreaterThan(30)
  })
})

describe('cannon siege hit detection', () => {
  it('hits the bullseye, bounces off walls and falls short deterministically', () => {
    let combo: { aim: number, power: number } | null = null
    for (const aim of SOLVE_AIMS) {
      for (const power of SOLVE_POWERS) {
        if (traceShot(plainCourse, aimRad(aim), power).outcome === 'hit') combo = { aim, power }
        if (combo) break
      }
      if (combo) break
    }
    expect(combo, 'plain course has a solver hit').toBeTruthy()
    const report = traceShot(plainCourse, aimRad(combo!.aim), combo!.power)
    expect(report.outcome).toBe('hit')
    expect(report.hits).toEqual([0])
    expect(traceShot(plainCourse, aimRad(combo!.aim), combo!.power)).toEqual(report)
    const walled = { ...plainCourse, walls: [{ x: 20, width: 3, height: 15 }] }
    expect(traceShot(walled, aimRad(0.1), 0.3).outcome).toBe('wall')
    expect(traceShot(plainCourse, aimRad(0.05), 0.25).outcome === 'ground' || traceShot(plainCourse, aimRad(0.05), 0.25).outcome === 'wall').toBe(true)
  })

  it('lets tailwind carry the same shot far past a headwind landing', () => {
    const angle = aimRad(0.55)
    const tail = rangeOf(angle, 0.5, 5)
    const head = rangeOf(angle, 0.5, -5)
    expect(tail.x - head.x).toBeGreaterThan(15)
    expect(tail.flight).toBeCloseTo(head.flight, 6)
  })

  it('moves patrolling targets on a seeded sine and accepts timing solutions', () => {
    const target = { baseX: 60, y: 12, amp: 5, period: 4, phase: 0, helmet: false }
    expect(targetX(target, 0)).toBeCloseTo(60, 9)
    expect(targetX(target, 1)).toBeCloseTo(65, 9)
    expect(targetX(target, 2)).toBeCloseTo(60, 9)
    expect(targetX(target, 3)).toBeCloseTo(55, 9)
    expect(targetX({ ...target, amp: 0 }, 123)).toBe(60)
    const moving = { ...plainCourse, targets: [target] }
    let found = false
    for (const aim of SOLVE_AIMS) {
      for (const power of SOLVE_POWERS) {
        if (traceShot(moving, aimRad(aim), power, 1).outcome === 'hit') found = true
        if (found) break
      }
      if (found) break
    }
    expect(found, 'moving target is hittable at a chosen timing').toBe(true)
  })

  it('lets shells fly through destroyed wrecks instead of being absorbed (残骸不挡弹)', () => {
    const mk = (baseX: number, y: number) => ({ baseX, y, amp: 0, period: 0, phase: 0, helmet: false })
    const duo = { ...plainCourse, targets: [mk(60, 10), mk(96, 14)], ammo: 4 }
    const combo = SOLVE_AIMS.flatMap((aim) => SOLVE_POWERS.map((power) => ({ aim, power })))
      .find(({ aim, power }) => traceShot(duo, aimRad(aim), power).hits[0] === 0)
    expect(combo, 'front target is hittable').toBeTruthy()
    const blocked = traceShot(duo, aimRad(combo!.aim), combo!.power)
    expect(blocked.hits).toEqual([0])
    const through = traceShot(duo, aimRad(combo!.aim), combo!.power, 0, [true, false])
    expect(through.hits).not.toContain(0)
    expect(through.flight).toBeGreaterThan(blocked.flight)
    // release 同样要跳过残骸:已摧毁的前排不再无声吞弹
    const charge = (combo!.power - 0.25) / 0.75
    const fired = release(setAim({ ...createSiegeState(duo), destroyed: [true, false], charging: true, charge }, combo!.aim), duo)
    expect(fired.event).toBe('fire')
    expect(fired.state.shot?.report.hits).not.toContain(0)
  })
})

describe('cannon siege state machine and scoring', () => {
  it('clamps aim, blocks charging while a shell flies and respects ammo', () => {
    expect(setAim(createSiegeState(plainCourse), 9).aim).toBe(1)
    expect(setAim(createSiegeState(plainCourse), -3).aim).toBe(0)
    expect(setAim(createSiegeState(plainCourse), Number.NaN).aim).toBe(0)
    let state = createSiegeState(plainCourse)
    expect(beginCharge(state).charging).toBe(true)
    state = beginCharge(state)
    for (let index = 0; index < 20; index += 1) state = holdCharge(state, 0.1)
    expect(state.charge).toBe(1)
    const fired = release(state, plainCourse)
    expect(fired.event).toBe('fire')
    expect(fired.state.ammo).toBe(3)
    expect(fired.state.shot).not.toBeNull()
    expect(fired.state.charging).toBe(false)
    expect(beginCharge(fired.state)).toBe(fired.state)
    const dry = release(beginCharge({ ...fired.state, shot: null, ammo: 0 }), plainCourse)
    expect(dry.event).toBeNull()
    expect(release({ ...state, charging: false }, plainCourse).event).toBeNull()
  })

  it('completes with an ammo bonus and fails when the quota runs dry', () => {
    let state = createSiegeState(plainCourse)
    let combo: { aim: number, power: number } | null = null
    for (const aim of SOLVE_AIMS) {
      for (const power of SOLVE_POWERS) {
        if (traceShot(plainCourse, aimRad(aim), power).outcome === 'hit') combo = { aim, power }
        if (combo) break
      }
      if (combo) break
    }
    state = { ...state, charging: true, charge: (combo!.power - 0.25) / 0.75 }
    state = setAim(state, combo!.aim)
    let fired = release(state, plainCourse).state
    let events: readonly string[] = []
    for (let index = 0; index < 400 && !events.length; index += 1) {
      const result = stepSiege(fired, plainCourse, 0.05)
      fired = result.state
      events = result.events
    }
    expect(events).toContain('hit')
    expect(events).toContain('clear')
    expect(fired.over).toBe('completed')
    expect(fired.score).toBe(HIT_SCORE + 3 * AMMO_SCORE)
    const scarce = { ...plainCourse, ammo: 1 }
    let wild = setAim(beginCharge(createSiegeState(scarce)), 0)
    wild = release(wild, scarce).state
    let dryEvents: readonly string[] = []
    for (let index = 0; index < 500 && !dryEvents.length; index += 1) {
      const result = stepSiege(wild, scarce, 0.05)
      wild = result.state
      dryEvents = result.events
    }
    expect(dryEvents).toContain('ground')
    expect(dryEvents).toContain('deplete')
    expect(wild.over).toBe('failed')
  })

  it('cracks helmets on the first hit and destroys on the second', () => {
    const helmeted = { ...plainCourse, targets: [{ ...plainCourse.targets[0], helmet: true }], ammo: 3 }
    const cracked = applyShot({ ...createSiegeState(helmeted), shot: { shell: { angle: aimRad(0.5), power: 0.5, t0: 0 }, report: { outcome: 'hit', hits: [0], flight: 2 } } }, helmeted)
    expect(cracked.events).toEqual(['crack'])
    expect(cracked.state.cracked[0]).toBe(true)
    expect(cracked.state.destroyed[0]).toBe(false)
    expect(cracked.state.score).toBe(0)
    const destroyed = applyShot({ ...cracked.state, shot: { shell: { angle: aimRad(0.5), power: 0.5, t0: 0 }, report: { outcome: 'hit', hits: [0], flight: 2 } } }, helmeted)
    expect(destroyed.events).toContain('hit')
    expect(destroyed.state.destroyed[0]).toBe(true)
    expect(destroyed.state.over).toBe('completed')
    const missed = applyShot({ ...createSiegeState(helmeted), shot: { shell: { angle: aimRad(0.5), power: 0.5, t0: 0 }, report: { outcome: 'ground', hits: [], flight: 2 } } }, helmeted)
    expect(missed.state.combo).toBe(0)
    expect(missed.events).toEqual(['ground'])
  })

  it('ignores zero, negative and NaN timesteps and freezes when over', () => {
    for (const dt of [0, -1, Number.NaN]) {
      const result = stepSiege(createSiegeState(plainCourse), plainCourse, dt)
      expect(result.state.time).toBe(0)
      expect(result.events).toEqual([])
    }
    const done = { ...createSiegeState(plainCourse), over: 'completed' as const }
    expect(stepSiege(done, plainCourse, 0.016).state).toBe(done)
    expect(chapterOf(0)).toBe(1)
    expect(chapterOf(999)).toBe(5)
  })
})

describe('cannon siege seeded generation', () => {
  it('regenerates identical courses and clamps bad levels', () => {
    for (const level of [1, 12, 23, 34, 45, 60]) expect(generateSiegeLevel(level)).toEqual(courses.get(level))
    for (const level of [7, 30, 52]) expect(generateSiegeLevel(level)).toEqual(generateSiegeLevel(level))
    expect(generateSiegeLevel(0)).toEqual(courses.get(1))
    expect(generateSiegeLevel(-4)).toEqual(courses.get(1))
    expect(generateSiegeLevel(999)).toEqual(courses.get(60))
    expect(generateSiegeLevel(Number.NaN)).toEqual(courses.get(1))
    expect(new Set([...courses.values()].map((course) => course.seed)).size).toBe(SIEGE_LEVEL_COUNT)
  })

  it('keeps targets, walls and wind inside fair bounds', () => {
    for (const [, course] of courses) {
      expect(course.targets.length).toBeGreaterThanOrEqual(3)
      expect(course.ammo).toBe(course.targets.length + course.targets.filter((target) => target.helmet).length + course.level.ammoPad)
      expect(course.ammo).toBeGreaterThanOrEqual(hpDemand(course))
      for (const target of course.targets) {
        expect(target.baseX).toBeGreaterThanOrEqual(34)
        expect(target.baseX).toBeLessThanOrEqual(106)
        expect(target.y).toBeGreaterThanOrEqual(7)
        expect(target.y).toBeLessThanOrEqual(30)
        expect(target.amp).toBeLessThanOrEqual(8.5)
        expect(target.period).toBeGreaterThanOrEqual(0)
      }
      for (const wall of course.walls) {
        expect(wall.x).toBeGreaterThanOrEqual(16)
        expect(wall.x + wall.width).toBeLessThan(Math.min(...course.targets.map((target) => target.baseX - target.amp)))
        expect(wall.height).toBeLessThanOrEqual(15.5)
      }
      const cap = Math.round(course.level.windMax * (0.55 + 0.45 * course.level.ramp) * 10) / 10
      expect(Math.abs(course.wind)).toBeLessThanOrEqual(cap + 1e-9)
    }
  })

  it('gates mechanics by chapter and verifies solvability for all 60 levels', () => {
    expect([1, 11, 12, 22, 23, 33, 34, 44, 45, 60].map(chapterOf)).toEqual([1, 1, 2, 2, 3, 3, 4, 4, 5, 5])
    for (const [level, course] of courses) {
      const chapter = course.level.chapter
      if (chapter === 1) {
        expect(course.wind).toBe(0)
        expect(course.walls).toHaveLength(0)
        expect(course.targets.every((target) => target.amp === 0 && !target.helmet)).toBe(true)
      }
      if (chapter >= 3) expect(course.targets.some((target) => target.amp > 0), `level ${level} lacks movers`).toBe(true)
      if (chapter < 3) expect(course.targets.every((target) => target.amp === 0)).toBe(true)
      if (chapter >= 4) expect(course.walls.length, `level ${level} lacks walls`).toBeGreaterThanOrEqual(1)
      if (chapter < 4) expect(course.walls).toHaveLength(0)
      if (chapter >= 5) expect(course.targets.some((target) => target.helmet), `level ${level} lacks helmets`).toBe(true)
      if (chapter < 5) expect(course.targets.every((target) => !target.helmet)).toBe(true)
      for (let index = 0; index < course.targets.length; index += 1) {
        expect(hasSolution(course, index), `level ${level} target ${index} unsolvable`).toBe(true)
      }
    }
  }, 60000)

  it('raises wind ceilings, target counts and mech stacks across chapters', () => {
    const firstOf = (chapter: number) => getSiegeSpec(chapter * 11 - 10)
    let lastWind = -1
    let lastTargets = 0
    for (let chapter = 1; chapter <= 5; chapter += 1) {
      const spec = firstOf(chapter)
      expect(spec.windMax).toBeGreaterThan(lastWind)
      expect(spec.targetCount).toBeGreaterThanOrEqual(lastTargets)
      lastWind = spec.windMax
      lastTargets = spec.targetCount
    }
    const finale = firstOf(5)
    expect(finale.moveChance).toBeGreaterThan(0)
    expect(finale.wallChance).toBeGreaterThan(0)
    expect(finale.helmetChance).toBeGreaterThan(0)
    expect(finale.windMax).toBeGreaterThanOrEqual(6)
    expect(getSiegeSpec(11).targetCount).toBeGreaterThan(getSiegeSpec(1).targetCount)
    const scoped = (chapter: number) => levels.filter((level) => chapterOf(level) === chapter).map((level) => courses.get(level)!)
    const pace = (list: ReturnType<typeof scoped>) => list.reduce((total, course) => total + course.targets.length, 0) / list.length
    for (let chapter = 2; chapter <= 5; chapter += 1) {
      expect(pace(scoped(chapter))).toBeGreaterThanOrEqual(pace(scoped(chapter - 1)))
    }
    expect(pace(scoped(5))).toBeGreaterThan(pace(scoped(1)))
  })
})
