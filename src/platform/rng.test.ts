import { describe, expect, it } from 'vitest'
import { mulberry32, pick, seedFor, shuffle } from './rng'

describe('rng', () => {
  it('produces identical streams for identical seeds', () => {
    const first = Array.from({ length: 12 }, mulberry32(1234))
    const second = Array.from({ length: 12 }, mulberry32(1234))
    expect(first).toEqual(second)
  })

  it('derives distinct stable seeds per level and salt', () => {
    expect(seedFor(7)).toBe(seedFor(7))
    expect(seedFor(7)).not.toBe(seedFor(8))
    expect(seedFor(7)).not.toBe(seedFor(7, 1))
  })

  it('keeps pick and shuffle inside bounds and deterministic', () => {
    const random = mulberry32(99)
    const items = ['a', 'b', 'c']
    expect(pick(random, items)).toBe(pick(mulberry32(99), items))
    expect(shuffle(mulberry32(5), [...items])).toEqual(shuffle(mulberry32(5), [...items]))
    expect(shuffle(mulberry32(5), [...items]).sort()).toEqual(items)
  })
})
