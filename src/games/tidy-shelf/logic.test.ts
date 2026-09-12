import { describe, expect, it } from 'vitest'
import { buildTarget, inversionCount, isShelfTidy, MAX_PER_TYPE, sizeOf, swapAdjacent, typeOf } from './logic'

describe('tidy shelf mechanics', () => {
  it('builds canonical targets that satisfy their own rule', () => {
    expect(buildTarget([3, 3], null)).toEqual([0, 1, 2, 4, 5, 6])
    expect(buildTarget([3, 3, 2], null)).toEqual([0, 1, 2, 4, 5, 6, 8, 9])
    expect(buildTarget([3, 3, 3, 3], [0, 1])).toEqual([8, 9, 10, 12, 13, 14, 0, 4, 1, 5, 2, 6])
    const rotated = buildTarget([3, 3, 3, 3], [3, 0])
    expect(rotated).toEqual([4, 5, 6, 8, 9, 10, 12, 0, 13, 1, 14, 2])
    expect(isShelfTidy(rotated, [3, 3, 3, 3], [3, 0])).toBe(true)
    expect(isShelfTidy(buildTarget([3, 3, 3, 3], [0, 1]), [3, 3, 3, 3], [0, 1])).toBe(true)
  })

  it('accepts any grouped block order but rejects broken grouping', () => {
    const counts = [3, 2]
    expect(isShelfTidy([0, 1, 2, 4, 5], counts, null)).toBe(true)
    expect(isShelfTidy([4, 5, 0, 1, 2], counts, null)).toBe(true)
    expect(isShelfTidy([1, 0, 2, 4, 5], counts, null)).toBe(false)
    expect(isShelfTidy([0, 1, 2, 5, 4], counts, null)).toBe(false)
    expect(isShelfTidy([0, 4, 1, 5, 2], counts, null)).toBe(false)
    expect(isShelfTidy([0, 1, 4, 2, 5], counts, null)).toBe(false)
  })

  it('enforces the alternation rule for the designated pair', () => {
    const counts = [3, 3, 2, 2]
    const alt = (shelf: number[]) => isShelfTidy(shelf, counts, [0, 1])
    expect(alt([8, 9, 12, 13, 0, 4, 1, 5, 2, 6])).toBe(true)
    expect(alt([0, 4, 1, 5, 2, 6, 8, 9, 12, 13])).toBe(true)
    expect(alt([4, 0, 5, 1, 6, 2, 8, 9, 12, 13])).toBe(true)
    expect(alt([8, 9, 12, 13, 0, 1, 4, 5, 2, 6])).toBe(false)
    expect(alt([0, 8, 4, 9, 1, 12, 2, 13, 5, 6])).toBe(false)
    expect(alt([8, 9, 12, 13, 1, 0, 5, 4, 2, 6])).toBe(false)
  })

  it('swaps only free adjacent cells inside bounds', () => {
    expect(swapAdjacent([1, 0, 2], [], 0)).toEqual([0, 1, 2])
    expect(swapAdjacent([1, 0, 2], [], -1)).toBeNull()
    expect(swapAdjacent([1, 0, 2], [], 2)).toBeNull()
    expect(swapAdjacent([1, 0, 2], [], 0.5)).toBeNull()
    expect(swapAdjacent([1, 0, 2], [0], 0)).toBeNull()
    expect(swapAdjacent([1, 0, 2], [1], 0)).toBeNull()
    expect(swapAdjacent([1, 0, 2], [], 1)).toEqual([1, 2, 0])
  })

  it('counts inversions as the adjacent-swap distance to target', () => {
    const target = [0, 1, 2, 4, 5]
    expect(inversionCount(target, target)).toBe(0)
    expect(inversionCount([1, 0, 2, 4, 5], target)).toBe(1)
    expect(inversionCount([2, 1, 0, 4, 5], target)).toBe(3)
    expect(inversionCount([4, 5, 0, 1, 2], target)).toBe(6)
    expect(inversionCount([5, 4, 2, 1, 0], target)).toBe(10)
  })

  it('decodes item type and size consistently', () => {
    expect(typeOf(13)).toBe(3)
    expect(sizeOf(13)).toBe(1)
    for (let type = 0; type < 4; type += 1) {
      for (let size = 0; size < MAX_PER_TYPE; size += 1) {
        const item = type * MAX_PER_TYPE + size
        expect(typeOf(item)).toBe(type)
        expect(sizeOf(item)).toBe(size)
      }
    }
  })
})
