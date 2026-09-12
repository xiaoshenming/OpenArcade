import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../../platform/rng'
import { buildScene, clicksToSolve, isSolved, linkedPartner, rotateTile, sceneLayers, sceneSlice, scoreFor, scrambleTurns, solveUnits, tilePosition, tileSlice, turnExcess } from './logic'
import { createWindowLevel, getWindowSpec } from './levels'

const ALL = Array.from({ length: 60 }, (_, index) => createWindowLevel(index + 1))

describe('window slide level system', () => {
  it('rotates tiles clockwise, linked pairs together, and returns after four clicks', () => {
    expect(rotateTile([0, 0, 0], 0)).toEqual([1, 0, 0])
    expect(rotateTile([0, 0, 0], 0, 2)).toEqual([1, 0, 1])
    const four = rotateTile(rotateTile(rotateTile(rotateTile([0, 0, 0], 1), 1), 1), 1)
    expect(four).toEqual([0, 4, 0])
    expect(isSolved(four)).toBe(true)
    expect(isSolved(rotateTile([0, 0, 0], 1))).toBe(false)
    const source = [1, 2, 3]
    rotateTile(source, 0)
    expect(source).toEqual([1, 2, 3])
    expect(linkedPartner([{ a: 2, b: 5 }], 5)).toBe(2)
    expect(linkedPartner([{ a: 2, b: 5 }], 2)).toBe(5)
    expect(linkedPartner([{ a: 2, b: 5 }], 3)).toBe(-1)
    expect(clicksToSolve([1, 2, 3, 0])).toBe(6)
    expect(clicksToSolve([0, 4, 8, 3])).toBe(1)
    expect(clicksToSolve([1])).toBe(3)
    expect(clicksToSolve([1, 1, 0, 3], [{ a: 0, b: 1 }])).toBe(4)
    expect(clicksToSolve([3, 3, 0, 3], [{ a: 0, b: 1 }])).toBe(2)
    expect(turnExcess(2, 2)).toBe(0)
    expect(turnExcess(5, 2)).toBe(3)
    expect(isSolved([2, 0], [2, 0])).toBe(true)
    expect(isSolved([0, 0], [2, 0])).toBe(false)
    expect(isSolved([1, 0], [2, 0])).toBe(false)
    expect(clicksToSolve([2], [], [2])).toBe(0)
    expect(clicksToSolve([0], [], [2])).toBe(2)
    expect(clicksToSolve([3, 1, 0, 3], [{ a: 0, b: 1 }], [2, 0, 0, 0])).toBe(4)
    const mirroredPair = rotateTile(rotateTile(rotateTile([3, 1, 0, 0], 0, 1), 0, 1), 0, 1)
    expect(mirroredPair).toEqual([6, 4, 0, 0])
    expect(isSolved(mirroredPair, [2, 0, 0, 0])).toBe(true)
    expect(clicksToSolve([3, 1, 0, 0], [{ a: 0, b: 1 }], [2, 0, 0, 0])).toBe(3)
  })

  it('generates sixty deterministic scrambled boards with replayable par', () => {
    for (const [index, level] of ALL.entries()) {
      const spec = getWindowSpec(index + 1)
      expect(createWindowLevel(index + 1)).toEqual(level)
      expect(level.par).toBe(spec.depth)
      expect(isSolved(level.turns, level.deltas)).toBe(false)
      expect(clicksToSolve(level.turns, level.links, level.deltas)).toBe(level.par)
      expect(level.deltas).toHaveLength(level.grid * level.grid)
      expect(level.deltas.every((delta) => delta === 0 || delta === 2)).toBe(true)
      if (level.budget !== undefined) expect(level.budget).toBeGreaterThanOrEqual(level.par + 2)
      let turns = [...level.turns]
      let spent = 0
      for (const unit of solveUnits(turns.length, level.links)) {
        const [head, tail] = unit
        while (turnExcess(turns[head], level.deltas[head]) !== 0) {
          turns = rotateTile(turns, head, tail ?? -1)
          spent += 1
        }
      }
      expect(spent).toBe(clicksToSolve(level.turns, level.links, level.deltas))
      expect(spent).toBe(level.par)
      expect(isSolved(turns, level.deltas)).toBe(true)
    }
    expect(new Set(ALL.map((level) => `${level.scene.moon.x},${level.turns.join(',')}`)).size).toBe(60)
    expect(ALL.some((level) => level.deltas.some((delta) => delta === 2))).toBe(true)
  })

  it('couples linked pairs with a conserved turn sum and veils fog tiles in late chapters', () => {
    expect([1, 33].map((level) => getWindowSpec(level).fogCount)).toEqual([0, 0])
    expect([34, 44].map((level) => getWindowSpec(level).fogCount)).toEqual([2, 4])
    expect([45, 60].map((level) => getWindowSpec(level).fogCount)).toEqual([2, 3])
    expect([1, 12, 23, 33].map((level) => getWindowSpec(level).linkCount)).toEqual([0, 0, 0, 0])
    expect([34, 44, 45, 60].map((level) => getWindowSpec(level).linkCount)).toEqual([2, 3, 2, 4])
    const scrambled = scrambleTurns(9, [[0, 1], [2], [3], [4], [5], [6], [7], [8]], 5, mulberry32(7))
    expect(scrambled.applied).toBe(5)
    expect(scrambled.deltas).toHaveLength(9)
    expect(scrambled.deltas.every((delta) => delta === 0 || delta === 2)).toBe(true)
    expect(turnExcess(scrambled.turns[0], scrambled.deltas[0])).toBe(turnExcess(scrambled.turns[1], scrambled.deltas[1]))
    const perturbed = scrambleTurns(16, Array.from({ length: 16 }, (_, tile) => [tile]), 12, mulberry32(3))
    expect(perturbed.deltas.some((delta) => delta === 2)).toBe(true)
    for (const level of ALL) {
      const used = new Set<number>()
      level.links.forEach(({ a, b }) => {
        expect(used.has(a)).toBe(false)
        expect(used.has(b)).toBe(false)
        used.add(a)
        used.add(b)
        expect([1, level.grid]).toContain(Math.abs(a - b))
        expect(level.fogs.includes(a) || level.fogs.includes(b)).toBe(false)
        expect(turnExcess(level.turns[a], level.deltas[a])).toBe(turnExcess(level.turns[b], level.deltas[b]))
      })
      expect(new Set(level.fogs).size).toBe(level.fogs.length)
      level.fogs.forEach((fog) => {
        expect(fog).toBeGreaterThanOrEqual(0)
        expect(fog).toBeLessThan(level.grid * level.grid)
      })
    }
    const linked = ALL[33]
    const { a, b } = linked.links[0]
    const before = [...linked.turns]
    const after = rotateTile(before, a, b)
    after.forEach((turn, index) => {
      if (index === a || index === b) expect(turn).toBe(before[index] + 1)
      else expect(turn).toBe(before[index])
    })
    expect(turnExcess(after[a], linked.deltas[a])).toBe(turnExcess(after[b], linked.deltas[b]))
    expect(ALL.filter((level) => level.chapter >= 4).some((level) => level.fogs.some((fog) => turnExcess(level.turns[fog], level.deltas[fog]) !== 0))).toBe(true)
  })

  it('escalates grid, scramble depth, budgets and fog across five chapters', () => {
    expect([1, 12, 23, 34, 45, 60].map((level) => getWindowSpec(level).grid)).toEqual([3, 4, 4, 5, 5, 5])
    expect([1, 11, 12, 22, 23, 33, 34, 44, 45, 60].map((level) => getWindowSpec(level).depth))
      .toEqual([3, 5, 6, 10, 8, 13, 12, 18, 15, 24])
    expect(ALL.filter((level) => level.chapter === 5).every((level) => level.fog && level.budget !== undefined)).toBe(true)
    expect(ALL.filter((level) => level.chapter === 3).every((level) => !level.fog && level.budget !== undefined)).toBe(true)
    expect(ALL.filter((level) => level.chapter <= 2).every((level) => !level.fog && level.budget === undefined && level.fogs.length === 0 && level.links.length === 0)).toBe(true)
    expect(ALL.filter((level) => level.chapter === 4).every((level) => !level.fog && level.budget === undefined && level.fogs.length > 0 && level.links.length > 0 && level.mode === 'fogged')).toBe(true)
    expect(ALL.filter((level) => level.chapter === 5).every((level) => level.fogs.length > 0 && level.links.length > 0)).toBe(true)
    const minPar = (chapter: number) => Math.min(...ALL.filter((level) => level.chapter === chapter).map((level) => level.par))
    expect([1, 2, 3, 4, 5].map(minPar)).toEqual([3, 6, 8, 12, 15])
    expect(getWindowSpec(45).slack).toBeLessThan(getWindowSpec(23).slack)
  })

  it('slices the shared scene into unique tile regions', () => {
    expect(tilePosition(3, 4)).toBe('50% 50%')
    expect(tilePosition(5, 24)).toBe('100% 100%')
    expect(tilePosition(4, 5)).toBe('33.33% 33.33%')
    for (const level of ALL) {
      const positions = new Set(Array.from({ length: level.grid * level.grid }, (_, index) => tilePosition(level.grid, index)))
      expect(positions.size).toBe(level.grid * level.grid)
      const slice = tileSlice(level.scene, level.grid, 0)
      expect(slice.size).toBe(`${level.grid * 100}% ${level.grid * 100}%`)
      expect(slice.image).toBe(sceneLayers(level.scene))
      expect(slice.image.split('conic-gradient')).toHaveLength(3 * (level.grid + 1) + 1)
      expect(slice.image.split('radial-gradient')).toHaveLength(level.scene.stars.length + 3)
      expect(slice.image.split('linear-gradient')).toHaveLength(3)
    }
    const full = sceneSlice(ALL[0].scene)
    expect(full.size).toBe('100% 100%')
    expect(full.position).toBe('0% 0%')
    expect(buildScene(mulberry32(5), 4)).toEqual(buildScene(mulberry32(5), 4))
  })

  it('scores par runs at the ceiling and penalizes extra turns and peeks', () => {
    expect(scoreFor(8, 8)).toBe(1000)
    expect(scoreFor(11, 8)).toBe(964)
    expect(scoreFor(8, 8, 2)).toBe(940)
    expect(scoreFor(8, 8, 90)).toBe(100)
    expect(scoreFor(80, 3, 0)).toBe(100)
  })

  it('clamps out-of-range levels onto the deterministic ladder', () => {
    expect(getWindowSpec(0).level).toBe(1)
    expect(getWindowSpec(61).level).toBe(60)
    expect(getWindowSpec(12.7).level).toBe(12)
    expect(createWindowLevel(0)).toEqual(createWindowLevel(1))
    expect(createWindowLevel(-3)).toEqual(createWindowLevel(1))
    expect(createWindowLevel(999)).toEqual(createWindowLevel(60))
  })
})
