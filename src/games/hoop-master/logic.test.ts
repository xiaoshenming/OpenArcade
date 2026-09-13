import { describe, expect, it } from 'vitest'
import { CHAPTER_STARTS, LEVEL_COUNT, createPegs, getPegLevel, type PegSpec } from './levels'
import {
  GRAVITY, HOOP_GAP, SCORE_CAP, SCORE_GOLD, SCORE_NORMAL, STREAK_CAP, TABLE, THROWER, V_MAX, V_MIN,
  createState, effectivePower, judgeLanding, landTime, landX, launchVelocity, lockThrow, pegX, powerAt,
  speedFor, speedForLanding, step, windBias,
} from './logic'

const allLevels = Array.from({ length: LEVEL_COUNT }, (_, index) => index + 1)
const analyticLand = (power: number) => {
  const velocity = launchVelocity(speedFor(power))
  return landX(THROWER.x, THROWER.y, velocity.vx, velocity.vy)
}

function fireAt(state: ReturnType<typeof createState>, spec: ReturnType<typeof getPegLevel>, pegs: ReturnType<typeof createPegs>, power: number) {
  let next = lockThrow({ ...state, power }, spec, spec.wind ?? undefined)
  expect(next.phase).toBe('flight')
  for (let guard = 0; guard < 900 && next.hoops.length > 0 && next.status === 'play'; guard += 1) {
    next = step(next, spec, pegs, 1 / 120)
  }
  return next
}

describe('hoop master parabolic landing', () => {
  const spec = getPegLevel(1)
  const pegs = createPegs(1)

  it('matches numerical flight integration exactly', () => {
    for (const power of [0.1, 0.35, 0.62, 0.9]) {
      const resolved = fireAt(createState(spec, pegs), spec, pegs, power)
      expect(resolved.hoops.length).toBe(0)
      expect(resolved.marks.length).toBe(1)
      expect(resolved.marks[0].x).toBeCloseTo(analyticLand(power), 6)
    }
  })

  it('lands the analytic parabola on the table plane', () => {
    const velocity = launchVelocity(speedFor(0.7))
    const t = landTime(THROWER.y, velocity.vy)
    expect(t).not.toBeNull()
    const height = THROWER.y + velocity.vy * t! + (GRAVITY / 2) * t! * t!
    expect(height).toBeCloseTo(70, 9)
    expect(analyticLand(0.7)).toBeCloseTo(THROWER.x + velocity.vx * t!, 12)
  })

  it('inverts landings and keeps every power on the table', () => {
    expect(speedForLanding(analyticLand(0.4))).toBeCloseTo(speedFor(0.4), 4)
    expect(speedForLanding(analyticLand(0.4) + HOOP_GAP)).toBeGreaterThan(speedFor(0.4))
    for (let power = 0; power <= 1.001; power += 0.05) {
      const land = analyticLand(power)
      expect(land).toBeGreaterThanOrEqual(TABLE.left - 1e-9)
      expect(land).toBeLessThanOrEqual(TABLE.right + 1e-9)
    }
    expect(analyticLand(0)).toBeGreaterThanOrEqual(TABLE.left)
    expect(analyticLand(1)).toBeLessThanOrEqual(TABLE.right)
    expect(V_MIN).toBeLessThan(V_MAX)
  })

  it('feeds wind into the double follow-up and stays exact without wind (双圈反解吃风)', () => {
    const spec = getPegLevel(23)
    const pegs = createPegs(23)
    const base = { ...createState(spec, pegs), power: 0.4 }
    const speed = (hoop: { vx: number; vy: number }) => Math.hypot(hoop.vx, hoop.vy)
    const calm = lockThrow(base, spec, undefined)
    expect(calm.hoops).toHaveLength(2)
    expect(speed(calm.hoops[1])).toBeCloseTo(speedForLanding(analyticLand(0.4) + HOOP_GAP), 6)
    const gust = { period: 5, force: 0.05, phase: Math.PI / 2 }
    const windy = lockThrow(base, spec, gust)
    expect(speed(windy.hoops[0])).toBeGreaterThan(speed(calm.hoops[0]))
    expect(speed(windy.hoops[1])).toBeGreaterThan(speed(calm.hoops[1]))
  })
})

describe('hoop master ring judgment', () => {
  const spec = getPegLevel(1)
  const pegs = createPegs(1)
  const powerFor = (targetX: number) => (speedForLanding(targetX) - V_MIN) / (V_MAX - V_MIN)

  it('rings a peg inside the threshold and misses just beyond it', () => {
    const center = pegs[1].baseX
    const hit = fireAt(createState(spec, pegs), spec, pegs, powerFor(center))
    expect(hit.claimed[1]).toBe(true)
    expect(hit.marks[0].hit).toBe(true)
    expect(hit.marks[0].x).toBeCloseTo(center, 6)
    expect(hit.score).toBe(SCORE_NORMAL)
    const near = fireAt(createState(spec, pegs), spec, pegs, powerFor(center + spec.threshold - 0.01))
    expect(near.claimed[1]).toBe(true)
    const far = fireAt(createState(spec, pegs), spec, pegs, powerFor(center + spec.threshold + 0.5))
    expect(far.claimed.every((flag) => !flag)).toBe(true)
    expect(far.marks[0].hit).toBe(false)
    expect(far.streak).toBe(0)
    expect(far.score).toBe(0)
  })

  it('doubles the streak on consecutive hits and values gold at 400', () => {
    const first = fireAt(createState(spec, pegs), spec, pegs, powerFor(pegs[1].baseX))
    const second = fireAt({ ...first, phase: 'aim' }, spec, pegs, powerFor(pegs[0].baseX))
    expect(second.claimed[0]).toBe(true)
    expect(second.score).toBe(SCORE_NORMAL * (1 + 2))
    const judged = judgeLanding([false, false], [createPegs(34)[1]], 5, createPegs(34)[1].baseX, 0, 3, 900, [])
    expect(judged.event).toBe('gold')
    expect(judged.score).toBe(900 + SCORE_GOLD * Math.min(4, STREAK_CAP))
    const again = judgeLanding([true], [createPegs(34)[1]], 5, createPegs(34)[1].baseX, 0, 2, 600, [])
    expect(again.event).toBe('miss')
    expect(again.score).toBe(600)
  })

  it('picks the nearest unclaimed peg when two are inside the threshold', () => {
    const pair: PegSpec[] = [
      { index: 0, baseX: 100, kind: 'normal', amp: 0, period: 1, phase: 0 },
      { index: 1, baseX: 103, kind: 'gold', amp: 0, period: 1, phase: 0 },
    ]
    const judged = judgeLanding([false, false], pair, 5, 101, 0, 0, 0, [])
    expect(judged.event).toBe('ring')
    expect(judged.score).toBe(SCORE_NORMAL)
    const afterFirst = judgeLanding(judged.claimed, pair, 5, 101, 0, 1, judged.score, judged.marks)
    expect(afterFirst.event).toBe('gold')
    expect(afterFirst.score).toBe(SCORE_NORMAL + SCORE_GOLD * 2)
  })
})

describe('hoop master determinism', () => {
  it('replays identical seeded peg layouts and winds for every level', () => {
    const layouts = new Set<string>()
    for (const level of allLevels) {
      const first = createPegs(level)
      expect(first).toEqual(createPegs(level))
      expect(getPegLevel(level)).toEqual(getPegLevel(level))
      layouts.add(JSON.stringify(first))
    }
    expect(layouts.size).toBe(LEVEL_COUNT)
  })

  it('keeps peg motion bounded and wind periodic', () => {
    for (const level of allLevels) {
      const spec = getPegLevel(level)
      const pegs = createPegs(level)
      pegs.forEach((peg) => {
        for (let time = 0; time < 6; time += 0.37) {
          expect(Math.abs(pegX(peg, time) - peg.baseX)).toBeLessThanOrEqual(peg.amp + 1e-9)
        }
      })
      if (spec.wind) {
        for (let time = 0; time < spec.wind.period * 2; time += 0.13) {
          expect(Math.abs(windBias(spec.wind, time))).toBeLessThanOrEqual(spec.wind.force + 1e-9)
          expect(windBias(spec.wind, time + spec.wind.period)).toBeCloseTo(windBias(spec.wind, time), 9)
        }
      }
    }
  })

  it('replays an identical match for the same input script', () => {
    const run = () => {
      const spec = getPegLevel(52)
      const pegs = createPegs(52)
      let state = createState(spec, pegs)
      for (const power of [0.3, 0.55, 0.75, 0.45, 0.62, 0.5, 0.8]) {
        if (state.status !== 'play' || state.throwsLeft <= 0) break
        state = fireAt({ ...state, time: state.time + 0.21 }, spec, pegs, power)
      }
      return JSON.stringify({ score: state.score, status: state.status, marks: state.marks })
    }
    expect(run()).toBe(run())
  })
})

describe('hoop master difficulty curve', () => {
  const levels = allLevels.map(getPegLevel)

  it('tightens timing and quotas level over level', () => {
    for (let index = 1; index < levels.length; index += 1) {
      expect(levels[index].threshold).toBeLessThanOrEqual(levels[index - 1].threshold)
      expect(levels[index].meterPeriod).toBeLessThanOrEqual(levels[index - 1].meterPeriod)
      expect(levels[index].quota).toBeGreaterThanOrEqual(levels[index - 1].quota)
    }
    expect(levels[0].threshold).toBe(6.4)
    expect(levels.at(-1)?.meterPeriod).toBe(0.9)
  })

  it('unlocks one mechanic per chapter and combines them in the fifth', () => {
    CHAPTER_STARTS.forEach((start, index) => {
      expect(levels[start - 1].chapter).toBe(index + 1)
    })
    levels.forEach((spec) => {
      expect(spec.double).toBe(spec.chapter === 3)
      expect(spec.gold).toBe(spec.chapter >= 4)
      expect(Boolean(spec.wind)).toBe(spec.chapter === 5)
      expect(spec.throws).toBeGreaterThan(0)
    })
    expect(levels[0].mode).toBe('calm')
    const pegCounts = allLevels.map((level) => createPegs(level).length)
    expect(pegCounts[0]).toBe(3)
    expect(pegCounts[11]).toBe(5)
    expect(pegCounts[22]).toBe(6)
    expect(pegCounts[33]).toBe(7)
    expect(pegCounts[44]).toBe(8)
    const firstLevelPegs = createPegs(1)
    expect(firstLevelPegs.every((peg) => peg.amp === 0)).toBe(true)
    const driftPegs = createPegs(12)
    expect(driftPegs.some((peg) => peg.amp > 0)).toBe(true)
    const stormPegs = createPegs(45)
    expect(stormPegs.filter((peg) => peg.kind === 'gold').every((peg) => peg.amp >= 12)).toBe(true)
  })
})

describe('hoop master constructive solver', () => {
  const solve = (level: number) => {
    const spec = getPegLevel(level)
    const pegs = createPegs(level)
    const wind = spec.wind ?? undefined
    let state = createState(spec, pegs)
    for (let guard = 0; guard < 24 && state.status === 'play'; guard += 1) {
      let best = { gain: -1, wait: 0, power: 0.5 }
      for (let sample = 0; sample <= 380; sample += 1) {
        const wait = sample * 0.006
        const at = state.time + wait
        const power = effectivePower(powerAt(spec, at), wind, at)
        const velocity = launchVelocity(speedFor(power))
        const drop = landTime(THROWER.y, velocity.vy) ?? 0
        const land = THROWER.x + velocity.vx * drop
        const second = spec.double ? launchVelocity(speedForLanding(land + HOOP_GAP)) : null
        const secondDrop = second ? landTime(THROWER.y, second.vy) ?? 0 : 0
        const localClaimed = [...state.claimed]
        let gain = 0
        let streak = state.streak
        const lands: { x: number; at: number }[] = [{ x: land, at: at + drop }]
        if (second) lands.push({ x: land + HOOP_GAP, at: at + secondDrop })
        for (const shot of lands) {
          let choice = -1
          let dist = spec.threshold
          pegs.forEach((peg, index) => {
            if (localClaimed[index]) return
            const gap = Math.abs(shot.x - pegX(peg, shot.at))
            if (gap <= dist) {
              choice = index
              dist = gap
            }
          })
          if (choice >= 0) {
            localClaimed[choice] = true
            streak += 1
            gain += (pegs[choice].kind === 'gold' ? SCORE_GOLD : SCORE_NORMAL) * Math.min(streak, STREAK_CAP)
          } else streak = 0
        }
        if (gain > best.gain) best = { gain, wait, power: powerAt(spec, at) }
      }
      state = lockThrow({ ...state, time: state.time + best.wait, power: best.power }, spec, wind)
      for (let guard = 0; guard < 900 && state.hoops.length > 0 && state.status === 'play'; guard += 1) {
        state = step(state, spec, pegs, 1 / 120)
      }
    }
    return state
  }

  it('reaches the score quota on all sixty levels within the throw budget', () => {
    for (const level of allLevels) {
      const spec = getPegLevel(level)
      const result = solve(level)
      expect(result.status, `level ${level} ended ${result.status} at ${result.score}/${spec.quota}`).toBe('completed')
      expect(result.score).toBeGreaterThanOrEqual(spec.quota)
      expect(result.score).toBeLessThanOrEqual(SCORE_CAP)
    }
  }, 240000)
})

describe('hoop master boundaries', () => {
  it('clamps level lookups to the valid range', () => {
    expect(getPegLevel(0)).toEqual(getPegLevel(1))
    expect(getPegLevel(999)).toEqual(getPegLevel(60))
    expect(getPegLevel(Number.NaN)).toEqual(getPegLevel(1))
    expect(getPegLevel(7.8).level).toBe(7)
  })

  it('ignores dead timing input and frozen states', () => {
    const spec = getPegLevel(2)
    const pegs = createPegs(2)
    const state = createState(spec, pegs)
    expect(step(state, spec, pegs, 0)).toBe(state)
    expect(step(state, spec, pegs, Number.NaN)).toBe(state)
    expect(step(state, spec, pegs, -1)).toBe(state)
    const locked = lockThrow(state, spec, undefined)
    expect(lockThrow(locked, spec, undefined)).toBe(locked)
    const done = { ...locked, status: 'completed' as const }
    expect(step(done, spec, pegs, 0.02)).toBe(done)
    expect(lockThrow(done, spec, undefined)).toBe(done)
    const spent = { ...createState(spec, pegs), throwsLeft: 0 }
    expect(lockThrow(spent, spec, undefined)).toBe(spent)
  })

  it('scales streak scoring up to the cap without leaving the score ceiling', () => {
    expect(Math.min(STREAK_CAP, 9)).toBe(4)
    expect(SCORE_CAP).toBe(10000)
    const spec = getPegLevel(45)
    expect(spec.quota).toBeLessThanOrEqual(SCORE_CAP)
    expect(effectivePower(1.4, undefined, 0)).toBe(1)
    expect(effectivePower(-0.4, { period: 5, force: 0.1, phase: 0 }, 0)).toBe(0)
  })
})
