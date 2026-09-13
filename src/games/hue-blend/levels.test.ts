import { describe, expect, it } from 'vitest'
import { BOTTLES, channelDeltas, inBounds, neededBottles, replaySolution, sameColor, type Rgb } from './logic'
import { createHueLevel, getHueSpec } from './levels'

const ALL = Array.from({ length: 60 }, (_, index) => createHueLevel(index + 1))

describe('hue blend level system', () => {
  it('generates sixty unique deterministic off-target recipes', () => {
    for (let level = 1; level <= 60; level += 1) {
      const first = createHueLevel(level)
      const second = createHueLevel(level)
      expect(first).toEqual(second)
      expect(sameColor(first.start, first.target)).toBe(false)
      expect(inBounds(first.start)).toBe(true)
      expect(inBounds(first.target)).toBe(true)
      expect(first.budget).toBeGreaterThanOrEqual(first.par + 1)
      expect(first.solution.length).toBe(first.par)
      expect(neededBottles(channelDeltas(first.start, first.target)).length).toBeGreaterThan(0)
    }
    expect(new Set(ALL.map((entry) => `${entry.start.r}.${entry.start.g}.${entry.start.b}|${entry.target.r}.${entry.target.g}.${entry.target.b}`)).size).toBe(60)
  })

  it('replays every stored solution onto its target within budget', () => {
    for (const [index, entry] of ALL.entries()) {
      const spec = getHueSpec(index + 1)
      const replay = replaySolution(entry.start, entry.solution)
      expect(replay.mix, `level ${index + 1} replay`).not.toBeNull()
      expect(sameColor(replay.mix as Rgb, entry.target), `level ${index + 1}`).toBe(true)
      expect(replay.steps).toBe(entry.par)
      expect(entry.par).toBeLessThanOrEqual(entry.budget)
      const keys = new Set(entry.solution.map((drop) => drop.key))
      keys.forEach((key) => expect(BOTTLES, `level ${index + 1} key ${key}`).toContain(key))
      entry.solution.forEach((drop) => expect(spec.droplets, `level ${index + 1} unit`).toContain(drop.drops))
    }
  })

  it('keeps duds real-free: never on a bottle the target delta needs', () => {
    expect(getHueSpec(5).dudCount).toBe(0)
    expect(getHueSpec(40).dudCount).toBe(0)
    expect(getHueSpec(45).dudCount).toBe(1)
    expect(getHueSpec(52).dudCount).toBe(2)
    expect(getHueSpec(60).dudCount).toBe(3)
    for (const [index, entry] of ALL.entries()) {
      const needed = neededBottles(channelDeltas(entry.start, entry.target))
      entry.duds.forEach((key) => expect(needed, `level ${index + 1} dud ${key}`).not.toContain(key))
      expect(entry.duds.length).toBe(getHueSpec(index + 1).dudCount)
      expect(new Set(entry.duds).size).toBe(entry.duds.length)
    }
  })

  it('grows deltas and tightens par chapter over chapter', () => {
    expect([1, 12, 23, 34, 45].map((level) => getHueSpec(level).active)).toEqual([1, 2, 3, 3, 3])
    expect(getHueSpec(3).droplets).toEqual([1])
    expect(getHueSpec(34).droplets).toEqual([1, 5])
    expect(getHueSpec(23).slack).toBeLessThan(getHueSpec(12).slack)
    expect(getHueSpec(45).slack).toBeGreaterThan(getHueSpec(23).slack)
    const pars = (chapter: number) => ALL.filter((_, index) => getHueSpec(index + 1).chapter === chapter).map((entry) => entry.par)
    expect(Math.min(...pars(2))).toBeGreaterThan(Math.min(...pars(1)))
    expect(Math.min(...pars(3))).toBeGreaterThan(Math.min(...pars(2)))
    expect(Math.min(...pars(4))).toBeGreaterThan(Math.min(...pars(3)))
    expect(Math.min(...pars(5))).toBeGreaterThan(Math.min(...pars(4)))
    expect(Math.max(...pars(5))).toBeGreaterThan(Math.max(...pars(1)))
    for (let chapter = 1; chapter <= 5; chapter += 1) expect(pars(chapter).every((par) => par >= 3)).toBe(true)
  })

  it('locks chapter one to a single active channel and chapters to their tools', () => {
    for (let level = 1; level <= 11; level += 1) {
      const entry = createHueLevel(level)
      const deltas = channelDeltas(entry.start, entry.target)
      const active = Object.values(deltas).filter((value) => value !== 0)
      expect(active, `level ${level}`).toHaveLength(1)
      expect(Math.abs(active[0])).toBe(getHueSpec(level).magnitude)
      expect(entry.solution.every((drop) => drop.drops === 1)).toBe(true)
      expect(entry.duds).toHaveLength(0)
    }
    const two = channelDeltas(createHueLevel(15).start, createHueLevel(15).target)
    expect(Object.values(two).filter((value) => value !== 0)).toHaveLength(2)
    const three = channelDeltas(createHueLevel(28).start, createHueLevel(28).target)
    expect(Object.values(three).filter((value) => value !== 0)).toHaveLength(3)
    expect(createHueLevel(38).solution.some((drop) => drop.drops === 5)).toBe(true)
    expect(ALL.slice(44).every((entry) => entry.solution.every((drop) => drop.drops === 1 || drop.drops === 5))).toBe(true)
    expect(ALL.slice(0, 33).every((entry) => entry.solution.every((drop) => drop.drops === 1))).toBe(true)
  })

  it('clamps out-of-range levels onto the deterministic ladder', () => {
    expect(getHueSpec(0).level).toBe(1)
    expect(getHueSpec(999).level).toBe(60)
    expect(createHueLevel(0)).toEqual(createHueLevel(1))
    expect(createHueLevel(-3)).toEqual(createHueLevel(1))
    expect(createHueLevel(999)).toEqual(createHueLevel(60))
    expect(createHueLevel(7.8)).toEqual(createHueLevel(7))
  })
})
