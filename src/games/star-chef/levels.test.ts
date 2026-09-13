import { describe, expect, it } from 'vitest'
import { canCook, countUses, ingredientById, isBlank, plateSum, sameTrio, trioKey, type Trio } from './logic'
import { createChefLevel, cookable, getChefSpec, verifyDish } from './levels'

const ALL = Array.from({ length: 60 }, (_, index) => createChefLevel(index + 1))
const chapterLevels = (chapter: number) => ALL.filter((_, index) => getChefSpec(index + 1).chapter === chapter)
const impossible = (target: Trio): Trio => ({ ...target, sweet: target.sweet + 100 })

describe('star chef level system', () => {
  it('generates sixty deterministic shelves with unique named stock', () => {
    for (let level = 1; level <= 60; level += 1) {
      const first = createChefLevel(level)
      expect(first).toEqual(ALL[level - 1])
      const spec = getChefSpec(level)
      expect(first.shelf).toHaveLength(spec.shelfSize)
      expect(first.dishes).toHaveLength(spec.dishCount)
      expect(new Set(first.shelf.map((item) => item.name)).size).toBe(first.shelf.length)
      expect(new Set(first.shelf.map((item) => trioKey(item.trio))).size).toBe(first.shelf.length)
      expect(first.lives).toBe(3)
      const par = first.dishes.reduce((sum, dish) => sum + dish.par, 0)
      expect(first.budget).toBe(par + spec.slack)
      first.shelf.forEach((entry) => {
        expect(isBlank(entry.trio), `level ${level} blank ingredient`).toBe(false)
        expect(entry.limit).toBeGreaterThanOrEqual(1)
      })
      first.dishes.forEach((dish) => {
        expect(isBlank(dish.target)).toBe(false)
        const targets = new Set(first.dishes.map((other) => trioKey(other.target)))
        first.shelf.forEach((entry) => expect(targets.has(trioKey(entry.trio)), `level ${level} ingredient equals a target`).toBe(false))
        expect(new Set(dish.solution).size).toBe(dish.solution.length)
        dish.solution.forEach((id) => expect(ingredientById(first.shelf, id), `level ${level} solution id ${id}`).not.toBeNull())
      })
    }
  })

  it('replays every constructed dish back onto its exact target', () => {
    for (const [index, entry] of ALL.entries()) {
      entry.dishes.forEach((dish) => {
        expect(verifyDish(entry, dish), `level ${index + 1} witness replay`).toBe(true)
        const sum = plateSum(entry.shelf, dish.solution)
        expect(sameTrio(sum, dish.target), `level ${index + 1} sum`).toBe(true)
        dish.solution.forEach((id) => {
          const item = ingredientById(entry.shelf, id)
          expect(countUses(dish.solution, id), `level ${index + 1} uses of ${id}`).toBeLessThanOrEqual(item?.limit ?? 0)
        })
      })
      expect(cookable(entry), `level ${index + 1} cookable`).toBe(true)
    }
  })

  it('confirms the solver accepts every level and rejects padded targets', () => {
    for (const [index, entry] of ALL.entries()) {
      entry.dishes.forEach((dish) => {
        expect(canCook(entry.shelf, dish.target), `level ${index + 1} solvable`).toBe(true)
        expect(canCook(entry.shelf, impossible(dish.target)), `level ${index + 1} padded`).toBe(false)
      })
    }
  })

  it('locks the chapter ladder: shelf, picks, limits, slack and dish counts', () => {
    expect([1, 12, 23, 34, 45].map((level) => getChefSpec(level).chapter)).toEqual([1, 2, 3, 4, 5])
    expect([1, 12, 23, 34, 45].map((level) => getChefSpec(level).shelfSize)).toEqual([6, 7, 7, 8, 9])
    expect([1, 12, 23, 34, 45].map((level) => getChefSpec(level).picks)).toEqual([2, 3, 3, 4, 3])
    expect([1, 12, 23, 34, 45].map((level) => getChefSpec(level).slack)).toEqual([8, 7, 6, 5, 4])
    expect(getChefSpec(1).limitItems).toBe(0)
    expect(getChefSpec(23).limitItems).toBeGreaterThan(0)
    expect(getChefSpec(23).solo).toBe(false)
    expect(getChefSpec(1).solo).toBe(true)
    for (const entry of chapterLevels(1)) {
      expect(entry.dishes[0].target.spicy).toBe(0)
      expect(entry.dishes[0].target.umami).toBe(0)
      expect(entry.dishes[0].target.sweet).toBeGreaterThan(0)
      entry.shelf.forEach((item) => expect(item.trio.spicy === 0 || item.trio.sweet === 0).toBe(true))
    }
    const pars = (chapter: number) => chapterLevels(chapter).map((entry) => entry.dishes.reduce((sum, dish) => sum + dish.par, 0))
    expect(pars(1).every((par) => par === 2)).toBe(true)
    expect(Math.min(...pars(2))).toBeGreaterThan(Math.min(...pars(1)))
    expect(Math.min(...pars(3))).toBeGreaterThanOrEqual(Math.min(...pars(2)))
    expect(Math.max(...pars(3))).toBeGreaterThan(Math.max(...pars(2)))
    expect(Math.min(...pars(4))).toBeGreaterThan(Math.min(...pars(3)))
    expect(Math.min(...pars(5))).toBeGreaterThan(Math.min(...pars(4)))
    expect(chapterLevels(5).every((entry) => entry.dishes.length === 2)).toBe(true)
    expect(chapterLevels(4).some((entry) => entry.shelf.length === 9)).toBe(true)
    expect(chapterLevels(3).some((entry) => entry.shelf.some((item) => item.limit === 2))).toBe(true)
    expect(chapterLevels(2).every((entry) => entry.shelf.every((item) => item.limit === 1))).toBe(true)
  })

  it('clamps out-of-range levels onto the deterministic ladder', () => {
    expect(getChefSpec(0).level).toBe(1)
    expect(getChefSpec(999).level).toBe(60)
    expect(getChefSpec(7.8).level).toBe(7)
    expect(createChefLevel(0)).toEqual(ALL[0])
    expect(createChefLevel(-3)).toEqual(ALL[0])
    expect(createChefLevel(999)).toEqual(ALL[59])
    expect(createChefLevel(7.8)).toEqual(ALL[6])
    expect(getChefSpec(60).title).toContain('终局')
  })
})
