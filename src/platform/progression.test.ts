import { describe, expect, it } from 'vitest'
import { getLevelCount, getUnlockedLevel, normalizeUnlockedLevels, unlockNextLevel } from './progression'

const game = { id: 'water', levelCount: 60 }

describe('host progression policy', () => {
  it('keeps legacy games on one level', () => {
    expect(getLevelCount({ id: 'legacy' })).toBe(1)
    expect(getUnlockedLevel({ legacy: 99 }, { id: 'legacy' })).toBe(1)
  })

  it('clamps corrupt progress to the manifest boundary', () => {
    expect(getUnlockedLevel({ water: 500 }, game)).toBe(60)
    expect(getUnlockedLevel({ water: -4 }, game)).toBe(1)
    expect(getUnlockedLevel({ water: 2.5 }, game)).toBe(1)
  })

  it('canonicalizes storage to known manifest boundaries', () => {
    expect(normalizeUnlockedLevels({ water: 500, unknown: 40 }, [game])).toEqual({ water: 60 })
  })

  it('advances from the host active level without skips or regressions', () => {
    expect(unlockNextLevel({}, game, 1).water).toBe(2)
    expect(unlockNextLevel({ water: 12 }, game, 4).water).toBe(12)
    expect(unlockNextLevel({ water: 59 }, game, 60).water).toBe(60)
  })
})
