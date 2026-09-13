import { describe, expect, it } from 'vitest'
import { addTrio, canAdd, canCook, countUses, dominantFlavor, exceeds, gapState, gapTrio, isBlank, plateSum, sameTrio, scaleTrio, scoreFor, subTrio, trioKey, type ChefLevel, type Ingredient, type Trio } from './logic'

const trio = (sweet: number, spicy: number, umami: number): Trio => ({ sweet, spicy, umami })
const item = (id: number, trioValue: Trio, limit = 1): Ingredient => ({ id, name: `食材${id}`, trio: trioValue, limit })
const shelf = [item(1, trio(2, 0, 1)), item(2, trio(0, 3, 0)), item(3, trio(1, 1, 1), 2)]
const level: ChefLevel = { shelf, dishes: [{ target: trio(3, 1, 2), par: 2, solution: [1, 3] }], budget: 6, lives: 3 }

describe('star chef plate mechanics', () => {
  it('keeps trio arithmetic total, invertible and sign-safe', () => {
    expect(addTrio(trio(1, 2, 3), trio(4, 5, 6))).toEqual(trio(5, 7, 9))
    expect(scaleTrio(trio(2, 3, 4), 2)).toEqual(trio(4, 6, 8))
    expect(subTrio(trio(5, 7, 9), trio(4, 5, 6))).toEqual(trio(1, 2, 3))
    expect(sameTrio(trio(1, 2, 3), trio(1, 2, 3))).toBe(true)
    expect(sameTrio(trio(1, 2, 3), trio(3, 2, 1))).toBe(false)
    expect(isBlank(trio(0, 0, 0))).toBe(true)
    expect(isBlank(trio(0, 1, 0))).toBe(false)
    expect(exceeds(trio(3, 1, 2), trio(2, 1, 1))).toBe(false)
    expect(exceeds(trio(3, 1, 2), trio(2, 1, 3))).toBe(true)
    expect(dominantFlavor(trio(0, 4, 2))).toBe('spicy')
    expect(dominantFlavor(trio(5, 5, 0))).toBe('sweet')
    expect(trioKey(trio(1, 2, 3))).toBe('1.2.3')
  })

  it('tracks plate sums and per-ingredient use limits', () => {
    expect(plateSum(shelf, [1, 2])).toEqual(trio(2, 3, 1))
    expect(plateSum(shelf, [3, 3])).toEqual(trio(2, 2, 2))
    expect(plateSum(shelf, [99])).toEqual(trio(0, 0, 0))
    expect(countUses([3, 3, 1], 3)).toBe(2)
    expect(canAdd(shelf, [], 3)).toBe(true)
    expect(canAdd(shelf, [3], 3)).toBe(true)
    expect(canAdd(shelf, [3, 3], 3)).toBe(false)
    expect(canAdd(shelf, [], 99)).toBe(false)
  })

  it('decides cookability with subset-sum search honoring repeat limits', () => {
    expect(canCook(shelf, trio(3, 1, 2))).toBe(true)
    expect(canCook(shelf, trio(2, 1, 2))).toBe(false)
    expect(canCook(shelf, trio(4, 2, 3))).toBe(true)
    expect(canCook(shelf, trio(1, 0, 0))).toBe(false)
    expect(canCook(shelf, trio(2, 3, 1))).toBe(true)
    expect(canCook(shelf, trio(2, 2, 2))).toBe(true)
    expect(canCook([item(1, trio(2, 0, 0), 1)], trio(4, 0, 0))).toBe(false)
    expect(canCook([item(1, trio(2, 0, 0), 2)], trio(4, 0, 0))).toBe(true)
    expect(canCook([], trio(0, 0, 0))).toBe(true)
    expect(canCook([], trio(1, 0, 0))).toBe(false)
  })

  it('reports gaps against the recipe and scores waste plus mistakes', () => {
    expect(gapTrio(trio(5, 2, 3), trio(2, 2, 4))).toEqual(trio(3, 0, -1))
    expect(gapState(trio(5, 2, 3), trio(5, 2, 3))).toBe('exact')
    expect(gapState(trio(5, 2, 3), trio(2, 2, 3))).toBe('under')
    expect(gapState(trio(5, 2, 3), trio(6, 2, 3))).toBe('over')
    expect(scoreFor(2, 2, 0)).toBe(1000)
    expect(scoreFor(4, 2, 1)).toBe(890)
    expect(scoreFor(40, 2, 3)).toBe(100)
    expect(scoreFor(0, 5, 0)).toBe(1000)
  })

  it('replays the stored witness dish of a level shape', () => {
    const usable = level.shelf.filter((entry) => level.dishes[0].solution.includes(entry.id))
    const sum = usable.reduce((acc, entry) => addTrio(acc, entry.trio), trio(0, 0, 0))
    expect(sameTrio(sum, level.dishes[0].target)).toBe(true)
    expect(usable.every((entry) => entry.limit >= 1)).toBe(true)
    expect(level.dishes[0].solution).toHaveLength(level.dishes[0].par)
  })
})
