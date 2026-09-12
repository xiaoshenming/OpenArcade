import { describe, expect, it } from 'vitest'
import { arcPeak, courseScore, distanceScore, G, G_HOLD, JUMP_V, MAX_LIVES, SCORE_MAX, simulateCourse } from './logic'
import { chapterOf, generateCourse, getMeadowLevel, MEADOW_LEVEL_COUNT } from './levels'

const levels = Array.from({ length: MEADOW_LEVEL_COUNT }, (_, index) => index + 1)
const courses = new Map(levels.map((level) => [level, generateCourse(level)]))

const meetOf = (course: { speed: number }, hazard: { x: number, speed: number }) => (hazard.x * course.speed) / (course.speed + hazard.speed)

const spanOf = (course: ReturnType<typeof generateCourse>, hazard: ReturnType<typeof generateCourse>['hazards'][number]) => {
  if (hazard.kind === 'bird') return { start: meetOf(course, hazard), end: meetOf(course, hazard) + 2.5 }
  return { start: hazard.x, end: hazard.x + hazard.width }
}

describe('meadow run jump physics', () => {
  it('raises jump height with hold time and the double-jump chain', () => {
    expect(arcPeak(0, false)).toBeCloseTo(JUMP_V ** 2 / (2 * G), 6)
    expect(arcPeak(500, false)).toBeCloseTo(JUMP_V ** 2 / (2 * G_HOLD), 6)
    expect(arcPeak(120, false)).toBeGreaterThan(arcPeak(0, false))
    expect(arcPeak(260, false)).toBeGreaterThan(arcPeak(120, false))
    expect(arcPeak(900, false)).toBe(arcPeak(500, false))
    expect(arcPeak(500, true)).toBeGreaterThan(arcPeak(0, false))
    expect(arcPeak(500, false) + arcPeak(500, true)).toBeGreaterThan(3.2)
    expect(arcPeak(0, false)).toBeGreaterThan(1.1)
    expect(arcPeak(0, false)).toBeLessThan(1.4)
    expect(arcPeak(500, false)).toBeGreaterThan(1.6)
  })

  it('scores distance in 10m steps, coins at 50, capped at 10000', () => {
    expect(distanceScore(0)).toBe(0)
    expect(distanceScore(9.9)).toBe(0)
    expect(distanceScore(10)).toBe(10)
    expect(distanceScore(1234.5)).toBe(1230)
    expect(distanceScore(-5)).toBe(0)
    expect(courseScore(600, 8)).toBe(600 + 8 * 50)
    expect(courseScore(9999, 999)).toBe(SCORE_MAX)
    expect(courseScore(-3, -2)).toBe(0)
  })
})

describe('meadow run course generator', () => {
  it('generates identical seeded courses per level and clamps edges', () => {
    for (const level of [1, 12, 23, 34, 45, 60]) expect(generateCourse(level)).toEqual(courses.get(level))
    for (const level of [7, 30, 52]) expect(generateCourse(level)).toEqual(generateCourse(level))
    expect(generateCourse(0)).toEqual(courses.get(1))
    expect(generateCourse(-9)).toEqual(courses.get(1))
    expect(generateCourse(999)).toEqual(courses.get(60))
    expect(generateCourse(Number.NaN)).toEqual(courses.get(1))
    expect(new Set([...courses.values()].map((course) => course.seed)).size).toBe(MEADOW_LEVEL_COUNT)
  })

  it('lets the autopilot clear every generated course without losing a life', () => {
    for (const [level, course] of courses) {
      const report = simulateCourse(course)
      expect(report.survived, `level ${level} never reached the quota`).toBe(true)
      expect(report.deaths, `level ${level} lost lives`).toBe(0)
      expect(report.coins, `level ${level} collected no coins`).toBeGreaterThan(3)
    }
  }, 90000)

  it('builds spacing-safe obstacle streams inside the quota', () => {
    for (const course of courses.values()) {
      const spans: { start: number, end: number, block: boolean }[] = []
      for (const hazard of course.hazards) {
        const span = { ...spanOf(course, hazard), block: hazard.kind === 'block' }
        if (span.block && spans.length && spans.at(-1)!.block && span.start - spans.at(-1)!.end < 4.5) spans.at(-1)!.end = span.end
        else spans.push(span)
      }
      expect(course.hazards.length).toBeGreaterThan(8)
      for (const span of spans) {
        expect(span.start).toBeGreaterThanOrEqual(20)
        expect(span.end).toBeLessThanOrEqual(course.quota - 6)
      }
      for (let index = 1; index < spans.length; index += 1) {
        expect(spans[index].start - spans[index - 1].end).toBeGreaterThanOrEqual(course.speed * 0.98)
      }
      for (const hazard of course.hazards) {
        if (hazard.kind === 'block') expect(hazard.height).toBeLessThanOrEqual(1.62)
        if (hazard.kind === 'gap') expect(hazard.width).toBeLessThanOrEqual(course.speed * 0.42)
        if (hazard.kind === 'bird') {
          expect(hazard.low).toBeGreaterThanOrEqual(1.0)
          expect(hazard.high).toBeLessThanOrEqual(1.9)
          expect(hazard.speed).toBeGreaterThan(course.speed * 0.4)
          expect(hazard.speed).toBeLessThan(course.speed * 0.6)
        }
      }
      for (const platform of course.platforms) {
        expect(platform.top).toBeLessThanOrEqual(2.1)
        expect(platform.x + platform.width).toBeLessThan(course.quota)
        const overlapsGap = course.hazards.some((hazard) => hazard.kind === 'gap' && platform.x < hazard.x + hazard.width + 6 && platform.x + platform.width > hazard.x - 6)
        expect(overlapsGap).toBe(false)
      }
    }
  })

  it('gates mechanics by chapter and tightens the pace across chapters', () => {
    expect([1, 11, 12, 22, 23, 33, 34, 44, 45, 60].map(chapterOf)).toEqual([1, 1, 2, 2, 3, 3, 4, 4, 5, 5])
    const pick = (chapter: number) => levels.filter((level) => chapterOf(level) === chapter).map((level) => courses.get(level)!)
    for (const course of pick(1)) {
      expect(course.hazards.every((hazard) => hazard.kind === 'block' && hazard.height <= 1.15)).toBe(true)
      expect(course.platforms).toHaveLength(0)
      expect(course.doubleJump).toBe(false)
    }
    expect(pick(2).every((course) => course.hazards.some((hazard) => hazard.kind === 'gap'))).toBe(true)
    expect(pick(2).some((course) => course.hazards.some((hazard) => hazard.kind === 'block' && hazard.height > 1.3))).toBe(true)
    for (const course of pick(3)) expect(course.doubleJump).toBe(true)
    expect(pick(3).every((course) => course.platforms.length > 0)).toBe(true)
    expect(pick(4).every((course) => course.hazards.some((hazard) => hazard.kind === 'bird'))).toBe(true)
    expect(getMeadowLevel(60)).toMatchObject({ doubleJump: true, quota: 1300 })
    let lastQuota = 0
    let lastSpeed = 0
    let lastPace = Number.POSITIVE_INFINITY
    for (let chapter = 1; chapter <= 5; chapter += 1) {
      const scoped = pick(chapter)
      const quota = scoped[0].quota
      const speed = scoped.at(-1)!.speed
      const pace = scoped.reduce((sum, course) => {
        const gaps = course.hazards.slice(1).map((hazard, index) => spanOf(course, hazard).start - spanOf(course, course.hazards[index]).end)
        return sum + gaps.reduce((total, gap) => total + gap, 0) / gaps.length / course.speed
      }, 0) / scoped.length
      expect(quota).toBeGreaterThanOrEqual(lastQuota)
      expect(speed).toBeGreaterThan(lastSpeed)
      expect(pace).toBeLessThan(lastPace)
      lastQuota = quota
      lastSpeed = speed
      lastPace = pace
    }
    expect(getMeadowLevel(11).speed).toBeGreaterThan(getMeadowLevel(1).speed)
    expect(getMeadowLevel(22).speed).toBeGreaterThan(getMeadowLevel(12).speed)
  })

  it('places reachable coins that never overlap blocks or float over gaps', () => {
    for (const [level, course] of courses) {
      expect(course.coins.length).toBeGreaterThan(6)
      for (const coin of course.coins) {
        expect(coin.x).toBeGreaterThan(2)
        expect(coin.x).toBeLessThan(course.quota)
        expect(coin.y).toBeGreaterThan(0.4)
        expect(coin.y).toBeLessThanOrEqual(2.75)
        for (const hazard of course.hazards) {
          if (hazard.kind !== 'block' || coin.x < hazard.x - 0.4 || coin.x > hazard.x + hazard.width + 0.4) continue
          expect(coin.y, `coin inside block at level ${level}`).toBeGreaterThan(hazard.height + 0.4)
        }
        if (coin.y < 1) {
          const overGap = course.hazards.some((hazard) => hazard.kind === 'gap' && coin.x > hazard.x - 0.5 && coin.x < hazard.x + hazard.width + 0.5)
          expect(overGap, `ground coin over a gap at level ${level}`).toBe(false)
        }
      }
    }
    const coinAverage = (chapter: number) => {
      const scoped = levels.filter((level) => chapterOf(level) === chapter)
      return scoped.reduce((sum, level) => sum + courses.get(level)!.coins.length, 0) / scoped.length
    }
    expect(coinAverage(5)).toBeGreaterThan(coinAverage(1) * 1.6)
    expect(MAX_LIVES).toBe(3)
  })
})
