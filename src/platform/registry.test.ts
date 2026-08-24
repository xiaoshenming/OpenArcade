import { describe, expect, it } from 'vitest'
import { games, getGameModule } from './registry'

describe('automatic game discovery', () => {
  it('discovers and orders every descriptor without a central list', () => {
    expect(games.map((game) => game.id)).toEqual(['water-sort', 'orbit-tap', 'petal-pairs'])
  })

  it('connects only existing module entrypoints', () => {
    expect(getGameModule('water-sort')).toBeTypeOf('function')
    expect(getGameModule('orbit-tap')).toBeUndefined()
    expect(getGameModule('petal-pairs')).toBeUndefined()
  })
})
