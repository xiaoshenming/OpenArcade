import { describe, expect, it } from 'vitest'
import {
  advance, autopilotSteer, BASE_RADIUS, canCrush, courseScore, createRollerState, CRUSH_SCORE, DT, FLAKE_SCORE,
  flakesFor, MAX_RADIUS, overlapsObstacle, radiusFor, SCORE_MAX, simulateCourse, speedAt, START_LIVES,
  STEP_METERS, STEP_SCORE, TRACK_HALF, type StepResult,
} from './logic'
import { chapterOf, generateCourse, getSnowLevel, SNOW_LEVEL_COUNT, type Course, type Obstacle, type Ramp } from './levels'

const levels = Array.from({ length: SNOW_LEVEL_COUNT }, (_, index) => index + 1)
const courses = new Map(levels.map((level) => [level, generateCourse(level)]))

const baseCourse = (over: Partial<Course> = {}): Course => ({
  level: 1, chapter: 1, quota: 500, baseSpeed: 10, accel: 0, ice: false, blizzard: 0, targetRadius: 2,
  obstacles: [], ramps: [], flakes: [], title: 't', detail: 'd', seed: 1, ...over,
})

const rockAt = (over: Partial<Obstacle>): Obstacle => ({ kind: 'rock', z: 40, x: 0, half: 0.6, crushAt: 1.05, ...over })

interface RollerStart { z?: number, x?: number, vx?: number, flakes?: number, air?: number, lives?: number }

interface RunOutcome {
  state: StepResult['state']
  hit: StepResult | null
  crush: StepResult | null
  ramped: boolean
}

const roll = (start: RollerStart, course: Course, frames = 600): RunOutcome => {
  let state = { ...createRollerState(), ...start }
  const taken = new Set<number>()
  const broken = new Set<number>()
  let hit: StepResult | null = null
  let crush: StepResult | null = null
  let ramped = false
  for (let frame = 0; frame < frames; frame += 1) {
    const result = advance(state, { steer: 0 }, course, taken, broken)
    state = result.state
    for (const index of result.collected) taken.add(index)
    for (const index of result.crushed) broken.add(index)
    if (!hit && result.hitIndex >= 0) hit = result
    if (!crush && result.crushed.length > 0) crush = result
    if (result.events.includes('ramp')) ramped = true
  }
  return { state, hit, crush, ramped }
}

describe('snow roller radius growth (log, pure)', () => {
  it('grows from the base radius with concave log increments and caps out', () => {
    expect(radiusFor(0)).toBe(BASE_RADIUS)
    expect(radiusFor(-4)).toBe(BASE_RADIUS)
    expect(radiusFor(Number.NaN)).toBe(BASE_RADIUS)
    expect(radiusFor(5)).toBeCloseTo(BASE_RADIUS + 0.62 * Math.LN2, 6)
    expect(radiusFor(50)).toBeGreaterThan(radiusFor(30))
    expect(radiusFor(30) - radiusFor(20)).toBeLessThan(radiusFor(20) - radiusFor(10))
    expect(radiusFor(20) - radiusFor(10)).toBeGreaterThan(0)
    expect(radiusFor(1e9)).toBe(MAX_RADIUS)
    expect(radiusFor(MAX_RADIUS + 5)).toBeLessThanOrEqual(MAX_RADIUS)
    expect(flakesFor(radiusFor(23))).toBeCloseTo(23, 4)
    expect(flakesFor(BASE_RADIUS)).toBe(0)
  })

  it('keeps every level stocked with enough flakes to reach the radius goal', () => {
    for (const [level, course] of courses) {
      const needed = Math.ceil(flakesFor(course.targetRadius))
      expect(course.flakes.length, `level ${level} cannot reach radius goal`).toBeGreaterThanOrEqual(needed)
      expect(course.targetRadius).toBeLessThanOrEqual(2.15)
    }
  })
})

describe('snow roller deterministic obstacle stream', () => {
  it('regenerates identical seeded courses and clamps edge levels', () => {
    for (const level of [1, 12, 23, 34, 45, 60]) expect(generateCourse(level)).toEqual(courses.get(level))
    for (const level of [7, 30, 52]) expect(generateCourse(level)).toEqual(generateCourse(level))
    expect(generateCourse(0)).toEqual(courses.get(1))
    expect(generateCourse(-9)).toEqual(courses.get(1))
    expect(generateCourse(999)).toEqual(courses.get(60))
    expect(generateCourse(Number.NaN)).toEqual(courses.get(1))
    expect(new Set([...courses.values()].map((course) => course.seed)).size).toBe(SNOW_LEVEL_COUNT)
  })

  it('lays sorted in-bounds entities with fair spacing and legal geometry', () => {
    for (const course of courses.values()) {
      const zs = course.obstacles.map((obstacle) => obstacle.z)
      expect([...zs].sort((a, b) => a - b)).toEqual(zs)
      for (const obstacle of course.obstacles) {
        expect(obstacle.z).toBeGreaterThan(4)
        expect(obstacle.z).toBeLessThan(course.quota)
        expect(Math.abs(obstacle.x)).toBeLessThanOrEqual(TRACK_HALF)
        if (obstacle.kind === 'snowman') {
          expect(obstacle.half).toBe(1.5)
          expect(obstacle.crushAt).toBe(2)
          expect(Math.abs(obstacle.x)).toBeGreaterThanOrEqual(1.7)
        } else if (Number.isFinite(obstacle.crushAt)) {
          expect(obstacle.half).toBeLessThanOrEqual(0.8)
          expect(obstacle.crushAt).toBeCloseTo(obstacle.half + 0.45, 6)
        } else {
          expect(obstacle.half).toBeLessThanOrEqual(1.35)
          expect(Math.abs(obstacle.x)).toBeGreaterThanOrEqual(1.5)
        }
      }
      for (let index = 1; index < course.obstacles.length; index += 1) {
        expect(course.obstacles[index].z - course.obstacles[index - 1].z).toBeGreaterThanOrEqual(course.baseSpeed * 1.04)
      }
      for (const ramp of course.ramps) {
        expect(ramp.z).toBeGreaterThan(4)
        for (const obstacle of course.obstacles) {
          if (obstacle.z > ramp.z) expect(obstacle.z - ramp.z).toBeGreaterThanOrEqual(course.baseSpeed * 1.25)
        }
      }
      for (const flake of course.flakes) {
        expect(flake.z).toBeGreaterThan(0)
        expect(flake.z).toBeLessThan(course.quota)
        expect(Math.abs(flake.x)).toBeLessThanOrEqual(TRACK_HALF)
      }
    }
  })
})

describe('snow roller collision verdicts depend on radius', () => {
  it('crushes small rocks once the ball is wide enough and is hurt otherwise', () => {
    const small = rockAt({})
    expect(canCrush(1.05, small)).toBe(true)
    expect(canCrush(1.04, small)).toBe(false)
    expect(overlapsObstacle(40, 1.2, 0.7, small)).toBe(true)
    expect(overlapsObstacle(40, 2.4, 0.7, small)).toBe(false)
    const big = rockAt({ half: 1.2, crushAt: Number.POSITIVE_INFINITY })
    expect(canCrush(MAX_RADIUS, big)).toBe(false)
    const smallRun = roll({ z: 35 }, baseCourse({ obstacles: [small] }))
    expect(smallRun.hit).not.toBeNull()
    expect(smallRun.hit!.hitIndex).toBe(0)
    expect(smallRun.hit!.events).toContain('hit')
    expect(smallRun.state.lives).toBe(START_LIVES - 1)
    expect(smallRun.hit!.state.iframes).toBeGreaterThan(0)
    const fatRun = roll({ z: 35, flakes: 20 }, baseCourse({ obstacles: [small] }))
    expect(fatRun.crush).not.toBeNull()
    expect(fatRun.crush!.crushed).toEqual([0])
    expect(fatRun.crush!.events).toContain('crush')
    expect(fatRun.state.lives).toBe(START_LIVES)
    expect(fatRun.state.crushes).toBe(1)
    const bigRun = roll({ z: 35, flakes: 60 }, baseCourse({ obstacles: [big] }))
    expect(bigRun.hit).not.toBeNull()
    expect(bigRun.state.lives).toBeLessThan(START_LIVES)
  })

  it('flies over everything while airborne and still gathers high flakes', () => {
    const course = baseCourse({
      obstacles: [rockAt({})],
      flakes: [{ z: 33, x: 0, high: false }, { z: 40, x: 0, high: true }],
    })
    const flight = roll({ z: 35, air: 0.8 }, course)
    expect(flight.hit).toBeNull()
    expect(flight.crush).toBeNull()
    expect(flight.state.lives).toBe(START_LIVES)
    expect(flight.state.flakes).toBe(1)
    const grounded = roll({ z: 28 }, baseCourse({ flakes: [{ z: 33, x: 0, high: false }] }))
    expect(grounded.state.flakes).toBe(1)
  })

  it('launches from ramps, slides further on ice and stops at the walls', () => {
    const ramps: Ramp[] = [{ z: 30, x: 0, half: 1.15 }]
    const rampRun = roll({ z: 26 }, baseCourse({ ramps }))
    expect(rampRun.ramped).toBe(true)
    let plain = createRollerState()
    let icy = createRollerState()
    const normal = baseCourse({})
    const frozen = baseCourse({ ice: true })
    for (let frame = 0; frame < Math.round(0.5 / DT); frame += 1) {
      plain = advance(plain, { steer: 1 }, normal, new Set(), new Set()).state
      icy = advance(icy, { steer: 1 }, frozen, new Set(), new Set()).state
    }
    expect(Math.abs(icy.x)).toBeGreaterThan(Math.abs(plain.x))
    expect(Math.abs(icy.vx)).toBeGreaterThan(Math.abs(plain.vx))
    const wall = roll({ x: 4, vx: 0 }, baseCourse({}), 240)
    expect(wall.state.x).toBeCloseTo(TRACK_HALF - BASE_RADIUS, 6)
    expect(speedAt(10, 1, 5)).toBeCloseTo(15, 6)
    expect(speedAt(10, 10, 99)).toBeCloseTo(10 * 1.55, 6)
    expect(speedAt(-3, 2, 1)).toBe(0)
  })
})

describe('snow roller scoring and input boundaries', () => {
  it('scores 10 per 10m, 25 per flake, 150 per crush, capped at 10000', () => {
    expect(courseScore(0, 0, 0)).toBe(0)
    expect(courseScore(9.9, 0, 0)).toBe(0)
    expect(courseScore(10, 0, 0)).toBe(STEP_SCORE)
    expect(courseScore(567.8, 0, 0)).toBe(560)
    expect(courseScore(0, 2, 0)).toBe(2 * FLAKE_SCORE)
    expect(courseScore(0, 0, 1)).toBe(CRUSH_SCORE)
    expect(courseScore(STEP_METERS * 3, 4, 2)).toBe(30 + 4 * FLAKE_SCORE + 2 * CRUSH_SCORE)
    expect(courseScore(-5, -3, -2)).toBe(0)
    expect(courseScore(99999, 9999, 999)).toBe(SCORE_MAX)
  })

  it('ignores dead time, hostile numbers and keeps won/dead flags honest', () => {
    const course = baseCourse({ targetRadius: 5 })
    const state = { ...createRollerState(), z: 30 }
    const still = advance(state, { steer: 0.4 }, course, new Set(), new Set(), 0)
    expect(still.state.z).toBe(30)
    expect(still.state.x).toBe(0)
    const nan = advance(state, { steer: Number.NaN }, course, new Set(), new Set(), Number.NaN)
    expect(nan.state.z).toBe(30)
    const drift = advance({ ...state, vx: 0 }, { steer: Number.NaN }, course, new Set(), new Set())
    expect(drift.state.vx).toBe(0)
    expect(drift.state.x).toBe(0)
    const wonRun = advance({ ...createRollerState(), z: course.quota - 0.05 }, { steer: 0 }, course, new Set(), new Set())
    expect(wonRun.won).toBe(true)
    expect(wonRun.events).toContain('goal')
    const lostRun = advance({ ...createRollerState(), lives: 0 }, { steer: 0 }, course, new Set(), new Set(), 0)
    expect(lostRun.dead).toBe(true)
    const goalByRadius = advance({ ...createRollerState(), flakes: 500 }, { steer: 0 }, baseCourse({ targetRadius: 2 }), new Set(), new Set())
    expect(goalByRadius.won).toBe(true)
    expect(goalByRadius.events).toContain('goal')
    const blocked = baseCourse({ obstacles: [rockAt({ half: 1.2, crushAt: Number.POSITIVE_INFINITY, z: 40 })] })
    expect(autopilotSteer({ ...createRollerState(), z: 10 }, blocked, new Set(), new Set())).not.toBe(0)
  })
})

describe('snow roller chapter curve stays tightening', () => {
  it('gates mechanics by chapter and stacks everything in the finale', () => {
    expect([1, 11, 12, 22, 23, 33, 34, 44, 45, 60].map(chapterOf)).toEqual([1, 1, 2, 2, 3, 3, 4, 4, 5, 5])
    const pick = (chapter: number) => levels.filter((level) => chapterOf(level) === chapter).map((level) => courses.get(level)!)
    for (const course of pick(1)) {
      expect(course.ramps).toHaveLength(0)
      expect(course.ice).toBe(false)
      expect(course.blizzard).toBe(0)
      expect(course.obstacles.every((obstacle) => obstacle.kind === 'rock' && Number.isFinite(obstacle.crushAt))).toBe(true)
    }
    expect(pick(2).every((course) => course.ramps.length > 0)).toBe(true)
    expect(pick(2).some((course) => course.obstacles.some((obstacle) => !Number.isFinite(obstacle.crushAt)))).toBe(true)
    for (const chapter of [3, 4, 5]) expect(pick(chapter).every((course) => course.ice)).toBe(true)
    expect(pick(3).every((course) => course.blizzard === 0)).toBe(true)
    for (const course of pick(4)) {
      expect(course.blizzard).toBeGreaterThan(8)
      expect(course.blizzard).toBeLessThan(30)
    }
    for (const course of pick(5)) {
      expect(course.obstacles.some((obstacle) => obstacle.kind === 'snowman')).toBe(true)
      expect(course.ramps.length).toBeGreaterThan(0)
      expect(course.blizzard).toBeGreaterThan(0)
    }
    expect(getSnowLevel(60)).toMatchObject({ quota: 1300, ice: true })
  })

  it('raises quota and pace pressure across the five chapters', () => {
    let lastQuota = 0
    let lastSpeed = 0
    let lastPace = Number.POSITIVE_INFINITY
    for (let chapter = 1; chapter <= 5; chapter += 1) {
      const scoped = levels.filter((level) => chapterOf(level) === chapter).map((level) => courses.get(level)!)
      const quota = scoped[0].quota
      const speed = scoped[scoped.length - 1].baseSpeed
      const pace = scoped.reduce((total, course) => {
        const events = [...course.obstacles.map((obstacle) => obstacle.z), ...course.ramps.map((ramp) => ramp.z)].sort((a, b) => a - b)
        const gaps = events.slice(1).map((z, index) => z - events[index])
        const avg = gaps.reduce((sum, gap) => sum + gap, 0) / Math.max(1, gaps.length)
        return total + avg / course.baseSpeed
      }, 0) / scoped.length
      expect(quota).toBeGreaterThanOrEqual(lastQuota)
      expect(speed).toBeGreaterThan(lastSpeed)
      expect(pace).toBeLessThan(lastPace)
      lastQuota = quota
      lastSpeed = speed
      lastPace = pace
    }
    expect(getSnowLevel(11).baseSpeed).toBeGreaterThan(getSnowLevel(1).baseSpeed)
    expect(getSnowLevel(22).baseSpeed).toBeGreaterThan(getSnowLevel(12).baseSpeed)
  })

  it('lets the autopilot clear every generated course without losing a life', () => {
    for (const [level, course] of courses) {
      const report = simulateCourse(course)
      expect(report.won, `level ${level} never finished`).toBe(true)
      expect(report.deaths, `level ${level} lost lives`).toBe(0)
      expect(report.flakes, `level ${level} gathered no snowflakes`).toBeGreaterThan(5)
    }
  }, 120000)
})
