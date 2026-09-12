import { describe, expect, it } from 'vitest'
import { CLIMB_RATE, createGates, createWind, getCloudLevel, LEVEL_COUNT } from './levels'
import { FLAP_VY, GRAVITY, MAX_FALL, WORLD, createWorld, gateCenter, step, windForce, windWarning } from './logic'

const allLevels = Array.from({ length: LEVEL_COUNT }, (_, index) => index + 1)

describe('cloud hop physics invariants', () => {
  const spec = getCloudLevel(1)
  const gates = createGates(1)
  const world = createWorld(gates)

  it('accelerates the bird downward with gravity and caps fall speed', () => {
    const fallen = step(world, spec, gates, undefined, 0.05, false)
    expect(fallen.bird.vy).toBeCloseTo(GRAVITY * 0.05, 9)
    expect(fallen.bird.y).toBeCloseTo(50 + GRAVITY * 0.05 * 0.05, 9)
    const lone = gates.slice(0, 1)
    let capped = { ...createWorld(lone), scroll: 300 }
    for (let index = 0; index < 22; index += 1) capped = step(capped, spec, lone, undefined, 0.05, false)
    expect(capped.bird.vy).toBe(MAX_FALL)
    expect(capped.bird.y).toBeLessThan(WORLD.ground - WORLD.birdRadius)
    expect(capped.status).toBe('flying')
  })

  it('replaces velocity with a fixed flap impulse instead of adding to it', () => {
    const flapped = step(world, spec, gates, undefined, 0.1, true)
    expect(flapped.bird.vy).toBe(FLAP_VY)
    const fromDive = { ...world, bird: { x: 46, y: 40, vy: 40 } }
    expect(step(fromDive, spec, gates, undefined, 0.01, true).bird.vy).toBe(FLAP_VY)
  })

  it('fails on the ground but forgives the ceiling', () => {
    const onGround = { ...world, bird: { x: 46, y: WORLD.ground - WORLD.birdRadius, vy: 20 } }
    expect(step(onGround, spec, gates, undefined, 0.01, false).status).toBe('failed')
    const atCeiling = { ...world, bird: { x: 46, y: WORLD.birdRadius - 1, vy: -30 } }
    const bounced = step(atCeiling, spec, gates, undefined, 0.01, false)
    expect(bounced.status).toBe('flying')
    expect(bounced.bird.y).toBe(WORLD.birdRadius)
  })
})

describe('cloud hop gate sequence determinism', () => {
  it('regenerates identical seeded gates for every level', () => {
    const layouts = new Set<string>()
    for (const level of allLevels) {
      const first = createGates(level)
      expect(first).toEqual(createGates(level))
      expect(getCloudLevel(level)).toEqual(getCloudLevel(level))
      layouts.add(JSON.stringify(first))
    }
    expect(layouts.size).toBe(LEVEL_COUNT)
  })

  it('keeps every gate center reachable and inside the sky at any phase', () => {
    for (const level of allLevels) {
      const spec = getCloudLevel(level)
      const gates = createGates(level)
      gates.forEach((gate, index) => {
        expect(gate.x).toBeCloseTo(76 + index * spec.spacing, 9)
        for (let phase = 0; phase < 16; phase += 1) {
          const center = gateCenter(gate, (phase / 16) * gate.period, spec.gap)
          expect(center).toBeGreaterThanOrEqual(spec.gap / 2 - 1e-9)
          expect(center).toBeLessThanOrEqual(WORLD.ground - spec.gap / 2 + 1e-9)
        }
      })
      for (let index = 1; index < gates.length; index += 1) {
        const climb = (spec.spacing / spec.speed) * CLIMB_RATE
        const needed = Math.max(0, Math.abs(gates[index].base - gates[index - 1].base) + gates[index].amp + gates[index - 1].amp - spec.gap)
        expect(climb).toBeGreaterThanOrEqual(needed + 1)
      }
    }
  })
})

describe('cloud hop collision precision', () => {
  const spec = getCloudLevel(1)
  const gates = createGates(1)
  const world = createWorld(gates)
  const center = gates[0].base
  const rim = spec.gap / 2 - WORLD.birdRadius

  it('clears a bird inside the gap by one hundredth of a unit', () => {
    const grazing = { ...world, scroll: 30, bird: { x: 46, y: center + rim - 0.01, vy: 0 } }
    const result = step(grazing, spec, gates, undefined, 0.01, false)
    expect(result.status).toBe('flying')
  })

  it('fails a bird overlapping the pipe edge by one hundredth of a unit', () => {
    const clipping = { ...world, scroll: 30, bird: { x: 46, y: center + rim + 0.01, vy: 0 } }
    expect(step(clipping, spec, gates, undefined, 0.01, false).status).toBe('failed')
    const topClip = { ...world, scroll: 30, bird: { x: 46, y: center - rim - 0.01, vy: 0 } }
    expect(step(topClip, spec, gates, undefined, 0.01, false).status).toBe('failed')
  })

  it('rewards gate, center bonus and coin ring exactly at the crossing plane', () => {
    const deadCenter = { ...world, scroll: 45, bird: { x: 46, y: center, vy: 0 } }
    expect(step(deadCenter, spec, gates, undefined, 0.01, false).score).toBe(150)
    const offCenter = { ...world, scroll: 45, bird: { x: 46, y: center + 3, vy: 0 } }
    expect(step(offCenter, spec, gates, undefined, 0.01, false).score).toBe(100)
    expect(step(deadCenter, spec, gates, undefined, 0.01, false).passed).toBe(1)
  })
})

describe('cloud hop difficulty curve', () => {
  const levels = allLevels.map(getCloudLevel)

  it('narrows gaps monotonically while speed never decreases', () => {
    for (let index = 1; index < levels.length; index += 1) {
      expect(levels[index].gap).toBeLessThanOrEqual(levels[index - 1].gap)
      expect(levels[index].speed).toBeGreaterThanOrEqual(levels[index - 1].speed)
    }
    expect(levels[0].gap).toBe(27)
    expect(levels.at(-1)?.gap).toBe(16)
  })

  it('introduces one new mechanic per chapter and combines all in the fifth', () => {
    levels.forEach((spec, index) => {
      expect(spec.chapter).toBe(Math.floor(index / 12) + 1)
      expect(spec.quota).toBe(spec.gateCount)
    })
    expect(levels[0]).toMatchObject({ mode: 'calm', gateCount: 8, moving: false, wind: false, coin: false })
    expect(levels[12]).toMatchObject({ mode: 'narrow', gateCount: 12, moving: false })
    expect(levels[24]).toMatchObject({ mode: 'drift', moving: true, wind: false })
    expect(levels[36]).toMatchObject({ mode: 'gale', moving: true, wind: true, coin: false })
    expect(levels[48]).toMatchObject({ mode: 'storm', moving: true, wind: true, coin: true })
    expect(levels[11].moving).toBe(false)
    expect(levels[23].wind).toBe(false)
    expect(levels[35].coin).toBe(false)
  })
})

describe('cloud hop wind field', () => {
  const wind = createWind(37)!

  it('stays bounded and ramps smoothly inside a gust', () => {
    for (let time = 0; time < wind.period * 3; time += 0.01) {
      expect(Math.abs(windForce(wind, time))).toBeLessThanOrEqual(wind.force + 1e-9)
    }
    const atClock = (clock: number) => (((clock - wind.phase) % wind.period) + wind.period) % wind.period
    expect(Math.abs(windForce(wind, atClock(0.2)))).toBeLessThan(Math.abs(windForce(wind, atClock(wind.duration / 2))))
  })

  it('warns strictly before every gust window', () => {
    for (let time = 0; time < wind.period * 2; time += 0.05) {
      if (!windWarning(wind, time)) continue
      expect(windForce(wind, time)).toBe(0)
      const horizon = Array.from({ length: 120 }, (_, index) => windForce(wind, time + 0.01 * (index + 1)))
      expect(horizon.some((force) => force !== 0)).toBe(true)
    }
  })

  it('only equips wind levels with a wind spec', () => {
    expect(createWind(36)).toBeUndefined()
    expect(createWind(60)).toBeDefined()
  })
})

describe('cloud hop boundaries and solvability', () => {
  it('clamps level lookups and degenerate steps', () => {
    expect(getCloudLevel(0)).toEqual(getCloudLevel(1))
    expect(getCloudLevel(999)).toEqual(getCloudLevel(60))
    expect(getCloudLevel(Number.NaN)).toEqual(getCloudLevel(1))
    const spec = getCloudLevel(1)
    const gates = createGates(1)
    const world = createWorld(gates)
    expect(step(world, spec, gates, undefined, 0, true)).toBe(world)
    expect(step(world, spec, gates, undefined, Number.NaN, true)).toBe(world)
    expect(step(world, spec, gates, undefined, -1, true)).toBe(world)
    const done = { ...world, status: 'completed' as const }
    expect(step(done, spec, gates, undefined, 0.01, true)).toBe(done)
  })

  const MARGIN = 0.25
  const autoPilot = (level: number) => {
    const spec = getCloudLevel(level)
    const gates = createGates(level)
    const wind = createWind(level)
    const tol = spec.gap / 2 - WORLD.birdRadius - MARGIN
    let state = createWorld(gates)
    for (let guard = 0; guard < 7200 && state.status === 'flying'; guard += 1) {
      const upcoming = Math.max(0, gates.findIndex((_, index) => !state.gates[index].passed))
      const gate = gates[upcoming]
      const next = gates[upcoming + 1]
      const contact = gate.x - state.scroll - state.bird.x - WORLD.birdRadius
      const eta = Math.max(0, contact / spec.speed)
      let trigger: number
      if (contact > 0) {
        const line = gateCenter(gate, state.time + Math.max(eta, 0.05), spec.gap)
        trigger = line + 0.2
        if (next) {
          const cNext = gateCenter(next, state.time + Math.max(eta, 0.05) + 0.7, spec.gap)
          trigger = cNext > line + 1 ? Math.max(trigger, cNext - 1.5)
            : cNext < line - 1 ? Math.min(trigger, Math.max(cNext + 4.94, line - tol + 4.9))
              : trigger
        }
        trigger = Math.min(Math.max(trigger, line - tol + 0.9), line + tol - 1.6)
      } else if (!next) {
        trigger = gateCenter(gate, state.time + 0.1, spec.gap) + 0.2
      } else {
        const line = gateCenter(gate, state.time + 0.1, spec.gap)
        const cNext = gateCenter(next, state.time + 0.1, spec.gap)
        const park = Math.min(Math.max(cNext + 0.2, Math.max(line, cNext) - tol + 4.9), Math.min(line, cNext) + tol - 1.4)
        trigger = park + 0.2
      }
      state = step(state, spec, gates, wind, 1 / 120, state.bird.y > trigger)
    }
    return state
  }

  it('completes every level with a deterministic park-and-glide autopilot', () => {
    for (const level of allLevels) {
      const result = autoPilot(level)
      expect(result.status, `level ${level} ended as ${result.status}`).toBe('completed')
      expect(result.passed).toBe(getCloudLevel(level).quota)
      expect(result.score).toBeGreaterThan(0)
    }
  })
})
