import { describe, expect, it } from 'vitest'
import { WATER_LEVELS } from './levels'
import { getWaterRule } from './rules'

describe('water mechanic chapters', () => {
  it('makes every opening level visibly and mechanically distinct', () => {
    const rules = WATER_LEVELS.slice(0, 5).map((level, index) => getWaterRule(index + 1, level))
    expect(new Set(rules.map((rule) => rule.mode)).size).toBe(5)
    expect(WATER_LEVELS.slice(0, 5).every((level) => level.tubes.length === 5)).toBe(true)
  })

  it('develops mechanics through twelve chapters and an all-rule finale', () => {
    const rules = WATER_LEVELS.map((level, index) => getWaterRule(index + 1, level))
    for (let chapter = 1; chapter <= 12; chapter += 1) {
      expect(rules.slice((chapter - 1) * 5, chapter * 5).every((rule) => rule.chapter === chapter)).toBe(true)
    }
    expect(getWaterRule(30, WATER_LEVELS[29])).toMatchObject({ hiddenLayers: true, lockTube: expect.any(Number) })
    expect(getWaterRule(50, WATER_LEVELS[49])).toMatchObject({ hiddenLayers: true, lockTube: expect.any(Number), moveLimit: expect.any(Number) })
    expect(getWaterRule(60, WATER_LEVELS[59])).toMatchObject({ hiddenLayers: true, lockTube: expect.any(Number), moveLimit: expect.any(Number), noUndo: true })
  })

  it('never seals a tube required by the stored opening witness', () => {
    for (const [index, level] of WATER_LEVELS.entries()) {
      const rule = getWaterRule(index + 1, level)
      if (rule.lockTube === undefined || rule.unlockMoves === undefined) continue
      const opening = level.solution.slice(0, rule.unlockMoves * 2).split('').map(Number)
      expect(opening).not.toContain(rule.lockTube)
    }
  })
})
