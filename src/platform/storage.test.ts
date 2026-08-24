import { beforeEach, describe, expect, it, vi } from 'vitest'
import { loadPlayer, savePlayer } from './storage'

beforeEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('player storage adapter', () => {
  it('falls back when local data is malformed', () => {
    localStorage.setItem('openarcade:player:v1', '{broken')
    expect(loadPlayer()).toEqual({ lives: 5, bestScores: {} })
  })

  it('clamps lives and rejects invalid score entries', () => {
    localStorage.setItem('openarcade:player:v1', JSON.stringify({
      lives: 99,
      bestScores: { safe: 120, negative: -1, decimal: 1.5, text: '900' },
    }))
    expect(loadPlayer()).toEqual({ lives: 9, bestScores: { safe: 120 } })
  })

  it('degrades safely when browser storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied') })
    expect(savePlayer({ lives: 3, bestScores: {} })).toBe(false)
  })
})
