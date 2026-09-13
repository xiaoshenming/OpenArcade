import { describe, expect, it } from 'vitest'
import { applyDrop, buildSolution, channelDeltas, cssColor, greedyClicks, inBounds, MAX_CHANNEL, minClicksBrute, neededBottles, replaySolution, sameColor, scoreFor, STEP } from './logic'

describe('hue blend drop mechanics', () => {
  it('drops shift one channel by the step and rejects out-of-bounds pours', () => {
    const base = { r: 100, g: 30, b: 250 }
    expect(applyDrop(base, '+r', 1)).toEqual({ r: 105, g: 30, b: 250 })
    expect(applyDrop(base, '-g', 1)).toEqual({ r: 100, g: 25, b: 250 })
    expect(applyDrop(base, '+b', 1)).toEqual({ r: 100, g: 30, b: MAX_CHANNEL })
    expect(applyDrop(base, '+b', 2)).toBeNull()
    expect(applyDrop({ r: 0, g: 0, b: 0 }, '-r', 1)).toBeNull()
    expect(applyDrop({ r: 0, g: 0, b: 0 }, '+r', 51)).toEqual({ r: MAX_CHANNEL, g: 0, b: 0 })
    expect(applyDrop({ r: 0, g: 0, b: 0 }, '+r', 52)).toBeNull()
    expect(applyDrop(base, '+r', 0)).toBeNull()
    expect(applyDrop(base, '+r', 1.5)).toBeNull()
    expect(applyDrop(base, '*r', 1)).toBeNull()
    expect(applyDrop(base, '+x', 1)).toBeNull()
    expect(base).toEqual({ r: 100, g: 30, b: 250 })
  })

  it('keeps generated mixes on the pour lattice and inside the channel bounds', () => {
    const mix = { r: 30, g: 225, b: 120 }
    expect(inBounds(mix)).toBe(true)
    expect(inBounds({ r: 256, g: 0, b: 0 })).toBe(false)
    expect(inBounds({ r: 0, g: 0, b: -5 })).toBe(false)
    const poured = applyDrop(mix, '-g', 5)
    expect(poured && inBounds(poured)).toBe(true)
    expect(sameColor(mix, { r: 30, g: 225, b: 120 })).toBe(true)
    expect(sameColor(mix, { r: 30, g: 225, b: 125 })).toBe(false)
    expect(cssColor(mix)).toBe('rgb(30, 225, 120)')
  })

  it('greedy click counts match brute force optima with and without fives', () => {
    for (let delta = -30; delta <= 30; delta += 1) {
      expect(greedyClicks(delta, true), `fives ${delta}`).toBe(minClicksBrute(delta, true))
      expect(greedyClicks(delta, false), `ones ${delta}`).toBe(minClicksBrute(delta, false))
    }
    expect(greedyClicks(0, true)).toBe(0)
    expect(greedyClicks(25, true)).toBe(5)
    expect(greedyClicks(23, true)).toBe(7)
    expect(greedyClicks(23, false)).toBe(23)
  })

  it('builds grouped witness solutions that replay onto the target', () => {
    const deltas = { r: 12, g: -27, b: 5 }
    const solution = buildSolution(deltas, true)
    expect(solution.filter((drop) => drop.drops === 5)).toHaveLength(2 + 5 + 1)
    expect(solution.filter((drop) => drop.drops === 1)).toHaveLength(2 + 2)
    expect(solution.map((drop) => drop.key)).toEqual(['+r', '+r', '+r', '+r', '-g', '-g', '-g', '-g', '-g', '-g', '-g', '+b'])
    const start = { r: 60, g: 210, b: 40 }
    const replay = replaySolution(start, solution)
    expect(replay.steps).toBe(12)
    expect(replay.mix).toEqual({ r: 120, g: 75, b: 65 })
    expect(channelDeltas(start, replay.mix as { r: number; g: number; b: number })).toEqual(deltas)
    const ones = buildSolution(deltas, false)
    expect(ones).toHaveLength(44)
    expect(replaySolution(start, ones).steps).toBe(44)
    expect(replaySolution(start, [{ key: '+r', drops: 999 }]).mix).toBeNull()
  })

  it('flags exactly the bottles a delta needs and scores par deviations', () => {
    expect(neededBottles({ r: 3, g: 0, b: -2 })).toEqual(['+r', '-b'])
    expect(neededBottles({ r: 0, g: 0, b: 0 })).toEqual([])
    expect(scoreFor(5, 5)).toBe(1000)
    expect(scoreFor(8, 5)).toBe(955)
    expect(scoreFor(70, 5)).toBe(100)
    expect(scoreFor(3, 5)).toBe(1000)
    expect(STEP).toBe(5)
  })
})
