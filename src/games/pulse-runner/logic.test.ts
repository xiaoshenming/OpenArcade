import { describe, expect, it } from 'vitest'
import {
  advance, createPulseState, distanceScore, GATE_SCORE, GOLD_SCORE, MAX_LIVES, minGapMeters, pairGapMeters, PRESS_S,
  pressesNeeded, SCORE_MAX, simulateCourse, speedAt, SWITCH_S, trySwitch, totalScore, DT,
} from './logic'
import { chapterOf, FIRST_GATE_M, generateCourse, getPulseLevel, PULSE_LEVEL_COUNT } from './levels'

const levels = Array.from({ length: PULSE_LEVEL_COUNT }, (_, index) => index + 1)
const courses = new Map(levels.map((level) => [level, generateCourse(level)]))
const solidsOf = (course: ReturnType<typeof generateCourse>) => course.gates.filter((gate) => gate.kind === 'solid')

describe('pulse runner color switching state machine', () => {
  it('cycles colors with a cooldown and refuses presses while cooling or finished', () => {
    const spec = getPulseLevel(20)
    let state = createPulseState()
    expect(state.color).toBe(0)
    const first = trySwitch(state, spec)
    expect(first.switched).toBe(true)
    expect(first.state.color).toBe(1)
    expect(first.state.cooldown).toBeCloseTo(SWITCH_S, 10)
    state = first.state
    const blocked = trySwitch(state, spec)
    expect(blocked.switched).toBe(false)
    expect(blocked.state).toBe(state)
    const cooled = { ...state, cooldown: 0 }
    const second = trySwitch(cooled, spec)
    expect(second.state.color).toBe(2)
    const third = trySwitch({ ...second.state, cooldown: 0 }, spec)
    expect(third.state.color).toBe(0)
    const dead = trySwitch({ ...createPulseState(), over: 'failed' }, spec)
    expect(dead.switched).toBe(false)
  })

  it('derives press counts and cooldown-derived minimum gate gaps', () => {
    expect([0, 1, 2, 3, 6].map((to) => pressesNeeded(0, to, 3))).toEqual([0, 1, 2, 0, 0])
    expect(pressesNeeded(2, 0, 3)).toBe(1)
    expect(pressesNeeded(1, 0, 2)).toBe(1)
    const spec = getPulseLevel(50)
    const one = minGapMeters(spec, 0, 1, 100)
    const two = minGapMeters(spec, 0, 2, 100)
    expect(one).toBeCloseTo(speedAt(spec, 100) * (PRESS_S + 0.14), 6)
    expect(two).toBeGreaterThan(one)
    expect(two).toBeCloseTo(speedAt(spec, 100) * (2 * PRESS_S + 0.14), 6)
    expect(pairGapMeters(spec, 1, 1, 100)).toBeCloseTo(speedAt(spec, 100) * 0.2, 6)
    expect(speedAt({ ...spec, gradient: 0 }, -40)).toBe(spec.speed)
  })
})

describe('pulse runner seeded gate flow', () => {
  it('regenerates identical courses per level and clamps bad levels', () => {
    for (const level of [1, 12, 23, 34, 45, 60]) expect(generateCourse(level)).toEqual(courses.get(level))
    for (const level of [7, 30, 52]) expect(generateCourse(level)).toEqual(generateCourse(level))
    expect(generateCourse(0)).toEqual(courses.get(1))
    expect(generateCourse(-9)).toEqual(courses.get(1))
    expect(generateCourse(999)).toEqual(courses.get(60))
    expect(generateCourse(Number.NaN)).toEqual(courses.get(1))
    expect(new Set([...courses.values()].map((course) => course.seed)).size).toBe(PULSE_LEVEL_COUNT)
  })

  it('keeps every gate stream ordered, in range and inside the level palette', () => {
    for (const [level, course] of courses) {
      expect(course.gates.length).toBeGreaterThan(20)
      expect(solidsOf(course).length).toBeGreaterThan(16)
      for (const gate of course.gates) {
        expect(Number.isFinite(gate.x)).toBe(true)
        expect(gate.x).toBeGreaterThanOrEqual(FIRST_GATE_M)
        expect(gate.x).toBeLessThan(course.level.quota)
        expect(gate.color).toBeGreaterThanOrEqual(0)
        expect(gate.color).toBeLessThan(course.level.colorCount)
      }
      for (let index = 1; index < course.gates.length; index += 1) {
        expect(course.gates[index].x - course.gates[index - 1].x).toBeGreaterThanOrEqual(1.4)
      }
      if (level <= 11) expect(course.gates.every((gate) => gate.color <= 1)).toBe(true)
    }
  })
})

describe('pulse runner greedy autopilot reachability', () => {
  it('clears all 60 generated courses with the greedy switcher and zero deaths', () => {
    for (const [level, course] of courses) {
      const report = simulateCourse(course.level, course)
      expect(report.survived, `level ${level} never reached the quota`).toBe(true)
      expect(report.deaths, `level ${level} lost lives`).toBe(0)
      expect(report.score).toBeGreaterThan(0)
      expect(report.score).toBeLessThanOrEqual(SCORE_MAX)
      if (level >= 45) expect(report.golds, `level ${level} missed gold gates`).toBeGreaterThan(0)
    }
  }, 60000)

  it('survives an all-gold stream and fails a wall of mismatched solids', () => {
    const spec = getPulseLevel(50)
    const golds = { level: spec, seed: 1, gates: [{ x: 40, color: 0, kind: 'gold' as const }, { x: 90, color: 1, kind: 'gold' as const }] }
    expect(simulateCourse(spec, golds)).toMatchObject({ survived: true, deaths: 0, golds: 2 })
    const wall = { level: spec, seed: 1, gates: Array.from({ length: 9 }, (_, index) => ({ x: 40 + index * speedAt(spec, 40) * 0.16, color: 1 + (index % 2), kind: 'solid' as const })) }
    const report = simulateCourse(spec, wall)
    expect(report.survived).toBe(false)
    expect(report.deaths).toBe(MAX_LIVES)
  })
})

describe('pulse runner scoring and step boundaries', () => {
  it('scores distance in 10m steps plus gates, capped at 10000', () => {
    expect(distanceScore(0)).toBe(0)
    expect(distanceScore(9.9)).toBe(0)
    expect(distanceScore(10)).toBe(10)
    expect(distanceScore(1234.5)).toBe(1230)
    expect(distanceScore(-5)).toBe(0)
    const state = { ...createPulseState(), x: 300, gateScore: 3 * GATE_SCORE + GOLD_SCORE }
    expect(totalScore(state)).toBe(300 + 3 * GATE_SCORE + GOLD_SCORE)
    expect(totalScore({ ...state, x: 20000 })).toBe(SCORE_MAX)
    expect(totalScore({ ...state, gateScore: -50 })).toBe(300)
  })

  it('ignores zero, negative and NaN timesteps, clamps huge ones and freezes when over', () => {
    const spec = getPulseLevel(30)
    const course = courses.get(30)!
    for (const dt of [0, -0.5, Number.NaN]) {
      const result = advance(createPulseState(), spec, course, dt)
      expect(result.state.x).toBe(0)
      expect(result.events).toEqual([])
    }
    const huge = advance(createPulseState(), spec, course, 99)
    expect(huge.state.x).toBeCloseTo(speedAt(spec, 0) * 0.05, 10)
    const frozen = { ...createPulseState(), over: 'completed' as const }
    expect(advance(frozen, spec, course, DT).state).toBe(frozen)
  })
})

describe('pulse runner chapter mechanics and difficulty curve', () => {
  it('gates mechanics by chapter', () => {
    expect([1, 11, 12, 22, 23, 33, 34, 44, 45, 60].map(chapterOf)).toEqual([1, 1, 2, 2, 3, 3, 4, 4, 5, 5])
    const specOf = (chapter: number) => getPulseLevel(chapter * 11)
    expect(specOf(1).colorCount).toBe(2)
    expect(specOf(2).colorCount).toBe(3)
    for (let chapter = 1; chapter <= 5; chapter += 1) {
      const spec = specOf(chapter)
      expect(spec.doubleChance > 0).toBe(chapter >= 3)
      expect(spec.phantomChance > 0).toBe(chapter >= 4)
      expect(spec.goldChance > 0).toBe(chapter >= 5)
    }
    const hasPair = (course: ReturnType<typeof generateCourse>) => course.gates.some((gate, index) => index > 0 && gate.kind === 'solid' && course.gates[index - 1].kind === 'solid' && gate.x - course.gates[index - 1].x < speedAt(course.level, gate.x) * 0.3)
    for (const [level, course] of courses) {
      const chapter = course.level.chapter
      if (chapter >= 3) expect(hasPair(course), `level ${level} has no double gate`).toBe(true)
      if (chapter >= 4) expect(course.gates.some((gate) => gate.kind === 'phantom'), `level ${level} has no phantom`).toBe(true)
      if (chapter >= 5) expect(course.gates.some((gate) => gate.kind === 'gold'), `level ${level} has no gold gate`).toBe(true)
      if (chapter < 4) expect(course.gates.every((gate) => gate.kind !== 'phantom')).toBe(true)
      if (chapter < 5) expect(course.gates.every((gate) => gate.kind !== 'gold')).toBe(true)
    }
  })

  it('tightens quotas, speeds and switch pacing across chapters', () => {
    let lastQuota = 0
    let lastSpeed = 0
    let lastPace = Number.POSITIVE_INFINITY
    for (let chapter = 1; chapter <= 5; chapter += 1) {
      const scoped = levels.filter((level) => chapterOf(level) === chapter).map((level) => courses.get(level)!)
      const gaps = scoped.flatMap((course) => {
        const solids = solidsOf(course)
        return solids.slice(1).map((gate, index) => {
          const presses = Math.max(1, pressesNeeded(solids[index].color, gate.color, course.level.colorCount))
          return (gate.x - solids[index].x) / speedAt(course.level, gate.x) / presses
        })
      })
      const pace = gaps.reduce((total, gap) => total + gap, 0) / gaps.length
      expect(scoped[0].level.quota).toBeGreaterThan(lastQuota)
      expect(scoped.at(-1)!.level.speed).toBeGreaterThan(lastSpeed)
      expect(pace, `chapter ${chapter} pacing loosened`).toBeLessThan(lastPace)
      lastQuota = scoped[0].level.quota
      lastSpeed = scoped.at(-1)!.level.speed
      lastPace = pace
    }
    expect(getPulseLevel(60)).toMatchObject({ quota: 1200, gradient: 0.0035 })
    expect(getPulseLevel(11).speed).toBeGreaterThan(getPulseLevel(1).speed)
  })

  it('keeps every solid gap long enough for the cooldown-derived switches', () => {
    for (const [level, course] of courses) {
      const solids = solidsOf(course)
      for (let index = 1; index < solids.length; index += 1) {
        const presses = pressesNeeded(solids[index - 1].color, solids[index].color, course.level.colorCount)
        const seconds = (solids[index].x - solids[index - 1].x) / speedAt(course.level, solids[index].x)
        expect(seconds, `level ${level} gap ${index} too tight`).toBeGreaterThanOrEqual(Math.max(0.18, presses * 0.2 + 0.1))
      }
    }
  })
})
