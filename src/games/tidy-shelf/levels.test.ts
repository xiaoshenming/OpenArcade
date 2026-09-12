import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../../platform/rng'
import { buildTarget, inversionCount, isShelfTidy, swapAdjacent } from './logic'
import { createTidyLevel, getTidySpec, scrambleShelf } from './levels'

const ALL = Array.from({ length: 60 }, (_, index) => createTidyLevel(index + 1))

describe('tidy shelf level system', () => {
  it('generates sixty unique deterministic unfinished boards', () => {
    for (let level = 1; level <= 60; level += 1) {
      const first = createTidyLevel(level)
      const second = createTidyLevel(level)
      expect(first).toEqual(second)
      expect([...first.shelf].sort((a, b) => a - b)).toEqual([...first.target].sort((a, b) => a - b))
      expect(first.shelf).not.toEqual(first.target)
      expect(isShelfTidy(first.shelf, first.counts, first.alternates)).toBe(false)
      expect(first.par).toBe(inversionCount(first.shelf, first.target))
      expect(first.budget).toBeGreaterThanOrEqual(first.par + 1)
    }
    expect(new Set(ALL.map((entry) => entry.shelf.join(','))).size).toBe(60)
  })

  it('replays a frozen-safe witness that sorts every shelf within budget', () => {
    for (const [index, entry] of ALL.entries()) {
      const rank = new Map(entry.target.map((item, order) => [item, order]))
      let shelf = [...entry.shelf]
      let used = 0
      while (inversionCount(shelf, entry.target) > 0) {
        const left = shelf.findIndex((item, position) => position + 1 < shelf.length && (rank.get(item) ?? 0) > (rank.get(shelf[position + 1]) ?? 0))
        const next = swapAdjacent(shelf, entry.frozen, left)
        expect(next, `level ${index + 1} swap at ${left}`).not.toBeNull()
        shelf = next as number[]
        used += 1
        expect(used).toBeLessThanOrEqual(entry.budget)
      }
      expect(shelf).toEqual(entry.target)
      expect(used).toBe(entry.par)
      entry.frozen.forEach((position) => expect(shelf[position]).toBe(entry.target[position]))
    }
  })

  it('keeps frozen cells on their target slots in frozen chapters', () => {
    expect(getTidySpec(23).frozenCount).toBe(1)
    expect(getTidySpec(30).frozenCount).toBe(2)
    expect(getTidySpec(45).frozenCount).toBe(2)
    expect(getTidySpec(54).frozenCount).toBe(3)
    expect(getTidySpec(5).frozenCount).toBe(0)
    expect(getTidySpec(40).frozenCount).toBe(0)
    for (const [index, entry] of ALL.entries()) {
      const spec = getTidySpec(index + 1)
      expect(entry.frozen).toHaveLength(spec.frozenCount)
      entry.frozen.forEach((position) => {
        expect(position).toBeGreaterThanOrEqual(0)
        expect(position).toBeLessThan(spec.cells)
        expect(entry.shelf[position]).toBe(entry.target[position])
      })
    }
  })

  it('grows boards and tightens budgets chapter over chapter', () => {
    expect([1, 12, 23, 34, 45].map((level) => getTidySpec(level).cells)).toEqual([6, 8, 10, 12, 12])
    expect(getTidySpec(34).alternates).toEqual([0, 1])
    expect(getTidySpec(37).alternates).toEqual([3, 0])
    expect(getTidySpec(45).slack).toBeLessThan(getTidySpec(34).slack)
    expect(getTidySpec(45).slack).toBeLessThan(getTidySpec(1).slack)
    const pars = (chapter: number) => ALL.filter((_, index) => getTidySpec(index + 1).chapter === chapter).map((entry) => entry.par)
    expect(Math.min(...pars(2))).toBeGreaterThan(Math.min(...pars(1)))
    expect(Math.min(...pars(3))).toBeGreaterThan(Math.min(...pars(2)))
    expect(Math.min(...pars(4))).toBeGreaterThan(Math.min(...pars(2)))
    expect(Math.min(...pars(5))).toBeGreaterThan(Math.min(...pars(4)))
    expect(Math.max(...pars(5))).toBeGreaterThan(Math.max(...pars(1)))
    for (let chapter = 1; chapter <= 5; chapter += 1) expect(pars(chapter).every((par) => par >= 2)).toBe(true)
  })

  it('clamps out-of-range levels onto the deterministic ladder', () => {
    expect(getTidySpec(0).level).toBe(1)
    expect(getTidySpec(999).level).toBe(60)
    expect(createTidyLevel(0)).toEqual(createTidyLevel(1))
    expect(createTidyLevel(-7)).toEqual(createTidyLevel(1))
    expect(createTidyLevel(999)).toEqual(createTidyLevel(60))
  })

  it('scrambles deterministically without touching frozen slots', () => {
    const target = buildTarget([2, 2, 2], null)
    const first = [...target]
    const second = [...target]
    const applied = scrambleShelf(target, first, 3, [0], mulberry32(1))
    expect(applied).toBe(3)
    expect(scrambleShelf(target, second, 3, [0], mulberry32(1))).toBe(3)
    expect(second).toEqual(first)
    expect(first[0]).toBe(target[0])
    expect(inversionCount(first, target)).toBe(3)
    const third = [...target]
    expect(scrambleShelf(target, third, 99, [0], mulberry32(1))).toBe(10)
    expect(inversionCount(third, target)).toBe(10)
    expect(third[0]).toBe(target[0])
  })
})
