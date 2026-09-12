import { describe, expect, it } from 'vitest'
import { createVinePaths, getVineLevel, VINE_LEVELS } from './levels'
import { judgeVine } from './logic'

describe('vine-link level book', () => {
  it('ships sixty deterministic, solvable, distinct gardens', () => {
    const shapes = new Set<string>()
    for (let level = 1; level <= VINE_LEVELS; level += 1) {
      const spec = getVineLevel(level)
      expect(spec).toEqual(getVineLevel(level))
      expect(judgeVine(spec.rows, spec.cols, spec.pairs, spec.solution).solved, `level ${level}`).toBe(true)
      expect(judgeVine(spec.rows, spec.cols, spec.pairs, createVinePaths(spec)).solved).toBe(false)
      expect(spec.pairs.every((pair) => spec.solution.some((path) => path[0] === pair.a && path[path.length - 1] === pair.b))).toBe(true)
      shapes.add(JSON.stringify(spec.pairs.map((pair) => [pair.a, pair.b])))
    }
    expect(shapes.size).toBe(VINE_LEVELS)
  })

  it('advances five chapters of escalating mechanics', () => {
    const specs = Array.from({ length: VINE_LEVELS }, (_, index) => getVineLevel(index + 1))
    expect(specs.slice(0, 11).every((spec) => spec.chapter === 1 && spec.rows === 5 && spec.pairs.length >= 3 && spec.pairs.length <= 5 && !spec.moveLimit && !spec.fixed.length)).toBe(true)
    expect(specs.slice(11, 22).every((spec) => spec.chapter === 2 && spec.rows === 6 && !spec.moveLimit && !spec.fixed.length)).toBe(true)
    expect(specs.slice(22, 33).every((spec) => spec.chapter === 3 && spec.rows === 7 && spec.moveLimit && !spec.fixed.length)).toBe(true)
    expect(specs.slice(33, 44).every((spec) => spec.chapter === 4 && spec.rows === 7 && spec.pairs.length === 6 && spec.fixed.length >= 1 && spec.fixed.length <= 3 && !spec.moveLimit)).toBe(true)
    expect(specs.slice(44).every((spec) => spec.chapter === 5 && spec.rows === 8 && spec.fixed.length >= 1 && spec.moveLimit)).toBe(true)
    expect(specs[0].pairs.length).toBe(3)
    expect(specs[10].pairs.length).toBe(5)
    expect(specs[33].fixed.length).toBe(1)
    expect(specs[43].fixed.length).toBe(3)
    expect(specs[21].pairs.length).toBe(5)
    expect(specs[32].pairs.length).toBe(6)
    expect(specs[59].pairs.length).toBe(8)
  })

  it('pre-paves valid locked vines for fixed chapters', () => {
    for (let level = 34; level <= VINE_LEVELS; level += 1) {
      const spec = getVineLevel(level)
      expect(spec.fixed.length).toBeLessThan(spec.pairs.length)
      for (const index of spec.fixed) {
        expect(judgeVine(spec.rows, spec.cols, [spec.pairs[index]], [spec.solution[index]]).connected[0], `level ${level}`).toBe(true)
      }
      expect(createVinePaths(spec).filter((path) => path.length > 0)).toHaveLength(spec.fixed.length)
    }
  })

  it('tightens budgets within chapters and widens boards across them', () => {
    const slack = (level: number) => {
      const spec = getVineLevel(level)
      return (spec.moveLimit ?? 0) - spec.par
    }
    expect([1, 12, 23, 34, 45].map((level) => getVineLevel(level).rows)).toEqual([5, 6, 7, 7, 8])
    expect([1, 12, 23, 34, 45].map((level) => getVineLevel(level).chapter)).toEqual([1, 2, 3, 4, 5])
    expect(slack(23)).toBeGreaterThan(slack(33))
    expect(slack(45)).toBeGreaterThan(slack(60))
    expect(slack(24)).toBeGreaterThanOrEqual(slack(25))
  })

  it('keeps late-chapter gardens finishable from the pre-paved state within budget', () => {
    for (let level = 34; level <= VINE_LEVELS; level += 1) {
      const spec = getVineLevel(level)
      const seeded = createVinePaths(spec).map((path, index) => (path.length ? path : spec.solution[index]))
      expect(judgeVine(spec.rows, spec.cols, spec.pairs, seeded).solved, `level ${level}`).toBe(true)
      if (spec.moveLimit !== undefined) {
        expect(spec.moveLimit, `level ${level}`).toBeGreaterThanOrEqual(spec.par)
        expect(spec.moveLimit - spec.par, `level ${level}`).toBeGreaterThanOrEqual(4)
      }
    }
  })

  it('clamps out-of-range levels to the book ends', () => {
    expect(getVineLevel(0)).toEqual(getVineLevel(1))
    expect(getVineLevel(-5)).toEqual(getVineLevel(1))
    expect(getVineLevel(999)).toEqual(getVineLevel(VINE_LEVELS))
  })
})
