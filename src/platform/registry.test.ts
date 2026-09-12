import { describe, expect, it } from 'vitest'
import { games, getGameModule } from './registry'

describe('automatic game discovery', () => {
  it('discovers and orders every descriptor without a central list', () => {
    const ids = games.map((game) => game.id)
    expect(ids.slice(0, 3)).toEqual(['water-sort', 'orbit-tap', 'petal-pairs'])
    expect(ids).toContain('star-sudoku')
    expect(new Set(ids).size).toBe(ids.length)
    expect([...games].sort((a, b) => a.order - b.order).map((game) => game.id)).toEqual(ids)
  })

  it('connects only existing module entrypoints', () => {
    expect(getGameModule('water-sort')).toBeTypeOf('function')
    expect(getGameModule('orbit-tap')).toBeUndefined()
    expect(getGameModule('petal-pairs')).toBeTypeOf('function')
  })
})
