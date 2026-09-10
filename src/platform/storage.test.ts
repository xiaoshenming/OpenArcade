import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LIFE_REGEN_MS, applyLifeRegen, loadPlayer, savePlayer, type PlayerState } from './storage'

const T0 = 1_700_000_000_000
const state = (lives: number, livesUpdatedAt = T0): PlayerState => ({ lives, livesUpdatedAt, bestScores: {}, unlockedLevels: {} })

beforeEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('player storage adapter', () => {
  it('falls back when local data is malformed', () => {
    vi.spyOn(Date, 'now').mockReturnValue(T0)
    localStorage.setItem('openarcade:player:v1', '{broken')
    expect(loadPlayer()).toEqual({ lives: 5, livesUpdatedAt: T0, bestScores: {}, unlockedLevels: {} })
  })

  it('clamps lives and rejects invalid score entries', () => {
    vi.spyOn(Date, 'now').mockReturnValue(T0)
    localStorage.setItem('openarcade:player:v1', JSON.stringify({
      lives: 99,
      bestScores: { safe: 120, negative: -1, decimal: 1.5, text: '900' },
      unlockedLevels: { water: 12, tooHigh: 501, decimal: 2.5 },
    }))
    expect(loadPlayer()).toEqual({ lives: 9, livesUpdatedAt: T0, bestScores: { safe: 120 }, unlockedLevels: { water: 12 } })
  })

  it('degrades safely when browser storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied') })
    expect(savePlayer(state(3))).toBe(false)
  })

  it('bases legacy saves without livesUpdatedAt on the current time', () => {
    vi.spyOn(Date, 'now').mockReturnValue(T0)
    localStorage.setItem('openarcade:player:v1', JSON.stringify({ lives: 2 }))
    const loaded = loadPlayer()
    expect(loaded.livesUpdatedAt).toBe(T0)
    expect(applyLifeRegen(loaded, T0)).toBe(loaded)
    expect(loaded.lives).toBe(2)
  })
})

describe('applyLifeRegen', () => {
  it('returns the same reference before a full interval elapses', () => {
    const current = state(4)
    expect(applyLifeRegen(current, T0 + LIFE_REGEN_MS - 1)).toBe(current)
    expect(applyLifeRegen(current, T0 - LIFE_REGEN_MS)).toBe(current)
  })

  it('restores one life at exactly one interval and keeps the remainder', () => {
    expect(applyLifeRegen(state(4), T0 + LIFE_REGEN_MS)).toMatchObject({ lives: 5, livesUpdatedAt: T0 + LIFE_REGEN_MS })
    const partial = applyLifeRegen(state(4), T0 + 25 * 60 * 1000)
    expect(partial.lives).toBe(5)
    expect(partial.livesUpdatedAt).toBe(T0 + LIFE_REGEN_MS)
  })

  it('restores multiple lives after a long absence', () => {
    const regenerated = applyLifeRegen(state(3), T0 + LIFE_REGEN_MS * 3 + 60 * 1000)
    expect(regenerated.lives).toBe(6)
    expect(regenerated.livesUpdatedAt).toBe(T0 + LIFE_REGEN_MS * 3)
  })

  it('caps lives at the maximum while advancing the baseline', () => {
    const regenerated = applyLifeRegen(state(8), T0 + LIFE_REGEN_MS * 100)
    expect(regenerated.lives).toBe(9)
    expect(regenerated.livesUpdatedAt).toBe(T0 + LIFE_REGEN_MS * 100)
  })
})
